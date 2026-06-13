import { handler as wrap, requireUser, json, computeIntelligence, buildContext, callClaude, parseClaudeJson } from './_lib/core.mjs';

export const handler = wrap(async (event) => {
  const { user, db } = await requireUser(event);
  const { run = 'both' } = JSON.parse(event.body || '{}');
  const I = await computeIntelligence(db, user.id);
  const out = {};

  // ---- 1. Deterministic monthly snapshot (no AI) ----
  if (run === 'snapshot' || run === 'both') {
    const row = {
      user_id: user.id, month: I.month,
      total_income: I.budget.totalIncome,
      total_expenses: I.budget.totalExpenses,
      fixed_expenses: I.budget.byType.fixed,
      variable_expenses: I.budget.byType.variable,
      one_time_expenses: I.budget.byType['one-time'],
      total_savings: I.budget.netSavings,
      savings_rate: I.budget.savingsRate ?? 0,
      total_invested: I.portfolio.totalInvested,
      total_assets: I.assets.totalAssets,
      total_liabilities: I.liabilities.totalLiabilities,
      net_worth: I.netWorth,
      emergency_fund: I.assets.emergencyFund,
      goal_progress: I.goals.map((g) => ({ goal_id: g.id, name: g.name, pct: Math.round(g.pct), on_track: g.onTrack })),
      learning_xp: I.learning.streak.total_xp,
      computed_at: new Date().toISOString(),
    };
    const { error } = await db.from('monthly_snapshots').upsert(row, { onConflict: 'user_id,month' });
    if (error) throw error;
    out.snapshot = row;
  }

  // ---- 2. Cross-module linked insights (Claude, grounded in triggers) ----
  if (run === 'insights' || run === 'both') {
    const context = await buildContext(db, user.id);
    const raw = await callClaude({
      maxTokens: 1800,
      system: `You generate CROSS-MODULE insights for a wealth app. Each insight must connect at least two modules (budget, goals, portfolio, networth, learn, projector) and be grounded ONLY in the context numbers — never invent values, never give buy/sell directives, never invent analyst ratings.
Good examples of the style: "Eating out (£240) is 27% of the gap to your house deposit pace" or "Crypto at 24% of investments — module 6 (Risk and Luck) is queued for you".
Return ONLY a JSON array (max 5 items):
[{"title":"short, specific, uses real numbers","detail":"1-2 sentences explaining the cross-module link and one concrete consideration","severity":"info|good|warning|risk","source_modules":["budget","goals"],"recommended_module_id":null or integer module id from the triggers section}]`,
      messages: [{ role: 'user', content: context }],
    });
    let items = parseClaudeJson(raw);
    if (!Array.isArray(items)) items = items.insights || [];
    const validModules = new Set(I.modules.map((m) => m.id));
    const rows = items.slice(0, 5).map((x) => ({
      user_id: user.id,
      title: String(x.title || '').slice(0, 180),
      detail: String(x.detail || '').slice(0, 600),
      severity: ['info', 'good', 'warning', 'risk'].includes(x.severity) ? x.severity : 'info',
      source_modules: Array.isArray(x.source_modules) ? x.source_modules.slice(0, 4) : [],
      recommended_module_id: validModules.has(x.recommended_module_id) ? x.recommended_module_id : null,
    })).filter((r) => r.title && r.detail);

    // Replace previous active auto-insights with the fresh set
    await db.from('insights').update({ status: 'resolved' }).eq('user_id', user.id).eq('status', 'active');
    if (rows.length) {
      const { data, error } = await db.from('insights').insert(rows).select();
      if (error) throw error;
      out.insights = data;
    } else out.insights = [];
  }

  return json(200, out);
});
