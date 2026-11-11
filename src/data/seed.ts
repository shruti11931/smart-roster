// Sample data: 34 employees, 4 pods, 24 brands (19 single-resource = 79%), 42 processes.
// All names, brands and dates are fictional sample data. Holiday dates are indicative only.
import type {
  Assignment,
  Brand,
  CalendarType,
  Employee,
  Holiday,
  Leave,
  Pod,
  Process,
  RosterConfig,
} from '../engine/types';

export const DEMO_MONTH = '2026-11';

const pods: Pod[] = [
  { id: 'pod-alpha', name: 'Alpha', leadId: 'e01' },
  { id: 'pod-bravo', name: 'Bravo', leadId: 'e02' },
  { id: 'pod-charlie', name: 'Charlie', leadId: 'e03' },
  { id: 'pod-delta', name: 'Delta', leadId: 'e04' },
];

const NAMES = [
  'Aarav Mehta', 'Riya Sharma', 'Kabir Nair', 'Ananya Iyer', 'Vihaan Gupta', 'Isha Kapoor',
  'Arjun Reddy', 'Meera Joshi', 'Rohan Desai', 'Diya Patel', 'Karan Malhotra', 'Sanya Verma',
  'Aditya Rao', 'Tara Bhatt', 'Nikhil Chawla', 'Pooja Menon', 'Yash Kulkarni', 'Neha Singh',
  'Rahul Pillai', 'Sneha Das', 'Vivek Shah', 'Kavya Krishnan', 'Manav Saxena', 'Priya Nambiar',
  'Harsh Vyas', 'Simran Kaur', 'Dev Bansal', 'Nisha Rane', 'Siddharth Jain', 'Lakshmi Hegde',
  'Omkar Patil', 'Zoya Khan', 'Tanmay Ghosh', 'Aisha Siddiqui',
];

const eid = (n: number) => `e${String(n).padStart(2, '0')}`;

// Pod index (0-3) of each employee number.
function podIndexOf(n: number): number {
  if (n <= 4) return n - 1; // pod leads
  if (n <= 7) return 0; // Lumio
  if (n <= 10) return 1; // Orbit
  if (n <= 12) return 2; // Zenith
  if (n <= 14) return 3; // Kiwi Home
  if (n <= 16) return 0; // Nimbus
  if (n <= 30) return (n - 17) % 4; // solo-brand owners
  return [0, 1, 2, 0][n - 31]; // floaters follow the brand they back up
}

// Soft preferences: 0 = Sun ... 6 = Sat.
const PREFS: Record<number, number[]> = {
  5: [6], 6: [1], 8: [5], 9: [6, 0], 11: [0], 12: [6], 13: [2], 14: [6], 15: [1], 16: [5],
  31: [6], 32: [0], 33: [3], 34: [6],
};

const employees: Employee[] = NAMES.map((name, i) => {
  const n = i + 1;
  return {
    id: eid(n),
    name,
    podId: pods[podIndexOf(n)].id,
    role: n <= 4 ? 'lead' : n >= 31 ? 'floater' : 'agent',
    preferredOffDays: PREFS[n] ?? [],
    // One weekly off in every Mon-Sun week allows up to 12 working days between rests.
    maxConsecutive: 12,
  };
});

// ---- Brands, processes, assignments -------------------------------------------------------
const brands: Brand[] = [];
const processes: Process[] = [];
const assignments: Assignment[] = [];

