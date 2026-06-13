import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { fmtMoney, symFor } from '../lib/wealth';

const TYPES = [
  ['mortgage', 'Mortgage'], ['loan', 'Personal loan'], ['credit_card', 'Credit card'],
  ['car_loan', 'Car loan'], ['education_loan', 'Education loan'], ['other', 'Other'],
];

// Liabilities ledger — rows feed Dashboard, Net Worth, Projector and the AI context automatically.
export default function Liabilities({ rows, onChanged }) {
  const { user, profile } = useAuth();
  const sym = symFor(profile?.currency || 'GBP');
  const f = (n) => fmtMoney(n, sym);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true); setErr('');
    try {
      if ([form.amount, form.interest_rate, form.monthly_payment].some((v) => v !== '' && v != null && Number(v) < 0))
        throw new Error('Amounts and rates cannot be negative.');
      const row = {
        user_id: user.id, name: form.name, type: form.type || 'loan',
        amount: Number(form.amount),
        interest_rate: form.interest_rate !== '' && form.interest_rate != null ? Number(form.interest_rate) : null,
        monthly_payment: form.monthly_payment !== '' && form.monthly_payment != null ? Number(form.monthly_payment) : null,
      };
      if (form.id) await supabase.from('liabilities').update(row).eq('id', form.id);
      else await supabase.from('liabilities').insert(row);
      setForm(null);
      onChanged?.();
      api.intelligence('snapshot').catch(() => {});
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const remove = async (l) => {
    if (!confirm(`Remove "${l.name}"? (Paid off? Congratulations.)`)) return;
    await supabase.from('liabilities').delete().eq('id', l.id);
    onChanged?.();
    api.intelligence('snapshot').catch(() => {});
  };

  const total = rows.reduce((a, l) => a + Number(l.amount), 0);
  const monthly = rows.reduce((a, l) => a + Number(l.monthly_payment || 0), 0);
  const typeLabel = (t) => TYPES.find(([k]) => k === t)?.[1] || t;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="eyebrow">Liabilities</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 600, color: 'var(--risk)' }}>−{f(total)}</div>
          {monthly > 0 && <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>{f(monthly)}/mo in payments</div>}
        </div>
        <button className="chip" onClick={() => setForm({ type: 'loan' })}>+ Add</button>
      </div>

      {err && <p style={{ color: 'var(--risk)', fontSize: '.74rem', marginBottom: 8 }}>{err}</p>}

      {form && (
        <div className="rise" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 12, display: 'grid', gap: 10 }}>
          <div className="field"><label>Name</label>
            <input value={form.name || ''} placeholder="e.g. Car finance" onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field"><label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field"><label>Outstanding ({sym})</label>
              <input type="number" min="0" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="field"><label>Interest rate %</label>
              <input type="number" step="0.1" min="0" value={form.interest_rate ?? ''} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} /></div>
            <div className="field"><label>Monthly payment ({sym})</label>
              <input type="number" min="0" value={form.monthly_payment ?? ''} onChange={(e) => setForm({ ...form, monthly_payment: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" style={{ padding: '8px 18px' }} onClick={() => setForm(null)}>Cancel</button>
            <button className="btn brass" style={{ padding: '8px 18px' }} disabled={busy || !form.name || !Number(form.amount)} onClick={save}>
              {busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}

      {rows.length === 0 && !form && <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Debt-free — or not added yet. Liabilities reduce net worth and shape the Projector.</p>}
      {rows.map((l) => (
        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.84rem' }}>{l.name}</div>
            <div style={{ fontSize: '.64rem', color: 'var(--muted)' }}>
              {typeLabel(l.type)}{l.interest_rate != null ? ` · ${l.interest_rate}%` : ''}{l.monthly_payment ? ` · ${f(l.monthly_payment)}/mo` : ''}
              {l.amount > 0 && l.monthly_payment > 0 && ` · ~${Math.ceil(l.amount / l.monthly_payment)} mo left`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--risk)' }}>−{f(l.amount)}</span>
            <button className="chip" style={{ padding: '4px 10px' }} onClick={() => setForm({ ...l })}>✎</button>
            <button className="chip" style={{ padding: '4px 10px' }} onClick={() => remove(l)}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
