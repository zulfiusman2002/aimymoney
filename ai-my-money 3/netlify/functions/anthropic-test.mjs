// Diagnostic — no auth required. Remove after confirming models.
// Calls POST /v1/messages with progressively cheaper models to find what works.
// Also calls GET /v1/models to list available models.

const ENDPOINT = 'https://api.anthropic.com/v1';
const API_VER  = '2023-06-01';

const CANDIDATES = [
  'claude-haiku-4-5-20251001',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
  'claude-3-5-sonnet-20241022',
  'claude-3-sonnet-20240229',
  'claude-3-opus-20240229',
  'claude-sonnet-4-6',
];

export const handler = async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  const results = {};

  // 1. Try GET /v1/models
  try {
    const r = await fetch(`${ENDPOINT}/models`, {
      headers: { 'x-api-key': key, 'anthropic-version': API_VER },
    });
    const body = await r.json().catch(() => null);
    results.models_endpoint = { status: r.status, body };
  } catch (e) {
    results.models_endpoint = { error: e.message };
  }

  // 2. Probe each candidate model with a minimal message
  results.model_probes = {};
  for (const model of CANDIDATES) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${ENDPOINT}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': API_VER },
        body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] }),
      });
      const body = await r.json().catch(() => null);
      results.model_probes[model] = {
        http_status: r.status,
        ok: r.ok,
        model_returned: body?.model || null,
        error_type: body?.error?.type || null,
        error_msg: body?.error?.message || null,
        ms: Date.now() - t0,
      };
    } catch (e) {
      results.model_probes[model] = { error: e.message, ms: Date.now() - t0 };
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note: 'Delete this function after diagnosing. api_key_present=' + !!key,
      api_version_header: API_VER,
      sdk: 'none — raw fetch only',
      ...results,
    }, null, 2),
  };
};
