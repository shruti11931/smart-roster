import { Fragment, type CSSProperties } from 'react';
import { dow } from '../engine';
import { monthLabel, STATUS, useAnalysis, type Page } from '../lib/analysis';
import { useCountUp } from '../lib/useCountUp';
import { useRoster } from '../store';

const SAMPLE_ROWS = ['e17', 'e31', 'e11', 'e12', 'e20', 'e05', 'e06', 'e08'];

export default function Landing({ go }: { go: (p: Page) => void }) {
  const { config, roster } = useRoster();
  const an = useAnalysis(config, roster);
  const { ctx } = an;
  const dates = ctx.dates.slice(8, 22);
  const known = SAMPLE_ROWS.filter((id) => ctx.empById.has(id));
  const rows = known.length ? known : config.employees.slice(0, 8).map((e) => e.id);
  const nEmp = useCountUp(config.employees.length);
  const nBrand = useCountUp(config.brands.length);
  const nCov = useCountUp(an.coveragePct, 1);
  const nErr = useCountUp(an.errors.length);
  const caught = an.errors.find((i) => i.kind === 'NO_COVERAGE' || i.kind === 'UNDERSTAFFED');

  return (
    <div className="landing">
      <header className="l-top">
        <span className="l-logo">Smart Roster</span>
        <button className="btn ghost" onClick={() => go('dashboard')}>Open dashboard</button>
      </header>

      <section className="l-hero">
        <div className="l-copy">
          <p className="l-kicker">{monthLabel(config.month)} roster, ready to review</p>
          <h1>Days off for everyone. Coverage for every brand.</h1>
          <p className="l-lede">
            Smart Roster builds the monthly schedule for your support team, flags any brand left without staff, and shows who can step in.
          </p>
          <div className="l-cta">
            <button className="btn light" onClick={() => go('dashboard')}>Open dashboard</button>
            <button className="btn outline" onClick={() => go('conflicts')}>See the conflicts</button>
          </div>
          <dl className="l-stats">
            <div><dt>Employees</dt><dd>{nEmp}</dd></div>
            <div><dt>Brands</dt><dd>{nBrand}</dd></div>
            <div><dt>Fully staffed</dt><dd>{nCov}%</dd></div>
            <div><dt>Conflicts caught</dt><dd>{nErr}</dd></div>
          </dl>
        </div>

        <div className="l-card" aria-label="Sample of the generated roster">
          <div className="mini" style={{ gridTemplateColumns: `78px repeat(${dates.length}, 1fr)` }}>
            <span />
            {dates.map((d) => (
              <b key={d} className={dow(d) === 0 || dow(d) === 6 ? 'we' : ''}>{Number(d.slice(8))}</b>
            ))}
            {rows.map((id, r) => (
              <Fragment key={id}>
                <span className="nm">{ctx.empById.get(id)?.name.split(' ')[0]}</span>
                {dates.map((d, c) => {
                  const st = roster[id]?.[d]?.status ?? 'work';
                  const gap = an.gapCells.has(`${id}|${d}`);
                  return (
                    <i
                      key={d}
                      className={`m s-${st} ${gap ? 'gap' : ''}`}
                      style={{ '--d': `${300 + (r + c) * 30}ms` } as CSSProperties}
                      title={`${ctx.empById.get(id)?.name}, ${d}: ${STATUS[st].label}`}
                    >
                      {STATUS[st].short}
                    </i>
                  );
                })}
              </Fragment>
            ))}
          </div>
          {caught && (
            <p className="l-caught">
              <b>Caught:</b> {caught.message.split('. Out')[0]}
            </p>
          )}
        </div>
      </section>

      <section className="l-steps">
        <div><h3>Generate</h3><p>One click gives every person a weekly off while each brand stays staffed on the days it runs.</p></div>
        <div><h3>Detect</h3><p>Every brand, process and day is checked. Gaps are named, not hidden.</p></div>
        <div><h3>Fix</h3><p>For each gap you see who is free and trained, ranked, so a backup is a quick decision.</p></div>
      </section>
    </div>
  );
}
