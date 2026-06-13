// netlify/functions/_lib/core.mjs
// ANTHROPIC_API_KEY and service role key exist ONLY here — never in browser code.

import { createClient } from '@supabase/supabase-js';

// ── Model constants (valid Anthropic API identifiers) ─────────────────────────
// ANTHROPIC_MODEL_FAST  → quick analyses   (budget, goals, risk, savings, networth)
// ANTHROPIC_MODEL_FULL  → advisor chat + full-review
// If the env vars are not set, we default to real, confirmed model strings.
// "claude-sonnet-4-6" is NOT a valid model id — it caused the 18s timeouts.
// MODEL_FAST: used for budget/goals/risk/savings/networth/portfolio/changes
// MODEL_FULL: used for full-review and advisor chat
// Defaults to Haiku for both until you confirm which Sonnet your key can access.
// Run /.netlify/functions/anthropic-test to find the right model strings for your key,
// then set ANTHROPIC_MODEL_FAST and ANTHROPIC_MODEL_FULL in Netlify env vars.
// Single model for all calls. Override with ANTHROPIC_MODEL env var in Netlify.
// Default: claude-3-5-haiku-20241022 (fast, cheap, works on all paid keys).
// If you see 404 errors, set ANTHROPIC_MODEL=claude-3-haiku-20240307 in Netlify env vars.
// DEPLOY_STAMP: 2026-06-13T13:43:10Z
const MODEL_FAST = 'claude-haiku-4-5-20251001';
const MODEL_FULL = 'claude-haiku-4-5-20251001';
console.log('[AI-MY-MONEY] Function loaded. MODEL=claude-3-haiku-20240307 ENV_OVERRIDE=' + (process.env.ANTHROPIC_MODEL || 'none'));
const CLAUDE_TIMEOUT_MS = 18_000;

export function admin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function requireUser(event) {
  const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw httpError(401, 'Missing auth token');
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw httpError(401, 'Invalid or expired session');
  return { user: data.user, db };
}

export function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
export function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
export function handler(fn) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204 };
    if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
    try { return await fn(event); }
    catch (e) { console.error('ANALYZE ERROR', e.message); return json(e.status || 500, { error: e.message || 'Server error' }); }
  };
}

