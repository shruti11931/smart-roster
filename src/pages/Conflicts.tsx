import { useState } from 'react';
import IssueList from '../components/IssueList';
import { DEMO_LEAVE } from '../data/seed';
import { fmtDate } from '../engine';
import { download, issuesCsv, STATUS, useAnalysis } from '../lib/analysis';
import { useRoster } from '../store';

type Filter = 'error' | 'warning' | 'info';

export default function Conflicts() {
  const { config, roster, last, log, applyChange } = useRoster();
  const an = useAnalysis(config, roster);
  const [f, setF] = useState<Filter>('error');
  const first = an.ctx.dates[0];
  const lastDay = an.ctx.dates[an.ctx.dates.length - 1];
  const [lv, setLv] = useState({ employeeId: config.employees[0].id, start: first, end: first, type: 'leave' as 'leave' | 'comp_off' });
  const list = an.issues.filter((i) => i.severity === f);
  const tabs: [Filter, string, number][] = [
    ['error', 'Errors', an.errors.length],
    ['warning', 'Warnings', an.warnings.length],
    ['info', 'Backup in use', an.issues.length - an.errors.length - an.warnings.length],
  ];
  const nm = (id: string) => an.ctx.empById.get(id)?.name ?? id;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Conflicts</h1>
          <p className="sub">Errors break a mandatory rule. Warnings are preferences that coverage outranked. Pick a cover to fix a gap.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => download(`conflicts-${config.month}.csv`, issuesCsv(an.issues))}>Export CSV</button>
        </div>
      </header>
      <div className="tabs">
        {tabs.map(([id, label, n]) => (
          <button key={id} className={f === id ? 'on' : ''} onClick={() => setF(id)}>
            {label} <small>{n}</small>
          </button>
        ))}
      </div>

      <div className="two-col">
        <section className="panel">
          <IssueList issues={list} actions empty="Nothing in this category." />
        </section>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Simulate a change</h2>
              <button className="link" onClick={() => setLv({ ...DEMO_LEAVE })}>Load demo</button>
            </div>
            <p className="sub small">Someone takes leave after the roster is made. See the gap first, then let the engine re-solve that week.</p>
            <form className="col-form" onSubmit={(e) => e.preventDefault()}>
              <label className="field"><span>Employee</span>
                <select value={lv.employeeId} onChange={(e) => setLv({ ...lv, employeeId: e.target.value })}>
                  {config.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
              <div className="pair">
                <label className="field"><span>From</span><input type="date" min={first} max={lastDay} value={lv.start} onChange={(e) => setLv({ ...lv, start: e.target.value, end: e.target.value > lv.end ? e.target.value : lv.end })} /></label>
                <label className="field"><span>To</span><input type="date" min={lv.start} max={lastDay} value={lv.end} onChange={(e) => setLv({ ...lv, end: e.target.value })} /></label>
              </div>
              <label className="field"><span>Type</span>
                <select value={lv.type} onChange={(e) => setLv({ ...lv, type: e.target.value as 'leave' | 'comp_off' })}>
                  <option value="leave">Leave</option><option value="comp_off">Comp-off</option>
                </select>
              </label>
              <div className="actions left">
                <button className="btn" type="button" onClick={() => lv.end >= lv.start && applyChange(lv, false)}>Show the gap</button>
                <button className="btn primary" type="button" onClick={() => lv.end >= lv.start && applyChange(lv, true)}>Apply and re-solve week</button>
              </div>
            </form>
            {last && (
              <div className={`result ${last.introduced.some((i) => i.severity === 'error') ? 'bad' : 'ok'}`}>
                <b>{last.summary}</b>
                <span>{last.diff.length} cell{last.diff.length === 1 ? '' : 's'} changed</span>
                <span>{an.errors.length === 0 ? 'No errors left in the roster.' : `${an.errors.length} error${an.errors.length === 1 ? '' : 's'} in the roster now.`}</span>
                {last.diff.length > 0 && (
                  <ul>
                    {last.diff.slice(0, 5).map((d) => (
                      <li key={d.employeeId + d.date}>{nm(d.employeeId)}, {fmtDate(d.date)}: {STATUS[d.from].label} to {STATUS[d.to].label}</li>
                    ))}
                    {last.diff.length > 5 && <li>and {last.diff.length - 5} more</li>}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Recent changes</h2></div>
            {log.length === 0 ? (
              <p className="empty">No changes yet this session.</p>
            ) : (
              <ul className="plain log">
                {log.slice(0, 8).map((l) => (
                  <li key={l.id}>
                    <span>{l.text}{l.afterPublish && <em> after publishing</em>}</span>
                    <small>{new Date(l.at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
