import { useEffect } from 'react';
import { fmtDate, type CellStatus, type ISODate } from '../engine';
import { STATUS } from '../lib/analysis';
import { useRoster } from '../store';

const ORDER: CellStatus[] = ['work', 'weekly_off', 'leave', 'comp_off', 'holiday'];

export interface MenuTarget { empId: string; date: ISODate; x: number; y: number }

/** Click a roster cell to change it. The roster is re-checked straight away and the impact is shown. */
export default function CellMenu({ empId, date, x, y, onClose }: MenuTarget & { onClose: () => void }) {
  const { roster, config, editCell, unlockCell } = useRoster();
  const cell = roster[empId]?.[date];
  const emp = config.employees.find((e) => e.id === empId);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  if (!emp) return null;
  const left = Math.max(8, Math.min(x, window.innerWidth - 236));
  const top = Math.max(8, Math.min(y + 4, window.innerHeight - 340));
  const current = cell?.status ?? 'work';

  return (
    <>
      <div className="menu-back" onClick={onClose} />
      <div className="cell-menu" style={{ left, top }} role="menu" aria-label={`Change ${emp.name} on ${fmtDate(date)}`}>
        <h4>{emp.name}, {fmtDate(date)}</h4>
        {ORDER.map((s) => (
          <button
            key={s}
            role="menuitem"
            className={current === s ? 'on' : ''}
            onClick={() => {
              if (s !== current) editCell(empId, date, s);
              onClose();
            }}
          >
            <i className={`s-${s}`}>{STATUS[s].short}</i>
            {STATUS[s].label}
          </button>
        ))}
        {cell?.locked ? (
          <button className="unlock" onClick={() => { unlockCell(empId, date); onClose(); }}>
            Unlock, let the engine decide
          </button>
        ) : (
          <p className="note">Your edit is checked at once and locked, so regeneration keeps it.</p>
        )}
      </div>
    </>
  );
}
