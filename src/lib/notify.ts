// Tells pod leads when a PUBLISHED roster changes, through an n8n webhook (VITE_N8N_WEBHOOK_URL).
// In n8n, enable CORS ("Allowed Origins: *") on the Webhook node so the browser may call it.
const url = import.meta.env.VITE_N8N_WEBHOOK_URL as string | undefined;

export const notifyConfigured = Boolean(url);

export interface ChangePayload {
  month: string;
  summary: string;
  errors: number;
}

/** Resolves true when the webhook accepted the call. Never throws. */
export async function notifyRosterChanged(p: ChangePayload): Promise<boolean> {
  if (!url) return false;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'published_roster_changed', at: new Date().toISOString(), ...p }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
