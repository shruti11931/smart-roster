import { monthDates, rangeDates } from './dates';
import type { Brand, Employee, ISODate, Pod, Process, RosterConfig } from './types';

/** Precomputed lookups so the engine never re-scans the config arrays. */
export interface Ctx {
  config: RosterConfig;
  dates: ISODate[];
  employees: Employee[];
  empById: Map<string, Employee>;
  procById: Map<string, Process>;
  brandById: Map<string, Brand>;
  podById: Map<string, Pod>;
  holidaySet: Set<ISODate>;
  /** processId -> primary employee ids */
  primaryEmps: Map<string, string[]>;
  /** processId -> backup employee ids */
  backupEmps: Map<string, string[]>;
  /** employeeId -> primary process ids */
  primaryProcs: Map<string, string[]>;
  /** employeeId -> processes (primary or backup) they are trained on */
  trainedProcs: Map<string, Set<string>>;
  /** employeeId -> date -> leave type (clipped to the month) */
  leaves: Map<string, Map<ISODate, 'leave' | 'comp_off'>>;
  /** processId -> date -> employees covering for just that day */
  covers: Map<string, Map<ISODate, string[]>>;
  /** Process ids, tightest (fewest primaries) first; fixes the order backups are allocated in. */
  processOrder: string[];
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

export function buildContext(config: RosterConfig): Ctx {
  const dates = monthDates(config.month);
  const first = dates[0];
  const last = dates[dates.length - 1];

  const primaryEmps = new Map<string, string[]>();
  const backupEmps = new Map<string, string[]>();
  const primaryProcs = new Map<string, string[]>();
  const trainedProcs = new Map<string, Set<string>>();
  for (const a of config.assignments) {
    push(a.isBackup ? backupEmps : primaryEmps, a.processId, a.employeeId);
    if (!a.isBackup) push(primaryProcs, a.employeeId, a.processId);
    if (!trainedProcs.has(a.employeeId)) trainedProcs.set(a.employeeId, new Set());
    trainedProcs.get(a.employeeId)!.add(a.processId);
  }

  const leaves = new Map<string, Map<ISODate, 'leave' | 'comp_off'>>();
  for (const l of config.leaves) {
    const from = l.start > first ? l.start : first;
    const to = l.end < last ? l.end : last;
    if (from > to) continue;
    if (!leaves.has(l.employeeId)) leaves.set(l.employeeId, new Map());
    for (const d of rangeDates(from, to)) leaves.get(l.employeeId)!.set(d, l.type);
  }

  const covers = new Map<string, Map<ISODate, string[]>>();
  for (const c of config.covers ?? []) {
    if (!covers.has(c.processId)) covers.set(c.processId, new Map());
    push(covers.get(c.processId)!, c.date, c.employeeId);
  }

  const processOrder = [...config.processes]
    .sort(
      (a, b) =>
        (primaryEmps.get(a.id)?.length ?? 0) - (primaryEmps.get(b.id)?.length ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .map((p) => p.id);

  return {
    config,
    dates,
    employees: config.employees,
    empById: new Map(config.employees.map((e) => [e.id, e])),
    procById: new Map(config.processes.map((p) => [p.id, p])),
    brandById: new Map(config.brands.map((b) => [b.id, b])),
    podById: new Map(config.pods.map((p) => [p.id, p])),
    holidaySet: new Set(config.holidays.map((h) => h.date)),
    primaryEmps,
    backupEmps,
    primaryProcs,
    trainedProcs,
    leaves,
    covers,
    processOrder,
  };
}
