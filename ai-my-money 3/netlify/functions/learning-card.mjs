import { handler as wrap, requireUser, json, computeIntelligence, callClaude, parseClaudeJson } from './_lib/core.mjs';

// Picks today's lesson. Deterministic behaviour triggers drive the choice;
// Claude only writes the personalised "why this lesson" line. Falls back to
// pure rules if the AI call fails, so the Learn tab always works.
export const handler = wrap(async (event) => {
  const { user, db } = await requireUser(event);

  const [{ data: lessons }, { data: done }] = await Promise.all([
    db.from('learn_lessons').select('id, module_id, title').order('module_id'),
    db.from('user_learning_progress').select('lesson_id').eq('user_id', user.id),
  ]);
  const doneIds = new Set((done || []).map((d) => d.lesson_id));
  const remaining = (lessons || []).filter((l) => !doneIds.has(l.id));
  if (!remaining.length) return json(200, { lesson_id: null, reason: 'You have completed every lesson — more are coming soon.' });

  const I = await computeIntelligence(db, user.id);

  // Deterministic pick: first trigger whose module still has lessons, else next sequential.
  let pick = null, trigger = null;
  for (const t of I.triggers) {
    const cand = remaining.find((l) => l.module_id === t.module);
    if (cand) { pick = cand; trigger = t; break; }
  }
  if (!pick) pick = remaining[0];

  let reason = trigger ? `Picked for you because ${trigger.why}.` : 'Next up on your learning path.';
  try {
    const raw = await callClaude({
      maxTokens: 200,
      system: `Write ONE warm sentence (max 25 words) telling the user why today's lesson fits their finances. Use only the facts given. No advice, no invented numbers. Return JSON: {"reason":"..."}`,
      messages: [{ role: 'user', content: `Lesson: "${pick.title}". Trigger: ${trigger ? `${trigger.code} — ${trigger.why}` : 'none, sequential pick'}. Savings rate: ${I.budget.savingsRate?.toFixed(1) ?? 'unknown'}%. Streak: ${I.learning.streak.current_streak} days.` }],
    });
    reason = parseClaudeJson(raw).reason || reason;
  } catch { /* deterministic reason already set */ }

  return json(200, { lesson_id: pick.id, reason, trigger: trigger?.code || null });
});
