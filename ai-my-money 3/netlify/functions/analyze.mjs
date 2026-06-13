import { handler as wrap, requireUser, json, buildAnalysisContext, callClaude, parseClaudeJson, ADVISOR_SYSTEM, DISCLAIMER } from './_lib/core.mjs';

const CONFIG = {
  'budget':      { focus: 'Analyse the monthly budget: where money goes, fixed vs variable balance, overspending risks, 3 specific cuts with amounts.', maxTokens: 700 },
  'goals':       { focus: 'Check every goal: on track or not, required monthly vs current contribution, biggest risk.', maxTokens: 700 },
  'networth':    { focus: 'Review net worth: composition, liquid vs illiquid, liabilities, month-on-month direction.', maxTokens: 800 },
  'risk':        { focus: 'Risk review: concentration, volatility exposure, emergency-fund coverage, single points of failure.', maxTokens: 800 },
  'savings':     { focus: 'Savings optimisation: realistic ways to raise the savings rate, ranked by impact and effort.', maxTokens: 700 },
  'portfolio':   { focus: 'Analyse the investment portfolio: diversification, concentration risk, currency/geography exposure, stale snapshots.', maxTokens: 900 },
  'changes':     { focus: 'Explain what changed since last month and why it matters.', maxTokens: 800 },
  'full-review': { focus: 'Full financial review: budget health, savings rate, portfolio, goals, net worth, top 3 priorities.', maxTokens: 1400 },
};

const JSON_SCHEMA = `Return ONLY valid JSON, no markdown fences:
{"headline":"one-sentence verdict","health_score":0-100 or null,"summary":"2-3 sentences","insights":[{"title":"","detail":"","sentiment":"good|warning|risk|neutral"}],"actions":[{"title":"","detail":"","priority":"high|medium|low"}],"confidence":"high|medium|low","data_gaps":[]}`;

export const handler = wrap(async (event) => {
  console.log('ANALYZE START');
  const { user, db } = await requireUser(event);
  console.log('USER VERIFIED', user.id);

  const { type = 'full-review' } = JSON.parse(event.body || '{}');
  const cfg = CONFIG[type];
  if (!cfg) return json(400, { error: 'Unknown analysis type' });

  const context = await buildAnalysisContext(db, user.id, type);
  console.log('CONTEXT BUILT', { type, chars: context.length });

  let raw;
  try {
    raw = await callClaude({
      maxTokens: cfg.maxTokens,
      system: `${ADVISOR_SYSTEM}\n\n${JSON_SCHEMA}`,
      messages: [{ role: 'user', content: `${cfg.focus}\n\n${context}` }],
    });
  } catch (e) {
    console.log('ANALYZE ERROR', e.message);
    // AbortError already turned into 504 by callClaude; re-throw so handler catches it
    throw e;
  }
  console.log('ANTHROPIC RETURNED');

  const result = parseClaudeJson(raw);
  result.disclaimer = DISCLAIMER;

  // fire-and-forget — don't let a DB write delay the response
  db.from('ai_analysis').insert({ user_id: user.id, analysis_type: type, prompt: cfg.focus, response: JSON.stringify(result) }).then(() => {}).catch(() => {});

  return json(200, result);
});
