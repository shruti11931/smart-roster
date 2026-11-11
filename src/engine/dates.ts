// Date helpers on plain 'YYYY-MM-DD' strings, computed in UTC so results never
// depend on the machine's time zone.
import type { ISODate } from './types';

const DAY = 86_400_000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const WEEKDAY_NAMES = WD;

export const parseISO = (s: ISODate): number => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const toISO = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s: ISODate, n: number): ISODate => toISO(parseISO(s) + n * DAY);
/** 0 = Sunday ... 6 = Saturday */
export const dow = (s: ISODate): number => new Date(parseISO(s)).getUTCDay();
/** Monday of the week containing s (ISO week). */
export const weekStart = (s: ISODate): ISODate => addDays(s, -((dow(s) + 6) % 7));

export function monthDates(month: string): ISODate[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function rangeDates(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const fmtDate = (s: ISODate): string =>
  `${WD[dow(s)]} ${Number(s.slice(8))} ${MN[Number(s.slice(5, 7)) - 1]}`;

export interface WeekSegment {
  /** Monday of the ISO week (may fall in the previous month). */
  key: ISODate;
  /** Dates of that week that fall inside the month, in order. */
  dates: ISODate[];
}

export function weekSegments(dates: ISODate[]): WeekSegment[] {
  const out: WeekSegment[] = [];
  for (const d of dates) {
    const key = weekStart(d);
    const last = out[out.length - 1];
    if (last && last.key === key) last.dates.push(d);
    else out.push({ key, dates: [d] });
  }
  return out;
}
