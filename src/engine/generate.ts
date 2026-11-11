import { isRequired } from './calendar';
import { buildContext, type Ctx } from './context';
import { wouldBreak } from './coverage';
import { dow, weekSegments, type WeekSegment } from './dates';
import type { Cell, ISODate, Roster, RosterConfig, Strategy } from './types';

export interface GenerateOptions {
  /** Existing roster to build on (used for partial re-solve). */
  base?: Roster;
  /** Only re-solve these ISO weeks (keys = Monday). Other weeks stay untouched. */
  onlyWeeks?: Set<ISODate>;
  strategy?: Strategy;
}

interface Weights {
  pref: number; // reward for a preferred off day
  fair: number; // penalty growth for repeated weekend offs
  spread: number; // penalty for days where many people are already off
  brand: number; // penalty for days where brand-mates are already off
  streak: number; // penalty per working day beyond SOFT_STREAK before this off
}

const WEIGHTS: Record<Strategy, Weights> = {
  balanced: { pref: 25, fair: 2, spread: 0.7, brand: 1.5, streak: 1.5 },
  fairness: { pref: 8, fair: 6, spread: 0.7, brand: 1.5, streak: 1.5 },
  preference: { pref: 40, fair: 1, spread: 0.3, brand: 0.8, streak: 1.5 },
  'min-risk': { pref: 10, fair: 1.5, spread: 2, brand: 4, streak: 1.5 },
};

/** Soft target: try to keep the gap between rest days to about this many working days. */
const SOFT_STREAK = 8;

const REST: Cell['status'][] = ['weekly_off', 'leave', 'comp_off'];

/** The cell an employee would have before any weekly off is chosen. */
export function initialCell(ctx: Ctx, empId: string, date: ISODate): Cell {
  const leave = ctx.leaves.get(empId)?.get(date);
  if (leave) return { status: leave, locked: false, source: 'leave' };

  const procs = ctx.primaryProcs.get(empId) ?? [];
  const allClosed =
    procs.length > 0 && procs.every((pid) => !isRequired(ctx.procById.get(pid)!, date, ctx.holidaySet));
  if (allClosed) {
    // A holiday that lands on a Sunday is absorbed by the Sunday weekly off.
    const holiday = ctx.holidaySet.has(date) && dow(date) !== 0;
    return { status: holiday ? 'holiday' : 'weekly_off', locked: false, source: 'closed' };
  }
  return { status: 'work', locked: false, source: 'base' };
}

/** Working days in a row immediately before `date` (within the month). */
function runBefore(row: Record<ISODate, Cell>, dates: ISODate[], date: ISODate): number {
  let run = 0;
  for (let i = dates.indexOf(date) - 1; i >= 0 && row[dates[i]]?.status === 'work'; i--) run++;
  return run;
}

export function generateRoster(config: RosterConfig, opts: GenerateOptions = {}): Roster {
  const ctx = buildContext(config);
  const w = WEIGHTS[opts.strategy ?? 'balanced'];
  const roster: Roster = opts.base ? structuredClone(opts.base) : {};

  const segments = weekSegments(ctx.dates);
  const active = opts.onlyWeeks ? segments.filter((s) => opts.onlyWeeks!.has(s.key)) : segments;
  const activeDates = new Set(active.flatMap((s) => s.dates));

  // Layer 1: hard blocks (leaves, comp-offs, holidays, closed days). Locked manual cells survive.
  for (const e of ctx.employees) {
    const row = (roster[e.id] ??= {});
    for (const d of ctx.dates) {
      const existing = row[d];
      if (!existing) {
        row[d] = initialCell(ctx, e.id, d);
        continue;
      }
      if (!activeDates.has(d)) continue;
      const init = initialCell(ctx, e.id, d);
      row[d] = existing.locked && init.source !== 'leave' ? existing : init;
    }
  }

  // Layer 2: weekly offs, tightest employees first.
  const slack = (empId: string): number => {
    const procs = ctx.primaryProcs.get(empId) ?? [];
    if (procs.length === 0) return 99;
    return Math.min(
      ...procs.map(
        (pid) =>
          (ctx.primaryEmps.get(pid)?.length ?? 0) +
          0.5 * (ctx.backupEmps.get(pid)?.length ?? 0) -
          ctx.procById.get(pid)!.minStaff,
      ),
    );
  };
  const order = [...ctx.employees].sort((a, b) => slack(a.id) - slack(b.id) || a.id.localeCompare(b.id));

  const weekendOffs = new Map<string, number>();
  for (const e of ctx.employees) {
    weekendOffs.set(
      e.id,
      ctx.dates.filter((d) => roster[e.id][d].status === 'weekly_off' && [0, 6].includes(dow(d))).length,
    );
  }

  const brandsOf = (empId: string): Set<string> =>
    new Set((ctx.primaryProcs.get(empId) ?? []).map((pid) => ctx.procById.get(pid)!.brandId));
  const brandMates = new Map<string, Set<string>>(); // empId -> colleagues sharing a brand
  for (const e of ctx.employees) {
    const mates = new Set<string>();
    const mine = brandsOf(e.id);
    for (const o of ctx.employees) {
      if (o.id === e.id) continue;
      for (const b of brandsOf(o.id)) if (mine.has(b)) mates.add(o.id);
    }
    brandMates.set(e.id, mates);
  }

  // Days off chosen by people (not forced by a closed calendar) – used to spread offs out.
  const discretionaryOffs = (d: ISODate) =>
    ctx.employees.filter((x) => {
      const c = roster[x.id][d];
      return c.status !== 'work' && c.source !== 'closed';
    }).length;

  const place = (empId: string, seg: WeekSegment) => {
    const e = ctx.empById.get(empId)!;
    const row = roster[empId];
    if (seg.dates.length < 4) return; // stub weeks at month edges need no off
    if (seg.dates.some((d) => REST.includes(row[d].status))) return; // already has a rest day

    let best: { date: ISODate; score: number } | null = null;
    for (const d of seg.dates) {
      const cell = row[d];
      if (cell.status !== 'work' || cell.locked) continue;
      if (wouldBreak(ctx, roster, empId, d).length > 0) continue; // coverage is mandatory

      let score = 0;
      const wd = dow(d);
      if (e.preferredOffDays.includes(wd)) score -= w.pref;
      if (wd === 0 || wd === 6) score += w.fair * ((weekendOffs.get(empId) ?? 0) - 0.75);
      score += w.spread * discretionaryOffs(d);
      let mates = 0;
      for (const m of brandMates.get(empId) ?? []) if (roster[m][d].status !== 'work') mates++;
      score += w.brand * mates;
      score += w.streak * Math.max(0, runBefore(row, ctx.dates, d) - SOFT_STREAK);

      if (!best || score < best.score) best = { date: d, score };
    }
    if (!best) return; // nothing safe: leave it for the validator to report
    row[best.date] = { status: 'weekly_off', locked: false, source: 'generated' };
    if ([0, 6].includes(dow(best.date))) weekendOffs.set(empId, (weekendOffs.get(empId) ?? 0) + 1);
  };

  for (const seg of active) for (const e of order) place(e.id, seg);
  return roster;
}
