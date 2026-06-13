import { handler as wrap, requireUser, json, buildContext, callClaude, ADVISOR_SYSTEM } from './_lib/core.mjs';

export const handler = wrap(async (event) => {
  console.log('CHAT START');
  const { user, db } = await requireUser(event);
  console.log('USER VERIFIED', user.id);
  const { messages = [] } = JSON.parse(event.body || '{}');
  if (!messages.length) return json(400, { error: 'messages required' });

  const context = await buildContext(db, user.id);
  console.log('CONTEXT BUILT', { chars: context.length });

  const reply = await callClaude({
    system: `${ADVISOR_SYSTEM}\n\n${context}`,
    messages: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    maxTokens: 900,
    useFast: false,   // Sonnet for advisor chat — quality matters here
  });

  db.from('ai_analysis').insert({ user_id: user.id, analysis_type: 'chat',
    prompt: messages[messages.length - 1]?.content?.slice(0, 500), response: reply })
    .then(() => {}).catch(() => {});

  return json(200, { reply });
});
