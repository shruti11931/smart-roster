import type { Issue } from '../engine';
import { supabase } from './supabase';

export interface Explanation { text: string; ai: boolean }

const first = (i: Issue) => i.fixes?.[0];

/** Deterministic explanation built from the detected facts. Always available, never wrong about names. */
export function templateExplanation(i: Issue): string {
  const f = first(i);
  const fix = f
    ? ` The best option is ${f.name}${f.cost === 'comp_off' ? ', who would give up a weekly off' : ', who is free that day'}${f.reasons[0] ? ` (${f.reasons[0]})` : ''}.`
    : ' Nobody is free to cover, so this needs a manual decision, such as moving a leave or hiring cover.';
  switch (i.kind) {
    case 'NO_COVERAGE':
      return `Every person who could work this process is away, so the client has no coverage at all that day. This is a mandatory rule and blocks publishing.${fix}`;
    case 'UNDERSTAFFED':
      return `The process needs more people than are available that day, so it runs short. This is a mandatory rule and blocks publishing.${fix}`;
    case 'MISSING_WEEKLY_OFF':
      return 'This person has no rest day in that week. Re-solving the week lets the engine place one without breaking coverage.';
    case 'MAX_CONSECUTIVE':
      return 'This person works more days in a row than their limit allows. Moving a weekly off earlier or adding a comp-off breaks the run.';
    case 'WORKING_ON_CLOSED_DAY':
      return 'The employee is marked as working on a day every one of their processes is closed. Set the day to off or remove the manual edit.';
    case 'DOUBLE_BOOKED':
    case 'DOUBLE_DUTY':
      return 'This person is covering two things at once on the same day. Pick a different cover for one of them.';
    case 'PREFERENCE_MISSED': {
      const m = i.message.match(/^(.+?) prefers (\w+) off, got (\w+)/);
      return m
        ? `${m[1]} asked for ${m[2]} off but was given ${m[3]}, because other staff are needed on ${m[2]} to keep a client covered. Coverage outranks a preference, so this is only a warning. If ${m[1].split(' ')[0]} keeps missing the preferred day, try the Preference first plan on the Compare page.`
        : 'A preferred day off was not given because that day is needed for coverage. A required coverage day outranks a preference, so no action is needed unless it keeps happening to the same person.';
    }
    case 'UNFAIR_DISTRIBUTION':
      return 'Weekend offs are spread unevenly. Switch to Fairness first on the Compare page to even them out.';
    case 'BACKUP_COVER':
      return 'The primary team is short here and a trained backup is covering. Nothing to fix, but it uses the backup on that day.';
    default:
      return i.message;
  }
}

/** Ask the Edge Function for a written explanation. Falls back to the template on any failure. */
/** Ask the server for a written explanation. Falls back to the template on any failure. */
export async function explainIssue(i: Issue): Promise<Explanation> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issue: { kind: i.kind, severity: i.severity, date: i.date, message: i.message, fixes: i.fixes?.slice(0, 4) },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.ok) {
      const data = await r.json();
      if (data?.text) return { text: String(data.text), ai: true };
    }
  } catch {
    /* fall through to the template */
  }
  return { text: templateExplanation(i), ai: false };
}