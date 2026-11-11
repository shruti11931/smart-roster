import { Fragment, useState } from 'react';
import { WEEKDAY_NAMES, fmtDate, type CalendarType, type Employee, type Process } from '../engine';
import { CALENDAR_LABEL, useAnalysis } from '../lib/analysis';
import { addBrand, addEmployee, addPod, addProcess, removeBrand, removeEmployee, removePod, removeProcess, setStaff, updateProcess, type ProcessRules } from '../lib/configOps';
import { useRoster } from '../store';

type Tab = 'employees' | 'pods' | 'brands' | 'holidays' | 'leaves';
const ROLES: Employee['role'][] = ['agent', 'lead', 'floater'];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

export default function Setup() {
  const { config, roster, addHoliday, removeHoliday, addLeave, removeLeave, updateConfig } = useRoster();
  const an = useAnalysis(config, roster);
  const { ctx } = an;
  const [tab, setTab] = useState<Tab>('employees');
  const first = ctx.dates[0];
  const last = ctx.dates[ctx.dates.length - 1];
  const [hol, setHol] = useState({ date: first, name: '' });
  const [lv, setLv] = useState({ employeeId: config.employees[0].id, start: first, end: first, type: 'leave' as 'leave' | 'comp_off' });
  const [emp, setEmp] = useState({ name: '', podId: config.pods[0]?.id ?? '', role: 'agent' as Employee['role'] });
  const [pod, setPod] = useState({ name: '', leadId: '' });
  const [brand, setBrand] = useState({ name: '', podId: config.pods[0]?.id ?? '' });
  const [proc, setProc] = useState({ brandId: config.brands[0]?.id ?? '', name: '', calendar: 'EXCL_SUN_HOLIDAYS' as CalendarType, minStaff: 1 });
  const [openStaff, setOpenStaff] = useState<string | null>(null);
  const [openRules, setOpenRules] = useState<string | null>(null);
  const [pick, setPick] = useState({ employeeId: config.employees[0]?.id ?? '', mode: 'primary' as 'primary' | 'backup' });
  const nm = (id: string) => ctx.empById.get(id)?.name ?? id;
  const podName = (id: string) => ctx.podById.get(id)?.name ?? 'None';
  const tabs: [Tab, string][] = [['employees', 'Employees'], ['pods', 'Pods'], ['brands', 'Brands and processes'], ['holidays', 'Holidays'], ['leaves', 'Leaves']];
  const sure = (msg: string) => window.confirm(msg);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Setup</h1>
          <p className="sub">Add, change or remove anything here and the roster is re-checked straight away. Currently {an.errors.length} error{an.errors.length === 1 ? '' : 's'}.</p>
        </div>
      </header>
      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'employees' && (
        <>
          <section className="panel">
            <form className="row-form" onSubmit={(e) => {
              e.preventDefault();
              const name = emp.name.trim();
              if (!name) return;
              updateConfig((c) => { addEmployee(c, { ...emp, name }); }, `Employee added: ${name}`);
              setEmp({ ...emp, name: '' });
            }}>
              <label className="field grow"><span>Name</span><input value={emp.name} placeholder="Full name" onChange={(e) => setEmp({ ...emp, name: e.target.value })} /></label>
              <label className="field"><span>Pod</span>
                <select value={emp.podId} onChange={(e) => setEmp({ ...emp, podId: e.target.value })}>{config.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </label>
              <label className="field"><span>Role</span>
                <select value={emp.role} onChange={(e) => setEmp({ ...emp, role: e.target.value as Employee['role'] })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
              </label>
              <button className="btn primary" type="submit">Add employee</button>
            </form>
          </section>
          <section className="panel flush">
            <table className="data">
              <thead><tr><th>Name</th><th>Pod</th><th>Role</th><th>Prefers off</th><th>Own</th><th>Backup</th><th /></tr></thead>
              <tbody>
                {config.employees.map((e) => {
                  const own = config.assignments.filter((a) => a.employeeId === e.id && !a.isBackup).length;
                  const bk = config.assignments.filter((a) => a.employeeId === e.id && a.isBackup).length;
                  return (
                    <tr key={e.id}>
                      <td>
                        <input className="inline" defaultValue={e.name} aria-label={`Name of ${e.name}`} onBlur={(ev) => {
                          const v = ev.target.value.trim();
                          if (v && v !== e.name) updateConfig((c) => { c.employees.find((x) => x.id === e.id)!.name = v; }, `Renamed ${e.name} to ${v}`);
                          else ev.target.value = e.name;
                        }} />
                      </td>
                      <td>
                        <select value={e.podId} aria-label={`Pod of ${e.name}`} onChange={(ev) => updateConfig((c) => { c.employees.find((x) => x.id === e.id)!.podId = ev.target.value; }, `${e.name} moved to pod ${podName(ev.target.value)}`)}>
                          {config.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={e.role} aria-label={`Role of ${e.name}`} onChange={(ev) => updateConfig((c) => { c.employees.find((x) => x.id === e.id)!.role = ev.target.value as Employee['role']; }, `${e.name} is now ${ev.target.value}`)}>
                          {ROLES.map((r) => <option key={r}>{r}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="dows" role="group" aria-label={`Preferred days off for ${e.name}`}>
                          {MON_FIRST.map((n) => (
                            <button key={n} type="button" className={e.preferredOffDays.includes(n) ? 'on' : ''} aria-pressed={e.preferredOffDays.includes(n)} title={WEEKDAY_NAMES[n]}
                              onClick={() => updateConfig((c) => {
                                const x = c.employees.find((y) => y.id === e.id)!;
                                x.preferredOffDays = x.preferredOffDays.includes(n) ? x.preferredOffDays.filter((d) => d !== n) : [...x.preferredOffDays, n];
                              }, `Preference updated for ${e.name}`)}>{WEEKDAY_NAMES[n][0]}</button>
                          ))}
                        </div>
                      </td>
                      <td>{own}</td><td>{bk || '-'}</td>
                      <td><button className="link danger" onClick={() => sure(`Remove ${e.name}? Their assignments and leaves are removed too.`) && updateConfig((c) => removeEmployee(c, e.id), `Employee removed: ${e.name}`)}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      {tab === 'pods' && (
        <>
          <section className="panel">
            <form className="row-form" onSubmit={(e) => {
              e.preventDefault();
              const name = pod.name.trim();
              if (!name) return;
              updateConfig((c) => { addPod(c, name, pod.leadId); }, `Pod added: ${name}`);
              setPod({ name: '', leadId: '' });
            }}>
              <label className="field grow"><span>Pod name</span><input value={pod.name} placeholder="e.g. Echo" onChange={(e) => setPod({ ...pod, name: e.target.value })} /></label>
              <label className="field"><span>Pod lead</span>
                <select value={pod.leadId} onChange={(e) => setPod({ ...pod, leadId: e.target.value })}>
                  <option value="">No lead yet</option>
                  {config.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
              <button className="btn primary" type="submit">Add pod</button>
            </form>
          </section>
          <section className="panel flush">
            <table className="data">
              <thead><tr><th>Pod</th><th>Lead</th><th>People</th><th>Brands</th><th /></tr></thead>
              <tbody>
                {config.pods.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      <select value={p.leadId} aria-label={`Lead of pod ${p.name}`} onChange={(ev) => updateConfig((c) => { c.pods.find((x) => x.id === p.id)!.leadId = ev.target.value; }, `Pod ${p.name} lead changed`)}>
                        <option value="">No lead</option>
                        {config.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </td>
                    <td>{config.employees.filter((e) => e.podId === p.id).length}</td>
                    <td>{config.brands.filter((b) => b.podId === p.id).length}</td>
                    <td>{config.pods.length > 1 && <button className="link danger" onClick={() => sure(`Remove pod ${p.name}? Its people and brands move to another pod.`) && updateConfig((c) => removePod(c, p.id), `Pod removed: ${p.name}`)}>Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {tab === 'brands' && (
        <>
          <section className="panel">
            <form className="row-form" onSubmit={(e) => {
              e.preventDefault();
              const name = brand.name.trim();
              if (!name) return;
              updateConfig((c) => { addBrand(c, name, brand.podId); }, `Brand added: ${name}`);
              setBrand({ ...brand, name: '' });
            }}>
              <label className="field grow"><span>New brand</span><input value={brand.name} placeholder="Brand name" onChange={(e) => setBrand({ ...brand, name: e.target.value })} /></label>
              <label className="field"><span>Pod</span>
                <select value={brand.podId} onChange={(e) => setBrand({ ...brand, podId: e.target.value })}>{config.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </label>
              <button className="btn primary" type="submit">Add brand</button>
            </form>
            <form className="row-form" onSubmit={(e) => {
              e.preventDefault();
              const name = proc.name.trim();
              if (!name || !proc.brandId) return;
              updateConfig((c) => { addProcess(c, { ...proc, name, minStaff: Math.max(1, proc.minStaff) }); }, `Process added: ${name}`);
              setProc({ ...proc, name: '' });
            }}>
              <label className="field"><span>Brand</span>
                <select value={proc.brandId} onChange={(e) => setProc({ ...proc, brandId: e.target.value })}>{config.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              </label>
              <label className="field grow"><span>New process</span><input value={proc.name} placeholder="e.g. Customer Support" onChange={(e) => setProc({ ...proc, name: e.target.value })} /></label>
              <label className="field"><span>Runs</span>
                <select value={proc.calendar} onChange={(e) => setProc({ ...proc, calendar: e.target.value as CalendarType })}>
                  {(Object.keys(CALENDAR_LABEL) as CalendarType[]).map((k) => <option key={k} value={k}>{CALENDAR_LABEL[k]}</option>)}
                </select>
              </label>
              <label className="field"><span>Staff needed</span><input type="number" min={1} max={20} value={proc.minStaff} onChange={(e) => setProc({ ...proc, minStaff: Number(e.target.value) })} /></label>
              <button className="btn primary" type="submit">Add process</button>
            </form>
          </section>
          <section className="panel flush">
            <table className="data">
              <thead><tr><th>Brand</th><th>Pod</th><th>Process</th><th>Runs</th><th>Needs</th><th>Staff</th><th /></tr></thead>
              <tbody>
                {config.brands.flatMap((b) => {
                  const procs = config.processes.filter((p) => p.brandId === b.id);
                  if (procs.length === 0) {
                    return [(
                      <tr key={b.id}>
                        <td>{b.name}</td><td>{podName(b.podId)}</td><td colSpan={4} className="sub">No processes yet</td>
                        <td><button className="link danger" onClick={() => updateConfig((c) => removeBrand(c, b.id), `Brand removed: ${b.name}`)}>Remove brand</button></td>
                      </tr>
                    )];
                  }
                  return procs.map((p, i) => {
                    const staff = config.assignments.filter((a) => a.processId === p.id);
                    const open = openStaff === p.id;
                    return (
                      <Fragment key={p.id}>
                        <tr>
                          <td>{i === 0 ? b.name : ''}</td><td>{i === 0 ? podName(b.podId) : ''}</td>
                          <td>{p.name}</td><td>{CALENDAR_LABEL[p.calendar]}</td>
                          <td>{p.minStaff}{p.minStaffByDow ? `, ${Object.entries(p.minStaffByDow).map(([n, v]) => `${WEEKDAY_NAMES[Number(n)]} ${v}`).join(', ')}` : ''}{p.dateOverrides ? `, ${Object.keys(p.dateOverrides).length} date override${Object.keys(p.dateOverrides).length === 1 ? '' : 's'}` : ''}</td>
                          <td>{staff.map((a) => nm(a.employeeId) + (a.isBackup ? ' (backup)' : '')).join(', ') || <span className="sub">Nobody assigned</span>}</td>
                          <td>
                            <button className="link" onClick={() => setOpenStaff(open ? null : p.id)}>{open ? 'Close' : 'Staff'}</button>{' '}
                            <button className="link" onClick={() => setOpenRules(openRules === p.id ? null : p.id)}>{openRules === p.id ? 'Close rules' : 'Rules'}</button>{' '}
                            <button className="link danger" onClick={() => sure(`Remove process ${p.name}?`) && updateConfig((c) => removeProcess(c, p.id), `Process removed: ${p.name}`)}>Remove</button>
                            {i === 0 && <> <button className="link danger" onClick={() => sure(`Remove brand ${b.name} and all its processes?`) && updateConfig((c) => removeBrand(c, b.id), `Brand removed: ${b.name}`)}>Remove brand</button></>}
                          </td>
                        </tr>
                        {openRules === p.id && (
                          <tr className="staff-row">
                            <td colSpan={7}>
                              <RulesEditor
                                key={`${p.id}-${p.calendar}-${p.minStaff}`}
                                p={p}
                                first={first}
                                last={last}
                                onSave={(r) => updateConfig((c) => updateProcess(c, p.id, r), `Rules updated: ${b.name} ${p.name}`)}
                              />
                            </td>
                          </tr>
                        )}
                        {open && (
                          <tr className="staff-row">
                            <td colSpan={7}>
                              <div className="staff-edit">
                                {staff.map((a) => (
                                  <span key={a.employeeId} className={`tag ${a.isBackup ? 'bk' : ''}`}>
                                    {nm(a.employeeId)}{a.isBackup ? ' (backup)' : ''}
                                    <button aria-label={`Remove ${nm(a.employeeId)}`} onClick={() => updateConfig((c) => setStaff(c, p.id, a.employeeId, null), `${nm(a.employeeId)} removed from ${p.name}`)}>×</button>
                                  </span>
                                ))}
                                <select aria-label="Employee to assign" value={pick.employeeId} onChange={(e) => setPick({ ...pick, employeeId: e.target.value })}>
                                  {config.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <select aria-label="Assignment type" value={pick.mode} onChange={(e) => setPick({ ...pick, mode: e.target.value as 'primary' | 'backup' })}>
                                  <option value="primary">Primary</option><option value="backup">Backup</option>
                                </select>
                                <button className="btn" onClick={() => updateConfig((c) => setStaff(c, p.id, pick.employeeId, pick.mode), `${nm(pick.employeeId)} assigned to ${p.name}`)}>Assign</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  });
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      {tab === 'holidays' && (
        <section className="panel">
          <form className="row-form" onSubmit={(e) => { e.preventDefault(); if (hol.name.trim()) { addHoliday({ date: hol.date, name: hol.name.trim() }); setHol({ ...hol, name: '' }); } }}>
            <label className="field"><span>Date</span><input type="date" min={first} max={last} value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} /></label>
            <label className="field grow"><span>Name</span><input value={hol.name} placeholder="Holiday name" onChange={(e) => setHol({ ...hol, name: e.target.value })} /></label>
            <button className="btn primary" type="submit">Add holiday</button>
          </form>
          <ul className="plain">
            {[...config.holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
              <li key={h.date}><span><b>{fmtDate(h.date)}</b> {h.name}</span><button className="link" onClick={() => removeHoliday(h.date)}>Remove</button></li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'leaves' && (
        <section className="panel">
          <form className="row-form" onSubmit={(e) => { e.preventDefault(); if (lv.end >= lv.start) addLeave(lv); }}>
            <label className="field grow"><span>Employee</span>
              <select value={lv.employeeId} onChange={(e) => setLv({ ...lv, employeeId: e.target.value })}>
                {config.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <label className="field"><span>From</span><input type="date" min={first} max={last} value={lv.start} onChange={(e) => setLv({ ...lv, start: e.target.value, end: e.target.value > lv.end ? e.target.value : lv.end })} /></label>
            <label className="field"><span>To</span><input type="date" min={lv.start} max={last} value={lv.end} onChange={(e) => setLv({ ...lv, end: e.target.value })} /></label>
            <label className="field"><span>Type</span>
              <select value={lv.type} onChange={(e) => setLv({ ...lv, type: e.target.value as 'leave' | 'comp_off' })}>
                <option value="leave">Leave</option><option value="comp_off">Comp-off</option>
              </select>
            </label>
            <button className="btn primary" type="submit">Add and re-check</button>
          </form>
          <ul className="plain">
            {config.leaves.map((l) => (
              <li key={l.id}>
                <span><b>{nm(l.employeeId)}</b> {l.type === 'leave' ? 'leave' : 'comp-off'}, {fmtDate(l.start)}{l.end !== l.start ? ` to ${fmtDate(l.end)}` : ''}</span>
                <button className="link" onClick={() => removeLeave(l.id)}>Remove</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Operating calendar and staffing minimums of one process: default, per weekday, per date. */
export function RulesEditor({ p, first, last, onSave }: { p: Process; first: string; last: string; onSave: (r: ProcessRules) => void }) {
  const [calendar, setCalendar] = useState<CalendarType>(p.calendar);
  const [minStaff, setMinStaff] = useState(p.minStaff);
  const [byDow, setByDow] = useState<Record<number, string>>(() =>
    Object.fromEntries(MON_FIRST.map((n) => [n, p.minStaffByDow?.[n] ? String(p.minStaffByDow[n]) : ''])),
  );
  const [dates, setDates] = useState<Record<string, number>>({ ...(p.dateOverrides ?? {}) });
  const [od, setOd] = useState({ date: first, n: 2 });
  const save = () => {
    const minStaffByDow: Record<number, number> = {};
    for (const n of MON_FIRST) {
      const v = Number(byDow[n]);
      if (byDow[n] !== '' && v >= 1) minStaffByDow[n] = Math.round(v);
    }
    onSave({ calendar, minStaff: Math.max(1, minStaff), minStaffByDow, dateOverrides: dates });
  };
  return (
    <div className="rules-edit">
      <div className="row-form">
        <label className="field grow">
          <span>Operating calendar</span>
          <select value={calendar} onChange={(e) => setCalendar(e.target.value as CalendarType)}>
            {(Object.keys(CALENDAR_LABEL) as CalendarType[]).map((k) => <option key={k} value={k}>{CALENDAR_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Staff needed (normal day)</span>
          <input type="number" min={1} max={20} value={minStaff} onChange={(e) => setMinStaff(Number(e.target.value))} />
        </label>
      </div>
      <p className="sub">Different number on certain weekdays (leave blank to use the normal number):</p>
      <div className="dow-grid">
        {MON_FIRST.map((n) => (
          <label key={n} className="field">
            <span>{WEEKDAY_NAMES[n]}</span>
            <input type="number" min={1} max={20} placeholder={String(minStaff)} value={byDow[n]} onChange={(e) => setByDow({ ...byDow, [n]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="sub">Different number on one date, such as a sale day:</p>
      <div className="staff-edit">
        {Object.entries(dates).sort().map(([d, n]) => (
          <span key={d} className="tag">
            {fmtDate(d)}: {n}
            <button aria-label={`Remove override for ${fmtDate(d)}`} onClick={() => { const next = { ...dates }; delete next[d]; setDates(next); }}>×</button>
          </span>
        ))}
        <input aria-label="Override date" type="date" min={first} max={last} value={od.date} onChange={(e) => setOd({ ...od, date: e.target.value })} />
        <input aria-label="Staff needed on that date" type="number" min={1} max={20} value={od.n} onChange={(e) => setOd({ ...od, n: Number(e.target.value) })} style={{ width: 70 }} />
        <button className="btn" onClick={() => od.date && od.n >= 1 && setDates({ ...dates, [od.date]: Math.round(od.n) })}>Add date</button>
      </div>
      <div className="actions left">
        <button className="btn primary" onClick={save}>Save rules and re-check</button>
      </div>
    </div>
  );
}
