export * from './types';
export * from './dates';
export { isRequired, minStaffFor } from './calendar';
export { buildContext, type Ctx } from './context';
export { computeDayCoverage, wouldBreak, type DayCoverage, type ProcessCoverage } from './coverage';
export { generateRoster, initialCell, type GenerateOptions } from './generate';
export { validateRoster } from './validate';
export { suggestBackups } from './suggest';
export { fairnessReport, type FairnessReport } from './fairness';
export {
  editCell,
  applyLeave,
  applyCover,
  resolveWeeks,
  addLeaveAndResolve,
  diffRosters,
  weeksOf,
  type ChangeResult,
  type LeaveChange,
} from './resolve';
