import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const TOTAL_STEPS = 8;
const month = new Date().toISOString().slice(0, 7);

const FIXED_DEFAULTS = [
  { description: 'Rent / mortgage', amount: '' },
  { description: 'Utilities', amount: '' },
  { description: 'Groceries', amount: '' },
  { description: 'Insurance', amount: '' },
  { description: 'Car payment', amount: '' },
  { description: 'Fuel / transport', amount: '' },
  { description: 'Loan EMIs', amount: '' },
  { description: 'Subscriptions', amount: '' },
  { description: 'Family support', amount: '' },
  { description: 'Childcare', amount: '' },
];
const BROKER_TYPES = ['Indian stocks', 'UK stocks', 'US stocks', 'Mutual funds', 'ETFs', 'Crypto', 'Bonds'];
const WEALTH_TYPES = [
  ['Property', 'property', 'illiquid'],
  ['Land', 'land', 'illiquid'],
  ['Gold', 'gold', 'liquid'],
  ['Pension', 'pension', 'illiquid'],
  ['Cash savings', 'cash', 'liquid'],
  ['Vehicle', 'vehicle', 'semi_liquid'],
  ['Other', 'other', 'semi_liquid'],
];
const ASSET_TYPES = [...BROKER_TYPES, ...WEALTH_TYPES.map(([l]) => l)];
const GOAL_TYPES = ['Emergency fund', 'House deposit', 'Debt freedom', 'Retirement', 'Child education', 'Travel', 'Business', 'Wealth target'];
const CURRENCIES = ['GBP', 'USD', 'EUR', 'INR', 'AED', 'AUD', 'CAD'];
const SYM = { GBP: '£', USD: '$', EUR: '€', INR: '₹', AED: 'AED', AUD: 'A$', CAD: 'C$' };

const Pill = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} style={{
    padding: '10px 20px', borderRadius: 999, cursor: 'pointer', fontSize: '.875rem', fontWeight: 500,
    border: on ? 'none' : '1.5px solid rgba(255,255,255,.2)',
    background: on ? 'var(--c-gold)' : 'rgba(255,255,255,.07)',
    color: on ? '#fff' : 'rgba(255,255,255,.85)', transition: 'all .15s ease',
  }}>{children}</button>
);

const DInput = (p) => (
  <input style={{
    width: '100%', padding: '13px 15px', borderRadius: 12, fontSize: '.9375rem',
    background: 'rgba(255,255,255,.08)', border: '1.5px solid rgba(255,255,255,.16)',
    color: '#fff', outline: 'none', fontFamily: 'inherit',
  }} {...p} />
);

const DSel = ({ children, ...p }) => (
  <select style={{
    width: '100%', padding: '13px 15px', borderRadius: 12, fontSize: '.9375rem',
    background: 'rgba(255,255,255,.08)', border: '1.5px solid rgba(255,255,255,.16)',
    color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
  }} {...p}>{children}</select>
);

