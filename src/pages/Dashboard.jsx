import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { composition, fmtMoney, symFor } from '../lib/wealth';
import { getMonthlyIncome } from '../lib/income';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const month = new Date().toISOString().slice(0, 7);

export default function Dashboard() {
  const { user, profile } = useAuth();
  const sym = symFor(profile?.currency);
  const f = (n) => fmtMoney(n, sym);
  const nav = useNavigate();

  const [data, setData] = useState(null);
  const [brief, setBrief] = useState(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefErr, setBriefErr] = useState('');

  useEffect(() => {
    (async () => {
      const [inc, exp, goals, snaps, ins, ast, liab] = await Promise.all([
        getMonthlyIncome(user.id, month),
        supabase.from('expenses').select('*').eq('user_id', user.id).eq('month', month),
        supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active'),
        supabase.from('investment_snapshots').select('asset_type,total_value,converted_total,snapshot_date')
          .eq('user_id', user.id).order('snapshot_date', { ascending: false }),
        supabase.from('insights').select('*').eq('user_id', user.id).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(4),
        supabase.from('assets').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('liabilities').select('amount').eq('user_id', user.id),
      ]);
      const income = inc.total;
      const expenses = (exp.data || []).reduce((a, e) => a + Number(e.amount), 0);
      const latest = {};
      for (const s of snaps.data || []) if (!latest[s.asset_type]) latest[s.asset_type] = s;
      const invested = Object.values(latest).reduce((a, s) => a + Number(s.converted_total ?? s.total_value), 0);
      const comp = composition(ast.data || [], Object.values(latest), liab.data || []);
      const expByCat = Object.entries(
        (exp.data || []).reduce((m, e) => { m[e.description] = (m[e.description] || 0) + Number(e.amount); return m; }, {})
      ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7);
      setData({ income, expenses, net: income - expenses, rate: income > 0 ? ((income - expenses) / income) * 100 : 0, goals: goals.data || [], comp, insights: ins.data || [], expByCat });
    })();
  }, [user.id]);

  const runBrief = async () => {
    setBriefBusy(true); setBriefErr('');
    try {
      const [review] = await Promise.all([
        api.analyze('full-review'),
        api.intelligence('both').catch(() => null),
      ]);
      setBrief(review);
    } catch (e) { setBriefErr(e.message); }
    finally { setBriefBusy(false); }
  };

  if (!data) return (
    <div className="page">
      <div className="skeleton" style={{ height: 120, marginBottom: 16, borderRadius: 16 }} />
      <div className="grid g4">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
      </div>
    </div>
  );

  const savingsRateColor = data.rate >= 20 ? 'var(--c-green)' : data.rate >= 10 ? 'var(--c-amber)' : 'var(--c-red)';

  return (
    <div className="page">
      {/* Hero */}
      <div className="fade-up" style={{ marginBottom: 28 }}>
        <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 6 }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <h1 className="t-h1">{profile?.name ? `Good day, ${profile.name}.` : 'Your money, at a glance.'}</h1>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '.75rem', fontWeight: 500, color: 'var(--c-muted)', marginBottom: 2 }}>NET WORTH</div>
            <div className="num-hero" style={{ color: 'var(--c-green)' }}>{f(data.comp.netWorth)}</div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid g4 fade-up delay-1">
        <div className="stat-card">
          <div className="label">Monthly income</div>
          <div className="value">{f(data.income)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Monthly expenses</div>
          <div className="value">{f(data.expenses)}</div>
          <div className="delta" style={{ color: 'var(--c-muted)', fontSize: '.78rem' }}>This month</div>
        </div>
        <div className="stat-card">
          <div className="label">Net savings</div>
          <div className="value" style={{ color: data.net >= 0 ? 'var(--c-green)' : 'var(--c-red)' }}>{f(data.net)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Savings rate</div>
          <div className="value" style={{ color: savingsRateColor }}>{data.rate.toFixed(1)}%</div>
          <div style={{ marginTop: 8, height: 4, background: 'var(--c-border)', borderRadius: 99 }}>
            <div style={{ height: '100%', width: `${Math.min(100, data.rate)}%`, background: savingsRateColor, borderRadius: 99, transition: 'width .8s ease' }} />
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid g2 fade-up delay-2" style={{ marginTop: 16 }}>
        {/* Spending */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="t-label">This month's spending</div>
            <button className="btn btn-xs btn-secondary" onClick={() => nav('/app/budget')}>Budget →</button>
          </div>
          {data.expByCat.length ? (
            <ResponsiveContainer width="100%" height={Math.max(160, data.expByCat.length * 34)}>
              <BarChart data={data.expByCat} layout="vertical" margin={{ left: 0, right: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12, fill: 'var(--c-ink2)' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => f(v)} cursor={{ fill: 'rgba(184,134,11,.07)' }} contentStyle={{ borderRadius: 10, border: '1px solid var(--c-border)', fontSize: 13 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
                  {data.expByCat.map((_, i) => <Cell key={i} fill={i === 0 ? 'var(--c-gold)' : 'var(--chart-1)'} opacity={1 - i * 0.1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <div className="empty-title">No expenses yet</div>
              <div className="empty-body">Add this month's spending in Budget.</div>
              <button className="btn btn-gold btn-sm" onClick={() => nav('/app/budget')}>Open Budget</button>
            </div>
          )}
        </div>

        {/* Goals */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="t-label">Goals</div>
            <button className="btn btn-xs btn-secondary" onClick={() => nav('/app/goals')}>All goals →</button>
          </div>
          {data.goals.length ? (
            <div className="row-list">
              {data.goals.slice(0, 4).map((g) => {
                const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100 || 0);
                return (
                  <div key={g.id} style={{ paddingBottom: 16, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="t-h3">{g.goal_name}</span>
                      <span className="num-sm">{f(g.current_amount)} <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}>/ {f(g.target_amount)}</span></span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div style={{ marginTop: 5, fontSize: '.75rem', color: 'var(--c-muted)' }}>{pct.toFixed(0)}% there</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">🎯</div>
              <div className="empty-title">No goals yet</div>
              <div className="empty-body">A goal turns "saving" into "saving for".</div>
              <button className="btn btn-gold btn-sm" onClick={() => nav('/app/goals')}>Add first goal</button>
            </div>
          )}
          {/* Wealth summary */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--c-border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><div className="t-label" style={{ marginBottom: 4 }}>Total wealth</div><div className="num-md">{f(data.comp.gross)}</div></div>
            <div><div className="t-label" style={{ marginBottom: 4 }}>Liabilities</div><div className="num-md" style={{ color: 'var(--c-red)' }}>−{f(data.comp.totalLiabilities)}</div></div>
          </div>
        </div>
      </div>

      {/* Connected Insights */}
      {data.insights.length > 0 && (
        <div className="fade-up delay-3" style={{ marginTop: 16 }}>
          <div className="t-label" style={{ marginBottom: 12 }}>Connected insights · how your modules affect each other</div>
          <div className="grid g2">
            {data.insights.map((ins) => (
              <div key={ins.id} className={`insight-card ${ins.severity}`}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span className={`badge badge-${ins.severity === 'good' ? 'good' : ins.severity === 'warning' ? 'warn' : ins.severity === 'risk' ? 'risk' : 'neutral'}`}>{ins.severity}</span>
                  {(ins.source_modules || []).map((m) => <span key={m} className="badge badge-neutral">{m}</span>)}
                </div>
                <div className="insight-title">{ins.title}</div>
                <div className="insight-body">{ins.detail}</div>
                {ins.recommended_module_id && (
                  <Link to="/app/learn" style={{ fontSize: '.78rem', fontWeight: 500, color: 'var(--c-blue)', display: 'inline-block', marginTop: 8 }}>→ A lesson is queued in Learn</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Briefing */}
      <div className="card fade-up delay-4" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="t-label" style={{ marginBottom: 6 }}>AI daily briefing</div>
            <div className="t-h2">{brief?.headline || 'Your private analyst is ready.'}</div>
            {brief?.summary && <p className="t-body" style={{ marginTop: 8, maxWidth: 560 }}>{brief.summary}</p>}
          </div>
          <button className="btn btn-primary btn-sm" onClick={runBrief} disabled={briefBusy}>
            {briefBusy ? 'Analysing…' : brief ? 'Refresh' : 'Run full review'}
          </button>
        </div>

        {briefErr && <div style={{ marginTop: 12, color: 'var(--c-red)', fontSize: '.82rem', fontWeight: 500 }}>{briefErr}</div>}

        {brief?.insights?.length > 0 && (
          <div className="grid g3" style={{ marginTop: 20 }}>
            {brief.insights.slice(0, 6).map((ins, i) => (
              <div key={i} className={`insight-card ${ins.sentiment}`}>
                <span className={`badge badge-${ins.sentiment === 'good' ? 'good' : ins.sentiment === 'warning' ? 'warn' : ins.sentiment === 'risk' ? 'risk' : 'neutral'}`}>{ins.sentiment}</span>
                <div className="insight-title" style={{ marginTop: 8 }}>{ins.title}</div>
                <div className="insight-body">{ins.detail}</div>
              </div>
            ))}
          </div>
        )}

        {brief?.actions?.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="t-label" style={{ marginBottom: 10 }}>Priority actions</div>
            {brief.actions.slice(0, 3).map((a, i) => (
              <div key={i} className="row-item">
                <div>
                  <div className="row-label" style={{ fontWeight: 600 }}>{a.title}</div>
                  <div className="row-sub">{a.detail}</div>
                </div>
                <span className={`badge badge-${a.priority === 'high' ? 'risk' : a.priority === 'medium' ? 'warn' : 'neutral'}`}>{a.priority}</span>
              </div>
            ))}
          </div>
        )}

        {!brief && !briefBusy && (
          <p className="t-small" style={{ marginTop: 12 }}>
            One tap runs a full analysis of your budget, portfolio and goals —
            or <Link to="/app/advisor" style={{ color: 'var(--c-blue)' }}>ask anything in AI Advisor</Link>.
          </p>
        )}
        {brief?.disclaimer && <p className="t-small" style={{ marginTop: 14, borderTop: '1px solid var(--c-border)', paddingTop: 12 }}>{brief.disclaimer}</p>}
      </div>
    </div>
  );
}
