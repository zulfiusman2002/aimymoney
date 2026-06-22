import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { fmtMoney, symFor } from '../lib/wealth';
import { getMonthlyIncome, materialiseIncome } from '../lib/income';
import {
  ResponsiveContainer, Sankey, Tooltip, BarChart, Bar, XAxis, YAxis, Cell,
  RadialBarChart, RadialBar, PolarAngleAxis, Rectangle, Layer,
} from 'recharts';

const CATEGORIES = ['housing', 'food', 'transport', 'family', 'lifestyle', 'health', 'debt', 'other'];
const TYPES = ['fixed', 'variable', 'one-time'];
const DESTS = ['emergency_fund', 'bank', 'stocks', 'mutual_funds', 'crypto', 'gold', 'property', 'other'];
const thisMonth = () => new Date().toISOString().slice(0, 7);
const shiftMonth = (m, d) => { const [y, mo] = m.split('-').map(Number); const dt = new Date(y, mo - 1 + d, 1); return dt.toISOString().slice(0, 7); };
const monthName = (m) => new Date(m + '-02').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

// Custom Sankey node in the app's palette
const FlowNode = ({ x, y, width, height, payload }) => (
  <Layer>
    <Rectangle x={x} y={y} width={width} height={height} fill={payload.color || 'var(--c-green)'} radius={3} />
    <text x={x < 200 ? x + width + 8 : x - 8} y={y + height / 2} textAnchor={x < 200 ? 'start' : 'end'}
      dominantBaseline="middle" style={{ fontFamily: 'Arial', fontSize: 11, fill: '#2b2a26' }}>
      {payload.name}
    </text>
  </Layer>
);