// ── Anthropic call with AbortController timeout ───────────────────────────────
// useFast=true  → Haiku  (budget, goals, risk, savings, networth)
// useFast=false → Sonnet (full-review, advisor chat)
export async function callClaude({ system, messages, maxTokens = 400, useFast = true }) {
  const model = useFast ? MODEL_FAST : MODEL_FULL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  console.log('CALLING ANTHROPIC', { model, maxTokens, msgChars: messages.map((m) => String(m.content).length) });
  const t0 = Date.now();
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw httpError(502, `AI service error (${res.status}): ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    console.log('ANTHROPIC RETURNED', { model: data.model, ms: Date.now() - t0, stopReason: data.stop_reason, outputTokens: data.usage?.output_tokens });
    return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  } catch (e) {
    if (e.name === 'AbortError') throw httpError(504, 'AI analysis timed out. Try a smaller review.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function parseClaudeJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const a = cleaned.indexOf('{'); const b = cleaned.lastIndexOf('}');
  const a2 = cleaned.indexOf('['); const b2 = cleaned.lastIndexOf(']');
  let slice;
  if (a !== -1 && (a2 === -1 || a < a2)) slice = cleaned.slice(a, b + 1);
  else if (a2 !== -1) slice = cleaned.slice(a2, b2 + 1);
  else throw httpError(502, 'AI returned non-JSON output');
  return JSON.parse(slice);
}

export const DISCLAIMER =
  'This is educational guidance based on your data, not regulated financial advice. ' +
  'Please consult a qualified financial advisor before making investment decisions.';

export const ADVISOR_SYSTEM = `You are the AI Advisor inside "AI My Money".
Rules:
- Use ONLY numbers from the context. Never invent values.
- If data is missing, say so rather than guessing.
- Never give regulated financial advice or say "buy X" / "sell X". Use "consider", "review", "watch".
- Never invent analyst ratings, price targets or consensus views.
- Acknowledge uncertainty. You have no live market data.
- End every response with: "${DISCLAIMER}"`;

// ── Month helpers ─────────────────────────────────────────────────────────────
const monthStr = (d = new Date()) => d.toISOString().slice(0, 7);
const prevMonthStr = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return monthStr(d); };
const LIQUID = new Set(['cash', 'gold']);
const SEMI   = new Set(['etf', 'uk_stocks', 'us_stocks', 'indian_stocks', 'mutual_funds', 'crypto', 'bonds']);

async function fetchIncome(db, userId, month) {
  const [rec, std] = await Promise.all([
    db.from('income_records').select('amount, name, type').eq('user_id', userId).eq('month', month),
    db.from('income_sources').select('amount, name, type').eq('user_id', userId).eq('is_active', true),
  ]);
  return rec.data?.length ? rec.data : (std.data || []);
}

// ── Lightweight per-analysis context builders ─────────────────────────────────

async function ctxBudget(db, userId) {
  const month = monthStr();
  const [profile, income, expenses, allocs, goals] = await Promise.all([
    db.from('user_profiles').select('name, currency').eq('user_id', userId).maybeSingle(),
    fetchIncome(db, userId, month),
    db.from('expenses').select('description, amount, category, type').eq('user_id', userId).eq('month', month),
    db.from('savings_allocations').select('destination, amount').eq('user_id', userId).eq('month', month),
    db.from('goals').select('goal_name, monthly_contribution').eq('user_id', userId).eq('status', 'active'),
  ]);
  const p = profile.data || {};
  const cur = p.currency || 'GBP';
  const sym = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }[cur] || cur + ' ';
  const f = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
  const totalIncome = income.reduce((a, i) => a + Number(i.amount), 0);
  const exps = expenses.data || [];
  const byType = { fixed: 0, variable: 0, 'one-time': 0 };
  const byCat = {};
  for (const e of exps) {
    byType[e.type] = (byType[e.type] || 0) + Number(e.amount);
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount);
  }
  const totalExp = Object.values(byType).reduce((a, v) => a + v, 0);
  const net = totalIncome - totalExp;
  const rate = totalIncome > 0 ? ((net / totalIncome) * 100).toFixed(1) : 'n/a';
  const catLines = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f(v)}`).join(', ');
  const goalCommit = (goals.data || []).map((g) => `${g.goal_name} ${f(g.monthly_contribution)}/mo`).join('; ') || 'none';
  const allocLines = (allocs.data || []).map((a) => `${a.destination} ${f(a.amount)}`).join(', ') || 'none';
  return `BUDGET ${month} (${cur}): income ${f(totalIncome)}, expenses ${f(totalExp)} (fixed ${f(byType.fixed)} var ${f(byType.variable)} one-off ${f(byType['one-time'])}), net ${f(net)}, rate ${rate}%.
By category: ${catLines || 'none'}. Savings allocated: ${allocLines}. Goal commitments: ${goalCommit}.`;
}

async function ctxGoals(db, userId) {
  const month = monthStr();
  const [profile, income, expenses, goals] = await Promise.all([
    db.from('user_profiles').select('name, currency').eq('user_id', userId).maybeSingle(),
    fetchIncome(db, userId, month),
    db.from('expenses').select('amount').eq('user_id', userId).eq('month', month),
    db.from('goals').select('goal_name, target_amount, current_amount, monthly_contribution, target_date').eq('user_id', userId).eq('status', 'active'),
  ]);
  const p = profile.data || {};
  const cur = p.currency || 'GBP';
  const sym = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }[cur] || cur + ' ';
  const f = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
  const totalIncome = income.reduce((a, i) => a + Number(i.amount), 0);
  const totalExp = (expenses.data || []).reduce((a, e) => a + Number(e.amount), 0);
  const net = totalIncome - totalExp;
  const committed = (goals.data || []).reduce((a, g) => a + Number(g.monthly_contribution || 0), 0);
  const MS = 2629800000;
  const gLines = (goals.data || []).map((g) => {
    const rem = Math.max(0, Number(g.target_amount) - Number(g.current_amount));
    const mc = Number(g.monthly_contribution || 0);
    const mn = mc > 0 ? Math.ceil(rem / mc) : null;
    const ma = g.target_date ? Math.max(0, Math.round((new Date(g.target_date) - Date.now()) / MS)) : null;
    const status = mn != null && ma != null ? (mn <= ma ? 'ON TRACK' : 'BEHIND') : 'no deadline';
    return `${g.goal_name}: ${f(g.current_amount)}/${f(g.target_amount)} ${f(mc)}/mo ${status}${mn ? ` needs ${mn}mo` : ''}${ma != null ? ` has ${ma}mo` : ''}`;
  }).join('; ') || 'none';
  return `GOALS (${cur}): net savings ${f(net)}/mo, committed ${f(committed)}/mo, headroom ${f(net - committed)}/mo. Goals: ${gLines}.`;
}

