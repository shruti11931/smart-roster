import { describe, expect, it } from 'vitest';
import { seedConfig } from '../../data/seed';
import { comparePlans } from '../../lib/compare';
import { generateRoster } from '..';

describe('compare plans', () => {
  const plans = comparePlans(seedConfig, generateRoster(seedConfig));
  it('builds all four strategies and marks exactly one best', () => {
    expect(plans.map((p) => p.strategy).sort()).toEqual(['balanced', 'fairness', 'min-risk', 'preference']);
    expect(plans.filter((p) => p.best)).toHaveLength(1);
  });
  it('never calls a plan with more errors the best', () => {
    const best = plans.find((p) => p.best)!;
    expect(plans.every((p) => best.errors <= p.errors)).toBe(true);
  });
  it('is deterministic', () => {
    const again = comparePlans(seedConfig, generateRoster(seedConfig));
    expect(again.map((p) => [p.errors, p.warnings, p.fairness])).toEqual(plans.map((p) => [p.errors, p.warnings, p.fairness]));
  });
});

import { templateExplanation } from '../../lib/explain';
import { validateRoster } from '..';

describe('explanations', () => {
  it('every detected issue gets a non-empty template explanation that names no invented people', () => {
    const issues = validateRoster(seedConfig, generateRoster(seedConfig));
    expect(issues.length).toBeGreaterThan(0);
    for (const i of issues) expect(templateExplanation(i).length).toBeGreaterThan(20);
    const gap = issues.find((i) => i.kind === 'NO_COVERAGE')!;
    const names = new Set(seedConfig.employees.map((e) => e.name));
    const text = templateExplanation(gap);
    if (gap.fixes?.[0]) expect(names.has(gap.fixes[0].name) && text.includes(gap.fixes[0].name)).toBe(true);
  });
});
