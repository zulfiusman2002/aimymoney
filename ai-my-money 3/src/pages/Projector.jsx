import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { composition, fmtMoney, symFor, snapshotValue } from '../lib/wealth';
import { getMonthlyIncome } from '../lib/income';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';

const PROPERTY_CLASSES = new Set(['property', 'commercial_property', 'land']);

// 20-year monthly simulation off the user's real composition.
// Liabilities amortise individually: interest-aware when rate + payment exist.
function totalDebt(debts) { return debts.reduce((a, d) => a + d.balance, 0); }
function stepDebts(debts) {
  for (const d of debts) {
    if (d.balance <= 0) continue;
    if (d.rate != null && d.payment > 0) {
      d.balance = Math.max(0, d.balance * (1 + d.rate / 1200) - d.payment);  // interest-aware
    } else if (d.payment > 0) {
      d.balance = Math.max(0, d.balance - d.payment);                        // straight-line approximation
    }
    // no payment data: balance held constant (clearly approximate)
  }
}
function project({ investable, propertyWealth, debts0, monthly, lump, retPct, propPct, inflPct }) {
  const rm = Math.pow(1 + retPct / 100, 1 / 12) - 1;
  const pm = Math.pow(1 + propPct / 100, 1 / 12) - 1;
  const im = Math.pow(1 + inflPct / 100, 1 / 12) - 1;
  const debts = debts0.map((d) => ({ ...d }));
  let inv = investable + lump, prop = propertyWealth;
  const startNW = investable + propertyWealth - totalDebt(debts) + lump;
  let totalContrib = 0;
  const rows = [{ year: 0, nominal: Math.round(startNW), real: Math.round(startNW), contributions: Math.round(startNW), growth: 0 }];
  for (let m = 1; m <= 240; m++) {
    inv = inv * (1 + rm) + monthly;
    prop = prop * (1 + pm);
    stepDebts(debts);
    const debt = totalDebt(debts);
    totalContrib += monthly;
    if (m % 12 === 0) {
      const nominal = inv + prop - debt;
      const deflator = Math.pow(1 + im, m);
      rows.push({
        year: m / 12,
        nominal: Math.round(nominal),
        real: Math.round(nominal / deflator),
        contributions: Math.round(startNW + totalContrib),
        growth: Math.round(nominal - startNW - totalContrib),
      });
    }
  }
  return rows;
}