// Custom money-flow diagram — works on all screen sizes
function MoneyFlow({ income, fixed, variable, oneOff, savings, sym, f }) {
  const total = Math.max(income, 1);
  const bars = [
    { label: 'Fixed costs', value: fixed, color: '#5b5346' },
    { label: 'Variable', value: variable, color: '#8a8276' },
    { label: 'One-off', value: oneOff, color: 'var(--c-amber)' },
    { label: 'Saved', value: savings, color: 'var(--c-green)' },
  ].filter((b) => b.value > 0);
  return (
    <div>
      {/* Income row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 90, fontSize: '.75rem', color: 'var(--c-muted)', textAlign: 'right', flexShrink: 0 }}>Income</div>
        <div style={{ flex: 1, height: 28, background: 'var(--c-ink)', borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
          <span style={{ fontSize: '.8rem', fontWeight: 600, color: '#fff' }}>{f(income)}</span>
        </div>
      </div>
      {/* Flow bars */}
      {bars.map((b) => (
        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ width: 90, fontSize: '.75rem', color: 'var(--c-muted)', textAlign: 'right', flexShrink: 0 }}>{b.label}</div>
          <div style={{ flex: 1, height: 22, background: 'var(--c-border)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (b.value / total) * 100)}%`, background: b.color, borderRadius: 6, transition: 'width .8s ease' }} />
          </div>
          <div style={{ width: 72, fontSize: '.8rem', fontWeight: 600, color: 'var(--c-ink)', flexShrink: 0 }}>{f(b.value)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Budget() {
  const { user, profile } = useAuth();
  const base = profile?.currency || 'GBP';
  const sym = symFor(base);
  const f = (n) => fmtMoney(n, sym);

  const [month, setMonth] = useState(thisMonth());
  const [income, setIncome] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [prevExpenses, setPrevExpenses] = useState([]);
  const [allocs, setAllocs] = useState([]);
  const [editing, setEditing] = useState(null);   // { table:'income'|'expense'|'alloc', row }
  const [insights, setInsights] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [incomeSource, setIncomeSource] = useState('records'); // 'records' | 'standard' fallback
  const load = async () => {
    const [inc, exp, prev, al] = await Promise.all([
      getMonthlyIncome(user.id, month),
      supabase.from('expenses').select('*').eq('user_id', user.id).eq('month', month).order('amount', { ascending: false }),
      supabase.from('expenses').select('*').eq('user_id', user.id).eq('month', shiftMonth(month, -1)),
      supabase.from('savings_allocations').select('*').eq('user_id', user.id).eq('month', month),
    ]);
    setIncome(inc.rows); setIncomeSource(inc.source); setExpenses(exp.data || []);
    setPrevExpenses(prev.data || []); setAllocs(al.data || []);
  };
  useEffect(() => { load(); }, [user.id, month]);

  // ---------- derived ----------
  const totals = useMemo(() => {
    const ti = (income || []).reduce((a, i) => a + Number(i.amount), 0);
    const byType = { fixed: 0, variable: 0, 'one-time': 0 };
    const byCat = {};
    for (const e of expenses) {
      byType[e.type] = (byType[e.type] || 0) + Number(e.amount);
      byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount);
    }
    const te = byType.fixed + byType.variable + byType['one-time'];
    const ta = allocs.reduce((a, x) => a + Number(x.amount), 0);
    const prevTotal = prevExpenses.reduce((a, e) => a + Number(e.amount), 0);
    // top movers vs last month by category
    const prevCat = {};
    for (const e of prevExpenses) prevCat[e.category] = (prevCat[e.category] || 0) + Number(e.amount);
    const movers = [...new Set([...Object.keys(byCat), ...Object.keys(prevCat)])]
      .map((c) => ({ cat: c, now: byCat[c] || 0, prev: prevCat[c] || 0, delta: (byCat[c] || 0) - (prevCat[c] || 0) }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5).filter((m) => m.delta !== 0);
    return { ti, te, byType, byCat, ta, net: ti - te, rate: ti > 0 ? ((ti - te) / ti) * 100 : 0, prevTotal, movers };
  }, [income, expenses, allocs, prevExpenses]);

  // Sankey: Income → Fixed/Variable/One-time/Savings → destinations
  const sankey = useMemo(() => {
    if (!totals.ti || !totals.te) return null;
    const nodes = [{ name: `Income ${f(totals.ti)}`, color: 'var(--c-green)' }];
    const links = [];
    const push = (name, value, color) => {
      if (value <= 0) return;
      nodes.push({ name: `${name} ${f(value)}`, color });
      links.push({ source: 0, target: nodes.length - 1, value });
    };
    push('Fixed', totals.byType.fixed, '#5b5346');
    push('Variable', totals.byType.variable, '#8a8276');
    push('One-time', totals.byType['one-time'], '#b07f2e');
    const savings = Math.max(0, totals.net);
    if (savings > 0) {
      nodes.push({ name: `Savings ${f(savings)}`, color: 'var(--c-gold)' });
      const sIdx = nodes.length - 1;
      links.push({ source: 0, target: sIdx, value: savings });
      let allocated = 0;
      for (const a of allocs) {
        if (Number(a.amount) <= 0) continue;
        nodes.push({ name: `${a.destination.replace(/_/g, ' ')} ${f(a.amount)}`, color: '#2e5239' });
        links.push({ source: sIdx, target: nodes.length - 1, value: Number(a.amount) });
        allocated += Number(a.amount);
      }
      if (savings - allocated > 1) {
        nodes.push({ name: `unallocated ${f(savings - allocated)}`, color: '#c9bfa8' });
        links.push({ source: sIdx, target: nodes.length - 1, value: savings - allocated });
      }
    }
    return { nodes, links };
  }, [totals, allocs]);

  const catData = Object.entries(totals.byCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // ---------- CRUD ----------
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const { table, row } = editing;
      if (Number(row.amount) < 0) throw new Error('Amounts cannot be negative.');
      if (!Number(row.amount) && Number(row.amount) !== 0) throw new Error('Enter a valid amount.');
      if (table === 'income') {
        // editing standard fallback rows first materialises this month's records
        if (incomeSource === 'standard') await materialiseIncome(user.id, month);
        const data = { user_id: user.id, month, name: row.name, amount: Number(row.amount), type: row.type || 'salary' };
        if (row.id && incomeSource === 'records') await supabase.from('income_records').update(data).eq('id', row.id);
        else await supabase.from('income_records').insert(data);
      } else if (table === 'expense') {
        const data = { user_id: user.id, month, description: row.description, category: row.category, amount: Number(row.amount), type: row.type, recurring: row.type === 'fixed' };
        if (row.id) await supabase.from('expenses').update(data).eq('id', row.id);
        else await supabase.from('expenses').insert(data);
      } else {
        const data = { user_id: user.id, month, destination: row.destination, amount: Number(row.amount) };
        if (row.id) await supabase.from('savings_allocations').update(data).eq('id', row.id);
        else await supabase.from('savings_allocations').insert(data);
      }
      setEditing(null); await load();
      api.intelligence('snapshot').catch(() => {});
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (table, id) => {
    
    if (table === 'income' && incomeSource === 'standard') {
      // deleting from the fallback view: materialise first so history stays intact
      const rows = await materialiseIncome(user.id, month);
      const match = rows.find((r) => r.source_id === id);
      if (match) id = match.id;
    }
    const t = { income: 'income_records', expense: 'expenses', alloc: 'savings_allocations' }[table];
    await supabase.from(t).delete().eq('id', id);
    await load();
    api.intelligence('snapshot').catch(() => {});
  };

  const copyPrevious = async () => {
    const fixed = prevExpenses.filter((e) => e.recurring || e.type === 'fixed');
    if (!fixed.length) return;
    await supabase.from('expenses').insert(fixed.map((e) => ({
      user_id: user.id, month, description: e.description, category: e.category,
      amount: e.amount, type: e.type, recurring: e.recurring,
    })));
    await load();
    api.intelligence('snapshot').catch(() => {});
  };

  const runInsights = async () => {
    setBusy(true); setErr(''); setInsights(null);
    try { setInsights(await api.analyze('budget')); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (income === null) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;

  const Editor = () => {
    const { table, row } = editing;
    const set = (k, v) => setEditing({ table, row: { ...row, [k]: v } });
    return (
      <div className="card fade-up" style={{ marginBottom: 18 }}>
        <div className="t-label">{row.id ? 'Edit' : 'Add'} {table === 'alloc' ? 'savings allocation' : table}</div>
        <div className="grid g3" style={{ marginTop: 12 }}>
          {table === 'income' && (<>
            <div className="field"><label>Source</label><input value={row.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
            <div className="field"><label>Amount ({sym}/mo)</label><input type="number" min="0" value={row.amount || ''} onChange={(e) => set('amount', e.target.value)} /></div>
            <div className="field"><label>Type</label><select value={row.type || 'salary'} onChange={(e) => set('type', e.target.value)}>
              {['salary', 'side', 'rental', 'bonus', 'other'].map((t) => <option key={t}>{t}</option>)}</select></div>
          </>)}
          {table === 'expense' && (<>
            <div className="field"><label>Description</label><input value={row.description || ''} onChange={(e) => set('description', e.target.value)} /></div>
            <div className="field"><label>Amount ({sym})</label><input type="number" min="0" value={row.amount || ''} onChange={(e) => set('amount', e.target.value)} /></div>
            <div className="field"><label>Category</label><select value={row.category || 'other'} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Type</label><select value={row.type || 'fixed'} onChange={(e) => set('type', e.target.value)}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          </>)}
          {table === 'alloc' && (<>
            <div className="field"><label>Destination</label><select value={row.destination || 'emergency_fund'} onChange={(e) => set('destination', e.target.value)}>
              {DESTS.map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}</select></div>
            <div className="field"><label>Amount ({sym})</label><input type="number" min="0" value={row.amount || ''} onChange={(e) => set('amount', e.target.value)} /></div>
          </>)}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn btn-gold" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      {/* header + month selector */}
      <div className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
        <div>
          <div className="t-label">Where the month went — and where it should go</div>
          <h1 style={{ fontSize: '2.3rem', marginTop: 6 }}>Budget</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="chip" onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', minWidth: 150, textAlign: 'center' }}>{monthName(month)}</span>
          <button className="chip" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()}>→</button>
        </div>
      </div>

      {err && <div className="card" style={{ borderColor: 'var(--c-red)', color: 'var(--c-red)', marginBottom: 14, fontSize: '.8rem' }}>{err}</div>}

      {incomeSource === 'standard' && income.length > 0 && (
        <div className="card fade-up" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderColor: 'var(--c-gold)' }}>
          <span style={{ fontSize: '.8rem' }}>Showing your <strong>standard income</strong> ({f(totals.ti)}) — {monthName(month)} hasn't been confirmed yet.</span>
          <button className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '.72rem' }} disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await materialiseIncome(user.id, month); await load(); }
              finally { setBusy(false); }
            }}>
            {busy ? 'Confirming…' : `Confirm for ${monthName(month)}`}</button>
        </div>
      )}

      {expenses.length === 0 && prevExpenses.some((e) => e.recurring || e.type === 'fixed') && (
        <div className="card fade-up" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderColor: 'var(--c-gold)' }}>
          <span style={{ fontSize: '.8rem' }}>
            New month. Import <strong>{prevExpenses.filter((e) => e.recurring || e.type === 'fixed').length} fixed expenses</strong> ({f(prevExpenses.filter((e) => e.recurring || e.type === 'fixed').reduce((a, e) => a + Number(e.amount), 0))}) from {monthName(shiftMonth(month, -1))}?
          </span>
          <button className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '.72rem' }} onClick={copyPrevious}>Import fixed expenses</button>
        </div>
      )}

      {totals.ta > Math.max(0, totals.net) && totals.ti > 0 && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--c-amber)', fontSize: '.78rem', color: 'var(--c-amber)' }}>
          ⚠ Savings allocations ({f(totals.ta)}) exceed this month's net savings ({f(Math.max(0, totals.net))}). Reduce allocations or expenses so the plan adds up.
        </div>
      )}

      {/* headline stats + gauge */}
      <div className="grid g4">
        {[['Income', f(totals.ti)], ['Expenses', f(totals.te)], ['Net savings', f(totals.net)]].map(([l, v]) => (
          <div key={l} className="card"><div className="t-label">{l}</div>
            <div className="num-xl" style={{ marginTop: 6 }}>{v}</div>
            {l === 'Expenses' && totals.prevTotal > 0 && (
              <div style={{ fontSize: '.72rem', color: totals.te <= totals.prevTotal ? 'var(--c-green)' : 'var(--c-red)' }}>
                {totals.te <= totals.prevTotal ? '▼' : '▲'} {f(Math.abs(totals.te - totals.prevTotal))} vs last month
              </div>)}
          </div>
        ))}
        <div className="card" style={{ position: 'relative' }}>
          <div className="t-label">Savings rate</div>
          <ResponsiveContainer width="100%" height={110}>
            <RadialBarChart innerRadius="70%" outerRadius="100%" startAngle={210} endAngle={-30}
              data={[{ value: Math.max(0, Math.min(100, totals.rate)) }]}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar dataKey="value" cornerRadius={8} fill={totals.rate >= 20 ? '#2e7d4f' : totals.rate >= 10 ? '#a8854a' : '#a8472f'} background={{ fill: '#e4dccb' }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 26 }}>
            <span className="num-xl" style={{ fontSize: '1.7rem' }}>{totals.rate.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* money flow */}
      {sankey && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="t-label" style={{ marginBottom: 8 }}>Money flow · {monthName(month)}</div>
          <ResponsiveContainer width="100%" height={Math.max(260, sankey.nodes.length * 34)}>
            <Sankey data={sankey} node={<FlowNode />} nodePadding={28} nodeWidth={10}
              link={{ stroke: '#c9bfa8', strokeOpacity: 0.5 }}
              margin={{ left: 10, right: 170, top: 10, bottom: 10 }}>
              <Tooltip formatter={(v) => f(v)} />
            </Sankey>
          </ResponsiveContainer>
        </div>
      )}

      {/* category chart + movers */}
      <div className="grid g2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="t-label" style={{ marginBottom: 12 }}>Spending by category</div>
          {catData.length ? (
            <ResponsiveContainer width="100%" height={Math.max(160, Math.min(catData.length * 34, 280))}>
              <BarChart data={catData} layout="vertical" margin={{ left: 6 }}>
                <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fontFamily: 'Arial' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => f(v)} cursor={{ fill: 'rgba(168,133,74,.08)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={700}>
                  {catData.map((_, i) => <Cell key={i} fill={i === 0 ? '#a8854a' : '#2e5239'} opacity={1 - i * 0.09} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><div className="display">Nothing yet</div><p>Add this month's expenses below.</p></div>}
        </div>
        <div className="card">
          <div className="t-label" style={{ marginBottom: 12 }}>Top movers vs last month</div>
          {totals.movers.length ? totals.movers.map((m) => (
            <div key={m.cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--c-border)', fontSize: '.82rem' }}>
              <span style={{ textTransform: 'capitalize' }}>{m.cat}</span>
              <span style={{ color: m.delta > 0 ? 'var(--c-red)' : 'var(--c-green)' }}>
                {m.delta > 0 ? '+' : ''}{f(m.delta)} <span style={{ color: 'var(--c-muted)' }}>({f(m.prev)} → {f(m.now)})</span>
              </span>
            </div>
          )) : <div className="empty-state"><p>No data for {monthName(shiftMonth(month, -1))} to compare against.</p></div>}
        </div>
      </div>

      {editing && <div style={{ marginTop: 18 }}><Editor /></div>}

      {/* three ledgers */}
      <div className="grid g3" style={{ marginTop: 18 }}>
        {[
          ['Income', 'income', income, (r) => [r.name, f(r.amount), r.type]],
          ['Expenses', 'expense', expenses, (r) => [r.description, f(r.amount), `${r.category} · ${r.type}`]],
          ['Savings allocation', 'alloc', allocs, (r) => [r.destination.replace(/_/g, ' '), f(r.amount), '']],
        ].map(([title, table, rows, fmt2]) => (
          <div key={table} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 6 }}>
              <span className="t-label">{title}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                {table === 'expense' && prevExpenses.length > 0 && expenses.length > 0 && (
                  <button className="chip" style={{ padding: '6px 12px' }} title="Copy last month's fixed expenses" onClick={copyPrevious}>⟳ prev</button>)}
                <button className="chip" onClick={() => setEditing({ table, row: {} })}>+ Add</button>
              </span>
            </div>
            {rows.length === 0 && <p style={{ fontSize: '.76rem', color: 'var(--c-muted)' }}>Nothing recorded{table !== 'income' ? ` for ${monthName(month)}` : ''}.</p>}
            {rows.map((r) => {
              const [a, b, c] = fmt2(r);
              return (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--c-border)', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: table === 'alloc' ? 'capitalize' : 'none' }}>{a}</div>
                    {c && <div style={{ fontSize: '.64rem', color: 'var(--c-muted)' }}>{c}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{b}</span>
                    <button className="chip" style={{ padding: '4px 10px' }} onClick={() => setEditing({ table, row: { ...r } })}>✎</button>
                    <button className="chip" style={{ padding: '4px 10px' }} onClick={() => remove(table, r.id)}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* AI insights */}
      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="t-label">AI budget insights</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginTop: 4 }}>{insights ? insights.headline : 'Let the analyst read this month.'}</div>
          </div>
          <button className="btn btn-primary" onClick={runInsights} disabled={busy}>{busy ? 'Analysing…' : 'Analyse my budget'}</button>
        </div>
        {insights?.insights?.length > 0 && (
          <div className="grid g3" style={{ marginTop: 16 }}>
            {insights.insights.map((ins, i) => (
              <div key={i} style={{ border: '1px solid var(--c-border)', borderRadius: 12, padding: 14 }}>
                <span className={`badge badge-${ins.sentiment === "good" ? "good" : ins.sentiment === "warning" ? "warn" : ins.sentiment === "risk" ? "risk" : "neutral"}`}>{ins.sentiment}</span>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', margin: '6px 0 2px' }}>{ins.title}</div>
                <div style={{ fontSize: '.74rem', color: 'var(--c-muted)' }}>{ins.detail}</div>
              </div>
            ))}
          </div>
        )}
        {insights?.disclaimer && <p style={{ marginTop: 12, fontSize: '.62rem', color: 'var(--c-muted)' }}>{insights.disclaimer}</p>}
      </div>
    </div>
  );
}
