import { buildContext } from './context';
import { rangeDates, weekStart } from './dates';
import { generateRoster } from './generate';
import { validateRoster } from './validate';
import type { CellDiff, CellStatus, ISODate, Issue, Leave, Roster, RosterConfig, Strategy } from './types';

export interface LeaveChange {
  employeeId: string;
  start: ISODate;
  end: ISODate;
  type: 'leave' | 'comp_off';
}

export interface ChangeResult {
  config: RosterConfig;
  roster: Roster;
  issuesBefore: Issue[];
  issuesAfter: Issue[];
  /** Errors/warnings that exist now but did not before. */
  introduced: Issue[];
  /** Errors/warnings that existed before and are gone. */
  resolved: Issue[];
  diff: CellDiff[];
  summary: string;
}

const actionable = (i: Issue) => i.severity !== 'info';

export function diffRosters(a: Roster, b: Roster): CellDiff[] {
  const out: CellDiff[] = [];
  for (const [employeeId, row] of Object.entries(b)) {
    for (const [date, cell] of Object.entries(row)) {
      const was = a[employeeId]?.[date]?.status;
      if (was && was !== cell.status) out.push({ employeeId, date, from: was, to: cell.status });
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.employeeId.localeCompare(y.employeeId));
}

function compare(before: Issue[], after: Issue[]) {
  const b = new Set(before.filter(actionable).map((i) => i.id));
  const a = new Set(after.filter(actionable).map((i) => i.id));
  return {
    introduced: after.filter((i) => actionable(i) && !b.has(i.id)),
    resolved: before.filter((i) => actionable(i) && !a.has(i.id)),
  };
}

function summarize(introduced: Issue[], resolved: Issue[]): string {
  const ne = introduced.filter((i) => i.severity === 'error').length;
  const nw = introduced.filter((i) => i.severity === 'warning').length;
  const re = resolved.filter((i) => i.severity === 'error').length;
  const parts: string[] = [];
  if (ne) parts.push(`${ne} new error${ne > 1 ? 's' : ''}`);
  if (nw) parts.push(`${nw} new warning${nw > 1 ? 's' : ''}`);
  if (re) parts.push(`${re} error${re > 1 ? 's' : ''} fixed`);
  return parts.length ? parts.join(', ') : 'No new issues';
}

/** Manual edit of one cell. The cell is locked so regeneration never overwrites it. */
export function editCell(
  config: RosterConfig,
  roster: Roster,
  employeeId: string,
  date: ISODate,
  status: CellStatus,
): ChangeResult {
  const issuesBefore = validateRoster(config, roster);
  const next = structuredClone(roster);
  next[employeeId][date] = { status, locked: true, source: 'manual' };
  const issuesAfter = validateRoster(config, next);
  const { introduced, resolved } = compare(issuesBefore, issuesAfter);
  return {
    config,
    roster: next,
    issuesBefore,
    issuesAfter,
    introduced,
    resolved,
    diff: diffRosters(roster, next),
    summary: summarize(introduced, resolved),
  };
}

/** Assign someone to cover a process for one day. A weekly off they give up is recorded as worked. */
export function applyCover(
  config: RosterConfig,
  roster: Roster,
  cover: { processId: string; date: ISODate; employeeId: string },
): ChangeResult {
  const issuesBefore = validateRoster(config, roster);
  const nextConfig: RosterConfig = { ...config, covers: [...(config.covers ?? []), cover] };
  const next = structuredClone(roster);
  const cell = next[cover.employeeId]?.[cover.date];
  if (cell && cell.status !== 'work') {
    next[cover.employeeId][cover.date] = { status: 'work', locked: true, source: 'manual' };
  }
  const issuesAfter = validateRoster(nextConfig, next);
  const { introduced, resolved } = compare(issuesBefore, issuesAfter);
  return {
    config: nextConfig,
    roster: next,
    issuesBefore,
    issuesAfter,
    introduced,
    resolved,
    diff: diffRosters(roster, next),
    summary: summarize(introduced, resolved),
  };
}

/** Record a leave/comp-off and mark the cells, WITHOUT re-solving, so the raw gap is visible. */
export function applyLeave(config: RosterConfig, roster: Roster, change: LeaveChange): ChangeResult {
  const issuesBefore = validateRoster(config, roster);
  const leave: Leave = { id: `lv-new-${config.leaves.length + 1}`, ...change };
  const nextConfig: RosterConfig = { ...config, leaves: [...config.leaves, leave] };
  const next = structuredClone(roster);
  const ctx = buildContext(nextConfig);
  for (const d of rangeDates(change.start, change.end)) {
    if (!ctx.dates.includes(d)) continue;
    next[change.employeeId][d] = { status: change.type, locked: false, source: 'leave' };
  }
  const issuesAfter = validateRoster(nextConfig, next);
  const { introduced, resolved } = compare(issuesBefore, issuesAfter);
  return {
    config: nextConfig,
    roster: next,
    issuesBefore,
    issuesAfter,
    introduced,
    resolved,
    diff: diffRosters(roster, next),
    summary: summarize(introduced, resolved),
  };
}

/** Re-solve only the given weeks. Manual (locked) cells and all other weeks stay as they are. */
export function resolveWeeks(
  config: RosterConfig,
  roster: Roster,
  weeks: Iterable<ISODate>,
  strategy: Strategy = 'balanced',
): ChangeResult {
  const issuesBefore = validateRoster(config, roster);
  const next = generateRoster(config, { base: roster, onlyWeeks: new Set(weeks), strategy });
  const issuesAfter = validateRoster(config, next);
  const { introduced, resolved } = compare(issuesBefore, issuesAfter);
  return {
    config,
    roster: next,
    issuesBefore,
    issuesAfter,
    introduced,
    resolved,
    diff: diffRosters(roster, next),
    summary: summarize(introduced, resolved),
  };
}

export const weeksOf = (start: ISODate, end: ISODate): Set<ISODate> =>
  new Set(rangeDates(start, end).map(weekStart));

/** Leave + automatic re-solve of the affected weeks in one step. */
export function addLeaveAndResolve(
  config: RosterConfig,
  roster: Roster,
  change: LeaveChange,
  strategy: Strategy = 'balanced',
): ChangeResult {
  const issuesBefore = validateRoster(config, roster);
  const leaveApplied = applyLeave(config, roster, change);
  const solved = resolveWeeks(leaveApplied.config, leaveApplied.roster, weeksOf(change.start, change.end), strategy);
  const { introduced, resolved } = compare(issuesBefore, solved.issuesAfter);
  return {
    ...solved,
    issuesBefore,
    introduced,
    resolved,
    diff: diffRosters(roster, solved.roster),
    summary: summarize(introduced, resolved),
  };
}
