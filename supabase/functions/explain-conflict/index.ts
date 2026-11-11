// Supabase Edge Function (Deno). Turns one detected scheduling conflict into a short plain-English
// explanation. The API key stays server-side as a secret and never reaches the browser.
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy explain-conflict --no-verify-jwt
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503, headers: CORS });
    const { issue } = await req.json();
    if (!issue || typeof issue.message !== 'string') return Response.json({ error: 'bad request' }, { status: 400, headers: CORS });

    const facts = JSON.stringify({
      kind: issue.kind, severity: issue.severity, date: issue.date, message: issue.message,
      possibleCovers: (issue.fixes ?? []).slice(0, 4),
    });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5',
        max_tokens: 220,
        system:
          'You explain staff-roster conflicts to an operations manager. Use ONLY the facts given. ' +
          'In 2-3 plain sentences: why this is a problem, then which option to try first and what it costs. ' +
          'Never invent names, dates or numbers. No headings, no bullet points.',
        messages: [{ role: 'user', content: facts }],
      }),
    });
    if (!res.ok) return Response.json({ error: `upstream ${res.status}` }, { status: 502, headers: CORS });
    const data = await res.json();
    const text = (data.content ?? []).map((b: { text?: string }) => b.text ?? '').join('').trim();
    return Response.json({ text }, { headers: CORS });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: CORS });
  }
});
