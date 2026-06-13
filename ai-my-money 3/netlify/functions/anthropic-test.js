// Diagnostic — accepts GET or POST, no auth required. DELETE after confirming models.
// Visit: https://your-site.netlify.app/.netlify/functions/anthropic-test

const API = 'https://api.anthropic.com/v1';
const HDR = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' };

// Probe a single model — 4s timeout per call
async function probe(key, model) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${API}/messages`, {
      method: 'POST', signal: ctrl.signal,
      headers: { ...HDR, 'x-api-key': key },
      body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] }),
    });
    const body = await r.json().catch(() => ({}));
    return { model, ok: r.ok, status: r.status, model_returned: body.model, error: body.error?.message, ms: Date.now() - t0 };
  } catch (e) {
    return { model, ok: false, status: 0, error: e.name === 'AbortError' ? 'timed out' : e.message, ms: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}

export const handler = async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in Netlify env vars' }),
  };

  // All probes run in PARALLEL so total time ≈ slowest single call (~3s)
  const results = await Promise.all([
    probe(key, 'claude-3-haiku-20240307'),
    probe(key, 'claude-3-sonnet-20240229'),
    probe(key, 'claude-3-opus-20240229'),
    probe(key, 'claude-3-5-haiku-20241022'),
    probe(key, 'claude-3-5-sonnet-20241022'),
    probe(key, 'claude-3-5-sonnet-20240620'),
  ]);

  const working = results.filter((r) => r.ok);
  const haiku  = working.find((r) => r.model.includes('haiku'));
  const sonnet = working.find((r) => r.model.includes('sonnet'));
  const best   = haiku || working[0] || null;
  const full   = sonnet || haiku || working[0] || null;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recommendation: {
        ANTHROPIC_MODEL_FAST: best?.model_returned || best?.model || 'NONE WORKING',
        ANTHROPIC_MODEL_FULL: full?.model_returned || full?.model || 'NONE WORKING',
        instruction: best
          ? 'Copy these values into Netlify → Site settings → Environment variables, then redeploy.'
          : 'No models responded. Verify ANTHROPIC_API_KEY is set correctly in Netlify env vars.',
      },
      key_prefix: key.slice(0, 14) + '...',
      probes: results,
    }, null, 2),
  };
};
