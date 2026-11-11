import { describe, expect, it } from 'vitest';
import { DEMO_LEAVE, seedConfig } from '../../data/seed';
import {
  addLeaveAndResolve,
  applyCover,
  applyLeave,
  buildContext,
  dow,
  editCell,
  fairnessReport,
  generateRoster,
  isRequired,
  monthDates,
  resolveWeeks,
  suggestBackups,
  validateRoster,
  weekSegments,
  weeksOf,
  type Process,
  type RosterConfig,
} from '..';

const hol = new Set(['2026-11-11']);
const proc = (calendar: Process['calendar']): Process => ({
  id: 'p',
  brandId: 'b',
  name: 'CS',
  calendar,
  minStaff: 1,
});

/** Small config: one brand, one process, the given staff (all primary). */
function tiny(staff: string[], calendar: Process['calendar'] = 'ALL_DAYS', backup: string[] = []): RosterConfig {
  const ids = [...staff, ...backup];
  return {
    month: '2026-11',
    pods: [{ id: 'pd', name: 'P', leadId: ids[0] }],
    employees: ids.map((id) => ({
      id,
      name: id.toUpperCase(),
      podId: 'pd',
      role: 'agent' as const,
      preferredOffDays: [],
      maxConsecutive: 12,
    })),
    brands: [{ id: 'b', name: 'Brand', podId: 'pd' }],
    processes: [proc(calendar)],
    assignments: [
      ...staff.map((employeeId) => ({ employeeId, processId: 'p', isBackup: false })),
      ...backup.map((employeeId) => ({ employeeId, processId: 'p', isBackup: true })),
    ],
    holidays: [],
    leaves: [],
  };
}

describe('operating calendars', () => {
  it('ALL_DAYS is always required', () => {
    expect(isRequired(proc('ALL_DAYS'), '2026-11-15', hol)).toBe(true); // Sunday
    expect(isRequired(proc('ALL_DAYS'), '2026-11-11', hol)).toBe(true); // holiday
  });
  it('EXCL_HOLIDAYS skips holidays but runs Sundays', () => {
    expect(isRequired(proc('EXCL_HOLIDAYS'), '2026-11-11', hol)).toBe(false);
    expect(isRequired(proc('EXCL_HOLIDAYS'), '2026-11-15', hol)).toBe(true);
  });
  it('EXCL_SUN_HOLIDAYS skips Sundays and holidays', () => {
    expect(isRequired(proc('EXCL_SUN_HOLIDAYS'), '2026-11-15', hol)).toBe(false);
    expect(isRequired(proc('EXCL_SUN_HOLIDAYS'), '2026-11-11', hol)).toBe(false);
    expect(isRequired(proc('EXCL_SUN_HOLIDAYS'), '2026-11-12', hol)).toBe(true);
  });
  it('knows 1 Nov 2026 is a Sunday and splits the month into 6 week segments', () => {
    expect(dow('2026-11-01')).toBe(0);
    const segs = weekSegments(monthDates('2026-11'));
    expect(segs.map((s) => s.dates.length)).toEqual([1, 7, 7, 7, 7, 1]);
  });
});

