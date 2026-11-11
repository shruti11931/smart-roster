import { generateRoster, type RosterConfig } from '../engine';
import { loadFromSupabase, saveToSupabase } from './repository';
import { supabaseEnabled } from './supabase';
import { useRoster } from '../store';

/** Shared configuration lives in Supabase. The roster is rebuilt from it, so only config is synced.
 *  Any failure leaves the local state untouched and the app keeps working on browser storage. */
let timer: ReturnType<typeof setTimeout> | undefined;
let applying = false;
let started = false;

export async function initSync(): Promise<void> {
  if (started) return; // React StrictMode runs effects twice in dev
  started = true;
  const st = useRoster.getState();
  if (!supabaseEnabled) { st.setDb('off'); return; }
  st.setDb('loading');
  try {
    const remote = await loadFromSupabase();
    if (!remote || remote.employees.length === 0) {
      await saveToSupabase(useRoster.getState().config); // first run: put the sample data in
    } else {
      const { config, roster, strategy } = useRoster.getState();
      const next: RosterConfig = { ...remote, month: config.month };
      applying = true;
      useRoster.setState({ config: next, roster: generateRoster(next, { base: roster, strategy }) });
      applying = false;
    }
    useRoster.getState().setDb('connected');
  } catch (e) {
    applying = false;
    console.warn('Supabase unavailable, using browser storage:', e);
    useRoster.getState().setDb('error');
    return;
  }
  let prev = useRoster.getState().config;
  useRoster.subscribe((s) => {
    if (s.config === prev) return;
    prev = s.config;
    if (applying || s.db === 'off' || s.db === 'error') return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await saveToSupabase(useRoster.getState().config);
        useRoster.getState().setDb('connected');
      } catch (e) {
        console.warn('Supabase save failed:', e);
        useRoster.getState().setDb('error');
      }
    }, 900);
  });
}
