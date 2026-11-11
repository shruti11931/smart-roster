export type ISODate = string; // 'YYYY-MM-DD'

/** How a process decides which days it must be staffed. */
export type CalendarType = 'ALL_DAYS' | 'EXCL_HOLIDAYS' | 'EXCL_SUN_HOLIDAYS';

export type CellStatus = 'work' | 'weekly_off' | 'leave' | 'comp_off' | 'holiday';
/** Where a cell came from. 'closed' = every process of the employee is closed that day. */
export type CellSource = 'closed' | 'generated' | 'manual' | 'leave' | 'base';

export interface Pod {
  id: string;
  name: string;
  leadId: string;
}

export interface Employee {
  id: string;
  name: string;
  podId: string;
  role: 'lead' | 'agent' | 'floater';
  /** 0 = Sunday ... 6 = Saturday. Soft preference only. */
  preferredOffDays: number[];
  maxConsecutive: number;
}

export interface Brand {
  id: string;
  name: string;
  podId: string;
}

export interface Process {
  id: string;
  brandId: string;
  name: string;
  calendar: CalendarType;
  /** Default minimum staff on a required day. */
  minStaff: number;
  /** Day-of-week overrides, e.g. { 6: 2, 0: 2 } = two people on Sat and Sun. */
  minStaffByDow?: Partial<Record<number, number>>;
  /** Date-specific overrides, e.g. a sale day. */
  dateOverrides?: Record<ISODate, number>;
}

export interface Assignment {
  employeeId: string;
  processId: string;
  /** Backups are trained cover: they only count when primaries fall short. */
  isBackup: boolean;
}

export interface Holiday {
  date: ISODate;
  name: string;
}

export interface Leave {
  id: string;
  employeeId: string;
  start: ISODate;
  end: ISODate;
  type: 'leave' | 'comp_off';
}

/** A one-day cover: `employeeId` works `processId` on `date` in addition to its usual staff. */
export interface Cover {
  processId: string;
  date: ISODate;
  employeeId: string;
}

export interface RosterConfig {
  month: string; // 'YYYY-MM'
  pods: Pod[];
  employees: Employee[];
  brands: Brand[];
  processes: Process[];
  assignments: Assignment[];
  holidays: Holiday[];
  leaves: Leave[];
  covers?: Cover[];
}

export interface Cell {
  status: CellStatus;
  /** Locked cells are manual edits; regeneration never overwrites them. */
  locked: boolean;
  source: CellSource;
}

/** employeeId -> date -> cell */
export type Roster = Record<string, Record<ISODate, Cell>>;

export type Severity = 'error' | 'warning' | 'info';

export type IssueKind =
  | 'NO_COVERAGE'
  | 'UNDERSTAFFED'
  | 'MISSING_WEEKLY_OFF'
  | 'MAX_CONSECUTIVE'
  | 'PREFERENCE_MISSED'
  | 'WORKING_ON_CLOSED_DAY'
  | 'UNFAIR_DISTRIBUTION'
  | 'BACKUP_COVER'
  | 'DOUBLE_BOOKED'
  | 'DOUBLE_DUTY';

export interface Suggestion {
  employeeId: string;
  name: string;
  score: number;
  /** 'comp_off' means the person would give up a weekly off to cover. */
  cost: 'free' | 'comp_off';
  reasons: string[];
}

export interface Issue {
  id: string;
  severity: Severity;
  kind: IssueKind;
  message: string;
  date?: ISODate;
  brandId?: string;
  processId?: string;
  employeeId?: string;
  fixes?: Suggestion[];
}

export type Strategy = 'balanced' | 'fairness' | 'preference' | 'min-risk';

export interface CellDiff {
  employeeId: string;
  date: ISODate;
  from: CellStatus;
  to: CellStatus;
}
