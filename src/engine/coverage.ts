import { isRequired, minStaffFor } from './calendar';
import type { Ctx } from './context';
import type { CellStatus, ISODate, Roster } from './types';

export interface ProcessCoverage {
  processId: string;
  required: number;
  /** Primary staff whose cell is 'work'. */
  primaryAvailable: string[];
  /** Primary staff who are not working, with the reason. */
  unavailable: { employeeId: string; status: CellStatus }[];
  /** Backups pulled in to close the gap. */
  rescuedBy: string[];
  /** How many people are still missing after backups. 0 = covered. */
  shortfall: number;
}

export interface DayCoverage {
  date: ISODate;
  byProcess: Map<string, ProcessCoverage>;
  /** backupId -> brandId they are covering today (one brand per backup per day). */
  usedBackups: Map<string, string>;
}

const statusOf = (r: Roster, e: string, d: ISODate): CellStatus => r[e]?.[d]?.status ?? 'work';

/**
 * Coverage for every process that must run on `date`.
 * Primaries count first; if short, trained backups fill in (each backup covers one brand per day).
 */
export function computeDayCoverage(ctx: Ctx, roster: Roster, date: ISODate): DayCoverage {
  const usedBackups = new Map<string, string>();
  const byProcess = new Map<string, ProcessCoverage>();

  for (const pid of ctx.processOrder) {
    const p = ctx.procById.get(pid)!;
    if (!isRequired(p, date, ctx.holidaySet)) continue;
    const required = minStaffFor(p, date);
    const primaries = [...(ctx.primaryEmps.get(pid) ?? []), ...(ctx.covers.get(pid)?.get(date) ?? [])];
    const primaryAvailable = primaries.filter((e) => statusOf(roster, e, date) === 'work');
    const unavailable = primaries
      .filter((e) => statusOf(roster, e, date) !== 'work')
      .map((employeeId) => ({ employeeId, status: statusOf(roster, employeeId, date) }));

    let deficit = required - primaryAvailable.length;
    const rescuedBy: string[] = [];
    if (deficit > 0) {
      for (const b of ctx.backupEmps.get(pid) ?? []) {
        if (deficit <= 0) break;
        if (statusOf(roster, b, date) !== 'work') continue;
        const taken = usedBackups.get(b);
        if (taken && taken !== p.brandId) continue;
        usedBackups.set(b, p.brandId);
        rescuedBy.push(b);
        deficit--;
      }
    }
    byProcess.set(pid, {
      processId: pid,
      required,
      primaryAvailable,
      unavailable,
      rescuedBy,
      shortfall: Math.max(0, deficit),
    });
  }
  return { date, byProcess, usedBackups };
}

/**
 * Which processes would get worse if `empId` were off on `date`?
 * Empty array = the off is safe.
 */
export function wouldBreak(ctx: Ctx, roster: Roster, empId: string, date: ISODate): string[] {
  const row = roster[empId];
  const saved = row?.[date];
  if (!row || !saved) return [];
  const before = computeDayCoverage(ctx, roster, date);
  row[date] = { status: 'weekly_off', locked: false, source: 'generated' };
  const after = computeDayCoverage(ctx, roster, date);
  row[date] = saved;
  const broken: string[] = [];
  for (const [pid, c] of after.byProcess) {
    if (c.shortfall > (before.byProcess.get(pid)?.shortfall ?? 0)) broken.push(pid);
  }
  return broken;
}
