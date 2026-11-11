import { useState, type CSSProperties } from 'react';
import { explainIssue, type Explanation } from '../lib/explain';
import type { Issue } from '../engine';
import { useRoster } from '../store';

const LABEL = { error: 'Error', warning: 'Warning', info: 'Backup' } as const;
const COVERAGE = ['NO_COVERAGE', 'UNDERSTAFFED'];

interface Props {
  issues: Issue[];
  limit?: number;
  empty?: string;
  /** Show one-click fixes: pick a cover, or re-solve the week. */
  actions?: boolean;
}

export default function IssueList({ issues, limit, empty = 'Nothing to report.', actions = false }: Props) {
  const cover = useRoster((s) => s.cover);
  const resolveWeek = useRoster((s) => s.resolveWeek);
  const [ex, setEx] = useState<Record<string, Explanation | 'loading'>>({});
  const ask = async (i: Issue) => {
    setEx((m) => ({ ...m, [i.id]: 'loading' }));
    const r = await explainIssue(i);
    setEx((m) => ({ ...m, [i.id]: r }));
  };
  const shown = limit ? issues.slice(0, limit) : issues;
  if (shown.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ul className="issues">
      {shown.map((i, n) => (
        <li key={i.id} className={`issue ${i.severity}`} style={{ '--i': n } as CSSProperties}>
          <span className="sev">{LABEL[i.severity]}</span>
          <div>
            <p>{i.message}</p>
            {i.fixes && i.fixes.length > 0 && !actions && (
              <p className="fixes">
                <b>Who could cover:</b>{' '}
                {i.fixes
                  .map((f) => `${f.name}${f.cost === 'comp_off' ? ' (gives up a weekly off)' : ''}: ${f.reasons.slice(0, 2).join(', ')}`)
                  .join('; ')}
              </p>
            )}
            {actions && COVERAGE.includes(i.kind) && i.fixes && i.processId && i.date && (
              <div className="fix-row">
                {i.fixes.length === 0 && <span className="fixes">Nobody is free to cover this day.</span>}
                {i.fixes.map((f) => (
                  <button key={f.employeeId} className="fix" onClick={() => cover(i.processId!, i.date!, f.employeeId)}>
                    Use {f.name}
                    <small>{f.cost === 'comp_off' ? 'gives up a weekly off' : 'free'}, {f.reasons.slice(0, 2).join(', ')}</small>
                  </button>
                ))}
              </div>
            )}
            {actions && i.kind === 'MISSING_WEEKLY_OFF' && i.date && (
              <div className="fix-row">
                <button className="fix" onClick={() => resolveWeek(i.date!)}>Re-solve this week<small>keeps manual edits</small></button>
              </div>
            )}
            {actions && i.severity !== 'info' && (
              <div className="fix-row">
                <button className="fix" disabled={ex[i.id] === 'loading'} onClick={() => ask(i)}>
                  {ex[i.id] === 'loading' ? 'Explaining…' : 'Explain'}<small>why it matters</small>
                </button>
              </div>
            )}
            {ex[i.id] && ex[i.id] !== 'loading' && (
              <div className="explain">
                {(ex[i.id] as Explanation).text}
                <small>{(ex[i.id] as Explanation).ai ? 'Written by Claude from the detected facts' : 'Standard explanation'}</small>
              </div>
            )}
          </div>
        </li>
      ))}
      {limit && issues.length > limit && <li className="more">and {issues.length - limit} more</li>}
    </ul>
  );
}