async function ctxNetworth(db, userId) {
  const [profile, snaps, assets, liabs, prev] = await Promise.all([
    db.from('user_profiles').select('name, currency').eq('user_id', userId).maybeSingle(),
    db.from('investment_snapshots').select('asset_type, converted_total, total_value, snapshot_date')
      .eq('user_id', userId).order('snapshot_date', { ascending: false }).limit(14),
    db.from('assets').select('name, asset_class, liquidity, converted_value').eq('user_id', userId).eq('is_active', true),
    db.from('liabilities').select('name, amount, interest_rate').eq('user_id', userId),
    db.from('monthly_snapshots').select('net_worth').eq('user_id', userId).eq('month', prevMonthStr()).maybeSingle(),
  ]);
  const p = profile.data || {};
  const cur = p.currency || 'GBP';
  const sym = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }[cur] || cur + ' ';
  const f = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
  const latest = {};
  for (const s of snaps.data || []) if (!latest[s.asset_type]) latest[s.asset_type] = s;
  const invested = Object.values(latest).reduce((a, s) => a + Number(s.converted_total ?? s.total_value), 0);
  const aRows = assets.data || [];
  let liquid = 0, semi = 0, illiquid = 0;
  for (const a of aRows) {
    const v = Number(a.converted_value);
    if (a.liquidity === 'liquid') liquid += v; else if (a.liquidity === 'semi_liquid') semi += v; else illiquid += v;
  }
  for (const [t, s] of Object.entries(latest)) {
    const v = Number(s.converted_total ?? s.total_value);
    if (LIQUID.has(t)) liquid += v; else if (SEMI.has(t)) semi += v; else illiquid += v;
  }
  const totalAssets = aRows.reduce((a, x) => a + Number(x.converted_value), 0);
  const totalLiab = (liabs.data || []).reduce((a, l) => a + Number(l.amount), 0);
  const nw = invested + totalAssets - totalLiab;
  const prevNw = prev.data?.net_worth;
  return `NET WORTH (${cur}): ${f(nw)}${prevNw ? ` (prev ${f(prevNw)}, Δ${f(nw - Number(prevNw))})` : ''}. Investments: ${f(invested)}, other assets: ${f(totalAssets)}, liabilities: -${f(totalLiab)}. Liquidity: liquid ${f(liquid)} semi ${f(semi)} illiquid ${f(illiquid)}. Investments: ${Object.entries(latest).map(([t, s]) => `${t} ${f(s.converted_total ?? s.total_value)}`).join(', ') || 'none'}. Assets: ${aRows.map((a) => `${a.name}(${a.asset_class}) ${f(a.converted_value)}`).join(', ') || 'none'}. Liabilities: ${(liabs.data || []).map((l) => `${l.name} ${f(l.amount)}`).join(', ') || 'none'}.`;
}

async function ctxPortfolio(db, userId) {
  const [profile, snaps] = await Promise.all([
    db.from('user_profiles').select('name, currency').eq('user_id', userId).maybeSingle(),
    db.from('investment_snapshots').select('asset_type, converted_total, total_value, snapshot_date, currency, investment_holdings(asset_name,ticker,converted_value,current_value,gain_loss,platform)')
      .eq('user_id', userId).order('snapshot_date', { ascending: false }).limit(14),
  ]);
  const p = profile.data || {};
  const cur = p.currency || 'GBP';
  const sym = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }[cur] || cur + ' ';
  const f = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
  const latest = {};
  for (const s of snaps.data || []) if (!latest[s.asset_type]) latest[s.asset_type] = s;
  const total = Object.values(latest).reduce((a, s) => a + Number(s.converted_total ?? s.total_value), 0);
  const today = Date.now();
  const lines = Object.values(latest).map((s) => {
    const v = Number(s.converted_total ?? s.total_value);
    const age = Math.floor((today - new Date(s.snapshot_date)) / 86400000);
    const h = (s.investment_holdings || []).slice(0, 4)
      .map((h) => `${h.asset_name}${h.ticker ? `(${h.ticker})` : ''} ${f(h.converted_value ?? h.current_value)}`).join(', ');
    return `${s.asset_type}: ${f(v)} [${age}d${age > 45 ? ' STALE' : ''}]${h ? ` — ${h}` : ''}`;
  });
  return `PORTFOLIO (${cur}): total ${f(total)}. ${lines.join('. ') || 'No data.'}`;
}

