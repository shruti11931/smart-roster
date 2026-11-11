// Add / remove people, pods, brands, processes and staffing. Each function mutates the config it is given
// (the store passes a clone) and keeps every reference consistent.
import type { CalendarType, Employee, RosterConfig } from '../engine';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const nextNum = (ids: string[], prefix: string) =>
  1 + Math.max(0, ...ids.map((i) => Number(i.replace(prefix, '')) || 0));
const unique = (base: string, taken: string[]) => {
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
};

export function addEmployee(c: RosterConfig, p: { name: string; podId: string; role: Employee['role'] }): string {
  const id = `e${String(nextNum(c.employees.map((e) => e.id), 'e')).padStart(2, '0')}`;
  c.employees.push({ id, name: p.name, podId: p.podId, role: p.role, preferredOffDays: [], maxConsecutive: 12 });
  return id;
}

export function removeEmployee(c: RosterConfig, id: string) {
  c.employees = c.employees.filter((e) => e.id !== id);
  c.assignments = c.assignments.filter((a) => a.employeeId !== id);
  c.leaves = c.leaves.filter((l) => l.employeeId !== id);
  c.covers = (c.covers ?? []).filter((v) => v.employeeId !== id);
  for (const p of c.pods) if (p.leadId === id) p.leadId = '';
}

export function addPod(c: RosterConfig, name: string, leadId: string): string {
  const id = unique(`pod-${slug(name)}`, c.pods.map((p) => p.id));
  c.pods.push({ id, name, leadId });
  return id;
}

export function removePod(c: RosterConfig, id: string) {
  if (c.pods.length <= 1) return;
  const fallback = c.pods.find((p) => p.id !== id)!.id;
  for (const e of c.employees) if (e.podId === id) e.podId = fallback;
  for (const b of c.brands) if (b.podId === id) b.podId = fallback;
  c.pods = c.pods.filter((p) => p.id !== id);
}

export function addBrand(c: RosterConfig, name: string, podId: string): string {
  const id = `b${String(nextNum(c.brands.map((b) => b.id), 'b')).padStart(2, '0')}`;
  c.brands.push({ id, name, podId });
  return id;
}

export function addProcess(
  c: RosterConfig,
  p: { brandId: string; name: string; calendar: CalendarType; minStaff: number },
): string {
  const id = unique(`${p.brandId}-${slug(p.name)}`, c.processes.map((x) => x.id));
  c.processes.push({ id, brandId: p.brandId, name: p.name, calendar: p.calendar, minStaff: p.minStaff });
  return id;
}

export function removeProcess(c: RosterConfig, id: string) {
  c.processes = c.processes.filter((p) => p.id !== id);
  c.assignments = c.assignments.filter((a) => a.processId !== id);
  c.covers = (c.covers ?? []).filter((v) => v.processId !== id);
}

export function removeBrand(c: RosterConfig, id: string) {
  for (const p of c.processes.filter((x) => x.brandId === id)) removeProcess(c, p.id);
  c.brands = c.brands.filter((b) => b.id !== id);
}

/** mode null = remove the assignment. */
export function setStaff(c: RosterConfig, processId: string, employeeId: string, mode: 'primary' | 'backup' | null) {
  c.assignments = c.assignments.filter((a) => !(a.employeeId === employeeId && a.processId === processId));
  if (mode) c.assignments.push({ employeeId, processId, isBackup: mode === 'backup' });
}

export interface ProcessRules {
  calendar?: CalendarType;
  minStaff?: number;
  /** 0 = Sunday ... 6 = Saturday. An empty object clears the overrides. */
  minStaffByDow?: Partial<Record<number, number>>;
  dateOverrides?: Record<string, number>;
}

/** Change the operating calendar and staffing minimums of an existing process. */
export function updateProcess(c: RosterConfig, id: string, rules: ProcessRules) {
  const p = c.processes.find((x) => x.id === id);
  if (!p) return;
  if (rules.calendar) p.calendar = rules.calendar;
  if (rules.minStaff !== undefined) p.minStaff = Math.max(1, Math.round(rules.minStaff));
  if (rules.minStaffByDow !== undefined) {
    const clean = Object.fromEntries(Object.entries(rules.minStaffByDow).filter(([, v]) => v !== undefined && v >= 1));
    if (Object.keys(clean).length) p.minStaffByDow = clean;
    else delete p.minStaffByDow;
  }
  if (rules.dateOverrides !== undefined) {
    if (Object.keys(rules.dateOverrides).length) p.dateOverrides = rules.dateOverrides;
    else delete p.dateOverrides;
  }
}
