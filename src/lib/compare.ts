import { generateRoster, type Roster, type RosterConfig, type Strategy } from '../engine';
import { analyse, STRATEGIES } from './analysis';

export interface PlanResult {
  strategy: Strategy;
  label: string;
  hint: string;
  roster: Roster;
  errors: number;
  warnings: number;
  preferencesMissed: number;
  backupDays: number;
  fairness: number;
  coveragePct: number;
  /** Cells that differ from the roster currently open. */
  changed: number;
  best: boolean;
}

/** Build the roster with every strategy from the same inputs and measure each one. */
export function comparePlans(config: RosterConfig, current: Roster): PlanResult[] {
  const plans = STRATEGIES.map((s): PlanResult => {
    const roster = generateRoster(config, { base: current, strategy: s.id });
    const an = analyse(config, roster);
    let changed = 0;
    for (const id of Object.keys(roster)) {
      for (const d of Object.keys(roster[id])) {
        if (roster[id][d].status !== current[id]?.[d]?.status) changed++;
      }
    }
    return {
      strategy: s.id,
      label: s.label,
      hint: s.hint,
      roster,
      errors: an.errors.length,
      warnings: an.warnings.length,
      preferencesMissed: an.issues.filter((i) => i.kind === 'PREFERENCE_MISSED').length,
      backupDays: an.issues.filter((i) => i.kind === 'BACKUP_COVER').length,
      fairness: an.fairness.score,
      coveragePct: an.coveragePct,
      changed,
      best: false,
    };
  });
  // Mandatory rules first (errors, coverage), then preferences, then fairness.
  const rank = (p: PlanResult) => [p.errors, -p.coveragePct, p.warnings, -p.fairness];
  const sorted = [...plans].sort((a, b) => {
    const x = rank(a), y = rank(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  });
  sorted[0].best = true;
  return plans;
}