async function ctxSavingsOrRisk(db, userId) {
  const month = monthStr();
  const [profile, income, expenses, assets, liabs, snaps] = await Promise.all([
    db.from('user_profiles').select('name, currency').eq('user_id', userId).maybeSingle(),
    fetchIncome(db, userId, month),
    db.from('expenses').select('amount, type').eq('user_id', userId).eq('month', month),
    db.from('assets').select('name, asset_class, liquidity, converted_value').eq('user_id', userId).eq('is_active', true),
    db.from('liabilities').select('amount').eq('user_id', userId),
    db.from('investment_snapshots').select('asset_type, converted_total, total_value')
      .eq('user_id', userId).order('snapshot_date', { ascending: false }).limit(10),
  ]);
  const p = profile.data || {};
  const cur = p.currency || 'GBP';
  const sym = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }[cur] || cur + ' ';
  const f = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
  const totalIncome = income.reduce((a, i) => a + Number(i.amount), 0);
  const totalExp = (expenses.data || []).reduce((a, e) => a + Number(e.amount), 0);
  const net = totalIncome - totalExp;
  const latest = {};
  for (const s of snaps.data || []) if (!latest[s.asset_type]) latest[s.asset_type] = s;
  const invested = Object.values(latest).reduce((a, s) => a + Number(s.converted_total ?? s.total_value), 0);
  const aRows = assets.data || [];
  const totalAssets = aRows.reduce((a, x) => a + Number(x.converted_value), 0);
  const totalLiab = (liabs.data || []).reduce((a, l) => a + Number(l.amount), 0);
  const liquid = aRows.filter((a) => a.liquidity === 'liquid').reduce((a, x) => a + Number(x.converted_value), 0);
  const cash = aRows.find((a) => a.asset_class === 'cash');
  const cashVal = cash ? Number(cash.converted_value) : 0;
  const emergencyMonths = totalExp > 0 && cashVal > 0 ? (cashVal / totalExp).toFixed(1) : null;
  const mix = Object.entries(latest).map(([t, s]) => `${t} ${f(s.converted_total ?? s.total_value)}`).join(', ');
  return `SAVINGS/RISK (${cur}): income ${f(totalIncome)}, expenses ${f(totalExp)}, net ${f(net)}, rate ${totalIncome > 0 ? ((net / totalIncome) * 100).toFixed(1) : 'n/a'}%. Liquid assets: ${f(liquid)}. Emergency fund: ${emergencyMonths ? emergencyMonths + ' months' : 'unknown'}. Portfolio mix: ${mix || 'none'}. Net worth approx: ${f(invested + totalAssets - totalLiab)}.`;
}

