// Calls Netlify Functions with the user's Supabase session token.
// The Claude API key never exists in this codebase — backend only.
import { supabase } from './supabase';

async function call(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error('Network error — check your connection and try again.');
  }
  // Netlify timeout pages and other errors arrive as HTML, not JSON
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`AI analysis timed out. Try a smaller review. (HTTP ${res.status})`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export const api = {
  chat: (messages) => call('ai-chat', { messages }),
  analyze: (type) => call('analyze', { type }),
  extractScreenshot: (payload) => call('analyze-screenshot', payload),
  learningCard: () => call('learning-card', {}),
  intelligence: (run = 'both') => call('intelligence', { run }),
};
