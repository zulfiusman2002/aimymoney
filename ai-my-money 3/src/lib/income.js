import { supabase } from './supabase';

// Month-aware income. Returns the month's actual records when they exist;
// otherwise falls back to standard income_sources (flagged so the UI can
// offer to materialise the month).
export async function getMonthlyIncome(userId, month) {
  const { data: records } = await supabase.from('income_records')
    .select('*').eq('user_id', userId).eq('month', month).order('amount', { ascending: false });
  if (records?.length) {
    return { rows: records, total: records.reduce((a, r) => a + Number(r.amount), 0), source: 'records' };
  }
  const { data: std } = await supabase.from('income_sources')
    .select('*').eq('user_id', userId).eq('is_active', true).order('amount', { ascending: false });
  return { rows: std || [], total: (std || []).reduce((a, r) => a + Number(r.amount), 0), source: 'standard' };
}

// Copy standard income into a month's records (first-open materialisation).
// Idempotent: sources already materialised for the month are skipped, and a
// partial unique index (user_id, month, source_id) backstops race conditions.
export async function materialiseIncome(userId, month) {
  const [{ data: std }, { data: existing }] = await Promise.all([
    supabase.from('income_sources').select('*').eq('user_id', userId).eq('is_active', true),
    supabase.from('income_records').select('id, source_id').eq('user_id', userId).eq('month', month),
  ]);
  if (!std?.length) return existing || [];
  const present = new Set((existing || []).map((r) => r.source_id).filter(Boolean));
  const rows = std.filter((s) => !present.has(s.id))
    .map((s) => ({ user_id: userId, month, name: s.name, amount: s.amount, type: s.type, source_id: s.id }));
  if (!rows.length) return existing || [];
  const { data, error } = await supabase.from('income_records').insert(rows).select();
  if (error && error.code !== '23505') throw error;   // ignore unique-violation races
  return [...(existing || []), ...(data || [])];
}
