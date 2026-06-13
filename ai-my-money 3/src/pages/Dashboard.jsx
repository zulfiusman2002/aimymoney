import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { composition, fmtMoney } from '../lib/wealth';
import { getMonthlyIncome } from '../lib/income';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const month = new Date().toISOString().slice(0, 7);
const fmt = (n, sym) => `${sym}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function Dashboard() {
  const { user, profile } = useAuth();
  const sym = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }[profile?.currency] || '';
  const [data, setData] = useState(null);
  const [brief, setBrief] = useState(null);
  const [briefBusy, setBriefBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [inc, exp, goals, snaps, ins, ast, liab] = await Promise.all([
        getMonthlyIncome(user.id, month),
        supabase.from('expenses').select('*').eq('user_id', user.id).eq('month', month),
        supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active'),
        supabase.from('investment_snapshots').select('asset_type, total_value, converted_total, snapshot_date')
          .eq('user_id', user.id).order('snapshot_date', { ascending: false }),
        supabase.from('insights').select('*').eq('user_id', user.id).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(5),
        supabase.from('assets').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('liabilities').select('amount').eq('user_id', user.id),
      ]);
      const income = inc.total;
      const expenses = (exp.data || []).reduce((a, e) => a + Number(e.amount), 0);
      const latest = {};
      for (const s of snaps.data || []) if (!latest[s.asset_type]) latest[s.asset_type] = s;
      const invested = Object.values(latest).reduce((a, s) => a + Number(s.converted_total ?? s.total_value), 0);
      setData({
        income, expenses, net: income - expenses,
        rate: income > 0 ? ((income - expenses) / income) * 100 : 0,
        goals: goals.data || [], invested,
        expenseList: exp.data || [],
        allocation: Object.values(latest).filter((s) => Number(s.converted_total ?? s.total_value) > 0),
        insights: ins.data || [],
        comp: composition(ast.data || [], Object.values(latest), liab.data || []),
      });
    })();
  }, [user.id]);

  const runBrief = async () => {
    setBriefBusy(true);
    try {
      // full review + refresh monthly snapshot & connected insights together
      const [review, intel] = await Promise.all([
        api.analyze('full-review'),
        api.intelligence('both').catch(() => null),
      ]);
      setBrief(review);
      if (intel?.insights) setData((d) => ({ ...d, insights: intel.insights }));
    }
    catch (e) { setBrief({ headline: e.message, insights: [], actions: [] }); }
    finally { setBriefBusy(false); }
  };

  if (!data) return (
    <div className="page grid g4">
      {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}
    </div>
  );

  const stats = [
    ['Monthly income', fmt(data.income, sym)],
    ['Monthly expenses', fmt(data.expenses, sym)],
    ['Net savings', fmt(data.net, sym)],
    ['Savings rate', `${data.rate.toFixed(1)}%`],
  ];

  const expByCat = Object.entries(
    data.expenseList.reduce((m, e) => { m[e.description] = (m[e.description] || 0) + Number(e.amount); return m; }, {})
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  return (
    <div className="page">
      <div className="rise" style={{ marginBottom: 28 }}>
        <div className="eyebrow">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <h1 style={{ fontSize: '2.3rem', marginTop: 6 }}>
          {profile?.name ? `Good day, ${profile.name}.` : 'Your money, at a glance.'}
        </h1>
      </div>

      <div className="grid g4">
        {stats.map(([label, value]) => (
          <div className="card rise" key={label}>
            <div className="eyebrow">{label}</div>
            <div className="stat-value" style={{ marginTop: 8 }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid g2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>This month's spending</div>
          {expByCat.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={expByCat} layout="vertical" margin={{ left: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmt(v, sym)} cursor={{ fill: 'rgba(168,133,74,.08)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {expByCat.map((_, i) => <Cell key={i} fill={i === 0 ? '#a8854a' : '#2e5239'} opacity={1 - i * 0.08} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty"><div className="display">No expenses yet</div>
              <p>Add this month's spending in the Budget tab.</p></div>
          )}
        </div>

        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Goals</div>
          {data.goals.length ? data.goals.map((g) => {
            const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100 || 0);
            return (
              <div key={g.id} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>{g.goal_name}</span>
                  <span style={{ color: 'var(--muted)' }}>{fmt(g.current_amount, sym)} / {fmt(g.target_amount, sym)}</span>
                </div>
                <div style={{ height: 6, background: 'var(--line)', borderRadius: 6 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--green), var(--brass))', borderRadius: 6, transition: 'width .8s ease' }} />
                </div>
              </div>
            );
          }) : (
            <div className="empty"><div className="display">No goals yet</div>
              <p>Set your first goal — even a small one changes behaviour.</p></div>
          )}
          <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
            <span className="eyebrow">Total wealth (investments + assets)</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600 }}>{fmt(data.comp.gross, sym)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span className="eyebrow">Net worth (after liabilities)</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600, color: 'var(--green)' }}>{fmt(data.comp.netWorth, sym)}</span>
          </div>
        </div>
      </div>

      {data.insights.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Connected insights · how your modules affect each other</div>
          <div className="grid g2">
            {data.insights.map((ins) => (
              <div key={ins.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`badge ${ins.severity}`}>{ins.severity}</span>
                  {(ins.source_modules || []).map((m) => <span key={m} className="badge">{m}</span>)}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', margin: '8px 0 4px' }}>{ins.title}</div>
                <div style={{ fontSize: '.76rem', color: 'var(--muted)' }}>{ins.detail}</div>
                {ins.recommended_module_id && (
                  <Link to="/app/learn" style={{ fontSize: '.7rem', display: 'inline-block', marginTop: 8 }}>→ A lesson on this is queued in Learn</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="eyebrow">AI daily briefing</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', marginTop: 4 }}>
              {brief ? brief.headline : 'Your private analyst is ready.'}
            </div>
          </div>
          <button className="btn" onClick={runBrief} disabled={briefBusy}>
            {briefBusy ? 'Analysing…' : brief ? 'Refresh briefing' : 'Run full review'}
          </button>
        </div>
        {brief?.insights?.length > 0 && (
          <div className="grid g3" style={{ marginTop: 20 }}>
            {brief.insights.slice(0, 6).map((ins, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                <span className={`badge ${ins.sentiment}`}>{ins.sentiment}</span>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', margin: '8px 0 4px' }}>{ins.title}</div>
                <div style={{ fontSize: '.76rem', color: 'var(--muted)' }}>{ins.detail}</div>
              </div>
            ))}
          </div>
        )}
        {brief?.disclaimer && <p style={{ marginTop: 16, fontSize: '.66rem', color: 'var(--muted)' }}>{brief.disclaimer}</p>}
        {!brief && <p style={{ marginTop: 10, fontSize: '.78rem', color: 'var(--muted)' }}>
          One click runs a full review of your budget, portfolio and goals — or ask anything in the <Link to="/app/advisor">AI Advisor</Link>.</p>}
      </div>
    </div>
  );
}
