import { useMemo, type CSSProperties } from 'react';
import { comparePlans } from '../lib/compare';
import { useRoster } from '../store';

const ROWS: { key: 'errors' | 'warnings' | 'preferencesMissed' | 'backupDays' | 'fairness' | 'coveragePct'; label: string; better: 'low' | 'high'; unit?: string }[] = [
  { key: 'errors', label: 'Errors (mandatory rules broken)', better: 'low' },
  { key: 'coveragePct', label: 'Coverage', better: 'high', unit: '%' },
  { key: 'warnings', label: 'Warnings', better: 'low' },
  { key: 'preferencesMissed', label: 'Preferences missed', better: 'low' },
  { key: 'fairness', label: 'Fairness score (of 100)', better: 'high' },
  { key: 'backupDays', label: 'Days a backup is needed', better: 'low' },
];

export default function Compare() {
  const { config, roster, strategy, generate } = useRoster();
  const plans = useMemo(() => comparePlans(config, roster), [config, roster]);
  const winner = (key: (typeof ROWS)[number]['key'], better: 'low' | 'high') => {
    const vals = plans.map((p) => p[key]);
    const t = better === 'low' ? Math.min(...vals) : Math.max(...vals);
    return vals.every((v) => v === t) ? null : t;
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Compare plans</h1>
          <p className="sub">The same month built four ways. Mandatory coverage is judged first, then preferences, then fairness.</p>
        </div>
      </header>
      <section className="panel">
        <div className="cmp">
          <div className="cmp-head" />
          {plans.map((p, n) => (
            <div key={p.strategy} className={`cmp-head ${p.best ? 'best' : ''}`} style={{ '--i': n } as CSSProperties}>
              {p.best && <span className="tag">Best overall</span>}
              <b>{p.label}</b>
              <small>{p.hint}</small>
            </div>
          ))}
          {ROWS.map((r) => {
            const w = winner(r.key, r.better);
            return (
              <div className="cmp-row" key={r.key}>
                <div className="cmp-label">{r.label}</div>
                {plans.map((p) => (
                  <div key={p.strategy} className={`cmp-cell ${w !== null && p[r.key] === w ? 'win' : ''}`}>
                    {p[r.key]}{r.unit ?? ''}
                  </div>
                ))}
              </div>
            );
          })}
          <div className="cmp-row">
            <div className="cmp-label">Cells that differ from now</div>
            {plans.map((p) => <div key={p.strategy} className="cmp-cell">{p.changed}</div>)}
          </div>
          <div className="cmp-row">
            <div className="cmp-label" />
            {plans.map((p) => (
              <div key={p.strategy} className="cmp-cell">
                {p.strategy === strategy && p.changed === 0 ? (
                  <span className="sub small">Current plan</span>
                ) : (
                  <button className={`btn ${p.best ? 'primary' : ''}`} onClick={() => generate(p.strategy)}>Use this plan</button>
                )}
              </div>
            ))}
          </div>
        </div>
        {plans.some((p) => p.preferencesMissed > 0) && (
          <p className="sub small">Preferences that every plan still misses are forced by mandatory coverage: a required day outranks a preferred day off.</p>
        )}
        <p className="sub small">Manual edits are locked and kept in every plan. Switching plans sends the roster back to draft.</p>
      </section>
    </>
  );
}
