// Dead simple - no imports, no auth, no dependencies
// GET /.netlify/functions/model-check
// Returns exactly what model string the running code sees
export const handler = async () => {
  const stamp = '2026-06-13T13:43:10Z';
  const hardcoded = 'claude-3-haiku-20240307';
  const envOverride = process.env.ANTHROPIC_MODEL || null;
  const envFast = process.env.ANTHROPIC_MODEL_FAST || null;
  const envFull = process.env.ANTHROPIC_MODEL_FULL || null;
  const actualModel = envOverride || hardcoded;
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deploy_stamp: stamp,
      hardcoded_model: hardcoded,
      actual_model_used: actualModel,
      env_ANTHROPIC_MODEL: envOverride,
      env_ANTHROPIC_MODEL_FAST: envFast,
      env_ANTHROPIC_MODEL_FULL: envFull,
      key_prefix: process.env.ANTHROPIC_API_KEY?.slice(0, 20) + '...' || 'NOT SET',
      message: actualModel === hardcoded 
        ? 'Good - using hardcoded model, no env override'
        : 'WARNING - env var is overriding the hardcoded model to: ' + actualModel
    }, null, 2)
  };
};
