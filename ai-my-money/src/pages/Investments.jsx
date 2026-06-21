import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { getRate, saveRate } from '../lib/fx';
import { compressImage } from '../lib/image';
import OtherWealth from '../components/OtherWealth';
import WealthComposition from '../components/WealthComposition';
import { composition } from '../lib/wealth';

const ASSET_TYPES = ['indian_stocks', 'uk_stocks', 'us_stocks', 'mutual_funds', 'etf', 'crypto', 'gold', 'pension', 'bonds', 'cash', 'other'];
const label = (t) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const today = () => new Date().toISOString().slice(0, 10);

export default function Investments() {
  const { user, profile } = useAuth();
  const base = profile?.currency || 'GBP';
  const sym = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }[base] || '';
  const f = (n) => `${sym}${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

  const [snapshots, setSnapshots] = useState(null);
  // wizard state
  const [step, setStep] = useState(0);              // 0 closed · 1 type · 2 upload · 3 extracting · 4 review · 5 saved
  const [assetType, setAssetType] = useState('uk_stocks');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [extract, setExtract] = useState(null);     // claude result (editable)
  const [fxRate, setFxRate] = useState(1);
  const [snapDate, setSnapDate] = useState(today());
  const [comparison, setComparison] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [assets, setAssets] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const load = async () => {
    const [snaps, ast, liab] = await Promise.all([
      supabase.from('investment_snapshots').select('*, investment_holdings(*)')
        .eq('user_id', user.id).order('snapshot_date', { ascending: false }),
      supabase.from('assets').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('liabilities').select('*').eq('user_id', user.id),
    ]);
    setSnapshots(snaps.data || []);
    setAssets(ast.data || []);
    setLiabilities(liab.data || []);
  };
  useEffect(() => { load(); }, [user.id]);

  const latestByType = {};
  for (const s of snapshots || []) if (!latestByType[s.asset_type]) latestByType[s.asset_type] = s;
  const total = Object.values(latestByType).reduce((a, s) => a + Number(s.converted_total ?? s.total_value ?? 0), 0);

  // ---------- wizard ----------
  const pickFile = async (fl) => {
    if (!fl) return;
    try {
      const c = await compressImage(fl);   // shrink before upload + AI call
      setFile(new File([c.blob], fl.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
      setPreview(c.dataUrl);
    } catch { setErr('That file could not be read as an image.'); }
  };

  const runExtraction = async () => {
    setErr(''); setStep(3); setBusy(true);
    try {
      // 1. store the screenshot privately
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('screenshots').upload(path, file);
      if (upErr) throw upErr;
      const { data: shot, error: rowErr } = await supabase.from('uploaded_screenshots')
        .insert({ user_id: user.id, asset_type: assetType, file_path: path }).select().single();
      if (rowErr) throw rowErr;

      // 2. Claude extraction via secure backend
      const base64 = preview.split(',')[1];
      const result = await api.extractScreenshot({
        imageBase64: base64, mediaType: 'image/jpeg',
        assetType, screenshotId: shot.id,
      });

      // 3. prep review state
      const cur = result.currency || base;
      setFxRate(await getRate(user.id, cur, base));
      if (result.snapshot_date) setSnapDate(result.snapshot_date);
      setExtract({ ...result, currency: cur, screenshotPath: path });
      setStep(4);
    } catch (e) { setErr(e.message); setStep(2); }
    finally { setBusy(false); }
  };

  const editHolding = (i, k, v) =>
    setExtract({ ...extract, holdings: extract.holdings.map((h, j) => j === i ? { ...h, [k]: v } : h) });

  const approve = async () => {
    setBusy(true); setErr('');
    try {
      const cur = extract.currency;
      const rate = cur === base ? 1 : Number(fxRate) || 1;
      if (cur !== base) await saveRate(user.id, cur, base, rate);

      const holdings = extract.holdings.filter((h) => h.asset_name && Number(h.current_value) > 0);
      const totalOrig = holdings.reduce((a, h) => a + Number(h.current_value), 0) || Number(extract.total_value) || 0;

      const { data: snap, error: se } = await supabase.from('investment_snapshots').insert({
        user_id: user.id, asset_type: assetType, snapshot_date: snapDate,
        total_value: totalOrig, currency: cur, source: 'screenshot',
        base_currency: base, converted_total: totalOrig * rate, fx_rate: rate, fx_date: today(),
        extraction_confidence: extract.extraction_confidence,
        notes: extract.platform ? `Platform: ${extract.platform}` : null,
      }).select().single();
      if (se) throw se;

      if (holdings.length) {
        const { error: he } = await supabase.from('investment_holdings').insert(holdings.map((h) => ({
          snapshot_id: snap.id, user_id: user.id,
          asset_name: h.asset_name, ticker: h.ticker || null,
          quantity: h.quantity || null,
          current_value: Number(h.current_value),
          invested_value: h.invested_value != null && h.invested_value !== '' ? Number(h.invested_value) : null,
          gain_loss: h.gain_loss != null && h.gain_loss !== '' ? Number(h.gain_loss) : null,
          currency: cur, platform: extract.platform || null,
          confidence_score: h.confidence_score ?? null,
          original_currency: cur, original_value: Number(h.current_value),
          base_currency: base, converted_value: Number(h.current_value) * rate,
          fx_rate: rate, fx_date: today(),
        })));
        if (he) throw he;
      }

      // comparison vs previous snapshot of same type
      const prev = (snapshots || []).find((s) => s.asset_type === assetType);
      if (prev) {
        const prevVal = Number(prev.converted_total ?? prev.total_value);
        const newVal = totalOrig * rate;
        const prevNames = new Set((prev.investment_holdings || []).map((h) => h.asset_name));
        setComparison({
          prevDate: prev.snapshot_date, prevVal, newVal, delta: newVal - prevVal,
          pct: prevVal > 0 ? ((newVal - prevVal) / prevVal) * 100 : null,
          added: holdings.filter((h) => !prevNames.has(h.asset_name)).map((h) => h.asset_name),
        });
      } else setComparison(null);

      // refresh monthly snapshot + cross-module insights in the background
      api.intelligence('both').catch(() => {});
      await load();
      setStep(5);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const reset = () => { setStep(0); setFile(null); setPreview(null); setExtract(null); setComparison(null); setErr(''); };

  // ---------- render ----------
  return (
    <div className="page">
      <div className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 26 }}>
        <div>
          <div className="t-label">Screenshot in · structured wealth out</div>
          <h1 style={{ fontSize: '2.3rem', marginTop: 6 }}>Investments</h1>
        </div>
        <div style={{ display: 'flex', gap: 22, alignItems: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div className="num-xl" style={{ fontSize: '1.9rem' }}>{f(total)}</div>
            <div className="t-label">tracked total ({base})</div>
          </div>
          <button className="btn btn-gold" onClick={() => { reset(); setStep(1); }}>Update investments</button>
        </div>
      </div>

      {snapshots !== null && (assets.length > 0 || Object.keys(latestByType).length > 0 || liabilities.length > 0) && (
        <WealthComposition comp={composition(assets, Object.values(latestByType), liabilities)} sym={sym} base={base} />
      )}

      {err && <div className="card" style={{ borderColor: 'var(--c-red)', color: 'var(--c-red)', marginBottom: 16, fontSize: '.8rem' }}>{err}</div>}

      {/* ---------- wizard ---------- */}
      {step > 0 && (
        <div className="card fade-up" style={{ marginBottom: 24 }}>
          {step === 1 && (<>
            <div className="t-label">Step 1 of 3 · What are you updating?</div>
            <div className="chips" style={{ marginTop: 14 }}>
              {ASSET_TYPES.map((t) => (
                <button key={t} className={'chip' + (assetType === t ? ' on' : '')} onClick={() => setAssetType(t)}>{label(t)}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={reset}>Cancel</button>
              <button className="btn btn-gold" onClick={() => setStep(2)}>Continue</button>
            </div>
          </>)}

          {step === 2 && (<>
            <div className="t-label">Step 2 of 3 · Upload a screenshot of your {label(assetType)}</div>
            <label htmlFor="shot" style={{
              display: 'block', marginTop: 14, padding: preview ? 0 : '48px 20px',
              border: '2px dashed var(--c-border)', borderRadius: 14, textAlign: 'center',
              cursor: 'pointer', overflow: 'hidden', transition: 'border-color .15s' }}>
              {preview
                ? <img src={preview} alt="screenshot preview" style={{ maxWidth: '100%', maxHeight: 340, display: 'block', margin: '0 auto' }} />
                : <span style={{ color: 'var(--c-muted)', fontSize: '.84rem' }}>
                    Drop or tap to choose an image<br />
                    <span style={{ fontSize: '.68rem' }}>from any broker, bank or app — values are read by AI, you review before saving</span>
                  </span>}
            </label>
            <input id="shot" type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => pickFile(e.target.files?.[0])} />
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-gold" disabled={!file || busy} onClick={runExtraction}>Read screenshot →</button>
            </div>
          </>)}

          {step === 3 && (
            <div className="empty-state">
              <div className="skeleton" style={{ height: 14, width: 220, margin: '0 auto 14px' }} />
              <div className="display">Reading your screenshot…</div>
              <p>Extracting holdings, values and currency. Nothing is saved until you approve.</p>
            </div>
          )}

          {step === 4 && extract && (<>
            <div className="t-label">Step 3 of 3 · Review &amp; approve</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, alignItems: 'flex-end' }}>
              {extract.platform && <span className="badge badge-good">Platform: {extract.platform}</span>}
              <span className="badge badge-neutral">Currency: {extract.currency}</span>
              <span className={`badge ${extract.extraction_confidence > 0.8 ? 'good' : 'warning'}`}>
                AI confidence {Math.round((extract.extraction_confidence || 0) * 100)}%</span>
              <div className="field" style={{ width: 150 }}><label>Snapshot date</label>
                <input type="date" value={snapDate} onChange={(e) => setSnapDate(e.target.value)} /></div>
              {extract.currency !== base && (
                <div className="field" style={{ width: 170 }}><label>1 {extract.currency} = ? {base}</label>
                  <input type="number" step="0.0001" value={fxRate} onChange={(e) => setFxRate(e.target.value)} /></div>
              )}
            </div>

            {extract.warnings?.length > 0 && (
              <p style={{ marginTop: 10, fontSize: '.74rem', color: 'var(--c-amber)' }}>⚠ {extract.warnings.join(' · ')}</p>
            )}

            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                <thead><tr>
                  {['Holding', 'Ticker', 'Qty', `Value (${extract.currency})`, 'Invested', 'Gain/Loss', 'Conf.', ''].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--c-border)', fontSize: '.62rem', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {extract.holdings.map((h, i) => (
                    <tr key={i}>
                      {[['asset_name', 'text', 160], ['ticker', 'text', 80], ['quantity', 'number', 70],
                        ['current_value', 'number', 100], ['invested_value', 'number', 100], ['gain_loss', 'number', 90]].map(([k, type, w]) => (
                        <td key={k} style={{ padding: '6px 6px' }}>
                          <input type={type} value={h[k] ?? ''} style={{ width: w, fontFamily: 'var(--font)', fontSize: '.76rem', padding: '8px 10px', border: '1px solid var(--c-border)', borderRadius: 8, background: 'var(--c-surface)' }}
                            onChange={(e) => editHolding(i, k, e.target.value)} />
                        </td>
                      ))}
                      <td style={{ padding: '6px' }}>
                        <span className={`badge ${Number(h.confidence_score) > 0.8 ? 'good' : 'warning'}`}>{Math.round((h.confidence_score || 0) * 100)}%</span>
                      </td>
                      <td><button className="chip" onClick={() => setExtract({ ...extract, holdings: extract.holdings.filter((_, j) => j !== i) })}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="chip" style={{ marginTop: 10 }}
              onClick={() => setExtract({ ...extract, holdings: [...extract.holdings, { asset_name: '', current_value: '' }] })}>+ Add row</button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, flexWrap: 'wrap', gap: 12 }}>
              <div className="num-xl" style={{ fontSize: '1.5rem' }}>
                {f(extract.holdings.reduce((a, h) => a + (Number(h.current_value) || 0), 0) * (extract.currency === base ? 1 : Number(fxRate) || 1))}
                <span className="unit"> in {base}</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
                <button className="btn btn-gold" disabled={busy} onClick={approve}>{busy ? 'Saving…' : 'Approve & save snapshot'}</button>
              </div>
            </div>
          </>)}

          {step === 5 && (<>
            <div className="display" style={{ fontSize: '1.6rem' }}>Snapshot saved ✦</div>
            {comparison ? (
              <p style={{ marginTop: 10, fontSize: '.86rem' }}>
                {label(assetType)} moved from <strong>{f(comparison.prevVal)}</strong> ({comparison.prevDate}) to <strong>{f(comparison.newVal)}</strong> —{' '}
                <span style={{ color: comparison.delta >= 0 ? 'var(--c-green)' : 'var(--c-red)' }}>
                  {comparison.delta >= 0 ? '+' : ''}{f(comparison.delta)}{comparison.pct != null ? ` (${comparison.pct.toFixed(1)}%)` : ''}
                </span>
                {comparison.added.length > 0 && <> · new holdings: {comparison.added.join(', ')}</>}
              </p>
            ) : <p style={{ marginTop: 10, fontSize: '.86rem' }}>First snapshot for {label(assetType)} — the next upload unlocks change tracking.</p>}
            <p style={{ fontSize: '.72rem', color: 'var(--c-muted)', marginTop: 6 }}>Monthly snapshot and cross-module insights are refreshing in the background.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={reset}>Done</button>
          </>)}
        </div>
      )}

      {/* ---------- portfolio by asset class ---------- */}
      {snapshots === null ? <div className="skeleton" style={{ height: 200 }} /> : (
        Object.keys(latestByType).length === 0 && step === 0 ? (
          <div className="card empty">
            <div className="display">No investments tracked yet</div>
            <p style={{ maxWidth: 420, margin: '8px auto 0' }}>Tap "Update investments", upload a screenshot from any broker or bank, and AI will turn it into a structured, dated portfolio snapshot.</p>
          </div>
        ) : (
          <div className="grid g3">
            {Object.values(latestByType).map((s) => {
              const ageDays = Math.floor((Date.now() - new Date(s.snapshot_date)) / 86400000);
              const history = (snapshots || []).filter((x) => x.asset_type === s.asset_type);
              const prev = history[1];
              const val = Number(s.converted_total ?? s.total_value);
              const prevVal = prev ? Number(prev.converted_total ?? prev.total_value) : null;
              return (
                <div key={s.asset_type} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="t-label">{label(s.asset_type)}</span>
                    <span className={`badge ${ageDays > 45 ? 'warning' : ''}`}>{ageDays === 0 ? 'today' : `${ageDays}d ago`}</span>
                  </div>
                  <div className="num-xl" style={{ fontSize: '1.7rem', marginTop: 8 }}>{f(val)}</div>
                  {prevVal != null && (
                    <div style={{ fontSize: '.74rem', color: val >= prevVal ? 'var(--c-green)' : 'var(--c-red)' }}>
                      {val >= prevVal ? '▲' : '▼'} {f(Math.abs(val - prevVal))} since {prev.snapshot_date}
                    </div>
                  )}
                  {(s.investment_holdings || []).slice(0, 3).map((h) => (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.74rem', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--c-border)' }}>
                      <span>{h.asset_name}</span>
                      <span style={{ color: 'var(--c-muted)' }}>{f(h.converted_value ?? h.current_value)}</span>
                    </div>
                  ))}
                  {(s.investment_holdings || []).length > 3 && (
                    <div style={{ fontSize: '.68rem', color: 'var(--c-muted)', marginTop: 6 }}>+{s.investment_holdings.length - 3} more · {history.length} snapshot{history.length === 1 ? '' : 's'}</div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      <OtherWealth onChanged={load} />
    </div>
  );
}
