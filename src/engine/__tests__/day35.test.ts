import { describe, expect, it, vi } from 'vitest';

// The store persists to localStorage; give the node test run an in-memory one.
vi.hoisted(() => {
  const m = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    },
  });
});

import { seedConfig } from '../../data/seed';
import { updateProcess } from '../../lib/configOps';
import { useRoster } from '../../store';
import { generateRoster, suggestBackups, buildContext, validateRoster, type RosterConfig } from '..';

const clone = (): RosterConfig => structuredClone(seedConfig);
const errs = (c: RosterConfig) => validateRoster(c, generateRoster(c)).filter((i) => i.severity === 'error');

describe('sample data: processes that need more than one person', () => {
  it('has processes needing 2 staff every normal day, each with enough people to rest', () => {
    const multi = seedConfig.processes.filter((p) => p.minStaff >= 2);
    expect(multi.length).toBeGreaterThanOrEqual(2);
    for (const p of multi) {
      const primaries = seedConfig.assignments.filter((a) => a.processId === p.id && !a.isBackup);
      expect(primaries.length).toBeGreaterThan(p.minStaff);
    }
  });
  it('still reports exactly the two planted conflicts as errors', () => {
    expect(errs(clone())).toHaveLength(2);
  });
});

describe('editing an existing process', () => {
  it('changes calendar, default minimum, weekday and date overrides', () => {
    const c = clone();
    updateProcess(c, 'b06-customer-support', { calendar: 'EXCL_HOLIDAYS', minStaff: 2, minStaffByDow: { 6: 3 }, dateOverrides: { '2026-11-10': 4 } });
    const p = c.processes.find((x) => x.id === 'b06-customer-support')!;
    expect([p.calendar, p.minStaff, p.minStaffByDow, p.dateOverrides]).toEqual(['EXCL_HOLIDAYS', 2, { 6: 3 }, { '2026-11-10': 4 }]);
    updateProcess(c, 'b06-customer-support', { minStaffByDow: {}, dateOverrides: {} });
    expect(p.minStaffByDow).toBeUndefined();
    expect(p.dateOverrides).toBeUndefined();
  });
  it('a higher minimum on one date creates a gap on that date only', () => {
    const c = clone();
    const before = errs(c).length;
    updateProcess(c, 'b09-customer-support', { dateOverrides: { '2026-11-10': 2 } }); // a one-person brand
    const after = errs(c);
    expect(after.length).toBe(before + 1);
    expect(after.some((i) => i.date === '2026-11-10' && i.processId === 'b09-customer-support')).toBe(true);
  });
  it('switching a process to 365 days makes its Sundays required', () => {
    const c = clone();
    updateProcess(c, 'b09-customer-support', { calendar: 'ALL_DAYS' });
    expect(errs(c).length).toBeGreaterThan(2);
  });
});

describe('overlapping responsibilities', () => {
  const find = () => {
    const c = clone();
    const date = '2026-11-10';
    const r = generateRoster(c);
    const ctx = buildContext(c);
    // someone with their own brand open today who is working
    const emp = ['e21', 'e22', 'e23', 'e24', 'e25'].find((id) => r[id][date].status === 'work' && (ctx.primaryProcs.get(id) ?? []).length > 0)!;
    return { c, date, emp };
  };
  it('a cover who is also needed on their own brand gets a warning', () => {
    const { c, date, emp } = find();
    c.covers = [{ processId: 'b06-customer-support', date, employeeId: emp }];
    const issues = validateRoster(c, generateRoster(c));
    expect(issues.some((i) => i.kind === 'DOUBLE_DUTY' && i.employeeId === emp && i.date === date && i.severity === 'warning')).toBe(true);
    expect(issues.some((i) => i.kind === 'DOUBLE_BOOKED')).toBe(false);
  });
  it('covering two brands on the same day is an error', () => {
    const { c, date, emp } = find();
    c.covers = [
      { processId: 'b06-customer-support', date, employeeId: emp },
      { processId: 'b07-customer-support', date, employeeId: emp },
    ];
    const issues = validateRoster(c, generateRoster(c));
    expect(issues.some((i) => i.kind === 'DOUBLE_BOOKED' && i.severity === 'error' && i.employeeId === emp)).toBe(true);
  });
  it('suggestions never offer someone already covering another brand that day', () => {
    const { c, date, emp } = find();
    c.covers = [{ processId: 'b06-customer-support', date, employeeId: emp }];
    const r = generateRoster(c);
    const names = suggestBackups(buildContext(c), r, 'b07-customer-support', date).map((s) => s.employeeId);
    expect(names).not.toContain(emp);
  });
});

describe('any month can be planned', () => {
  it('months that end mid-week are not flagged for a rest day that falls next month', () => {
    for (const month of ['2026-10', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06']) {
      const c = { ...clone(), month };
      expect(errs(c), month).toHaveLength(0);
    }
  });
  it('the store opens another month, remembers its edits and returns to the first', () => {
    const s = useRoster.getState();
    s.resetSample();
    useRoster.getState().setMonth('2026-12');
    expect(useRoster.getState().config.month).toBe('2026-12');
    expect(Object.keys(useRoster.getState().roster['e01'])).toHaveLength(31);
    useRoster.getState().editCell('e01', '2026-12-09', 'leave');
    useRoster.getState().setMonth('2026-11');
    expect(Object.keys(useRoster.getState().roster['e01'])[0]).toBe('2026-11-01');
    expect(useRoster.getState().months['2026-12']).toBeDefined();
    useRoster.getState().setMonth('2026-12');
    expect(useRoster.getState().roster['e01']['2026-12-09']).toMatchObject({ status: 'leave', locked: true });
    useRoster.getState().setMonth('not-a-month');
    expect(useRoster.getState().config.month).toBe('2026-12');
  });
});
