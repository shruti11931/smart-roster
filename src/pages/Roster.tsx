import { useMemo, useState, type CSSProperties } from 'react';
import Grid, { Legend } from '../components/Grid';
import CellMenu, { type MenuTarget } from '../components/CellMenu';
import IssueList from '../components/IssueList';
import { dow, isRequired, WEEKDAY_NAMES, type CellStatus, type Employee, type Issue, type Roster, type RosterConfig } from '../engine';
import { downloadXlsx } from '../lib/excel';
import { download, monthLabel, rosterCsv, STATUS, useAnalysis, type Analysis } from '../lib/analysis';
import { useRoster } from '../store';

const VIEWS = [
  ['company', 'Company'],
  ['pod', 'Pod'],
  ['brand', 'Brand'],
  ['process', 'Process'],
  ['employee', 'Employee'],
] as const;
type View = (typeof VIEWS)[number][0];

const COVERAGE_KINDS = ['NO_COVERAGE', 'UNDERSTAFFED'];

export default function RosterPage() {
  const { config, roster } = useRoster();
  const an = useAnalysis(config, roster);
  const { ctx } = an;
  const [view, setView] = useState<View>('company');
  const [sel, setSel] = useState<Partial<Record<View, string>>>({});
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const pick = (e: Employee, d: string, r: DOMRect) => setMenu({ empId: e.id, date: d, x: r.left, y: r.bottom });

  const procName = (pid: string) => {
    const p = ctx.procById.get(pid)!;
    return `${ctx.brandById.get(p.brandId)?.name}: ${p.name}`;
  };
  const options = useMemo(
    () => ({
      pod: config.pods.map((p) => ({ id: p.id, label: `Pod ${p.name}` })),
      brand: config.brands.map((b) => ({ id: b.id, label: b.name })),
      process: config.processes.map((p) => ({ id: p.id, label: procName(p.id) })),
      employee: config.employees.map((e) => ({ id: e.id, label: e.name })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config],
  );
  const current = view === 'company' ? '' : (sel[view] ?? options[view][0].id);

  // What the grid shows for the chosen view.
  const nonInfo = an.issues.filter((i) => i.severity !== 'info');
  let employees: Employee[] = config.employees;
  let coverage: { id: string; label: string }[] = [];
  let tags: Record<string, string> = {};
  let scoped: Issue[] = nonInfo;
  let title = `Whole company, ${monthLabel(config.month)}`;
  let facts = `${employees.length} employees`;

  const assigned = (pids: string[]) => {
    const seen = new Map<string, boolean>(); // employee -> backup only?
    for (const a of config.assignments) {
      if (!pids.includes(a.processId)) continue;
      seen.set(a.employeeId, (seen.get(a.employeeId) ?? true) && a.isBackup);
    }
    const list = [...seen.keys()].map((id) => ctx.empById.get(id)!).sort((a, b) => Number(seen.get(a.id)) - Number(seen.get(b.id)) || a.name.localeCompare(b.name));
    return { list, tags: Object.fromEntries([...seen].filter(([, b]) => b).map(([id]) => [id, 'backup'])) };
  };

  if (view === 'pod') {
    const pod = ctx.podById.get(current)!;
    employees = config.employees.filter((e) => e.podId === current);
    tags = { [pod.leadId]: 'pod lead' };
    const brandIds = new Set(config.brands.filter((b) => b.podId === current).map((b) => b.id));
    coverage = config.processes.filter((p) => brandIds.has(p.brandId)).map((p) => ({ id: p.id, label: procName(p.id) }));
    scoped = nonInfo.filter((i) => (i.brandId ? brandIds.has(i.brandId) : i.employeeId ? ctx.empById.get(i.employeeId)?.podId === current : false));
    title = `Pod ${pod.name}`;
    facts = `Led by ${ctx.empById.get(pod.leadId)?.name}, ${employees.length} people, ${brandIds.size} brands`;
  } else if (view === 'brand') {
    const procs = config.processes.filter((p) => p.brandId === current);
    const a = assigned(procs.map((p) => p.id));
    employees = a.list;
    tags = a.tags;
    coverage = procs.map((p) => ({ id: p.id, label: p.name }));
    scoped = nonInfo.filter((i) => i.brandId === current || (i.employeeId && employees.some((e) => e.id === i.employeeId)));
    title = ctx.brandById.get(current)!.name;
    facts = `${procs.length} process${procs.length > 1 ? 'es' : ''}, ${employees.length} ${employees.length === 1 ? 'person' : 'people'}${employees.length === 1 ? ' (single-resource brand)' : ''}`;
  } else if (view === 'process') {
    const a = assigned([current]);
    employees = a.list;
    tags = a.tags;
    coverage = [{ id: current, label: procName(current) }];
    scoped = nonInfo.filter((i) => i.processId === current);
    const p = ctx.procById.get(current)!;
    title = procName(current);
    facts = `Needs ${p.minStaff} on a normal day, ${employees.length} assigned`;
  }

  const gapDates = new Set(scoped.filter((i) => COVERAGE_KINDS.includes(i.kind) && i.date).map((i) => i.date!));
  const emp = view === 'employee' ? ctx.empById.get(current)! : null;
  const empIssues = emp
    ? nonInfo.filter((i) => i.employeeId === emp.id || (i.processId && (ctx.primaryProcs.get(emp.id) ?? []).includes(i.processId)))
    : [];

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Roster</h1>
          <p className="sub">{title}. {emp ? '' : facts}</p>
        </div>
        <div className="actions">
          {view !== 'employee' && (
            <button className="btn" onClick={() => download(`roster-${view}-${config.month}.csv`, rosterCsv(an, roster, employees))}>
              Export CSV
            </button>
          )}
          {view !== 'employee' && (
            <button className="btn" onClick={() => void downloadXlsx(`roster-${view}-${config.month}.xlsx`, an, roster, employees, an.issues)}>
              Export Excel
            </button>
          )}
        </div>
      </header>

      <div className="toolbar">
        <div className="tabs">
          {VIEWS.map(([id, label]) => (
            <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
        {view !== 'company' && (
          <select aria-label={`Choose ${view}`} value={current} onChange={(e) => setSel({ ...sel, [view]: e.target.value })}>
            {options[view].map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        )}
      </div>

      {emp ? (
        <EmployeeView emp={emp} an={an} roster={roster} config={config} issues={empIssues} pick={pick} />
      ) : (
        <>
          <section className="panel flush">
            <Grid config={config} roster={roster} an={an} employees={employees} coverage={coverage} gapDates={gapDates} tags={tags} onPick={pick} />
          </section>
          <Legend />
          <p className="hint">Click any cell to change it. The roster is re-checked at once, and your edit is locked so regeneration keeps it.</p>
          {view !== 'company' && (
            <section className="panel">
              <div className="panel-head"><h2>Conflicts in this {view}</h2></div>
              <IssueList issues={scoped} limit={6} actions empty={`No conflicts in this ${view}.`} />
            </section>
          )}
        </>
      )}
      {menu && <CellMenu {...menu} onClose={() => setMenu(null)} />}
    </>
  );
}

function EmployeeView({ emp, an, roster, config, issues, pick }: { emp: Employee; an: Analysis; roster: Roster; config: RosterConfig; issues: Issue[]; pick: (e: Employee, d: string, r: DOMRect) => void }) {
  const { ctx } = an;
  const procs = ctx.primaryProcs.get(emp.id) ?? [];
  const backups = [...(ctx.trainedProcs.get(emp.id) ?? [])].filter((p) => !procs.includes(p));
  const pn = (pid: string) => {
    const p = ctx.procById.get(pid)!;
    return `${ctx.brandById.get(p.brandId)?.name} ${p.name}`;
  };
  const lead = (dow(ctx.dates[0]) + 6) % 7;
  const counts: Record<CellStatus, number> = { work: 0, weekly_off: 0, leave: 0, comp_off: 0, holiday: 0 };
  for (const d of ctx.dates) counts[roster[emp.id]?.[d]?.status ?? 'work']++;
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="emp-layout">
      <section className="panel flush">
        <div className="cal">
          {order.map((n) => (
            <div key={n} className="cal-h">{WEEKDAY_NAMES[n]}</div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div key={`b${i}`} />
          ))}
          {ctx.dates.map((d, i) => {
            const c = roster[emp.id]?.[d];
            const st = c?.status ?? 'work';
            const duties = procs.filter((pid) => isRequired(ctx.procById.get(pid)!, d, ctx.holidaySet)).map(pn);
            const covering = [...an.days[i].byProcess.values()].filter((x) => x.rescuedBy.includes(emp.id)).map((x) => pn(x.processId));
            return (
              <div key={d} style={{ '--i': i } as CSSProperties} className={`cal-c s-${st} pick ${an.gapCells.has(`${emp.id}|${d}`) ? 'ring' : ''}`} onClick={(ev) => pick(emp, d, ev.currentTarget.getBoundingClientRect())}>
                <b>{Number(d.slice(8))}</b>
                <span>{st === 'work' ? (duties.length ? duties.slice(0, 2).join(', ') + (duties.length > 2 ? ` +${duties.length - 2}` : '') : 'Closed') : STATUS[st].label}</span>
                {covering.length > 0 && <em>Backup: {covering.join(', ')}</em>}
              </div>
            );
          })}
        </div>
      </section>
      <aside className="panel side">
        <h2>{emp.name}</h2>
        <dl>
          <dt>Pod</dt><dd>{ctx.podById.get(emp.podId)?.name}{emp.role !== 'agent' ? `, ${emp.role}` : ''}</dd>
          <dt>Prefers off</dt><dd>{emp.preferredOffDays.length ? emp.preferredOffDays.map((n) => WEEKDAY_NAMES[n]).join(', ') : 'No preference'}</dd>
          <dt>Own processes</dt><dd>{procs.length ? procs.map(pn).join('; ') : 'None'}</dd>
          {backups.length > 0 && (<><dt>Backup for</dt><dd>{backups.map(pn).join('; ')}</dd></>)}
          <dt>This month</dt>
          <dd>{counts.work} working, {counts.weekly_off} weekly off, {counts.leave} leave, {counts.comp_off} comp-off, {counts.holiday} holiday</dd>
        </dl>
        <h3>Conflicts</h3>
        <IssueList issues={issues} limit={4} empty={`None for ${config.employees.find((e) => e.id === emp.id)?.name.split(' ')[0]}.`} />
      </aside>
    </div>
  );
}
