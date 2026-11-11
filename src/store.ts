import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { seedConfig } from './data/seed';
import {
  addLeaveAndResolve,
  applyCover,
  applyLeave,
  editCell as engineEdit,
  fmtDate,
  generateRoster,
  resolveWeeks,
  validateRoster,
  weekStart,
  type CellStatus,
  type ChangeResult,
  type Holiday,
  type ISODate,
  type Leave,
  type LeaveChange,
  type Roster,
  type RosterConfig,
  type Strategy,
} from './engine';
import { monthLabel, STATUS } from './lib/analysis';
import { notifyConfigured, notifyRosterChanged } from './lib/notify';

/** draft -> every pod lead approved -> published. Any change moves it back to draft. */
export type Approval = 'draft' | 'approved' | 'published';
export interface LogEntry { id: number; at: number; text: string; afterPublish: boolean }
/** Everything that belongs to one month's roster, kept so switching months never loses edits. */
export interface MonthState { roster: Roster; status: Approval; approvals: Record<string, boolean>; publishedAt: number | null }
export type DbStatus = 'off' | 'loading' | 'connected' | 'error';
export interface Toast { id: number; kind: 'ok' | 'bad' | 'info'; text: string }

interface RosterState {
  config: RosterConfig;
  roster: Roster;
  strategy: Strategy;
  status: Approval;
  approvals: Record<string, boolean>;
  publishedAt: number | null;
  log: LogEntry[];
  last: ChangeResult | null;
  toasts: Toast[];
  /** Who is using the app: 'ops' (operations manager) or a pod id (that pod's lead). */
  db: DbStatus;
  setDb: (db: DbStatus) => void;
  role: string;
  setRole: (role: string) => void;
  /** Saved rosters of the months that are not currently open. */
  months: Record<string, MonthState>;
  /** Open another month. Its roster is generated the first time, then remembered. */
  setMonth: (month: string) => void;
  setStrategy: (s: Strategy) => void;
  /** Regenerate every week. Manually locked cells are kept. */
  generate: (s?: Strategy) => void;
  resetSample: () => void;
  addHoliday: (h: Holiday) => void;
  removeHoliday: (date: string) => void;
  addLeave: (l: Omit<Leave, 'id'>) => void;
  removeLeave: (id: string) => void;
  /** Change any part of the configuration (people, brands, staffing). Roster is re-checked at once. */
  updateConfig: (mut: (c: RosterConfig) => void, label: string) => void;
  editCell: (employeeId: string, date: ISODate, status: CellStatus) => void;
  unlockCell: (employeeId: string, date: ISODate) => void;
  /** Record a leave. resolve=false shows the raw gap, true also re-solves that week. */
  applyChange: (c: LeaveChange, resolve: boolean) => void;
  cover: (processId: string, date: ISODate, employeeId: string) => void;
  resolveWeek: (date: ISODate) => void;
  togglePodApproval: (podId: string) => void;
  publish: () => void;
  reopen: () => void;
  dismiss: (id: number) => void;
}

const fresh = (strategy: Strategy): Roster => generateRoster(seedConfig, { strategy });
let seq = 0;