const Lbl = ({ children }) => (
  <div style={{ fontSize: '.6875rem', fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', marginBottom: 8 }}>{children}</div>
);

const F = ({ children }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>;

const BtnGold = ({ children, style, ...p }) => (
  <button type="button" style={{ background: 'var(--c-gold)', border: 'none', color: '#fff', padding: '14px 28px', borderRadius: 999, fontSize: '1rem', fontWeight: 600, cursor: 'pointer', ...style }} {...p}>{children}</button>
);
const BtnGhost = ({ children, ...p }) => (
  <button type="button" style={{ background: 'transparent', border: '1.5px solid rgba(255,255,255,.2)', color: 'rgba(255,255,255,.75)', padding: '14px 24px', borderRadius: 999, fontSize: '1rem', fontWeight: 500, cursor: 'pointer' }} {...p}>{children}</button>
);

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [profile, setProfile] = useState({ name: '', country: 'United Kingdom', currency: 'GBP', age_range: '25–34', tracker_type: 'individual', earning_members: 1, dependents: 0, financial_confidence: 'beginner' });
  const [incomeType, setIncomeType] = useState('salaried');
  const [incomeVar, setIncomeVar] = useState('fixed');
  const [incomes, setIncomes] = useState([{ name: 'Take-home salary', amount: '', type: 'salary' }]);
  const [expenses, setExpenses] = useState(FIXED_DEFAULTS);
  const [savings, setSavings] = useState({ current: '', emergencyTarget: '', monthly: '', destinations: [] });
  const [assets, setAssets] = useState([]);
  const [assetValues, setAssetValues] = useState({});
  const [goals, setGoals] = useState([]);

  const sym = SYM[profile.currency] || profile.currency + ' ';
  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));
  const pct = Math.round((step / (TOTAL_STEPS - 1)) * 100);
  const canNext = step !== 1 || profile.name.trim().length > 0;

  const next = () => { setErr(''); setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1)); };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const finish = async () => {
    setBusy(true); setErr('');
    try {
      const uid = user.id;
      const { error: pe } = await supabase.from('user_profiles').upsert({ user_id: uid, ...profile, income_type: incomeType, income_variability: incomeVar, onboarding_complete: true });
      if (pe) throw pe;

      const incomeRows = incomes.filter((i) => Number(i.amount) > 0).map((i) => ({ user_id: uid, name: i.name, amount: Number(i.amount), type: i.type }));
      if (incomeRows.length) {
        const { data: srcRows } = await supabase.from('income_sources').insert(incomeRows).select();
        await supabase.from('income_records').insert((srcRows || []).map((r) => ({ user_id: uid, month, name: r.name, amount: r.amount, type: r.type, source_id: r.id })));
      }
      const expenseRows = expenses.filter((e) => Number(e.amount) > 0).map((e) => ({ user_id: uid, month, description: e.description, amount: Number(e.amount), type: 'fixed', recurring: true, category: e.description.toLowerCase().includes('rent') ? 'housing' : 'fixed' }));
      if (expenseRows.length) await supabase.from('expenses').insert(expenseRows);
      const allocRows = savings.destinations.map((d) => ({ user_id: uid, month, destination: d.toLowerCase().replace(/ /g, '_'), amount: savings.destinations.length ? Number(savings.monthly || 0) / savings.destinations.length : 0 }));
      if (allocRows.length) await supabase.from('savings_allocations').insert(allocRows);
      const hasEF = goals.some((g) => g.goal_type === 'Emergency fund');
      const allGoals = Number(savings.emergencyTarget) > 0 && !hasEF ? [{ goal_name: 'Emergency fund', goal_type: 'Emergency fund', target_amount: savings.emergencyTarget, current_amount: savings.current || 0, monthly_contribution: 0, target_date: '' }, ...goals] : goals;
      const goalRows = allGoals.filter((g) => g.goal_name && Number(g.target_amount) > 0).map((g) => ({ user_id: uid, goal_name: g.goal_name, goal_type: g.goal_type || 'custom', target_amount: Number(g.target_amount), current_amount: Number(g.current_amount || 0), target_date: g.target_date || null, monthly_contribution: Number(g.monthly_contribution || 0) }));
      if (goalRows.length) await supabase.from('goals').insert(goalRows);
      const brokerSel = assets.filter((a) => BROKER_TYPES.includes(a));
      if (brokerSel.length) await supabase.from('investment_snapshots').insert(brokerSel.map((a) => ({ user_id: uid, asset_type: a.toLowerCase().replace(/ /g, '_').replace('etfs', 'etf'), snapshot_date: new Date().toISOString().slice(0, 10), total_value: 0, currency: profile.currency, base_currency: profile.currency, converted_total: 0, fx_rate: 1, source: 'manual', notes: 'Placeholder — upload a screenshot to fill values.' })));
      const wealthSel = assets.map((a) => WEALTH_TYPES.find(([l]) => l === a)).filter(Boolean);
      if (wealthSel.length) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: created } = await supabase.from('assets').insert(wealthSel.map(([lName, cls, liq]) => ({ user_id: uid, name: lName, asset_class: cls, liquidity: liq, original_currency: profile.currency, original_value: Number(assetValues[lName] || 0), base_currency: profile.currency, converted_value: Number(assetValues[lName] || 0), fx_rate: 1, fx_date: today, valuation_date: today, valuation_source: 'manual estimate' }))).select();
        const valued = (created || []).filter((a) => Number(a.original_value) > 0);
        if (valued.length) await supabase.from('asset_valuations').insert(valued.map((a) => ({ asset_id: a.id, user_id: uid, original_currency: a.original_currency, original_value: a.original_value, base_currency: a.base_currency, converted_value: a.converted_value, fx_rate: 1, fx_date: today, valuation_date: today, source: 'manual estimate' })));
      }
      await refreshProfile();
      navigate('/app');
    } catch (e) { setErr(e.message || 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };

  const screens = [
    // 0 Welcome
    <div key="w">
      <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--c-gold)', marginBottom: 16 }}>AI MY MONEY · SETUP</div>
      <h1 style={{ fontSize: 'clamp(1.8rem,6vw,2.6rem)', fontWeight: 700, color: '#fff', letterSpacing: '-.025em', lineHeight: 1.12, marginBottom: 16 }}>Let's build your financial brain.</h1>
      <p style={{ color: 'rgba(255,255,255,.55)', fontSize: '.9375rem', lineHeight: 1.65, marginBottom: 36 }}>AI My Money works best when it knows your income, expenses, investments and goals. Takes about 3 minutes.</p>
      <BtnGold onClick={next}>Get started →</BtnGold>
    </div>,

    // 1 Profile
    <div key="p" style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 'clamp(1.5rem,5vw,2rem)', fontWeight: 700, color: '#fff', letterSpacing: '-.02em', marginBottom: 4 }}>Tell us about yourself.</h1>
      <F><Lbl>Your first name</Lbl><DInput value={profile.name} placeholder="Alex" autoFocus onChange={(e) => set('name', e.target.value)} /></F>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <F><Lbl>Country</Lbl><DInput value={profile.country} onChange={(e) => set('country', e.target.value)} /></F>
        <F><Lbl>Currency</Lbl><DSel value={profile.currency} onChange={(e) => set('currency', e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</DSel></F>
      </div>
      <F><Lbl>Age range</Lbl><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{['18–24', '25–34', '35–44', '45–54', '55+'].map((a) => <Pill key={a} on={profile.age_range === a} onClick={() => set('age_range', a)}>{a}</Pill>)}</div></F>
      <F><Lbl>Tracking for</Lbl><div style={{ display: 'flex', gap: 10 }}><Pill on={profile.tracker_type === 'individual'} onClick={() => set('tracker_type', 'individual')}>Just me</Pill><Pill on={profile.tracker_type === 'family'} onClick={() => { set('tracker_type', 'family'); set('earning_members', 2); }}>My family</Pill></div></F>
      <F><Lbl>Money confidence</Lbl><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{['Beginner', 'Intermediate', 'Advanced'].map((c) => <Pill key={c} on={profile.financial_confidence === c.toLowerCase()} onClick={() => set('financial_confidence', c.toLowerCase())}>{c}</Pill>)}</div></F>
    </div>,

    // 2 Income
    <div key="i" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 'clamp(1.5rem,5vw,2rem)', fontWeight: 700, color: '#fff', letterSpacing: '-.02em', marginBottom: 4 }}>Your monthly income.</h1>
      <F><Lbl>Employment type</Lbl><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{['Salaried', 'Self-employed', 'Freelancer', 'Business owner', 'Mixed'].map((t) => <Pill key={t} on={incomeType === t.toLowerCase().replace(' ', '-')} onClick={() => setIncomeType(t.toLowerCase().replace(' ', '-'))}>{t}</Pill>)}</div></F>
      {incomes.map((inc, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
          <F>{i === 0 && <Lbl>Source</Lbl>}<DInput value={inc.name} onChange={(e) => setIncomes(incomes.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></F>
          <F>{i === 0 && <Lbl>Amount ({sym})</Lbl>}<DInput type="number" min="0" placeholder="0" value={inc.amount} onChange={(e) => setIncomes(incomes.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} /></F>
        </div>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{['Second salary', 'Bonus', 'Rental income', 'Side income'].map((n) => <Pill key={n} on={false} onClick={() => setIncomes([...incomes, { name: n, amount: '', type: 'side' }])}>+ {n}</Pill>)}</div>
      <F><Lbl>Income stability</Lbl><div style={{ display: 'flex', gap: 10 }}><Pill on={incomeVar === 'fixed'} onClick={() => setIncomeVar('fixed')}>Fixed</Pill><Pill on={incomeVar === 'variable'} onClick={() => setIncomeVar('variable')}>Variable</Pill></div></F>
    </div>,

    // 3 Expenses
    <div key="e">
      <h1 style={{ fontSize: 'clamp(1.5rem,5vw,2rem)', fontWeight: 700, color: '#fff', letterSpacing: '-.02em', marginBottom: 8 }}>Fixed monthly costs.</h1>
      <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '.875rem', marginBottom: 16 }}>Fill what applies — leave the rest blank. Edit anytime.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '44vh', overflowY: 'auto', paddingRight: 4 }}>
        {expenses.map((ex, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
            <DInput value={ex.description} placeholder="Expense name" onChange={(e) => setExpenses(expenses.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
            <DInput type="number" min="0" placeholder="0" value={ex.amount} onChange={(e) => setExpenses(expenses.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
          </div>
        ))}
      </div>
      <Pill on={false} onClick={() => setExpenses([...expenses, { description: '', amount: '' }])} >+ Add row</Pill>
    </div>,

    // 4 Savings
    <div key="s" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 'clamp(1.5rem,5vw,2rem)', fontWeight: 700, color: '#fff', letterSpacing: '-.02em', marginBottom: 4 }}>Your savings.</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <F><Lbl>Total saved ({sym})</Lbl><DInput type="number" min="0" placeholder="0" value={savings.current} onChange={(e) => setSavings({ ...savings, current: e.target.value })} /></F>
        <F><Lbl>Emergency fund target ({sym})</Lbl><DInput type="number" min="0" placeholder="e.g. 15000" value={savings.emergencyTarget} onChange={(e) => setSavings({ ...savings, emergencyTarget: e.target.value })} /></F>
      </div>
      <F><Lbl>Monthly savings ({sym})</Lbl><DInput type="number" min="0" placeholder="0" value={savings.monthly} onChange={(e) => setSavings({ ...savings, monthly: e.target.value })} /></F>
      <F><Lbl>Where savings go</Lbl>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {['Bank account', 'Emergency fund', 'Stocks', 'Mutual funds', 'Crypto', 'Property', 'Gold', 'Other'].map((d) => (
            <Pill key={d} on={savings.destinations.includes(d)} onClick={() => setSavings({ ...savings, destinations: savings.destinations.includes(d) ? savings.destinations.filter((x) => x !== d) : [...savings.destinations, d] })}>{d}</Pill>
          ))}
        </div>
      </F>
    </div>,

    // 5 Assets
    <div key="a">
      <h1 style={{ fontSize: 'clamp(1.5rem,5vw,2rem)', fontWeight: 700, color: '#fff', letterSpacing: '-.02em', marginBottom: 8 }}>What do you own?</h1>
      <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '.875rem', marginBottom: 20 }}>Select all. Broker assets get screenshot placeholders. Other wealth is tracked directly.</p>
      <Lbl>Investments & broker accounts</Lbl>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {BROKER_TYPES.map((a) => <Pill key={a} on={assets.includes(a)} onClick={() => setAssets(assets.includes(a) ? assets.filter((x) => x !== a) : [...assets, a])}>{a}</Pill>)}
      </div>
      <Lbl>Property, gold & other wealth</Lbl>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {WEALTH_TYPES.map(([label]) => <Pill key={label} on={assets.includes(label)} onClick={() => setAssets(assets.includes(label) ? assets.filter((x) => x !== label) : [...assets, label])}>{label}</Pill>)}
      </div>
      {assets.some((a) => WEALTH_TYPES.some(([l]) => l === a)) && (
        <div style={{ marginTop: 20 }}>
          <Lbl>Estimated values — optional, rough is fine</Lbl>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginTop: 10 }}>
            {assets.filter((a) => WEALTH_TYPES.some(([l]) => l === a)).map((a) => (
              <F key={a}><Lbl>{a} ({sym})</Lbl><DInput type="number" min="0" placeholder="optional" value={assetValues[a] || ''} onChange={(e) => setAssetValues({ ...assetValues, [a]: e.target.value })} /></F>
            ))}
          </div>
        </div>
      )}
    </div>,

    // 6 Goals
    <div key="g">
      <h1 style={{ fontSize: 'clamp(1.5rem,5vw,2rem)', fontWeight: 700, color: '#fff', letterSpacing: '-.02em', marginBottom: 8 }}>What are you saving for?</h1>
      <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '.875rem', marginBottom: 20 }}>Pick goals — details can be refined anytime.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {GOAL_TYPES.map((g) => (
          <Pill key={g} on={goals.some((x) => x.goal_type === g)}
            onClick={() => setGoals(goals.some((x) => x.goal_type === g) ? goals.filter((x) => x.goal_type !== g) : [...goals, { goal_type: g, goal_name: g, target_amount: '', current_amount: '', target_date: '', monthly_contribution: '' }])}>
            {g}
          </Pill>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '36vh', overflowY: 'auto', paddingRight: 4 }}>
        {goals.map((g, i) => (
          <div key={g.goal_type} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: 16, background: 'rgba(255,255,255,.04)' }}>
            <div style={{ fontWeight: 600, color: '#fff', marginBottom: 12 }}>{g.goal_name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['target_amount', `Target (${sym})`, 'number'], ['current_amount', `Saved so far (${sym})`, 'number'], ['monthly_contribution', `Monthly (${sym})`, 'number'], ['target_date', 'Target date', 'date']].map(([k, label, type]) => (
                <F key={k}><Lbl>{label}</Lbl><DInput type={type} min="0" value={g[k]} onChange={(e) => setGoals(goals.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))} /></F>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>,

    // 7 Done
    <div key="d" style={{ textAlign: 'center', paddingTop: 8 }}>
      <div style={{ fontSize: '3.5rem', marginBottom: 20 }}>✦</div>
      <h1 style={{ fontSize: 'clamp(1.6rem,5vw,2.2rem)', fontWeight: 700, color: '#fff', letterSpacing: '-.025em', marginBottom: 14 }}>
        {profile.name ? `${profile.name}, you're all set.` : "You're all set."}
      </h1>
      <p style={{ color: 'rgba(255,255,255,.55)', fontSize: '.9375rem', lineHeight: 1.65, maxWidth: 400, margin: '0 auto 28px' }}>
        Your financial profile is ready. Income, expenses, goals and assets are all saved.
      </p>
      {err && <div style={{ background: 'rgba(192,57,43,.2)', border: '1px solid rgba(192,57,43,.4)', color: '#ff8a80', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: '.875rem' }}>{err}</div>}
      <BtnGold onClick={finish} disabled={busy} style={{ minWidth: 200, opacity: busy ? .6 : 1 }}>
        {busy ? 'Building your dashboard…' : 'Open my dashboard →'}
      </BtnGold>
    </div>,
  ];

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(160deg,#1C1C1E 0%,#2C2C2E 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif" }}>
      <style>{`@keyframes onbFadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}`}</style>
      {/* Progress bar */}
      <div style={{ width: '100%', maxWidth: 560, marginBottom: 36 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: '.7rem', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)' }}>
            {step > 0 && step < TOTAL_STEPS - 1 ? `Step ${step} of ${TOTAL_STEPS - 2}` : '\u00a0'}
          </div>
          {step > 0 && <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.3)' }}>{pct}%</div>}
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,.1)', borderRadius: 99 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--c-gold)', borderRadius: 99, transition: 'width .4s cubic-bezier(.4,0,.2,1)' }} />
        </div>
      </div>

      {/* Step */}
      <div style={{ width: '100%', maxWidth: 560, animation: 'onbFadeUp .35s cubic-bezier(.4,0,.2,1) both' }} key={step}>
        {screens[step]}
      </div>

      {/* Nav */}
      {step > 0 && step < TOTAL_STEPS - 1 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 32, width: '100%', maxWidth: 560 }}>
          <BtnGhost onClick={back}>← Back</BtnGhost>
          <BtnGold onClick={next} style={{ flex: 1, opacity: canNext ? 1 : 0.5 }} disabled={!canNext}>
            Continue →
          </BtnGold>
        </div>
      )}
    </div>
  );
}
