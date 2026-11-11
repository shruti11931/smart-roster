import { isRequired } from './calendar';
import { buildContext, type Ctx } from './context';
import { computeDayCoverage, wouldBreak } from './coverage';
import { dow, fmtDate, weekSegments, WEEKDAY_NAMES } from './dates';
import { fairnessReport } from './fairness';
import { suggestBackups } from './suggest';
import type { CellStatus, Issue, Roster, RosterConfig } from './types';

const STATUS_LABEL: Record<CellStatus, string> = {
  work: 'working',
  weekly_off: 'weekly off',
  leave: 'on leave',
  comp_off: 'comp-off',
  holiday: 'holiday',
};
const REST: CellStatus[] = ['weekly_off', 'leave', 'comp_off'];

const mk = (i: Omit<Issue, 'id'>): Issue => ({
  ...i,
  id: [i.kind, i.processId ?? '', i.employeeId ?? '', i.date ?? ''].join('|'),
});

/**
 * Check a roster against every rule. Errors break a mandatory rule (coverage, weekly off,
 * consecutive days). Warnings are preferences. Info marks days a backup is carrying a process.
 */
export function validateRoster(config: RosterConfig, roster: Roster, prebuilt?: Ctx): Issue[] {
  const ctx = prebuilt ?? buildContext(config);
  const issues: Issue[] = [];
  const name = (id: string) => ctx.empById.get(id)?.name ?? id;

  // 1. Coverage: every process, every required day.
  for (const date of ctx.dates) {
    const day = computeDayCoverage(ctx, roster, date);
    for (const [pid, c] of day.byProcess) {
      const proc = ctx.procById.get(pid)!;
      const brand = ctx.brandById.get(proc.brandId);
      const where = `${brand?.name ?? proc.brandId} · ${proc.name} · ${fmtDate(date)}`;
      const have = c.primaryAvailable.length + c.rescuedBy.length;
      if (c.shortfall > 0) {
        const why = c.unavailable.map((u) => `${name(u.employeeId)} (${STATUS_LABEL[u.status]})`);
        issues.push(
          mk({
            severity: 'error',
            kind: have === 0 ? 'NO_COVERAGE' : 'UNDERSTAFFED',
            message:
              `${where}: ${have} of ${c.required} staff available` + (why.length ? `. Out: ${why.join(', ')}` : ''),
            date,
            brandId: proc.brandId,
            processId: pid,
            fixes: suggestBackups(ctx, roster, pid, date).slice(0, 3),
          }),
        );
      } else if (c.rescuedBy.length > 0) {
        issues.push(
          mk({
            severity: 'info',
            kind: 'BACKUP_COVER',
            message: `${where}: covered by backup ${c.rescuedBy.map(name).join(', ')}`,
            date,
            brandId: proc.brandId,
            processId: pid,
          }),
        );
      }
    }
  }

  // 2. Per employee: weekly off, consecutive days, closed-day work, preferences.
  const segments = weekSegments(ctx.dates);
  for (const e of ctx.employees) {
    const row = roster[e.id] ?? {};

    let run = 0;
    for (const d of ctx.dates) {
      if (row[d]?.status === 'work') {
        run++;
        if (run === e.maxConsecutive + 1) {
          issues.push(
            mk({
              severity: 'error',
              kind: 'MAX_CONSECUTIVE',
              message: `${e.name} works more than ${e.maxConsecutive} days in a row, reaching ${fmtDate(d)}`,
              date: d,
              employeeId: e.id,
            }),
          );
        }
      } else run = 0;
    }

    const procs = ctx.primaryProcs.get(e.id) ?? [];
    if (procs.length > 0) {
      for (const d of ctx.dates) {
        const closed = procs.every((pid) => !isRequired(ctx.procById.get(pid)!, d, ctx.holidaySet));
        if (closed && row[d]?.status === 'work') {
          issues.push(
            mk({
              severity: 'warning',
              kind: 'WORKING_ON_CLOSED_DAY',
              message: `${e.name} is scheduled on ${fmtDate(d)} but all of their processes are closed`,
              date: d,
              employeeId: e.id,
            }),
          );
        }
      }
    }

    for (const seg of segments) {
      // A week split across two months is judged in the month that holds its Sunday. A trailing
      // partial week (no Sunday yet) can still take its rest day next month, so it is not an error.
      if (seg.dates.length < 4 || dow(seg.dates[seg.dates.length - 1]) !== 0) continue;
      const rest = seg.dates.some((d) => row[d] && REST.includes(row[d].status));
      if (!rest) {
        const blockers = new Set<string>();
        for (const d of seg.dates) {
          if (row[d]?.status !== 'work') continue;
          for (const pid of wouldBreak(ctx, roster, e.id, d)) {
            const p = ctx.procById.get(pid)!;
            blockers.add(`${ctx.brandById.get(p.brandId)?.name} ${p.name}`);
          }
        }
        const list = [...blockers].slice(0, 3).join(', ');
        issues.push(
          mk({
            severity: 'error',
            kind: 'MISSING_WEEKLY_OFF',
            message:
              `${e.name} has no weekly off in the week of ${fmtDate(seg.dates[0])}` +
              (list ? `: every day would leave ${list} uncovered` : ''),
            date: seg.dates[0],
            employeeId: e.id,
          }),
        );
        continue;
      }
      // Preference check only where someone chose the off (not forced by a closed calendar).
      const chosen = seg.dates.filter(
        (d) => row[d]?.status === 'weekly_off' && row[d].source !== 'closed',
      );
      if (
        e.preferredOffDays.length > 0 &&
        chosen.length > 0 &&
        !chosen.some((d) => e.preferredOffDays.includes(dow(d)))
      ) {
        issues.push(
          mk({
            severity: 'warning',
            kind: 'PREFERENCE_MISSED',
            message:
              `${e.name} prefers ${e.preferredOffDays.map((n) => WEEKDAY_NAMES[n]).join('/')} off, ` +
              `got ${chosen.map((d) => WEEKDAY_NAMES[dow(d)]).join('/')} (week of ${fmtDate(seg.dates[0])}). ` +
              `Coverage took priority`,
            date: seg.dates[0],
            employeeId: e.id,
          }),
        );
      }
    }
  }

  // 3. Overlapping responsibilities: nobody can staff two brands at once.
  //    Error: one person is a cover or backup for two different brands on the same day.
  //    Warning: a cover or backup is also needed on their own brand that day.
  for (const date of ctx.dates) {
    const day = computeDayCoverage(ctx, roster, date);
    const duty = new Map<string, Map<string, string>>(); // employee -> brandId -> process name
    const add = (e: string, pid: string) => {
      const p = ctx.procById.get(pid)!;
      if (!duty.has(e)) duty.set(e, new Map());
      duty.get(e)!.set(p.brandId, p.name);
    };
    for (const [pid, c] of day.byProcess) {
      for (const e of c.rescuedBy) add(e, pid);
    }
    for (const [pid, byDate] of ctx.covers) {
      if (!day.byProcess.has(pid)) continue;
      for (const e of byDate.get(date) ?? []) add(e, pid);
    }
    const brandName = (id: string) => ctx.brandById.get(id)?.name ?? id;
    for (const [e, brands] of duty) {
      if (roster[e]?.[date]?.status !== 'work') continue;
      if (brands.size > 1) {
        issues.push(
          mk({
            severity: 'error',
            kind: 'DOUBLE_BOOKED',
            message: `${name(e)} is covering ${[...brands.keys()].map(brandName).join(' and ')} on ${fmtDate(date)}: one person cannot staff two brands at once`,
            date,
            employeeId: e,
          }),
        );
        continue;
      }
      const target = [...brands.keys()][0];
      const own = (ctx.primaryProcs.get(e) ?? []).filter((pid) => {
        const p = ctx.procById.get(pid)!;
        return p.brandId !== target && day.byProcess.has(pid);
      });
      if (own.length > 0) {
        const ownBrands = [...new Set(own.map((pid) => brandName(ctx.procById.get(pid)!.brandId)))];
        issues.push(
          mk({
            severity: 'warning',
            kind: 'DOUBLE_DUTY',
            message: `${name(e)} covers ${brandName(target)} on ${fmtDate(date)} while ${ownBrands.join(', ')} also needs them: workload overlaps`,
            date,
            employeeId: e,
          }),
        );
      }
    }
  }

  // 4. Fairness across the company.
  const fair = fairnessReport(config, roster);
  if (fair.stdev > 1.5) {
    issues.push(
      mk({
        severity: 'warning',
        kind: 'UNFAIR_DISTRIBUTION',
        message: `Weekend offs are uneven (spread ${fair.stdev.toFixed(1)}, fairness score ${fair.score}/100)`,
      }),
    );
  }

  const rank = { error: 0, warning: 1, info: 2 } as const;
  return issues.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id),
  );
}
