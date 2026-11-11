import { useMemo } from 'react';
import {
  buildContext,
  computeDayCoverage,
  fairnessReport,
  validateRoster,
  type CellStatus,
  type CalendarType,
  type Ctx,
  type DayCoverage,
  type Employee,
  type FairnessReport,
  type ISODate,
  type Issue,
  type Roster,
  type RosterConfig,
  type Strategy,
} from '../engine';

export type Page = 'landing' | 'dashboard' | 'roster' | 'conflicts' | 'compare' | 'setup';

export const STATUS: Record<CellStatus, { label: string; short: string }> = {
  work: { label: 'Working', short: '' },
  weekly_off: { label: 'Weekly off', short: 'O' },
  leave: { label: 'Leave', short: 'L' },
  comp_off: { label: 'Comp-off', short: 'C' },
  holiday: { label: 'Holiday', short: 'H' },
};

export const STRATEGIES: { id: Strategy; label: string; hint: string }[] = [
  { id: 'balanced', label: 'Balanced', hint: 'Respects preferences and spreads weekend offs evenly.' },
  { id: 'fairness', label: 'Fairness first', hint: 'Weekend offs are shared as equally as possible.' },
  { id: 'preference', label: 'Preference first', hint: 'Gives people their favourite day off whenever coverage allows.' },
  { id: 'min-risk', label: 'Lowest risk', hint: 'Keeps brand-mates off on different days to leave slack for surprises.' },
];

export const CALENDAR_LABEL: Record<CalendarType, string> = {
  ALL_DAYS: '365 days',
  EXCL_HOLIDAYS: 'Skips holidays',
  EXCL_SUN_HOLIDAYS: 'Skips Sundays and holidays',
};

export const monthLabel = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export interface Analysis {
  ctx: Ctx;
  issues: Issue[];
  errors: Issue[];
  warnings: Issue[];
  days: DayCoverage[];
  /** "employeeId|date" of absences that leave a process short. */
  gapCells: Set<string>;
  perDay: { date: ISODate; off: number; gaps: number }[];
  requiredSlots: number;
  gapSlots: number;
  coveragePct: number;
  fairness: FairnessReport;
}

export function analyse(config: RosterConfig, roster: Roster): Analysis {
  const ctx = buildContext(config);
  const issues = validateRoster(config, roster, ctx);
  const days = ctx.dates.map((d) => computeDayCoverage(ctx, roster, d));
  const gapCells = new Set<string>();
  let requiredSlots = 0;
  let gapSlots = 0;
  const perDay = days.map((day) => {
    let gaps = 0;
    for (const c of day.byProcess.values()) {
      requiredSlots++;
      if (c.shortfall > 0) {
        gaps++;
        gapSlots++;
        for (const u of c.unavailable) gapCells.add(`${u.employeeId}|${day.date}`);
      }
    }
    const off = ctx.employees.filter((e) => {
      const c = roster[e.id]?.[day.date];
      return c && c.status !== 'work' && c.source !== 'closed';
    }).length;
    return { date: day.date, off, gaps };
  });
  return {
    ctx,
    issues,
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
    days,
    gapCells,
    perDay,
    requiredSlots,
    gapSlots,
    coveragePct: requiredSlots ? Math.round((1000 * (requiredSlots - gapSlots)) / requiredSlots) / 10 : 100,
    fairness: fairnessReport(config, roster),
  };
}

export const useAnalysis = (config: RosterConfig, roster: Roster): Analysis =>
  useMemo(() => analyse(config, roster), [config, roster]);

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function rosterCsv(an: Analysis, roster: Roster, employees: Employee[]): string {
  const { ctx } = an;
  const rows = [['Employee', 'Pod', 'Role', ...ctx.dates]];
  for (const e of employees) {
    rows.push([
      e.name,
      ctx.podById.get(e.podId)?.name ?? '',
      e.role,
      ...ctx.dates.map((d) => STATUS[roster[e.id]?.[d]?.status ?? 'work'].label),
    ]);
  }
  return rows.map((r) => r.map(q).join(',')).join('\n');
}

export function issuesCsv(issues: Issue[]): string {
  const rows = [['Severity', 'Type', 'Date', 'Message', 'Suggested cover']];
  for (const i of issues) {
    rows.push([i.severity, i.kind, i.date ?? '', i.message, (i.fixes ?? []).map((f) => f.name).join('; ')]);
  }
  return rows.map((r) => r.map(q).join(',')).join('\n');
}

export function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
