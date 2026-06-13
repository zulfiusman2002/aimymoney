import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { getRate, saveRate } from '../lib/fx';
import { ASSET_CLASSES, LIQUIDITY_LABELS, fmtMoney, symFor } from '../lib/wealth';

const today = () => new Date().toISOString().slice(0, 10);
const CURRENCIES = ['GBP', 'USD', 'EUR', 'INR', 'AED', 'AUD', 'CAD'];
const SOURCES = ['manual estimate', 'agent valuation', 'statement', 'screenshot', 'index'];

const blank = (base) => ({
  name: '', asset_class: 'property', liquidity: 'illiquid',
  original_currency: base, original_value: '', fx_rate: 1,
  valuation_date: today(), valuation_source: 'manual estimate', notes: '',
});

// Other Wealth — everything you own that isn't on a broker screenshot.
export default function OtherWealth({ onChanged }) {
  const { user, profile } = useAuth();
  const base = profile?.currency || 'GBP';
  const sym = symFor(base);
  const f = (n) => fmtMoney(n, sym);

  const [assets, setAssets] = useState(null);
  const [history, setHistory] = useState({});           // asset_id -> valuations[]
  const [form, setForm] = useState(null);               // add/edit form state
  const [editingId, setEditingId] = useState(null);
  const [updating, setUpdating] = useState(null);       // asset being revalued: { asset, value, date, source, fx_rate }
  const [openHistory, setOpenHistory] = useState(null); // asset_id with history expanded
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: rows }, { data: vals }] = await Promise.all([
      supabase.from('assets').select('*').eq('user_id', user.id).eq('is_active', true).order('converted_value', { ascending: false }),
      supabase.from('asset_valuations').select('*').eq('user_id', user.id).order('valuation_date', { ascending: false }),
    ]);
    setAssets(rows || []);
    const h = {};
    for (const v of vals || []) (h[v.asset_id] = h[v.asset_id] || []).push(v);
    setHistory(h);
  };
  useEffect(() => { load(); }, [user.id]);

  const classChanged = async (cls) => {
    const def = ASSET_CLASSES.find(([c]) => c === cls);
    setForm({ ...form, asset_class: cls, liquidity: def?.[2] || 'semi_liquid' });
  };
  const currencyChanged = async (cur) => {
    setForm({ ...form, original_currency: cur, fx_rate: cur === base ? 1 : await getRate(user.id, cur, base) });
  };

  const converted = (v, r) => (Number(v) || 0) * (Number(r) || 1);

  const submitForm = async () => {
    setBusy(true); setErr('');
    try {
      if (Number(form.original_value) < 0 || Number(form.fx_rate) < 0) throw new Error('Values and rates cannot be negative.');
      const rate = form.original_currency === base ? 1 : Number(form.fx_rate) || 1;
      if (form.original_currency !== base) await saveRate(user.id, form.original_currency, base, rate);
      const row = {
        user_id: user.id, name: form.name, asset_class: form.asset_class, liquidity: form.liquidity,
        original_currency: form.original_currency, original_value: Number(form.original_value),
        base_currency: base, converted_value: converted(form.original_value, rate),
        fx_rate: rate, fx_date: today(),
        valuation_date: form.valuation_date, valuation_source: form.valuation_source,
        notes: form.notes || null, updated_at: new Date().toISOString(),
      };
      let assetId = editingId;
      if (editingId) {
        const { error } = await supabase.from('assets').update(row).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('assets').insert(row).select().single();
        if (error) throw error;
        assetId = data.id;
      }
      // every create/edit records a valuation point
      await supabase.from('asset_valuations').insert({
        asset_id: assetId, user_id: user.id,
        original_currency: row.original_currency, original_value: row.original_value,
        base_currency: base, converted_value: row.converted_value,
        fx_rate: rate, fx_date: today(),
        valuation_date: row.valuation_date, source: row.valuation_source, notes: row.notes,
      });
      setForm(null); setEditingId(null);
      await load();
      onChanged?.();
      api.intelligence('both').catch(() => {});
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const submitValuation = async () => {
    setBusy(true); setErr('');
    try {
      if (Number(updating.value) < 0) throw new Error('Values cannot be negative.');
      const a = updating.asset;
      const rate = a.original_currency === base ? 1 : Number(updating.fx_rate) || 1;
      if (a.original_currency !== base) await saveRate(user.id, a.original_currency, base, rate);
      const conv = converted(updating.value, rate);
      const { error: ve } = await supabase.from('asset_valuations').insert({
        asset_id: a.id, user_id: user.id,
        original_currency: a.original_currency, original_value: Number(updating.value),
        base_currency: base, converted_value: conv, fx_rate: rate, fx_date: today(),
        valuation_date: updating.date, source: updating.source,
      });
      if (ve) throw ve;
      const { error: ae } = await supabase.from('assets').update({
        original_value: Number(updating.value), converted_value: conv,
        fx_rate: rate, fx_date: today(), valuation_date: updating.date,
        valuation_source: updating.source, updated_at: new Date().toISOString(),
      }).eq('id', a.id);
      if (ae) throw ae;
      setUpdating(null);
      await load();
      onChanged?.();
      api.intelligence('both').catch(() => {});
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (a) => {
    if (!confirm(`Remove "${a.name}" from your wealth tracking? Its valuation history will be deleted.`)) return;
    await supabase.from('assets').delete().eq('id', a.id);
    await load();
    onChanged?.();
  };

  const classLabel = (c) => ASSET_CLASSES.find(([k]) => k === c)?.[1] || c;

  return (
    <div style={{ marginTop: 34 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="eyebrow">Other wealth · property, land, gold, pension, cash</div>
          <h2 style={{ fontSize: '1.5rem', marginTop: 4 }}>Beyond the brokers</h2>
        </div>
        <button className="btn" onClick={() => { setEditingId(null); setForm(blank(base)); }}>+ Add asset</button>
      </div>

      {err && <div className="card" style={{ borderColor: 'var(--risk)', color: 'var(--risk)', marginBottom: 14, fontSize: '.8rem' }}>{err}</div>}

      {/* ---------- add / edit form ---------- */}
      {form && (
        <div className="card rise" style={{ marginBottom: 18 }}>
          <div className="eyebrow">{editingId ? 'Edit asset' : 'New asset'}</div>
          <div className="grid g3" style={{ marginTop: 14 }}>
            <div className="field"><label>Name</label>
              <input value={form.name} placeholder="e.g. Flat in Delhi" onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Asset class</label>
              <select value={form.asset_class} onChange={(e) => classChanged(e.target.value)}>
                {ASSET_CLASSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></div>
            <div className="field"><label>Liquidity</label>
              <select value={form.liquidity} onChange={(e) => setForm({ ...form, liquidity: e.target.value })}>
                {Object.entries(LIQUIDITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></div>
            <div className="field"><label>Currency</label>
              <select value={form.original_currency} onChange={(e) => currencyChanged(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div className="field"><label>Value ({form.original_currency})</label>
              <input type="number" min="0" value={form.original_value} onChange={(e) => setForm({ ...form, original_value: e.target.value })} /></div>
            {form.original_currency !== base && (
              <div className="field"><label>1 {form.original_currency} = ? {base} <span style={{ textTransform: 'none', letterSpacing: 0 }}>(manual rate)</span></label>
                <input type="number" step="0.0001" value={form.fx_rate} onChange={(e) => setForm({ ...form, fx_rate: e.target.value })} /></div>
            )}
            <div className="field"><label>Valuation date</label>
              <input type="date" value={form.valuation_date} onChange={(e) => setForm({ ...form, valuation_date: e.target.value })} /></div>
            <div className="field"><label>Valuation source</label>
              <select value={form.valuation_source} onChange={(e) => setForm({ ...form, valuation_source: e.target.value })}>
                {SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select></div>
            <div className="field"><label>Notes</label>
              <input value={form.notes} placeholder="optional" onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 600 }}>
              = {f(converted(form.original_value, form.original_currency === base ? 1 : form.fx_rate))} <span className="eyebrow">in {base}</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn ghost" onClick={() => { setForm(null); setEditingId(null); }}>Cancel</button>
              <button className="btn brass" disabled={busy || !form.name || !Number(form.original_value)} onClick={submitForm}>
                {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add to my wealth'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- asset cards ---------- */}
      {assets === null ? <div className="skeleton" style={{ height: 160 }} /> :
        assets.length === 0 && !form ? (
          <div className="card empty">
            <div className="display">Your wealth is more than your brokers</div>
            <p style={{ maxWidth: 440, margin: '8px auto 0' }}>
              Add your home, land, gold, pension and cash so net worth, liquidity and the AI Advisor see the full picture.
            </p>
            <button className="btn brass" style={{ marginTop: 18 }} onClick={() => setForm(blank(base))}>Add your first asset</button>
          </div>
        ) : (
          <div className="grid g3">
            {assets.map((a) => {
              const hist = history[a.id] || [];
              const prev = hist[1];
              const delta = prev ? Number(a.converted_value) - Number(prev.converted_value) : null;
              const isUpd = updating?.asset?.id === a.id;
              return (
                <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span className="eyebrow">{classLabel(a.asset_class)}</span>
                    <span className="badge">{LIQUIDITY_LABELS[a.liquidity]}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginTop: 6 }}>{a.name}</div>
                  <div className="stat-value" style={{ fontSize: '1.7rem', marginTop: 2 }}>{f(a.converted_value)}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
                    {a.original_currency !== base
                      ? (() => {
                          const fxAge = a.fx_date ? Math.floor((Date.now() - new Date(a.fx_date)) / 86400000) : null;
                          const fxMissing = !a.fx_rate || Number(a.fx_rate) === 1;
                          const fxStale = fxAge != null && fxAge > 90;
                          return (<>
                            {symFor(a.original_currency)}{Number(a.original_value).toLocaleString()} @ {a.fx_rate}{' '}
                            <span className={`badge ${fxMissing || fxStale ? 'warning' : ''}`} style={{ fontSize: '.56rem', padding: '2px 7px' }}>
                              {fxMissing ? 'check FX rate' : fxStale ? `manual rate · ${fxAge}d old` : `manual rate · ${a.fx_date}`}
                            </span>
                          </>);
                        })()
                      : <>valued {a.valuation_date}</>}
                    {' '}· {a.valuation_source}
                  </div>
                  {delta != null && (
                    <div style={{ fontSize: '.74rem', marginTop: 6, color: delta >= 0 ? 'var(--good)' : 'var(--risk)' }}>
                      {delta >= 0 ? '▲' : '▼'} {f(Math.abs(delta))} since {prev.valuation_date}
                    </div>
                  )}

                  {/* valuation update inline form */}
                  {isUpd && (
                    <div className="rise" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'grid', gap: 10 }}>
                      <div className="field"><label>New value ({a.original_currency})</label>
                        <input type="number" min="0" autoFocus value={updating.value}
                          onChange={(e) => setUpdating({ ...updating, value: e.target.value })} /></div>
                      {a.original_currency !== base && (
                        <div className="field"><label>1 {a.original_currency} = ? {base} (manual rate)</label>
                          <input type="number" step="0.0001" value={updating.fx_rate}
                            onChange={(e) => setUpdating({ ...updating, fx_rate: e.target.value })} /></div>)}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div className="field"><label>Date</label>
                          <input type="date" value={updating.date} onChange={(e) => setUpdating({ ...updating, date: e.target.value })} /></div>
                        <div className="field"><label>Source</label>
                          <select value={updating.source} onChange={(e) => setUpdating({ ...updating, source: e.target.value })}>
                            {SOURCES.map((s) => <option key={s}>{s}</option>)}
                          </select></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn ghost" style={{ padding: '8px 18px' }} onClick={() => setUpdating(null)}>Cancel</button>
                        <button className="btn brass" style={{ padding: '8px 18px' }} disabled={busy || !Number(updating.value)} onClick={submitValuation}>
                          {busy ? 'Saving…' : 'Save valuation'}</button>
                      </div>
                    </div>
                  )}

                  {/* history */}
                  {openHistory === a.id && hist.length > 0 && (
                    <div className="rise" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                      {hist.slice(0, 6).map((v, i) => {
                        const nxt = hist[i + 1];
                        const d = nxt ? Number(v.converted_value) - Number(nxt.converted_value) : null;
                        return (
                          <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', padding: '4px 0' }}>
                            <span style={{ color: 'var(--muted)' }}>{v.valuation_date} · {v.source}</span>
                            <span>{f(v.converted_value)}{d != null && (
                              <span style={{ color: d >= 0 ? 'var(--good)' : 'var(--risk)', marginLeft: 6 }}>
                                {d >= 0 ? '+' : ''}{f(d)}</span>)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!isUpd && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 14, flexWrap: 'wrap' }}>
                      <button className="chip" onClick={() => setUpdating({ asset: a, value: a.original_value, date: today(), source: a.valuation_source || 'manual estimate', fx_rate: a.fx_rate })}>
                        Update value</button>
                      {hist.length > 1 && (
                        <button className="chip" onClick={() => setOpenHistory(openHistory === a.id ? null : a.id)}>
                          {openHistory === a.id ? 'Hide history' : `History (${hist.length})`}</button>)}
                      <button className="chip" onClick={() => {
                        setEditingId(a.id);
                        setForm({ name: a.name, asset_class: a.asset_class, liquidity: a.liquidity,
                          original_currency: a.original_currency, original_value: a.original_value,
                          fx_rate: a.fx_rate, valuation_date: a.valuation_date,
                          valuation_source: a.valuation_source || 'manual estimate', notes: a.notes || '' });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}>Edit</button>
                      <button className="chip" onClick={() => remove(a)}>✕</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
