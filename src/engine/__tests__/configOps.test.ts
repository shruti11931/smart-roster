import { describe, expect, it } from 'vitest';
import { seedConfig } from '../../data/seed';
import { addBrand, addEmployee, addPod, addProcess, removeBrand, removeEmployee, removePod, setStaff } from '../../lib/configOps';
import { generateRoster, validateRoster, type RosterConfig } from '..';

const clone = (): RosterConfig => structuredClone(seedConfig);
const errors = (c: RosterConfig) => validateRoster(c, generateRoster(c)).filter((i) => i.severity === 'error');

describe('configuration edits keep the roster consistent', () => {
  it('a new brand with a new process and a new person is scheduled with no new errors', () => {
    const c = clone();
    const before = errors(c).length;
    const eid = addEmployee(c, { name: 'Test Person', podId: c.pods[0].id, role: 'agent' });
    const bid = addBrand(c, 'Test Brand', c.pods[0].id);
    const pid = addProcess(c, { brandId: bid, name: 'Customer Support', calendar: 'EXCL_SUN_HOLIDAYS', minStaff: 1 });
    setStaff(c, pid, eid, 'primary');
    expect(c.employees).toHaveLength(35);
    expect(errors(c)).toHaveLength(before);
  });

  it('a brand nobody is assigned to is reported as uncovered, not silently ignored', () => {
    const c = clone();
    const bid = addBrand(c, 'Orphan', c.pods[0].id);
    addProcess(c, { brandId: bid, name: 'Support', calendar: 'ALL_DAYS', minStaff: 1 });
    expect(errors(c).filter((i) => i.kind === 'NO_COVERAGE').length).toBeGreaterThan(30);
  });

  it('removing an employee cleans assignments, leaves and pod lead', () => {
    const c = clone();
    removeEmployee(c, 'e17');
    expect(c.assignments.some((a) => a.employeeId === 'e17')).toBe(false);
    expect(c.leaves.some((l) => l.employeeId === 'e17')).toBe(false);
    const r = generateRoster(c);
    expect(() => validateRoster(c, r)).not.toThrow();
    const lead = clone();
    removeEmployee(lead, 'e01');
    expect(lead.pods[0].leadId).toBe('');
  });

  it('removing a brand removes its processes and staffing', () => {
    const c = clone();
    const brand = c.brands.find((b) => b.name === 'Zest')!;
    removeBrand(c, brand.id);
    expect(c.processes.some((p) => p.brandId === brand.id)).toBe(false);
    expect(c.assignments.every((a) => c.processes.some((p) => p.id === a.processId))).toBe(true);
  });

  it('removing a pod moves its people and brands, and the last pod cannot be removed', () => {
    const c = clone();
    const id = addPod(c, 'Echo', '');
    c.employees[5].podId = id;
    removePod(c, id);
    expect(c.pods.some((p) => p.id === id)).toBe(false);
    expect(c.employees.every((e) => c.pods.some((p) => p.id === e.podId))).toBe(true);
    const single = clone();
    single.pods = [single.pods[0]];
    removePod(single, single.pods[0].id);
    expect(single.pods).toHaveLength(1);
  });
});
