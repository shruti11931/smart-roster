// Reads/writes the roster configuration (people, brands, processes, rules) in Supabase.
// The roster itself is generated deterministically from this, so only configuration is stored here.
import type { Assignment, Cover, Employee, Holiday, Leave, Pod, Process, RosterConfig } from '../engine';
import { supabase } from './supabase';

type Row = Record<string, any>;
export type ConfigWithoutMonth = Omit<RosterConfig, 'month'>;

async function select(table: string): Promise<Row[]> {
  const r = await supabase!.from(table).select('*');
  if (r.error) throw new Error(`${table}: ${r.error.message}`);
  return (r.data ?? []) as Row[];
}

export async function loadFromSupabase(): Promise<ConfigWithoutMonth | null> {
  if (!supabase) return null;
  const [pods, emps, brands, procs, rules, assigns, hols, leaves, covers] = await Promise.all(
    ['pods', 'employees', 'brands', 'processes', 'coverage_rules', 'assignments', 'holidays', 'leaves', 'covers'].map(
      select,
    ),
  );

  const processes: Process[] = procs.map((p) => {
    const mine = rules.filter((r) => r.process_id === p.id);
    const byDow: Record<number, number> = {};
    const byDate: Record<string, number> = {};
    for (const r of mine) {
      if (r.day_of_week != null) byDow[r.day_of_week] = r.min_staff;
      if (r.on_date) byDate[r.on_date] = r.min_staff;
    }
    return {
      id: p.id,
      brandId: p.brand_id,
      name: p.name,
      calendar: p.calendar_type,
      minStaff: p.min_staff,
      ...(Object.keys(byDow).length ? { minStaffByDow: byDow } : {}),
      ...(Object.keys(byDate).length ? { dateOverrides: byDate } : {}),
    };
  });

  return {
    pods: pods.map((p): Pod => ({ id: p.id, name: p.name, leadId: p.lead_employee_id ?? '' })),
    employees: emps.map(
      (e): Employee => ({
        id: e.id,
        name: e.name,
        podId: e.pod_id ?? '',
        role: e.role,
        preferredOffDays: e.preferred_off_days ?? [],
        maxConsecutive: e.max_consecutive,
      }),
    ),
    brands: brands.map((b) => ({ id: b.id, name: b.name, podId: b.pod_id ?? '' })),
    processes,
    assignments: assigns.map(
      (a): Assignment => ({ employeeId: a.employee_id, processId: a.process_id, isBackup: a.is_backup }),
    ),
    holidays: hols.map((h): Holiday => ({ date: h.date, name: h.name })),
    leaves: leaves.map(
      (l): Leave => ({ id: l.id, employeeId: l.employee_id, start: l.start_date, end: l.end_date, type: l.type }),
    ),
    covers: covers.map((c): Cover => ({ processId: c.process_id, date: c.date, employeeId: c.employee_id })),
  };
}

/** Make the database match `c`. Small data, so upsert + prune is simple and safe enough for a demo. */
export async function saveToSupabase(c: RosterConfig): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  const check = (t: string, r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(`${t}: ${r.error.message}`);
  };
  const upsert = async (t: string, rows: Row[]) => {
    if (rows.length) check(t, await sb.from(t).upsert(rows));
  };
  const replaceAll = async (t: string, col: string, rows: Row[]) => {
    check(t, await sb.from(t).delete().not(col, 'is', null));
    if (rows.length) check(t, await sb.from(t).insert(rows));
  };
  const prune = async (t: string, col: string, keep: string[]) => {
    const q = sb.from(t).delete();
    check(t, keep.length ? await q.not(col, 'in', `(${keep.map((k) => `"${k}"`).join(',')})`) : await q.not(col, 'is', null));
  };

  const empIds = new Set(c.employees.map((e) => e.id));
  await upsert('pods', c.pods.map((p) => ({ id: p.id, name: p.name, lead_employee_id: null })));
  await upsert(
    'employees',
    c.employees.map((e) => ({
      id: e.id,
      name: e.name,
      pod_id: e.podId || null,
      role: e.role,
      preferred_off_days: e.preferredOffDays,
      max_consecutive: e.maxConsecutive,
    })),
  );
  await upsert(
    'pods',
    c.pods.map((p) => ({ id: p.id, name: p.name, lead_employee_id: empIds.has(p.leadId) ? p.leadId : null })),
  );
  await upsert('brands', c.brands.map((b) => ({ id: b.id, name: b.name, pod_id: b.podId || null })));
  await upsert(
    'processes',
    c.processes.map((p) => ({
      id: p.id,
      brand_id: p.brandId,
      name: p.name,
      calendar_type: p.calendar,
      min_staff: p.minStaff,
    })),
  );
  const rules: Row[] = [];
  for (const p of c.processes) {
    for (const [d, n] of Object.entries(p.minStaffByDow ?? {}))
      rules.push({ process_id: p.id, day_of_week: Number(d), min_staff: n });
    for (const [date, n] of Object.entries(p.dateOverrides ?? {}))
      rules.push({ process_id: p.id, on_date: date, min_staff: n });
  }
  await replaceAll('coverage_rules', 'process_id', rules);
  await replaceAll(
    'assignments',
    'employee_id',
    c.assignments.map((a) => ({ employee_id: a.employeeId, process_id: a.processId, is_backup: a.isBackup })),
  );
  await upsert('holidays', c.holidays.map((h) => ({ date: h.date, name: h.name })));
  await upsert(
    'leaves',
    c.leaves.map((l) => ({
      id: l.id,
      employee_id: l.employeeId,
      start_date: l.start,
      end_date: l.end,
      type: l.type,
    })),
  );
  await replaceAll(
    'covers',
    'process_id',
    (c.covers ?? []).map((v) => ({ process_id: v.processId, date: v.date, employee_id: v.employeeId })),
  );

  await prune('holidays', 'date', c.holidays.map((h) => h.date));
  await prune('leaves', 'id', c.leaves.map((l) => l.id));
  await prune('processes', 'id', c.processes.map((p) => p.id));
  await prune('brands', 'id', c.brands.map((b) => b.id));
  await prune('employees', 'id', c.employees.map((e) => e.id));
  await prune('pods', 'id', c.pods.map((p) => p.id));
}
