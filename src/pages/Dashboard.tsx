import type { CSSProperties } from 'react';
import IssueList from '../components/IssueList';
import { dow, fmtDate, WEEKDAY_NAMES } from '../engine';
import { useCountUp } from '../lib/useCountUp';
import { notifyConfigured } from '../lib/notify';
import { download, issuesCsv, monthLabel, STRATEGIES, useAnalysis, type Page } from '../lib/analysis';
import { useRoster } from '../store';

export default function Dashboard({ go }: { go: (p: Page) => void }) {
  const { config, roster, strategy, setStrategy, setMonth, generate, resetSample, status, approvals, publishedAt, togglePodApproval, publish, reopen, role } = useRoster();
  const an = useAnalysis(config, roster);
  const nErr = useCountUp(an.errors.length);
  const nWarn = useCountUp(an.warnings.length);
  const nCov = useCountUp(an.coveragePct, 1);
  const nFair = useCountUp(an.fairness.score);
  const maxOff = Math.max(1, ...an.perDay.map((d) => d.off));
  const gapDays = an.perDay.filter((d) => d.gaps > 0);
  const hint = STRATEGIES.find((s) => s.id === strategy)?.hint;
  const approvedN = config.pods.filter((p) => approvals[p.id]).length;
  const blocker = an.errors.length > 0 ? `${an.errors.length} error${an.errors.length === 1 ? '' : 's'} must be fixed before publishing.` : approvedN < config.pods.length ? `Waiting for ${config.pods.length - approvedN} pod lead${config.pods.length - approvedN === 1 ? '' : 's'} to approve.` : '';

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{monthLabel(config.month)}</h1>
          <p className="sub">
            {config.employees.length} employees across {config.pods.length} pods, {config.brands.length} brands, {config.processes.length} processes
          </p>
        </div>
        <div className="actions">
          <label className="field">
            <span>Month</span>
            <input type="month" min="2024-01" max="2032-12" value={config.month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
          <label className="field">
            <span>Strategy</span>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)}>
              {STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <button className="btn primary" onClick={() => generate()}>Generate roster</button>
          <button className="btn" onClick={resetSample}>Reset sample data</button>
        </div>
      </header>
      <p className="hint">{hint} Manual edits are locked and survive regeneration.</p>

      <section className="panel ribbon-panel">
        <div className="panel-head">
          <h2>Month at a glance</h2>
          <p>
            Bar height is people off that day. Red days have at least one process without enough staff
            {gapDays.length ? `: ${gapDays.map((d) => Number(d.date.slice(8))).join(', ')}.` : '. None this month.'}
          </p>
        </div>
        <div className="ribbon" style={{ gridTemplateColumns: `repeat(${an.perDay.length}, 1fr)` }}>
          {an.perDay.map((d, idx) => {
            const w = dow(d.date);
            return (
              <div
                key={d.date}
                style={{ '--i': idx } as CSSProperties}
                className={`rb ${d.gaps ? 'bad' : ''} ${w === 0 || w === 6 ? 'we' : ''} ${an.ctx.holidaySet.has(d.date) ? 'hol' : ''}`}
                title={`${fmtDate(d.date)}: ${d.off} people off, ${d.gaps} coverage gap${d.gaps === 1 ? '' : 's'}`}
              >
                <div className="bar-area">
                  <div className="bar" style={{ height: `${Math.max(6, (d.off / maxOff) * 100)}%` }} />
                </div>
                <b>{Number(d.date.slice(8))}</b>
                <span>{WEEKDAY_NAMES[w][0]}</span>
                {d.gaps > 0 && <em>{d.gaps}</em>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="facts">
        <div>
          <b className={an.errors.length ? 'bad' : 'ok'}>{nErr}</b>
          <span>coverage and rule errors</span>
        </div>
        <div>
          <b>{nWarn}</b>
          <span>preference warnings</span>
        </div>
        <div>
          <b>{nCov}%</b>
          <span>of {an.requiredSlots} process-days fully staffed</span>
        </div>
        <div>
          <b>{nFair}/100</b>
          <span>weekend-off fairness</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Approval and publishing</h2>
          <p>{notifyConfigured ? 'Pod leads are notified through n8n if a published roster changes.' : 'Any change to a published roster moves it back to draft.'}</p>
        </div>
        <div className="stepper">
          <div className={`step ${status === 'draft' ? 'now' : 'done'}`}><b>Draft</b><span>Generated and being checked</span></div>
          <div className={`step ${status === 'approved' ? 'now' : status === 'published' ? 'done' : ''}`}><b>Approved by pod leads</b><span>{approvedN} of {config.pods.length} pods</span></div>
          <div className={`step ${status === 'published' ? 'done' : ''}`}><b>Published</b><span>{publishedAt ? `at ${new Date(publishedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}` : 'Visible to the whole team'}</span></div>
        </div>
        <div className="chips">
          {config.pods.map((p) => (
            <button key={p.id} className={`chip ${approvals[p.id] ? 'on' : ''}`} disabled={status === 'published' || (role !== 'ops' && role !== p.id)} title={role !== 'ops' && role !== p.id ? 'Only this pod\'s lead can approve' : undefined} aria-pressed={!!approvals[p.id]} onClick={() => togglePodApproval(p.id)}>
              {approvals[p.id] ? '✓ ' : ''}Pod {p.name}<small>{config.employees.find((e) => e.id === p.leadId)?.name ?? 'no lead'}</small>
            </button>
          ))}
        </div>
        <div className="actions left">
          {status === 'published' ? (
            <button className="btn" disabled={role !== 'ops'} onClick={reopen}>Reopen as draft</button>
          ) : (
            <button className="btn primary" disabled={role !== 'ops' || status !== 'approved' || an.errors.length > 0} onClick={publish}>Publish roster</button>
          )}
          {role !== 'ops' && status !== 'published' && <span className="block-note">Publishing is for the operations manager. Switch role in the sidebar.</span>}
          {blocker && status !== 'published' && <span className="block-note">{blocker}</span>}
        </div>
      </section>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <h2>Needs attention</h2>
            <button className="link" onClick={() => go('conflicts')}>See all conflicts</button>
          </div>
          <IssueList issues={an.errors} limit={4} empty="Every process is covered on every day it runs." />
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Export</h2>
          </div>
          <p className="sub">Download the current month to share with pod leads or open in Excel.</p>
          <div className="actions left">
            <button className="btn" onClick={() => go('roster')}>Open roster grid</button>
            <button className="btn" onClick={() => download(`conflicts-${config.month}.csv`, issuesCsv(an.issues.filter((i) => i.severity !== 'info')))}>
              Conflicts CSV
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
