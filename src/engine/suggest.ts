import { isRequired } from './calendar';
import type { Ctx } from './context';
import { computeDayCoverage } from './coverage';
import type { ISODate, Roster, Suggestion } from './types';

/**
 * Rank people who could cover `processId` on `date`.
 * Trained on the process > works in the same brand > same pod > lightest workload.
 */
export function suggestBackups(ctx: Ctx, roster: Roster, processId: string, date: ISODate): Suggestion[] {
  const proc = ctx.procById.get(processId);
  if (!proc) return [];
  const brand = ctx.brandById.get(proc.brandId);
  const cov = computeDayCoverage(ctx, roster, date);
  const alreadyRescuing = new Set(cov.byProcess.get(processId)?.rescuedBy ?? []);
  const primaries = new Set([...(ctx.primaryEmps.get(processId) ?? []), ...(ctx.covers.get(processId)?.get(date) ?? [])]);

  const out: Suggestion[] = [];
  for (const e of ctx.employees) {
    if (primaries.has(e.id) || alreadyRescuing.has(e.id)) continue;
    const cell = roster[e.id]?.[date];
    if (!cell) continue;

    let cost: Suggestion['cost'];
    if (cell.status === 'work') cost = 'free';
    else if (cell.status === 'weekly_off' && cell.source !== 'closed') cost = 'comp_off';
    else continue; // on leave, holiday, comp-off or closed day

    const busyElsewhere = cov.usedBackups.get(e.id);
    if (busyElsewhere && busyElsewhere !== proc.brandId) continue;
    // Already booked as a one-day cover for another brand today.
    let coveringOther = false;
    for (const [pid, byDate] of ctx.covers) {
      if (byDate.get(date)?.includes(e.id) && ctx.procById.get(pid)?.brandId !== proc.brandId) coveringOther = true;
    }
    if (coveringOther) continue;

    const reasons: string[] = [];
    let score = 0;
    if (ctx.trainedProcs.get(e.id)?.has(processId)) {
      score += 50;
      reasons.push('trained on this process');
    }
    const inBrand = [...(ctx.trainedProcs.get(e.id) ?? [])].some(
      (pid) => ctx.procById.get(pid)?.brandId === proc.brandId,
    );
    if (inBrand) {
      score += 30;
      reasons.push(`works on ${brand?.name ?? 'this brand'}`);
    }
    if (brand && e.podId === brand.podId) {
      score += 15;
      reasons.push('same pod');
    }
    const load = (ctx.primaryProcs.get(e.id) ?? []).filter((pid) =>
      isRequired(ctx.procById.get(pid)!, date, ctx.holidaySet),
    ).length;
    score -= load * 3;
    if (load === 0) reasons.push('no process of their own today');
    else reasons.push(`already covers ${load} process${load > 1 ? 'es' : ''} today`);
    if (cost === 'free') score += 10;
    else {
      score -= 10;
      reasons.push('would give up a weekly off');
    }
    out.push({ employeeId: e.id, name: e.name, score, cost, reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
