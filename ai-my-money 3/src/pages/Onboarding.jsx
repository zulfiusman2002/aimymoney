import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const STEPS = ['Welcome', 'Profile', 'Income', 'Expenses', 'Savings', 'Investments', 'Goals', 'Done'];
const month = new Date().toISOString().slice(0, 7);

const Chip = ({ on, children, ...p }) => (
  <button type="button" className={'chip' + (on ? ' on' : '')} {...p}>{children}</button>
);

const FIXED_DEFAULTS = ['Rent / mortgage', 'Utilities', 'Groceries', 'Insurance', 'Car', 'Fuel / transport', 'Loan EMIs', 'Subscriptions', 'Family support', 'Childcare'];
const BROKER_TYPES = ['Indian stocks', 'UK stocks', 'US stocks', 'Mutual funds', 'ETFs', 'Crypto', 'Bonds'];
const WEALTH_TYPES = [
  ['Property', 'property', 'illiquid'], ['Land', 'land', 'illiquid'], ['Gold', 'gold', 'liquid'],
  ['Pension', 'pension', 'illiquid'], ['Cash savings', 'cash', 'liquid'], ['Vehicle', 'vehicle', 'semi_liquid'], ['Other', 'other', 'semi_liquid'],
];
const ASSET_TYPES = [...BROKER_TYPES, ...WEALTH_TYPES.map(([l]) => l)];
const GOAL_TYPES = ['Emergency fund', 'House deposit', 'Debt freedom', 'Retirement', 'Child education', 'Travel', 'Business', 'Wealth target'];

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // -------- state --------
  const [profile, setProfile] = useState({
    name: '', country: 'United Kingdom', currency: 'GBP', age_range: '',
    tracker_type: 'individual', earning_members: 1, dependents: 0,
    financial_confidence: 'beginner',
  });
  const [incomeType, setIncomeType] = useState('salaried');
  const [incomeVar, setIncomeVar] = useState('fixed');
  const [incomes, setIncomes] = useState([{ name: 'Take-home salary', amount: '', type: 'salary' }]);
  const [expenses, setExpenses] = useState(FIXED_DEFAULTS.map((n) => ({ description: n, amount: '' })));
  const [savings, setSavings] = useState({ current: '', emergencyTarget: '', monthly: '', destinations: [] });
  const [assets, setAssets] = useState([]);
  const [assetValues, setAssetValues] = useState({});   // wealth label -> estimated value
  const [goals, setGoals] = useState([]);

  const sym = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }[profile.currency] || '';
  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));
  const next = () => { setErr(''); setStep((s) => s + 1); };
  const back = () => setStep((s) => Math.max(0, s - 1));

  // -------- save everything --------
  const finish = async () => {
    setBusy(true); setErr('');
    try {
      const uid = user.id;
      const { error: pe } = await supabase.from('user_profiles').upsert({
        user_id: uid, ...profile, income_type: incomeType,
        income_variability: incomeVar, onboarding_complete: true,
      });
      if (pe) throw pe;

      const incomeRows = incomes.filter((i) => Number(i.amount) > 0)
        .map((i) => ({ user_id: uid, name: i.name, amount: Number(i.amount), type: i.type }));
      if (incomeRows.length) {
        const { data: srcRows } = await supabase.from('income_sources').insert(incomeRows).select();
        await supabase.from('income_records').insert((srcRows || []).map((r) => ({
          user_id: uid, month, name: r.name, amount: r.amount, type: r.type, source_id: r.id,
        })));
      }

      const expenseRows = expenses.filter((e) => Number(e.amount) > 0)
        .map((e) => ({ user_id: uid, month, description: e.description, amount: Number(e.amount), type: 'fixed', recurring: true, category: e.description.toLowerCase().includes('rent') ? 'housing' : 'fixed' }));
      if (expenseRows.length) await supabase.from('expenses').insert(expenseRows);

      const allocRows = savings.destinations.map((d) => ({
        user_id: uid, month, destination: d.toLowerCase().replace(/ /g, '_'),
        amount: savings.destinations.length ? Number(savings.monthly || 0) / savings.destinations.length : 0,
      }));
      if (allocRows.length) await supabase.from('savings_allocations').insert(allocRows);

      // Build the final goal list immutably; never duplicate an emergency fund goal.
      const hasEmergencyGoal = goals.some((g) => g.goal_type === 'Emergency fund');
      const allGoals = Number(savings.emergencyTarget) > 0 && !hasEmergencyGoal
        ? [{ goal_name: 'Emergency fund', goal_type: 'Emergency fund',
            target_amount: savings.emergencyTarget, current_amount: savings.current || 0,
            monthly_contribution: 0, target_date: '' }, ...goals]
        : goals;
      const goalRows = allGoals.filter((g) => g.goal_name && Number(g.target_amount) > 0)
        .map((g) => ({ user_id: uid, goal_name: g.goal_name, goal_type: g.goal_type || 'custom',
          target_amount: Number(g.target_amount), current_amount: Number(g.current_amount || 0),
          target_date: g.target_date || null, monthly_contribution: Number(g.monthly_contribution || 0) }));
      if (goalRows.length) await supabase.from('goals').insert(goalRows);

      // Broker-style selections become investment placeholders (filled via screenshots);
      // everything else becomes a real row in the assets table.
      const brokerSel = assets.filter((a) => BROKER_TYPES.includes(a));
      if (brokerSel.length) {
        await supabase.from('investment_snapshots').insert(brokerSel.map((a) => ({
          user_id: uid, asset_type: a.toLowerCase().replace(/ /g, '_').replace('etfs', 'etf'),
          snapshot_date: new Date().toISOString().slice(0, 10),
          total_value: 0, currency: profile.currency, base_currency: profile.currency,
          converted_total: 0, fx_rate: 1, source: 'manual',
          notes: 'Placeholder from onboarding — upload a screenshot to fill in values.',
        })));
      }
      const wealthSel = assets.map((a) => WEALTH_TYPES.find(([l]) => l === a)).filter(Boolean);
      if (wealthSel.length) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: created } = await supabase.from('assets').insert(wealthSel.map(([labelName, cls, liq]) => ({
          user_id: uid, name: labelName === 'Cash savings' ? 'Cash savings' : labelName,
          asset_class: cls, liquidity: liq,
          original_currency: profile.currency, original_value: Number(assetValues[labelName] || 0),
          base_currency: profile.currency, converted_value: Number(assetValues[labelName] || 0),
          fx_rate: 1, fx_date: today, valuation_date: today,
          valuation_source: 'manual estimate',
          notes: Number(assetValues[labelName] || 0) > 0 ? null : 'Added during onboarding — set its value in Investments → Other Wealth.',
        }))).select();
        const valued = (created || []).filter((a) => Number(a.original_value) > 0);
        if (valued.length) {
          await supabase.from('asset_valuations').insert(valued.map((a) => ({
            asset_id: a.id, user_id: uid,
            original_currency: a.original_currency, original_value: a.original_value,
            base_currency: a.base_currency, converted_value: a.converted_value,
            fx_rate: 1, fx_date: today, valuation_date: today, source: 'manual estimate',
          })));
        }
      }

      await refreshProfile();
      navigate('/app');
    } catch (e) {
      setErr(e.message || 'Something went wrong saving your profile.');
    } finally { setBusy(false); }
  };

  // -------- step renderers --------
  const steps = [
    // 0 · Welcome
    <div key="w" className="panel rise" style={{ textAlign: 'center' }}>
      <div className="eyebrow" style={{ color: 'var(--brass)', marginBottom: 16 }}>Setup · about 3 minutes</div>
      <h1>Let's build your financial brain.</h1>
      <p className="sub" style={{ maxWidth: 420, margin: '16px auto 0' }}>
        AI My Money works best when it understands your income, expenses,
        investments and goals. Everything is private to your account.
      </p>
      <button className="btn brass" style={{ marginTop: 36 }} onClick={next}>Start setup</button>
    </div>,

    // 1 · Profile
    <div key="p" className="panel rise">
      <h1 style={{ fontSize: '2rem' }}>About you</h1>
      <div style={{ display: 'grid', gap: 20, marginTop: 28 }}>
        <div className="field"><label>Your name</label>
          <input value={profile.name} onChange={(e) => set('name', e.target.value)} placeholder="First name is fine" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="field"><label>Country</label>
            <input value={profile.country} onChange={(e) => set('country', e.target.value)} /></div>
          <div className="field"><label>Currency</label>
            <select value={profile.currency} onChange={(e) => set('currency', e.target.value)}>
              {['GBP', 'USD', 'EUR', 'INR', 'AED', 'AUD', 'CAD'].map((c) => <option key={c}>{c}</option>)}
            </select></div>
        </div>
        <div className="field"><label>Age range</label>
          <div className="chips">{['18–24', '25–34', '35–44', '45–54', '55+'].map((a) =>
            <Chip key={a} on={profile.age_range === a} onClick={() => set('age_range', a)}>{a}</Chip>)}</div></div>
        <div className="field"><label>Tracking for</label>
          <div className="chips">
            <Chip on={profile.tracker_type === 'individual'} onClick={() => set('tracker_type', 'individual')}>Just me</Chip>
            <Chip on={profile.tracker_type === 'family'} onClick={() => { set('tracker_type', 'family'); set('earning_members', 2); }}>My family</Chip>
          </div></div>
        {profile.tracker_type === 'family' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field"><label>Earning members</label>
              <input type="number" min="1" value={profile.earning_members} onChange={(e) => set('earning_members', Number(e.target.value))} /></div>
            <div className="field"><label>Dependents</label>
              <input type="number" min="0" value={profile.dependents} onChange={(e) => set('dependents', Number(e.target.value))} /></div>
          </div>)}
        <div className="field"><label>How confident are you with money?</label>
          <div className="chips">{['beginner', 'intermediate', 'advanced'].map((c) =>
            <Chip key={c} on={profile.financial_confidence === c} onClick={() => set('financial_confidence', c)}>{c}</Chip>)}</div></div>
      </div>
    </div>,

    // 2 · Income
    <div key="i" className="panel rise">
      <h1 style={{ fontSize: '2rem' }}>Your income</h1>
      <p className="sub">Monthly take-home amounts in {profile.currency}.</p>
      <div style={{ display: 'grid', gap: 20, marginTop: 26 }}>
        <div className="field"><label>You are</label>
          <div className="chips">{['salaried', 'self-employed', 'business owner', 'freelancer', 'mixed'].map((t) =>
            <Chip key={t} on={incomeType === t} onClick={() => setIncomeType(t)}>{t}</Chip>)}</div></div>
        {incomes.map((inc, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 12 }}>
            <div className="field"><label>{i === 0 ? 'Source' : ''}</label>
              <input value={inc.name} onChange={(e) => setIncomes(incomes.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></div>
            <div className="field"><label>{i === 0 ? `Amount (${sym})` : ''}</label>
              <input type="number" min="0" value={inc.amount} placeholder="0"
                onChange={(e) => setIncomes(incomes.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} /></div>
          </div>))}
        <div className="chips">
          {['Second salary', 'Locum / side income', 'Bonus (monthly avg)', 'Rental income'].map((n) =>
            <Chip key={n} on={false} onClick={() => setIncomes([...incomes, { name: n, amount: '', type: 'side' }])}>+ {n}</Chip>)}
        </div>
        <div className="field"><label>Is your income…</label>
          <div className="chips">
            <Chip on={incomeVar === 'fixed'} onClick={() => setIncomeVar('fixed')}>Fixed every month</Chip>
            <Chip on={incomeVar === 'variable'} onClick={() => setIncomeVar('variable')}>Variable</Chip>
          </div></div>
      </div>
    </div>,

    // 3 · Fixed expenses
    <div key="e" className="panel rise">
      <h1 style={{ fontSize: '2rem' }}>Fixed monthly costs</h1>
      <p className="sub">Fill what applies — leave the rest at 0. You can edit everything later.</p>
      <div style={{ display: 'grid', gap: 10, marginTop: 26, maxHeight: '46vh', overflowY: 'auto', paddingRight: 6 }}>
        {expenses.map((ex, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, alignItems: 'center' }}>
            <input className="field" style={{ background: 'rgba(246,242,234,.06)', border: '1px solid rgba(246,242,234,.18)', color: 'var(--paper)', padding: '11px 14px', borderRadius: 10, fontFamily: 'var(--font-mono)' }}
              value={ex.description}
              onChange={(e) => setExpenses(expenses.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
            <input type="number" min="0" placeholder={sym + '0'}
              style={{ background: 'rgba(246,242,234,.06)', border: '1px solid rgba(246,242,234,.18)', color: 'var(--paper)', padding: '11px 14px', borderRadius: 10, fontFamily: 'var(--font-mono)' }}
              value={ex.amount}
              onChange={(e) => setExpenses(expenses.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
          </div>))}
      </div>
      <button type="button" className="chip" style={{ marginTop: 14 }}
        onClick={() => setExpenses([...expenses, { description: '', amount: '' }])}>+ Add another</button>
    </div>,

    // 4 · Savings
    <div key="s" className="panel rise">
      <h1 style={{ fontSize: '2rem' }}>Savings</h1>
      <div style={{ display: 'grid', gap: 20, marginTop: 26 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="field"><label>Current savings ({sym})</label>
            <input type="number" min="0" value={savings.current} onChange={(e) => setSavings({ ...savings, current: e.target.value })} /></div>
          <div className="field"><label>Emergency fund target ({sym})</label>
            <input type="number" min="0" value={savings.emergencyTarget} onChange={(e) => setSavings({ ...savings, emergencyTarget: e.target.value })} /></div>
        </div>
        <div className="field"><label>How much do you save monthly? ({sym})</label>
          <input type="number" min="0" value={savings.monthly} onChange={(e) => setSavings({ ...savings, monthly: e.target.value })} /></div>
        <div className="field"><label>Where do savings currently go?</label>
          <div className="chips">{['Bank account', 'Emergency fund', 'Stocks', 'Mutual funds', 'Crypto', 'Property', 'Gold', 'Other'].map((d) =>
            <Chip key={d} on={savings.destinations.includes(d)}
              onClick={() => setSavings({ ...savings, destinations: savings.destinations.includes(d) ? savings.destinations.filter((x) => x !== d) : [...savings.destinations, d] })}>{d}</Chip>)}</div></div>
      </div>
    </div>,

    // 5 · Investments
    <div key="inv" className="panel rise">
      <h1 style={{ fontSize: '2rem' }}>What do you own?</h1>
      <p className="sub">Select everything that applies. You'll add values later —
        manually or by uploading screenshots for AI extraction.</p>
      <div className="chips" style={{ marginTop: 26 }}>
        {ASSET_TYPES.map((a) =>
          <Chip key={a} on={assets.includes(a)}
            onClick={() => setAssets(assets.includes(a) ? assets.filter((x) => x !== a) : [...assets, a])}>{a}</Chip>)}
      </div>
      {assets.some((a) => WEALTH_TYPES.some(([l]) => l === a)) && (
        <div style={{ marginTop: 22 }}>
          <p className="sub" style={{ fontSize: '.78rem' }}>Rough estimates are fine — you can refine them anytime.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            {assets.filter((a) => WEALTH_TYPES.some(([l]) => l === a)).map((a) => (
              <div className="field" key={a}><label>{a} — estimated value ({sym})</label>
                <input type="number" min="0" placeholder="optional" value={assetValues[a] || ''}
                  onChange={(e) => setAssetValues({ ...assetValues, [a]: e.target.value })} /></div>
            ))}
          </div>
        </div>
      )}
    </div>,

    // 6 · Goals
    <div key="g" className="panel rise">
      <h1 style={{ fontSize: '2rem' }}>Your goals</h1>
      <p className="sub">Pick goals to start with — details can be refined anytime.</p>
      <div className="chips" style={{ marginTop: 24 }}>
        {GOAL_TYPES.map((g) =>
          <Chip key={g} on={goals.some((x) => x.goal_type === g)}
            onClick={() => setGoals(goals.some((x) => x.goal_type === g)
              ? goals.filter((x) => x.goal_type !== g)
              : [...goals, { goal_type: g, goal_name: g, target_amount: '', current_amount: '', target_date: '', monthly_contribution: '' }])}>{g}</Chip>)}
      </div>
      <div style={{ display: 'grid', gap: 16, marginTop: 22, maxHeight: '38vh', overflowY: 'auto', paddingRight: 6 }}>
        {goals.map((g, i) => (
          <div key={g.goal_type} style={{ border: '1px solid rgba(246,242,234,.15)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: 10 }}>{g.goal_name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['target_amount', `Target (${sym})`, 'number'], ['current_amount', `Saved so far (${sym})`, 'number'],
                ['monthly_contribution', `Monthly (${sym})`, 'number'], ['target_date', 'Target date', 'date']].map(([k, label, type]) => (
                <div className="field" key={k}><label>{label}</label>
                  <input type={type} min="0" value={g[k]}
                    onChange={(e) => setGoals(goals.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))} /></div>))}
            </div>
          </div>))}
      </div>
    </div>,

    // 7 · Done
    <div key="d" className="panel rise" style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', color: 'var(--brass)', lineHeight: 1 }}>✦</div>
      <h1 style={{ marginTop: 16 }}>Your financial profile is ready.</h1>
      <p className="sub" style={{ maxWidth: 400, margin: '14px auto 0' }}>
        {profile.name ? `${profile.name}, your` : 'Your'} dashboard is being prepared —
        income, fixed costs, goals and asset classes are all in place.
      </p>
      {err && <div style={{ color: '#e2a08c', fontSize: '.78rem', marginTop: 16 }}>{err}</div>}
      <button className="btn brass" style={{ marginTop: 34 }} onClick={finish} disabled={busy}>
        {busy ? 'Building your dashboard…' : 'Open my dashboard'}
      </button>
    </div>,
  ];

  return (
    <div className="onb">
      <div className="onb-progress">
        {STEPS.map((s, i) => <span key={s} className={i <= step ? 'done' : ''} title={s} />)}
      </div>
      {steps[step]}
      {step > 0 && step < STEPS.length - 1 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 36 }}>
          <button className="btn ghost" style={{ color: 'var(--paper)', borderColor: 'rgba(246,242,234,.3)' }} onClick={back}>Back</button>
          <button className="btn brass" onClick={next}
            disabled={step === 1 && !profile.name}>Continue</button>
        </div>
      )}
    </div>
  );
}
