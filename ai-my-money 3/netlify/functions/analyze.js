import { handler as wrap, requireUser, json, buildAnalysisContext, callClaude, parseClaudeJson, ADVISOR_SYSTEM, DISCLAIMER } from './_lib/core.js';

// Fast types: Haiku, 300-500 tokens — target <5s
// Full review: Sonnet, 800 tokens — target <10s
const CONFIG = {
  'budget':      { focus: 'Analyse the monthly budget: where money goes, overspending risks, and 3 specific improvements with amounts.', maxTokens: 600, useFast: true },
  'goals':       { focus: 'Check every goal: on track or not, required monthly vs current contribution, one key action per goal.', maxTokens: 600, useFast: true },
  'networth':    { focus: 'Review net worth: composition, liquid vs illiquid split, liabilities, and month-on-month direction.', maxTokens: 700, useFast: true },
  'risk':        { focus: 'Risk review: concentration, emergency-fund coverage, single points of failure, top 2 risks.', maxTokens: 600, useFast: true },
  'savings':     { focus: 'Savings optimisation: top 3 realistic ways to raise the savings rate, ranked by impact.', maxTokens: 600, useFast: true },
  'portfolio':   { focus: 'Analyse the investment portfolio: diversification, concentration risk, stale snapshots to update.', maxTokens: 700, useFast: true },
  'changes':     { focus: 'What changed since last month? Explain the most important financial shift and why it matters.', maxTokens: 600, useFast: true },
  'full-review': { focus: 'Full financial review: budget health, savings rate, portfolio summary, goal status, net worth, and top 3 priority actions.', maxTokens: 1200, useFast: true },
};

const JSON_SCHEMA = `Return ONLY valid JSON, no markdown, no extra text:
{"headline":"one sentence","health_score":0-100 or null,"summary":"2-3 sentences","insights":[{"title":"","detail":"","sentiment":"good|warning|risk|neutral"}],"actions":[{"title":"","detail":"","priority":"high|medium|low"}],"confidence":"high|medium|low","data_gaps":[]}`;

export const handler = wrap(async (event) => {
  console.log('ANALYZE START');
  const { user, db } = await requireUser(event);
  console.log('USER VERIFIED', user.id);

  const { type = 'full-review' } = JSON.parse(event.body || '{}');
  const cfg = CONFIG[type];
  if (!cfg) return json(400, { error: 'Unknown analysis type' });

  const context = await buildAnalysisContext(db, user.id, type);
  console.log('CONTEXT BUILT', { type, chars: context.length });

  const raw = await callClaude({
    maxTokens: cfg.maxTokens,
    useFast: cfg.useFast,
    system: `${ADVISOR_SYSTEM}\n\n${JSON_SCHEMA}`,
    messages: [{ role: 'user', content: `${cfg.focus}\n\n${context}` }],
  });
  console.log('ANTHROPIC RETURNED');

  const result = parseClaudeJson(raw);
  result.disclaimer = DISCLAIMER;

  db.from('ai_analysis').insert({ user_id: user.id, analysis_type: type, prompt: cfg.focus, response: JSON.stringify(result) })
    .then(() => {}).catch(() => {});

  return json(200, result);
});