let brandNo = 0;
function addBrand(name: string, podIdx: number): string {
  const id = `b${String(++brandNo).padStart(2, '0')}`;
  brands.push({ id, name, podId: pods[podIdx].id });
  return id;
}
function addProcess(
  brandId: string,
  name: string,
  calendar: CalendarType,
  staff: number[],
  extra: Partial<Process> = {},
  backups: number[] = [],
): string {
  const id = `${brandId}-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  processes.push({ id, brandId, name, calendar, minStaff: 1, ...extra });
  for (const n of staff) assignments.push({ employeeId: eid(n), processId: id, isBackup: false });
  for (const n of backups) assignments.push({ employeeId: eid(n), processId: id, isBackup: true });
  return id;
}

// Multi-resource brands (5): people split or share processes.
const lumio = addBrand('Lumio', 0);
addProcess(lumio, 'Customer Support', 'ALL_DAYS', [5, 6, 7], { minStaff: 2 });
addProcess(lumio, 'Abandoned Cart', 'EXCL_SUN_HOLIDAYS', [6, 7]);
addProcess(lumio, 'NDR', 'EXCL_HOLIDAYS', [5, 7]);

const orbit = addBrand('Orbit', 1);
addProcess(orbit, 'Customer Support', 'EXCL_HOLIDAYS', [8, 9]);
addProcess(orbit, 'Retention', 'EXCL_SUN_HOLIDAYS', [9, 10]);
addProcess(orbit, 'Abandoned Cart', 'ALL_DAYS', [8, 9, 10], { minStaff: 2 });

const zenith = addBrand('Zenith', 2);
// Two people, but two are required on Saturday and Sunday: tight on purpose.
addProcess(zenith, 'Customer Support', 'ALL_DAYS', [11, 12], { minStaffByDow: { 0: 2, 6: 2 } });

const kiwi = addBrand('Kiwi Home', 3);
addProcess(kiwi, 'Customer Support', 'EXCL_HOLIDAYS', [13, 14]);
addProcess(kiwi, 'Abandoned Cart', 'EXCL_SUN_HOLIDAYS', [13, 14]);

const nimbus = addBrand('Nimbus', 0);
addProcess(nimbus, 'Customer Support', 'ALL_DAYS', [15, 16], {}, [34]);
addProcess(nimbus, 'NDR', 'EXCL_HOLIDAYS', [15, 16]);

// Single-resource brands (19). One person owns every process of the brand.
const SOLO: { name: string; owner: number }[] = [
  { name: 'Zest', owner: 17 }, { name: 'Glow Labs', owner: 18 }, { name: 'Urban Roots', owner: 19 },
  { name: 'Pixel Wear', owner: 20 }, { name: 'Bloom Beauty', owner: 21 }, { name: 'Nutri Nest', owner: 22 },
  { name: 'Trail Gear', owner: 23 }, { name: 'Spice Route', owner: 24 }, { name: 'Aurora Jewels', owner: 25 },
  { name: 'Cozy Cart', owner: 26 }, { name: 'Beanline Coffee', owner: 26 }, { name: 'Paws & Co', owner: 27 },
  { name: 'FitFuel', owner: 27 }, { name: 'Velvet Home', owner: 28 }, { name: 'Kidoo Toys', owner: 28 },
  { name: 'Leafy Tea', owner: 29 }, { name: 'Gadget Barn', owner: 29 }, { name: 'Saffron Silks', owner: 30 },
  { name: 'Craftly', owner: 30 },
];
// Brands 1-3 run 365 days and have a trained floater as backup (e31, e32, e33).
// All other solo brands close on Sundays and holidays, so the owner's Sunday is a natural weekly off.
const FLOATER_FOR: Record<string, number> = { Zest: 31, 'Glow Labs': 32, 'Urban Roots': 33 };

SOLO.forEach((s, idx) => {
  const b = addBrand(s.name, podIndexOf(s.owner));
  const floater = FLOATER_FOR[s.name];
  if (floater) {
    addProcess(b, 'Customer Support', 'ALL_DAYS', [s.owner], {}, [floater]);
    if (s.name === 'Glow Labs') addProcess(b, 'NDR', 'EXCL_SUN_HOLIDAYS', [s.owner]);
    return;
  }
  addProcess(b, 'Customer Support', 'EXCL_SUN_HOLIDAYS', [s.owner]);
  if (idx % 3 === 0) addProcess(b, 'Abandoned Cart', 'EXCL_SUN_HOLIDAYS', [s.owner]);
  if (idx % 3 === 1) addProcess(b, 'NDR', 'EXCL_SUN_HOLIDAYS', [s.owner]);
});

const holidays: Holiday[] = [
  { date: '2026-11-08', name: 'Diwali (sample date, falls on a Sunday)' },
  { date: '2026-11-11', name: 'Bhai Dooj (sample date)' },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti (sample date)' },
];

const leaves: Leave[] = [
  // Planted conflict A: Zest's only agent and its backup are both away on a Sunday.
  { id: 'lv-01', employeeId: 'e17', start: '2026-11-15', end: '2026-11-15', type: 'leave' },
  { id: 'lv-02', employeeId: 'e31', start: '2026-11-15', end: '2026-11-15', type: 'comp_off' },
  // Planted conflict B: Zenith needs both agents on Saturday.
  { id: 'lv-03', employeeId: 'e11', start: '2026-11-21', end: '2026-11-21', type: 'leave' },
  // Ordinary leaves the system absorbs.
  { id: 'lv-04', employeeId: 'e08', start: '2026-11-12', end: '2026-11-12', type: 'leave' },
  { id: 'lv-05', employeeId: 'e13', start: '2026-11-19', end: '2026-11-19', type: 'leave' },
  { id: 'lv-06', employeeId: 'e15', start: '2026-11-26', end: '2026-11-27', type: 'leave' },
  { id: 'lv-07', employeeId: 'e05', start: '2026-11-23', end: '2026-11-23', type: 'comp_off' },
  { id: 'lv-08', employeeId: 'e02', start: '2026-11-16', end: '2026-11-17', type: 'leave' },
  { id: 'lv-09', employeeId: 'e33', start: '2026-11-04', end: '2026-11-04', type: 'leave' },
];

export const seedConfig: RosterConfig = {
  month: DEMO_MONTH,
  pods,
  employees,
  brands,
  processes,
  assignments,
  holidays,
  leaves,
};

/** Live-demo change: Pixel Wear's only agent has no backup, so this leaves it uncovered. */
export const DEMO_LEAVE = {
  employeeId: 'e20',
  start: '2026-11-17',
  end: '2026-11-18',
  type: 'leave' as const,
};
