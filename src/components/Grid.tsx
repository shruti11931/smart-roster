import type { CSSProperties } from 'react';
import { dow, fmtDate, WEEKDAY_NAMES, type Employee, type Roster, type RosterConfig } from '../engine';
import { STATUS, type Analysis } from '../lib/analysis';

interface Props {
  config: RosterConfig;
  roster: Roster;
  an: Analysis;
  employees: Employee[];
  /** Extra rows showing staff available vs required per process. */
  coverage?: { id: string; label: string }[];
  /** Dates to flag in the header. */
  gapDates?: Set<string>;
  tags?: Record<string, string>;
  /** Makes cells clickable (opens the cell menu). */
  onPick?: (e: Employee, date: string, rect: DOMRect) => void;
}

export default function Grid({ roster, an, employees, coverage = [], gapDates, tags = {}, onPick }: Props) {
  const { ctx } = an;
  return (
    <div className="grid-wrap">
      <table className="roster">
        <thead>
          <tr>
            <th className="name">Employee</th>
            {ctx.dates.map((d) => {
              const w = dow(d);
              const cls = [w === 0 || w === 6 ? 'we' : '', ctx.holidaySet.has(d) ? 'hol' : '', gapDates?.has(d) ? 'gap' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <th key={d} className={`day ${cls}`} title={fmtDate(d) + (gapDates?.has(d) ? ' (coverage gap)' : '')}>
                  <span>{WEEKDAY_NAMES[w].slice(0, 2)}</span>
                  <b>{Number(d.slice(8))}</b>
                </th>
              );
            })}
            <th className="tot">Off</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e, ri) => {
            const row = roster[e.id] ?? {};
            const off = ctx.dates.filter((d) => (row[d]?.status ?? 'work') !== 'work').length;
            return (
              <tr key={e.id} style={{ '--i': ri } as CSSProperties}>
                <th className="name">
                  <span>{e.name}</span>
                  <small>{[ctx.podById.get(e.podId)?.name, tags[e.id] ?? (e.role === 'agent' ? '' : e.role)].filter(Boolean).join(', ')}</small>
                </th>
                {ctx.dates.map((d) => {
                  const c = row[d];
                  const st = c?.status ?? 'work';
                  const cls = ['c', `s-${st}`, an.gapCells.has(`${e.id}|${d}`) ? 'ring' : '', c?.locked ? 'lock' : '', onPick ? 'pick' : '']
                    .filter(Boolean)
                    .join(' ');
                  const why = an.gapCells.has(`${e.id}|${d}`) ? ', leaves a process short' : '';
                  return (
                    <td key={d} className={cls} onClick={onPick ? (ev) => onPick(e, d, ev.currentTarget.getBoundingClientRect()) : undefined} title={`${e.name}, ${fmtDate(d)}: ${STATUS[st].label}${c?.locked ? ' (manual)' : ''}${why}`}>
                      {STATUS[st].short}
                    </td>
                  );
                })}
                <td className="tot">{off}</td>
              </tr>
            );
          })}
          {coverage.length > 0 && (
            <tr className="sep">
              <th className="name" colSpan={ctx.dates.length + 2}>
                Staff available against what the process needs
              </th>
            </tr>
          )}
          {coverage.map((p) => (
            <tr key={p.id}>
              <th className="name">
                <span>{p.label}</span>
              </th>
              {ctx.dates.map((d, i) => {
                const c = an.days[i].byProcess.get(p.id);
                if (!c) return <td key={d} className="c cov closed" title={`${fmtDate(d)}: process is closed`}>-</td>;
                const have = c.primaryAvailable.length + c.rescuedBy.length;
                const cls = c.shortfall > 0 ? 'bad' : c.rescuedBy.length ? 'backup' : 'ok';
                return (
                  <td key={d} className={`c cov ${cls}`} title={`${fmtDate(d)}: ${have} of ${c.required} staff${c.rescuedBy.length ? ' (backup in use)' : ''}`}>
                    {have}
                  </td>
                );
              })}
              <td className="tot" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend">
      {(['work', 'weekly_off', 'leave', 'comp_off', 'holiday'] as const).map((s) => (
        <span key={s}>
          <i className={`c s-${s}`}>{STATUS[s].short}</i>
          {STATUS[s].label}
        </span>
      ))}
      <span>
        <i className="c s-work ring" />
        Absence that leaves a gap
      </span>
    </div>
  );
}