// Full context for full-review and chat (no nested holdings join)
export async function buildContext(db, userId) {
  const month = monthStr();
  const [profile, incomeRec, incomeStd, expenses, allocs, goals, liabs, snaps, assets, prev] =
    await Promise.all([
      db.from('user_profiles').select('name, currency, tracker_type, financial_confidence').eq('user_id', userId).maybeSingle(),
      db.from('income_records').select('amount, name, type').eq('user_id', userId).eq('month', month),
      db.from('income_sources').select('amount, name, type').eq('user_id', userId).eq('is_active', true),
      db.from('expenses').select('description, amount, category, type').eq('user_id', userId).eq('month', month),
      db.from('savings_allocations').select('destination, amount').eq('user_id', userId).eq('month', month),
      db.from('goals').select('goal_name, target_amount, current_amount, monthly_contribution, target_date').eq('user_id', userId).eq('status', 'active'),
      db.from('liabilities').select('name, amount, interest_rate').eq('user_id', userId),
      db.from('investment_snapshots').select('asset_type, converted_total, total_value, snapshot_date')
        .eq('user_id', userId).order('snapshot_date', { ascending: false }).limit(14),
      db.from('assets').select('name, asset_class, liquidity, converted_value').eq('user_id', userId).eq('is_active', true),
      db.from('monthly_snapshots').select('net_worth, total_invested, savings_rate')
        .eq('user_id', userId).eq('month', prevMonthStr()).maybeSingle(),
    ]);
  const p = profile.data || {};
  const cur = p.currency || 'GBP';
  const sym = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }[cur] || cur + ' ';
  const f = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
  const income = incomeRec.data?.length ? incomeRec.data : (incomeStd.data || []);
  const totalIncome = income.reduce((a, i) => a + Number(i.amount), 0);
  const exps = expenses.data || [];
  const totalExp = exps.reduce((a, e) => a + Number(e.amount), 0);
  const net = totalIncome - totalExp;
  const rate = totalIncome > 0 ? ((net / totalIncome) * 100).toFixed(1) : 'n/a';
  const latest = {};
  for (const s of snaps.data || []) if (!latest[s.asset_type]) latest[s.asset_type] = s;
  const invested = Object.values(latest).reduce((a, s) => a + Number(s.converted_total ?? s.total_value), 0);
  const aRows = assets.data || [];
  const totalAssets = aRows.reduce((a, x) => a + Number(x.converted_value), 0);
  const totalLiab = (liabs.data || []).reduce((a, l) => a + Number(l.amount), 0);
  const nw = invested + totalAssets - totalLiab;
  const prevData = prev.data;
  const MS = 2629800000;
  const gLines = (goals.data || []).map((g) => {
    const rem = Math.max(0, Number(g.target_amount) - Number(g.current_amount));
    const mc = Number(g.monthly_contribution || 0);
    const mn = mc > 0 ? Math.ceil(rem / mc) : null;
    return `${g.goal_name}: ${f(g.current_amount)}/${f(g.target_amount)} at ${f(mc)}/mo${mn ? ` (~${mn}mo)` : ''}`;
  }).join('; ') || 'none';
  return `FULL REVIEW ${month} (${cur}, ${p.tracker_type || 'individual'}):
Income: ${f(totalIncome)} | Expenses: ${f(totalExp)} | Net: ${f(net)} | Rate: ${rate}%
Top expenses: ${exps.sort((a, b) => b.amount - a.amount).slice(0, 5).map((e) => `${e.description} ${f(e.amount)}`).join(', ') || 'none'}
Savings allocated: ${(allocs.data || []).map((a) => `${a.destination} ${f(a.amount)}`).join(', ') || 'none'}
Investments: ${Object.entries(latest).map(([t, s]) => `${t} ${f(s.converted_total ?? s.total_value)}`).join(', ') || 'none'}
Other assets: ${aRows.map((a) => `${a.name}(${a.asset_class}) ${f(a.converted_value)}`).join(', ') || 'none'}
Liabilities: ${(liabs.data || []).map((l) => `${l.name} ${f(l.amount)}`).join(', ') || 'none'}
Net worth: ${f(nw)}${prevData ? ` | Last month: ${f(prevData.net_worth)} (Δ ${f(nw - Number(prevData.net_worth))})` : ''}
Goals: ${gLines}`;
}

export async function buildAnalysisContext(db, userId, type) {
  if (type === 'budget')           return ctxBudget(db, userId);
  if (type === 'goals')            return ctxGoals(db, userId);
  if (type === 'networth')         return ctxNetworth(db, userId);
  if (type === 'risk' || type === 'savings') return ctxSavingsOrRisk(db, userId);
  if (type === 'portfolio' || type === 'changes') return ctxPortfolio(db, userId);
  return buildContext(db, userId);  // full-review
}