export default function Projector() {
  const { user, profile } = useAuth();
  const base = profile?.currency || 'GBP';
  const sym = symFor(base);
  const f = (n) => fmtMoney(n, sym);

  const [src, setSrc] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [lump, setLump] = useState(0);
  const [ret, setRet] = useState(7);
  const [prop, setProp] = useState(3);
  const [infl, setInfl] = useState(2.5);
  const [showReal, setShowReal] = useState(false);

  useEffect(() => {
    (async () => {
      const month = new Date().toISOString().slice(0, 7);
      const [snaps, assets, liabs, inc, exp] = await Promise.all([
        supabase.from('investment_snapshots').select('asset_type, total_value, converted_total, snapshot_date')
          .eq('user_id', user.id).order('snapshot_date', { ascending: false }),
        supabase.from('assets').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('liabilities').select('amount, interest_rate, monthly_payment').eq('user_id', user.id),
        getMonthlyIncome(user.id, month),
        supabase.from('expenses').select('amount').eq('user_id', user.id).eq('month', month),
      ]);
      const latestMap = {};
      for (const s of snaps.data || []) if (!latestMap[s.asset_type]) latestMap[s.asset_type] = s;
      const latest = Object.values(latestMap);
      const aRows = assets.data || [];
      const comp = composition(aRows, latest, liabs.data || []);
      const propertyWealth = aRows.filter((a) => PROPERTY_CLASSES.has(a.asset_class))
        .reduce((s, a) => s + Number(a.converted_value), 0)
        + latest.filter((s) => PROPERTY_CLASSES.has(s.asset_type)).reduce((s2, s) => s2 + snapshotValue(s), 0);
      const investable = comp.gross - propertyWealth;
      const income = inc.total;
      const expenses = (exp.data || []).reduce((a, x) => a + Number(x.amount), 0);
      const debts0 = (liabs.data || []).map((l) => ({
        balance: Number(l.amount), rate: l.interest_rate != null ? Number(l.interest_rate) : null,
        payment: Number(l.monthly_payment || 0),
      }));
      const debtApprox = debts0.some((d) => d.rate == null || !d.payment);
      setSrc({ comp, investable, propertyWealth, netSavings: Math.max(0, income - expenses), debts0, debtApprox });
      setMonthly(Math.max(0, Math.round(income - expenses)));
    })();
  }, [user.id]);

  const scenarios = useMemo(() => {
    if (!src || monthly === null) return null;
    const baseArgs = {
      investable: src.investable, propertyWealth: src.propertyWealth,
      debts0: src.debts0, monthly, lump: Number(lump) || 0, inflPct: infl,
    };
    return {
      conservative: project({ ...baseArgs, retPct: ret - 2, propPct: Math.max(0, prop - 1.5) }),
      base: project({ ...baseArgs, retPct: ret, propPct: prop }),
      aggressive: project({ ...baseArgs, retPct: ret + 2, propPct: prop + 1.5 }),
    };
  }, [src, monthly, lump, ret, prop, infl]);

  if (!src || !scenarios) return <div className="page"><div className="skeleton" style={{ height: 320 }} /></div>;

  const key = showReal ? 'real' : 'nominal';
  const chart = scenarios.base.map((r, i) => ({
    year: r.year,
    Conservative: scenarios.conservative[i][key],
    Base: r[key],
    Aggressive: scenarios.aggressive[i][key],
  }));
  const milestones = [3, 5, 10, 20].map((y) => ({ y, row: scenarios.base.find((r) => r.year === y) }));

  const Slider = ({ label, value, set, min, max, step, unit }) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: 'var(--muted)', marginBottom: 4 }}>
        <span className="eyebrow">{label}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--ink)' }}>{unit === sym ? f(value) : `${value}${unit}`}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} style={{ width: '100%', accentColor: 'var(--brass)' }}
        onChange={(e) => set(Number(e.target.value))} />
    </div>
  );

  return (
    <div className="page">
      <div className="rise" style={{ marginBottom: 24 }}>
        <div className="eyebrow">Built from your actual net worth of {f(src.comp.netWorth)} — not hypothetical numbers</div>
        <h1 style={{ fontSize: '2.3rem', marginTop: 6 }}>Wealth Projector</h1>
      </div>

      {/* sliders */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="grid g3" style={{ gap: 24 }}>
          <Slider label="Monthly savings" value={monthly} set={setMonthly} min={0} max={Math.max(3000, src.netSavings * 2)} step={50} unit={sym} />
          <Slider label="Investment return" value={ret} set={setRet} min={2} max={12} step={0.5} unit="% /yr" />
          <Slider label="Property growth" value={prop} set={setProp} min={0} max={8} step={0.5} unit="% /yr" />
          <Slider label="Inflation" value={infl} set={setInfl} min={0} max={8} step={0.5} unit="% /yr" />
          <Slider label="One-time lump sum" value={lump} set={setLump} min={0} max={50000} step={500} unit={sym} />
          <div style={{ alignSelf: 'end' }}>
            <button className={'chip' + (showReal ? ' on' : '')} onClick={() => setShowReal(!showReal)}>
              {showReal ? "Showing today's money (real)" : 'Show in today\u2019s money'}
            </button>
            <p style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 6 }}>
              Defaults: your current net savings rate, base assumptions. Debts amortise with interest where rate + payment are known{src.debtApprox && ' — some debts lack rate/payment, so debt projection is approximate'}.
            </p>
          </div>
        </div>
      </div>

      {/* milestone cards */}
      <div className="grid g4" style={{ marginBottom: 18 }}>
        {milestones.map(({ y, row }) => (
          <div key={y} className="card">
            <div className="eyebrow">{y} years</div>
            <div className="stat-value" style={{ fontSize: '1.8rem', marginTop: 4 }}>{f(row[key])}</div>
            <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
              {f(scenarios.conservative.find((r) => r.year === y)[key])} – {f(scenarios.aggressive.find((r) => r.year === y)[key])}
            </div>
          </div>
        ))}
      </div>

      {/* scenario chart */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Scenario projection · {showReal ? "today's money" : 'nominal'}</div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chart} margin={{ left: 8, right: 8 }}>
            <defs>
              <linearGradient id="pb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a8854a" stopOpacity={0.3} /><stop offset="100%" stopColor="#a8854a" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e4dccb" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year" tickFormatter={(v) => `${v}y`} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `${sym}${v >= 1e6 ? (v / 1e6).toFixed(1) + 'm' : (v / 1000).toFixed(0) + 'k'}`} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={56} />
            <Tooltip formatter={(v) => f(v)} labelFormatter={(v) => `Year ${v}`} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
            {[3, 5, 10].map((y) => <ReferenceLine key={y} x={y} stroke="#c9bfa8" strokeDasharray="3 3" />)}
            <Area type="monotone" dataKey="Conservative" stroke="#8a8276" strokeWidth={1.5} fill="none" strokeDasharray="5 4" animationDuration={700} />
            <Area type="monotone" dataKey="Base" stroke="#a8854a" strokeWidth={2.5} fill="url(#pb)" animationDuration={700} />
            <Area type="monotone" dataKey="Aggressive" stroke="#2e5239" strokeWidth={1.5} fill="none" strokeDasharray="5 4" animationDuration={700} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* contribution vs growth */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Contributions vs growth · base scenario (nominal)</div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={scenarios.base} margin={{ left: 8, right: 8 }}>
            <CartesianGrid stroke="#e4dccb" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year" tickFormatter={(v) => `${v}y`} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `${sym}${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={56} />
            <Tooltip formatter={(v) => f(v)} labelFormatter={(v) => `Year ${v}`} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
            <Area type="monotone" dataKey="contributions" name="You put in" stackId="1" stroke="#5b5346" fill="#5b5346" fillOpacity={0.55} animationDuration={700} />
            <Area type="monotone" dataKey="growth" name="Compounding did" stackId="1" stroke="#a8854a" fill="#a8854a" fillOpacity={0.55} animationDuration={700} />
          </AreaChart>
        </ResponsiveContainer>
        {scenarios.base.at(-1).growth > scenarios.base.at(-1).contributions && (
          <p style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 8 }}>
            By year 20, growth ({f(scenarios.base.at(-1).growth)}) outweighs everything you contributed — the lesson from your Compounding module, in your own numbers.
          </p>
        )}
      </div>

      {/* year-by-year table */}
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 10 }}>Year by year · base scenario</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem' }}>
            <thead><tr>
              {['Year', 'Nominal', "Today's money", 'You put in', 'Growth'].map((h) => (
                <th key={h} style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--line)', fontSize: '.6rem', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{h}</th>))}
            </tr></thead>
            <tbody>
              {scenarios.base.filter((r) => r.year > 0 && (r.year <= 5 || r.year % 2 === 0)).map((r) => (
                <tr key={r.year} style={{ background: [3, 5, 10, 20].includes(r.year) ? 'var(--brass-soft)' : 'transparent' }}>
                  <td style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 600 }}>{r.year}</td>
                  <td style={{ textAlign: 'right', padding: '7px 10px', fontFamily: 'var(--font-display)', fontSize: '.95rem', fontWeight: 600 }}>{f(r.nominal)}</td>
                  <td style={{ textAlign: 'right', padding: '7px 10px', color: 'var(--muted)' }}>{f(r.real)}</td>
                  <td style={{ textAlign: 'right', padding: '7px 10px' }}>{f(r.contributions)}</td>
                  <td style={{ textAlign: 'right', padding: '7px 10px', color: 'var(--good)' }}>{f(r.growth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 10 }}>
          Projections are illustrations based on your stored data and the assumptions above — not predictions or financial advice. Markets do not move in straight lines.
        </p>
      </div>
    </div>
  );
}
