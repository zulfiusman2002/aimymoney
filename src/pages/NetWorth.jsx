import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { composition, fmtMoney, symFor, snapshotValue } from '../lib/wealth';
import WealthComposition from '../components/WealthComposition';
import Liabilities from '../components/Liabilities';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  Treemap, BarChart, Bar, Cell,
} from 'recharts';

const PALETTE = ['#2e5239', '#a8854a', '#5b5346', '#7a9471', '#b07f2e', '#8a8276', '#465b4e', '#c9a86a'];
const label = (t) => String(t || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const TreeCell = ({ x, y, width, height, name, value, sym, index }) => {
  if (width < 4 || height < 4) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        fill={PALETTE[index % PALETTE.length]} stroke="#f6f2ea" strokeWidth={2} />
      {width > 80 && height > 36 && (
        <>
          <text x={x + 10} y={y + 20} style={{ fontFamily: 'Arial', fontSize: 10, fill: '#f6f2ea', letterSpacing: '.06em' }}>{name}</text>
          <text x={x + 10} y={y + 38} style={{ fontFamily: 'Arial', fontSize: 17, fontWeight: 600, fill: '#fffdf8' }}>{sym}{Number(value).toLocaleString('en-GB', { maximumFractionDigits: 0 })}</text>
        </>
      )}
    </g>
  );
};

export default function NetWorth() {
  const { user, profile } = useAuth();
  const base = profile?.currency || 'GBP';
  const sym = symFor(base);
  const f = (n) => fmtMoney(n, sym);

  const [data, setData] = useState(null);
  const [ai, setAi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    const [snaps, assets, liabs, months] = await Promise.all([
      supabase.from('investment_snapshots').select('asset_type, total_value, converted_total, snapshot_date')
        .eq('user_id', user.id).order('snapshot_date', { ascending: false }),
      supabase.from('assets').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('liabilities').select('*').eq('user_id', user.id).order('amount', { ascending: false }),
      supabase.from('monthly_snapshots').select('month, net_worth, total_invested, total_assets, total_liabilities')
        .eq('user_id', user.id).order('month'),
    ]);
    const latest = {};
    for (const s of snaps.data || []) if (!latest[s.asset_type]) latest[s.asset_type] = s;
    setData({ latest: Object.values(latest), assets: assets.data || [], liabilities: liabs.data || [], trend: months.data || [] });
  };
  useEffect(() => { load(); }, [user.id]);

  const comp = useMemo(() => data && composition(data.assets, data.latest, data.liabilities), [data]);

  // allocation across BOTH investments and other assets
  const allocation = useMemo(() => {
    if (!data) return [];
    const items = [
      ...data.latest.map((s) => ({ name: label(s.asset_type), value: snapshotValue(s) })),
      ...data.assets.map((a) => ({ name: a.name, value: Number(a.converted_value) })),
    ].filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    return items;
  }, [data]);

  const liabByType = useMemo(() => {
    if (!data) return [];
    const m = {};
    for (const l of data.liabilities) m[l.type] = (m[l.type] || 0) + Number(l.amount);
    return Object.entries(m).map(([name, value]) => ({ name: label(name), value })).sort((a, b) => b.value - a.value);
  }, [data]);

  const runAI = async () => {
    setBusy(true);
    try { setAi(await api.analyze('networth')); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!data) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;

  const mom = data.trend.length >= 2
    ? Number(data.trend.at(-1).net_worth) - Number(data.trend.at(-2).net_worth) : null;

  return (
    <div className="page">
      <div className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
        <div>
          <div className="t-label">Everything you own, minus everything you owe</div>
          <h1 style={{ fontSize: '2.3rem', marginTop: 6 }}>Net Worth</h1>
        </div>
        {mom != null && (
          <div style={{ textAlign: 'right' }}>
            <div className="t-label">vs last month</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: mom >= 0 ? 'var(--c-green)' : 'var(--c-red)' }}>
              {mom >= 0 ? '+' : ''}{f(mom)}
            </div>
          </div>
        )}
      </div>

      <WealthComposition comp={comp} sym={sym} base={base} />

      {/* trend */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="t-label" style={{ marginBottom: 10 }}>Net worth trend · from monthly snapshots</div>
        {data.trend.length >= 2 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.trend} margin={{ left: 8, right: 8 }}>
              <defs>
                <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2e5239" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2e5239" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e4dccb" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: 'Arial' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${sym}${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fontFamily: 'Arial' }} axisLine={false} tickLine={false} width={52} />
              <Tooltip formatter={(v) => f(v)} />
              <Area type="monotone" dataKey="net_worth" name="Net worth" stroke="#2e5239" strokeWidth={2.5} fill="url(#nw)" animationDuration={900} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📈</div>
            <div className="empty-title">The trend starts building next month</div>
            <p className="empty-body">{data.trend.length === 1 ? 'One snapshot recorded. Check back next month to see the trend.' : "Run a Full Review on the Dashboard to capture this month's snapshot."}</p>
          </div>
        )}
      </div>

      {/* allocation treemap + liabilities */}
      <div className="grid g2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="t-label" style={{ marginBottom: 10 }}>Wealth allocation</div>
          {allocation.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <Treemap data={allocation} dataKey="value" nameKey="name" isAnimationActive={false}
                content={<TreeCell sym={sym} />} />
            </ResponsiveContainer>
          ) : <div className="empty-state"><div className="empty-icon">📊</div><p className="empty-body">Add investments or assets to see allocation.</p></div>}
        </div>
        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <Liabilities rows={data.liabilities} onChanged={load} />
          {liabByType.length > 1 && (
            <div className="card">
              <div className="t-label" style={{ marginBottom: 10 }}>Liability breakdown</div>
              <ResponsiveContainer width="100%" height={liabByType.length * 42}>
                <BarChart data={liabByType} layout="vertical" margin={{ left: 6 }}>
                  <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fontFamily: 'Arial' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => f(v)} cursor={{ fill: 'rgba(168,71,47,.06)' }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={700}>
                    {liabByType.map((_, i) => <Cell key={i} fill="#a8472f" opacity={1 - i * 0.15} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {err && <div className="card" style={{ borderColor: 'var(--c-red)', color: 'var(--c-red)', marginBottom: 14, fontSize: '.8rem' }}>{err}</div>}

      {/* AI */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="t-label">AI net worth review</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginTop: 4 }}>{ai ? ai.headline : 'What does this composition say about you?'}</div>
          </div>
          <button className="btn btn-primary" onClick={runAI} disabled={busy}>{busy ? 'Reviewing…' : 'Review my net worth'}</button>
        </div>
        {ai?.insights?.length > 0 && (
          <div className="grid g3" style={{ marginTop: 16 }}>
            {ai.insights.map((ins, i) => (
              <div key={i} style={{ border: '1px solid var(--c-border)', borderRadius: 12, padding: 14 }}>
                <span className={`badge badge-${ins.sentiment === "good" ? "good" : ins.sentiment === "warning" ? "warn" : ins.sentiment === "risk" ? "risk" : "neutral"}`}>{ins.sentiment}</span>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', margin: '6px 0 2px' }}>{ins.title}</div>
                <div style={{ fontSize: '.74rem', color: 'var(--c-muted)' }}>{ins.detail}</div>
              </div>
            ))}
          </div>
        )}
        {ai?.disclaimer && <p style={{ marginTop: 12, fontSize: '.62rem', color: 'var(--c-muted)' }}>{ai.disclaimer}</p>}
      </div>
    </div>
  );
}
