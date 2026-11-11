// Vercel serverless function. The Groq key stays on the server.

declare const process: { env: Record<string, string | undefined> };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(503).json({ error: 'GROQ_API_KEY not set' });

  const issue = req.body?.issue;
  if (!issue?.message) return res.status(400).json({ error: 'issue required' });

  const prompt =
    'You help an operations manager fix a staff roster. In 2 to 3 plain sentences, explain why this ' +
    'problem matters and what to do. Use only the facts given, do not invent names or dates.\n\n' +
    JSON.stringify(issue);

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.2,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) return res.status(502).json({ error: 'Groq error ' + r.status });
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return res.status(502).json({ error: 'empty' });
    return res.status(200).json({ text });
  } catch {
    return res.status(502).json({ error: 'request failed' });
  }
}