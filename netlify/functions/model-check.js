// Diagnostic — no auth required. Accepts GET or POST.
// Visit: https://your-site.netlify.app/.netlify/functions/model-check
// Reports the exact model strings that core.js will use for this deployment.
// Delete this file once you have confirmed the deployment is healthy.

export const handler = async () => {
  const key = process.env.ANTHROPIC_API_KEY;

  // Mirror the exact same logic as core.js MODEL_FAST / MODEL_FULL constants
  const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST || 'claude-haiku-4-5-20251001';
  const MODEL_FULL = process.env.ANTHROPIC_MODEL_FULL || process.env.ANTHROPIC_MODEL_FAST || 'claude-haiku-4-5-20251001';

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'ok',
      models_in_use: {
        MODEL_FAST,
        MODEL_FULL,
        note: 'These mirror the constants in core.js exactly.',
      },
      env_vars: {
        ANTHROPIC_MODEL_FAST: process.env.ANTHROPIC_MODEL_FAST || null,
        ANTHROPIC_MODEL_FULL: process.env.ANTHROPIC_MODEL_FULL || null,
        ANTHROPIC_API_KEY_present: !!key,
        ANTHROPIC_API_KEY_prefix: key ? key.slice(0, 14) + '...' : null,
      },
      deprecated: {
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || null,
        note: 'ANTHROPIC_MODEL is no longer used. Use ANTHROPIC_MODEL_FAST / ANTHROPIC_MODEL_FULL instead.',
      },
    }, null, 2),
  };
};