// ── computeIntelligence (intelligence.mjs + learning-card.mjs only) ───────────
export async function computeIntelligence(db, userId) {
  const month = monthStr();
  const [profile, incomeRec, incomeStd, expenses, savingsAlloc, goals, liabilities, snaps, assets, progress, streak, prevSnap, modules] =
    await Promise.all([
      db.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
      db.from('income_records').select('*').eq('user_id', userId).eq('month', month),
      db.from('income_sources').select('*').eq('user_id', userId).eq('is_active', true),
      db.from('expenses').select('*').eq('user_id', userId).eq('month', month),
      db.from('savings_allocations').select('*').eq('user_id', userId).eq('month', month),
      db.from('goals').select('*').eq('user_id', userId).eq('status', 'active'),
      db.from('liabilities').select('*').eq('user_id', userId),
      db.from('investment_snapshots').select('asset_type, converted_total, total_value, snapshot_date, investment_holdings(asset_name,current_value,converted_value)')
        .eq('user_id', userId).order('snapshot_date', { ascending: false }).limit(20),
      db.from('assets').select('*').eq('user_id', userId).eq('is_active', true),
      db.from('user_learning_progress').select('lesson_id, quiz_correct').eq('user_id', userId),
      db.from('user_streaks').select('*').eq('user_id', userId).maybeSingle(),
      db.from('monthly_snapshots').select('*').eq('user_id', userId).eq('month', prevMonthStr()).maybeSingle(),
      db.from('learn_modules').select('id, title'),
    ]);
  const income = { data: (incomeRec.data?.length ? incomeRec.data : incomeStd.data) || [] };
  const p = profile.data || {};
  const base = p.currency || 'GBP';
  const sym = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }[base] || base + ' ';
  const f = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
  const totalIncome = (income.data || []).reduce((a, i) => a + Number(i.amount || 0), 0);
  const exps = expenses.data || [];
  const byType = { fixed: 0, variable: 0, 'one-time': 0 };
  const byCat = {};
  for (const e of exps) { byType[e.type] = (byType[e.type] || 0) + Number(e.amount); byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); }
  const totalExpenses = byType.fixed + byType.variable + byType['one-time'];
  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : null;
  const fixedRatio = totalIncome > 0 ? (byType.fixed / totalIncome) * 100 : null;
  const topExpenses = [...exps].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const latest = {};
  for (const s of snaps.data || []) if (!latest[s.asset_type]) latest[s.asset_type] = s;
  const today = Date.now();
  const portfolio = Object.values(latest).map((s) => {
    const value = Number(s.converted_total ?? s.total_value ?? 0);
    const ageDays = Math.floor((today - new Date(s.snapshot_date)) / 86400000);
    return { type: s.asset_type, value, date: s.snapshot_date, ageDays, stale: ageDays > 45, holdings: s.investment_holdings || [] };
  }).filter((x) => x.value > 0 || x.holdings.length);
  const totalInvested = portfolio.reduce((a, x) => a + x.value, 0);
  const staleClasses = portfolio.filter((x) => x.stale);
  const allHoldings = portfolio.flatMap((x) => x.holdings.map((h) => ({ ...h, klass: x.type, value: Number(h.converted_value ?? h.current_value ?? 0) })));
  const topHolding = [...allHoldings].sort((a, b) => b.value - a.value)[0] || null;
  const classMix = portfolio.map((x) => ({ type: x.type, pct: totalInvested > 0 ? (x.value / totalInvested) * 100 : 0 })).sort((a, b) => b.pct - a.pct);
  const cryptoPct = classMix.find((c) => c.type === 'crypto')?.pct || 0;
  const assetRows = assets.data || [];
  const totalAssets = assetRows.reduce((a, x) => a + Number(x.converted_value || 0), 0);
  let liquid = assetRows.filter((a) => a.liquidity === 'liquid').reduce((s, a) => s + Number(a.converted_value), 0);
  let semi = assetRows.filter((a) => a.liquidity === 'semi_liquid').reduce((s, a) => s + Number(a.converted_value), 0);
  for (const x of portfolio) { if (LIQUID.has(x.type)) liquid += x.value; else if (SEMI.has(x.type)) semi += x.value; }
  const illiquid = totalAssets + totalInvested - liquid - semi;
  const emergencyFund = assetRows.filter((a) => a.asset_class === 'cash').reduce((s, a) => s + Number(a.converted_value), 0) || (latest['cash'] ? Number(latest['cash'].converted_total ?? latest['cash'].total_value) : 0);
  const emergencyMonths = totalExpenses > 0 && emergencyFund > 0 ? emergencyFund / totalExpenses : null;
  const totalLiabilities = (liabilities.data || []).reduce((a, l) => a + Number(l.amount || 0), 0);
  const netWorth = totalInvested + totalAssets - totalLiabilities;
  const MS = 2629800000;
  const goalStates = (goals.data || []).map((g) => {
    const target = Number(g.target_amount), current = Number(g.current_amount), mc = Number(g.monthly_contribution || 0);
    const pct = target > 0 ? (current / target) * 100 : 0;
    const rem = Math.max(0, target - current);
    const monthsNeeded = mc > 0 && rem > 0 ? Math.ceil(rem / mc) : null;
    const monthsAvailable = g.target_date ? Math.max(0, Math.round((new Date(g.target_date) - today) / MS)) : null;
    const onTrack = monthsNeeded != null && monthsAvailable != null ? monthsNeeded <= monthsAvailable : null;
    const requiredMonthly = monthsAvailable > 0 ? rem / monthsAvailable : null;
    const eta = monthsNeeded != null ? new Date(today + monthsNeeded * MS) : null;
    return { id: g.id, name: g.goal_name, target, current, pct, monthly: mc, targetDate: g.target_date, monthsNeeded, monthsAvailable, onTrack, requiredMonthly, eta };
  });
  const behindGoals = goalStates.filter((g) => g.onTrack === false);
  const lessonsDone = (progress.data || []).length;
  const quizAccuracy = lessonsDone ? Math.round(100 * (progress.data.filter((x) => x.quiz_correct).length / lessonsDone)) : null;
  const st = streak.data || { current_streak: 0, longest_streak: 0, total_xp: 0 };
  const triggers = [];
  if (savingsRate != null && savingsRate < 10) triggers.push({ code: 'low_savings_rate', module: 2, why: `savings rate ${savingsRate.toFixed(1)}%` });
  if (cryptoPct > 20) triggers.push({ code: 'crypto_concentration', module: 6, why: `crypto is ${cryptoPct.toFixed(0)}% of portfolio` });
  if (topHolding && totalInvested > 0 && topHolding.value / totalInvested > 0.35) triggers.push({ code: 'single_holding_concentration', module: 6, why: `${topHolding.asset_name} is ${(100 * topHolding.value / totalInvested).toFixed(0)}% of investments` });
  if (totalIncome > 0 && netWorth < totalIncome * 6 && savingsRate != null && savingsRate < 20) triggers.push({ code: 'high_income_low_wealth', module: 9, why: `income ${f(totalIncome)}/mo but net worth ${f(netWorth)}` });
  if (behindGoals.length) triggers.push({ code: 'goals_behind', module: 7, why: `${behindGoals.map((g) => g.name).join(', ')} behind schedule` });
  if (emergencyMonths != null && emergencyMonths < 3) triggers.push({ code: 'thin_emergency_fund', module: 2, why: `emergency fund covers ${emergencyMonths.toFixed(1)} months` });
  if (fixedRatio != null && fixedRatio > 60) triggers.push({ code: 'high_fixed_costs', module: 4, why: `fixed costs are ${fixedRatio.toFixed(0)}% of income` });
  if (st.current_streak === 0 && lessonsDone > 0) triggers.push({ code: 'streak_broken', module: 7, why: 'learning streak broken' });
  const prev = prevSnap.data || null;
  const mom = prev ? { income: totalIncome - Number(prev.total_income), expenses: totalExpenses - Number(prev.total_expenses), savingsRate: savingsRate != null && prev.savings_rate != null ? savingsRate - Number(prev.savings_rate) : null, netWorth: netWorth - Number(prev.net_worth), invested: totalInvested - Number(prev.total_invested) } : null;
  return {
    month, base, sym, f, profile: p,
    budget: { totalIncome, totalExpenses, byType, netSavings, savingsRate, fixedRatio, topExpenses, savingsAllocated: (savingsAlloc.data || []).reduce((a, s) => a + Number(s.amount), 0) },
    portfolio: { items: portfolio, totalInvested, classMix, topHolding, cryptoPct, staleClasses, allHoldings },
    assets: { rows: assetRows, totalAssets, liquid, semi, illiquid, emergencyFund, emergencyMonths },
    liabilities: { rows: liabilities.data || [], totalLiabilities },
    netWorth, goals: goalStates, behindGoals,
    learning: { lessonsDone, quizAccuracy, streak: st },
    triggers, mom, prev, modules: modules.data || [],
  };
}