export const useRoster = create<RosterState>()(
  persist(
    (set, get) => {
      const toast = (kind: Toast['kind'], text: string) => {
        const id = ++seq;
        set((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-4) }));
        setTimeout(() => get().dismiss(id), 6500);
      };

      /** Everything that changes the roster goes through here: back to draft, logged, and the
       *  pod leads are told if the roster had already been published. */
      const record = (config: RosterConfig, roster: Roster, text: string, extra: Partial<RosterState> = {}) => {
        const wasPublished = get().status === 'published';
        const entry: LogEntry = { id: ++seq, at: Date.now(), text, afterPublish: wasPublished };
        set({ config, roster, status: 'draft', approvals: {}, publishedAt: null, log: [entry, ...get().log].slice(0, 40), ...extra });
        if (wasPublished) {
          const errors = validateRoster(config, roster).filter((i) => i.severity === 'error').length;
          void notifyRosterChanged({ month: config.month, summary: text, errors }).then((sent) =>
            toast('info', sent ? 'Pod leads notified through n8n.' : notifyConfigured ? 'Could not reach the n8n webhook.' : 'Published roster changed and is back to draft. Add an n8n webhook to notify pod leads automatically.'),
          );
        }
      };

      const result = (res: ChangeResult, text: string) => {
        record(res.config, res.roster, `${text}: ${res.summary}`, { last: res });
        toast(res.introduced.some((i) => i.severity === 'error') ? 'bad' : 'ok', `${text}. ${res.summary}.`);
      };

      const regen = (config: RosterConfig, text: string) => {
        const roster = generateRoster(config, { base: get().roster, strategy: get().strategy });
        record(config, roster, text, { last: null });
        toast('ok', text);
      };

      return {
        config: seedConfig,
        roster: fresh('balanced'),
        strategy: 'balanced',
        status: 'draft',
        approvals: {},
        publishedAt: null,
        log: [],
        last: null,
        toasts: [],
        db: 'off',
        setDb: (db) => set({ db }),
        role: 'ops',
        setRole: (role) => set({ role }),
        months: {},
        setMonth: (month) => {
          const s = get();
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month === s.config.month) return;
          const months = {
            ...s.months,
            [s.config.month]: { roster: s.roster, status: s.status, approvals: s.approvals, publishedAt: s.publishedAt },
          };
          const config = { ...s.config, month };
          const known = months[month];
          let roster: Roster;
          let next: MonthState = { roster: {}, status: 'draft', approvals: {}, publishedAt: null };
          if (known) {
            // Re-check against today's configuration; a changed roster goes back to draft.
            const again = generateRoster(config, { base: known.roster, strategy: s.strategy });
            const same = JSON.stringify(again) === JSON.stringify(known.roster);
            roster = same ? known.roster : again;
            next = same ? known : { roster, status: 'draft', approvals: {}, publishedAt: null };
          } else {
            roster = generateRoster(config, { strategy: s.strategy });
            next = { ...next, roster };
          }
          set({ config, roster, months, status: next.status, approvals: next.approvals, publishedAt: next.publishedAt, last: null });
          const hasHolidays = config.holidays.some((h) => h.date.startsWith(month));
          toast('info', known
            ? `Showing ${monthLabel(month)}.`
            : `Roster generated for ${monthLabel(month)}.${hasHolidays ? '' : ' No holidays are set for this month yet, add them in Setup.'}`);
        },
        setStrategy: (strategy) => set({ strategy }),
        generate: (s) => {
          const strategy = s ?? get().strategy;
          set({ strategy });
          const roster = generateRoster(get().config, { base: get().roster, strategy });
          record(get().config, roster, `Roster regenerated (${strategy})`, { last: null });
          toast('ok', 'Roster regenerated. Manual edits were kept.');
        },
        resetSample: () =>
          set({
            config: seedConfig, roster: fresh('balanced'), strategy: 'balanced', status: 'draft',
            approvals: {}, publishedAt: null, log: [], last: null, months: {},
          }),
        addHoliday: (h) => {
          const c = get().config;
          regen({ ...c, holidays: [...c.holidays.filter((x) => x.date !== h.date), h] }, `Holiday added: ${h.name}`);
        },
        removeHoliday: (date) => {
          const c = get().config;
          regen({ ...c, holidays: c.holidays.filter((x) => x.date !== date) }, `Holiday removed: ${fmtDate(date)}`);
        },
        addLeave: (l) => {
          const c = get().config;
          const who = c.employees.find((e) => e.id === l.employeeId)?.name ?? l.employeeId;
          regen({ ...c, leaves: [...c.leaves, { ...l, id: `lv-${Date.now()}` }] }, `Leave added for ${who}`);
        },
        removeLeave: (id) => {
          const c = get().config;
          regen({ ...c, leaves: c.leaves.filter((x) => x.id !== id) }, 'Leave removed');
        },
        updateConfig: (mut, label) => {
          const next = structuredClone(get().config);
          mut(next);
          regen(next, label);
        },
        editCell: (employeeId, date, status) => {
          const { config, roster } = get();
          const who = config.employees.find((e) => e.id === employeeId)?.name ?? employeeId;
          result(engineEdit(config, roster, employeeId, date, status), `${who}, ${fmtDate(date)} set to ${STATUS[status].label.toLowerCase()}`);
        },
        unlockCell: (employeeId, date) => {
          const roster = structuredClone(get().roster);
          const cell = roster[employeeId]?.[date];
          if (cell) cell.locked = false;
          set({ roster });
        },
        applyChange: (c, resolve) => {
          const { config, roster, strategy } = get();
          const who = config.employees.find((e) => e.id === c.employeeId)?.name ?? c.employeeId;
          const what = `${who} ${c.type === 'leave' ? 'leave' : 'comp-off'} ${fmtDate(c.start)}${c.end !== c.start ? ` to ${fmtDate(c.end)}` : ''}`;
          result(resolve ? addLeaveAndResolve(config, roster, c, strategy) : applyLeave(config, roster, c), what);
        },
        cover: (processId, date, employeeId) => {
          const { config, roster } = get();
          const who = config.employees.find((e) => e.id === employeeId)?.name ?? employeeId;
          result(applyCover(config, roster, { processId, date, employeeId }), `${who} covers ${fmtDate(date)}`);
        },
        resolveWeek: (date) => {
          const { config, roster, strategy } = get();
          result(resolveWeeks(config, roster, [weekStart(date)], strategy), `Week of ${fmtDate(weekStart(date))} re-solved`);
        },
        togglePodApproval: (podId) => {
          const { approvals, config, role } = get();
          if (role !== 'ops' && role !== podId) {
            toast('bad', 'Only that pod\'s lead or the operations manager can approve this pod.');
            return;
          }
          const next = { ...approvals, [podId]: !approvals[podId] };
          const all = config.pods.every((p) => next[p.id]);
          set({ approvals: next, status: all ? 'approved' : 'draft' });
        },
        publish: () => {
          const { config, roster, status, role } = get();
          if (role !== 'ops') { toast('bad', 'Only the operations manager can publish.'); return; }
          const errors = validateRoster(config, roster).filter((i) => i.severity === 'error').length;
          if (status !== 'approved' || errors > 0) return;
          set({ status: 'published', publishedAt: Date.now(), log: [{ id: ++seq, at: Date.now(), text: 'Roster published', afterPublish: false }, ...get().log] });
          toast('ok', 'Roster published. Further changes will notify the pod leads.');
        },
        reopen: () => set({ status: 'draft', approvals: {}, publishedAt: null }),
        dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      };
    },
    {
      name: 'smart-roster-v2',
      partialize: (s) => ({
        config: s.config, roster: s.roster, strategy: s.strategy, role: s.role,
        status: s.status, approvals: s.approvals, publishedAt: s.publishedAt, log: s.log, months: s.months,
      }),
    },
  ),
);
