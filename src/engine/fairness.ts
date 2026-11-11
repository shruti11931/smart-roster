import { dow } from './dates';
import type { Roster, RosterConfig } from './types';

export interface FairnessReport {
  perEmployee: { employeeId: string; weekendOffs: number; totalOffs: number }[];
  mean: number;
  stdev: number;
  /** 0-100. 100 = everyone who chooses offs gets the same number of weekend offs. */
  score: number;
}

/**
 * Fairness of weekend offs among people whose offs the engine (or a manager) chose.
 * Offs forced by a closed calendar are excluded: nobody picked those.
 */
export function fairnessReport(config: RosterConfig, roster: Roster): FairnessReport {
  const perEmployee = config.employees.map((e) => {
    const cells = Object.entries(roster[e.id] ?? {}).filter(
      ([, c]) => c.status === 'weekly_off' && c.source !== 'closed',
    );
    return {
      employeeId: e.id,
      totalOffs: cells.length,
      weekendOffs: cells.filter(([d]) => [0, 6].includes(dow(d))).length,
    };
  });
  const part = perEmployee.filter((p) => p.totalOffs > 0);
  if (part.length < 2) return { perEmployee, mean: 0, stdev: 0, score: 100 };
  const mean = part.reduce((s, p) => s + p.weekendOffs, 0) / part.length;
  const variance = part.reduce((s, p) => s + (p.weekendOffs - mean) ** 2, 0) / part.length;
  const stdev = Math.sqrt(variance);
  return { perEmployee, mean, stdev, score: Math.round(Math.max(0, Math.min(100, 100 - stdev * 50))) };
}