describe('generation on small configs', () => {
  it('two people on a 365-day process each get a weekly off, never overlapping', () => {
    const cfg = tiny(['a', 'b']);
    const r = generateRoster(cfg);
    expect(validateRoster(cfg, r).filter((i) => i.severity === 'error')).toEqual([]);
    for (const d of monthDates('2026-11')) {
      expect(['a', 'b'].some((e) => r[e][d].status === 'work')).toBe(true);
    }
  });

  it('a lone person on a 365-day process cannot get a weekly off: flagged, never silently invalid', () => {
    const cfg = tiny(['a']);
    const r = generateRoster(cfg);
    const issues = validateRoster(cfg, r);
    expect(issues.filter((i) => i.kind === 'MISSING_WEEKLY_OFF')).toHaveLength(4);
    expect(issues.some((i) => i.kind === 'NO_COVERAGE')).toBe(false); // coverage was never broken
    expect(issues[0].message).toContain('uncovered');
  });

  it('a lone person on a Sunday-closed process gets Sunday off automatically', () => {
    const cfg = tiny(['a'], 'EXCL_SUN_HOLIDAYS');
    const r = generateRoster(cfg);
    expect(r.a['2026-11-15']).toMatchObject({ status: 'weekly_off', source: 'closed' });
    expect(validateRoster(cfg, r).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('a trained backup lets a lone person on a 365-day process take a weekly off', () => {
    const cfg = tiny(['a'], 'ALL_DAYS', ['z']);
    const r = generateRoster(cfg);
    const issues = validateRoster(cfg, r);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(issues.some((i) => i.kind === 'BACKUP_COVER')).toBe(true);
  });

  it('is deterministic', () => {
    expect(generateRoster(seedConfig)).toEqual(generateRoster(seedConfig));
  });

  it('honours a preference when coverage allows it', () => {
    const cfg = tiny(['a', 'b']);
    cfg.employees[0].preferredOffDays = [3];
    const r = generateRoster(cfg);
    const offs = monthDates('2026-11').filter((d) => r.a[d].status === 'weekly_off');
    expect(offs.every((d) => dow(d) === 3)).toBe(true);
  });
});

describe('sample data', () => {
  const ctx = buildContext(seedConfig);
  const roster = generateRoster(seedConfig);
  const issues = validateRoster(seedConfig, roster);
  const errors = issues.filter((i) => i.severity === 'error');

  it('has the required scale: 30+ employees, ~80% single-resource brands', () => {
    expect(seedConfig.employees.length).toBeGreaterThanOrEqual(30);
    const single = seedConfig.brands.filter((b) => {
      const people = new Set(
        seedConfig.assignments
          .filter((a) => !a.isBackup && ctx.procById.get(a.processId)!.brandId === b.id)
          .map((a) => a.employeeId),
      );
      return people.size === 1;
    });
    expect(single.length / seedConfig.brands.length).toBeGreaterThanOrEqual(0.75);
  });

  it('uses all three operating calendars', () => {
    expect(new Set(seedConfig.processes.map((p) => p.calendar)).size).toBe(3);
  });

  it('reports exactly the two planted conflicts as errors', () => {
    expect(errors.map((e) => [e.kind, e.processId, e.date])).toEqual([
      ['NO_COVERAGE', 'b06-customer-support', '2026-11-15'],
      ['UNDERSTAFFED', 'b03-customer-support', '2026-11-21'],
    ]);
  });

  it('gives every conflict ranked fixes', () => {
    for (const e of errors) expect(e.fixes?.length).toBeGreaterThan(0);
  });

  it('gives every employee a rest day in every full week unless a conflict is reported', () => {
    expect(issues.filter((i) => i.kind === 'MISSING_WEEKLY_OFF')).toEqual([]);
  });
});

describe('change handling', () => {
  const roster = generateRoster(seedConfig);

  it('a solo agent with no backup on leave leaves a visible gap with suggestions', () => {
    const res = applyLeave(seedConfig, roster, DEMO_LEAVE);
    const gaps = res.introduced.filter((i) => i.kind === 'NO_COVERAGE');
    expect(gaps.length).toBe(4); // 2 processes x 2 days
    expect(gaps.every((g) => (g.fixes?.length ?? 0) > 0)).toBe(true);
    expect(res.summary).toBe('4 new errors');
  });

  it('applying a suggested cover clears that gap', () => {
    const res = applyLeave(seedConfig, roster, DEMO_LEAVE);
    const gap = res.introduced.find((i) => i.kind === 'NO_COVERAGE')!;
    const pick = gap.fixes![0];
    const fixed = applyCover(res.config, res.roster, {
      processId: gap.processId!,
      date: gap.date!,
      employeeId: pick.employeeId,
    });
    expect(fixed.resolved.some((i) => i.id === gap.id)).toBe(true);
    expect(fixed.introduced.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('re-solving after a leave touches only the affected week and keeps other weeks identical', () => {
    const res = addLeaveAndResolve(seedConfig, roster, DEMO_LEAVE);
    const weeks = weeksOf(DEMO_LEAVE.start, DEMO_LEAVE.end);
    for (const d of res.diff) expect(weeks.has(weekSegments([d.date])[0].key)).toBe(true);
  });

  it('a leave that other staff can absorb causes no new errors', () => {
    const res = addLeaveAndResolve(seedConfig, roster, {
      employeeId: 'e14', // Kiwi Home has a second agent
      start: '2026-11-03',
      end: '2026-11-03',
      type: 'leave',
    });
    expect(res.introduced.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('manual edits are locked and survive regeneration', () => {
    // Make e16 work a Saturday and lock it, then re-solve that week.
    const edited = editCell(seedConfig, roster, 'e16', '2026-11-14', 'work');
    expect(edited.roster.e16['2026-11-14']).toMatchObject({ locked: true, source: 'manual' });
    const again = resolveWeeks(seedConfig, edited.roster, ['2026-11-09']);
    expect(again.roster.e16['2026-11-14']).toMatchObject({ status: 'work', locked: true });
  });

  it('an edit that opens a gap reports it as a new error', () => {
    const res = editCell(seedConfig, roster, 'e12', '2026-11-18', 'weekly_off');
    // Zenith needs only 1 on a weekday, so e12 off is fine if e11 works.
    expect(res.introduced.filter((i) => i.severity === 'error')).toEqual([]);
    const bad = editCell(res.config, res.roster, 'e11', '2026-11-18', 'weekly_off');
    expect(bad.introduced.some((i) => i.kind === 'NO_COVERAGE')).toBe(true);
    expect(bad.summary).toMatch(/new error/);
  });
});

describe('suggestions', () => {
  it('ranks trained and same-brand people above strangers', () => {
    const roster = generateRoster(seedConfig);
    const ctx = buildContext(seedConfig);
    // Zenith CS on Sat 21 Nov: e11 on leave; nobody trained, so same pod ranks first.
    const s = suggestBackups(ctx, roster, 'b03-customer-support', '2026-11-21');
    expect(s.length).toBeGreaterThan(3);
    expect(s[0].score).toBeGreaterThanOrEqual(s[s.length - 1].score);
    expect(s.every((x) => x.employeeId !== 'e11' && x.employeeId !== 'e12')).toBe(true);
  });
});

describe('strategies and fairness', () => {
  it('every strategy produces a roster with no mandatory-rule errors beyond the planted ones', () => {
    for (const strategy of ['balanced', 'fairness', 'preference', 'min-risk'] as const) {
      const r = generateRoster(seedConfig, { strategy });
      const errs = validateRoster(seedConfig, r).filter((i) => i.severity === 'error');
      expect(errs.length, strategy).toBe(2);
    }
  });

  it('fairness-first spreads weekend offs at least as evenly as preference-first', () => {
    const fair = fairnessReport(seedConfig, generateRoster(seedConfig, { strategy: 'fairness' }));
    const pref = fairnessReport(seedConfig, generateRoster(seedConfig, { strategy: 'preference' }));
    expect(fair.stdev).toBeLessThanOrEqual(pref.stdev);
  });

  it('preference-first misses fewer preferences than fairness-first', () => {
    const missed = (s: 'fairness' | 'preference') =>
      validateRoster(seedConfig, generateRoster(seedConfig, { strategy: s })).filter(
        (i) => i.kind === 'PREFERENCE_MISSED',
      ).length;
    expect(missed('preference')).toBeLessThanOrEqual(missed('fairness'));
  });
});
