import { dow } from './dates';
import type { ISODate, Process } from './types';

/** Does this process have to be staffed on this date? (operating calendar, not employee schedule) */
export function isRequired(p: Process, date: ISODate, holidays: Set<ISODate>): boolean {
  switch (p.calendar) {
    case 'ALL_DAYS':
      return true;
    case 'EXCL_HOLIDAYS':
      return !holidays.has(date);
    case 'EXCL_SUN_HOLIDAYS':
      return dow(date) !== 0 && !holidays.has(date);
  }
}

/** Minimum staff on a required day: date override > weekday override > default. */
export function minStaffFor(p: Process, date: ISODate): number {
  return p.dateOverrides?.[date] ?? p.minStaffByDow?.[dow(date)] ?? p.minStaff;
}
