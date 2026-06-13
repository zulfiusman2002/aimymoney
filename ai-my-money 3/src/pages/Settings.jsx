import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const CURRENCIES = ['GBP', 'USD', 'EUR', 'INR', 'AED', 'AUD', 'CAD'];

export default function Settings() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: profile?.name || '',
    country: profile?.country || '',
    currency: profile?.currency || 'GBP',
    tracker_type: profile?.tracker_type || 'individual',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const currencyChanged = form.currency !== (profile?.currency || 'GBP');

  const save = async () => {
    setBusy(true); setErr(''); setSaved(false);
    try {
      const { error } = await supabase.from('user_profiles')
        .update({ name: form.name, country: form.country, currency: form.currency, tracker_type: form.tracker_type })
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <div className="rise" style={{ marginBottom: 24 }}>
        <div className="eyebrow">Your account</div>
        <h1 style={{ fontSize: '2.3rem', marginTop: 6 }}>Settings</h1>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 14 }}>Profile</div>
        <div className="grid g2">
          <div className="field"><label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Country</label>
            <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          <div className="field"><label>Base currency</label>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div className="field"><label>Tracking for</label>
            <select value={form.tracker_type} onChange={(e) => setForm({ ...form, tracker_type: e.target.value })}>
              <option value="individual">Just me</option>
              <option value="family">My family</option>
            </select></div>
        </div>
        {currencyChanged && (
          <p style={{ marginTop: 12, fontSize: '.72rem', color: 'var(--warn)' }}>
            ⚠ Changing the base currency relabels amounts — it does not re-convert stored values.
            Update your assets' FX rates afterwards so converted values stay accurate.
          </p>
        )}
        {err && <p style={{ marginTop: 10, fontSize: '.76rem', color: 'var(--risk)' }}>{err}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button className="btn brass" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
          {saved && <span className="badge good rise">saved ✦</span>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Session</div>
        <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 12 }}>Signed in as {user?.email}</p>
        <button className="btn" onClick={async () => { await signOut(); navigate('/'); }}>Sign out</button>
      </div>

      <div className="card" style={{ marginTop: 18, borderColor: '#d8c4bb' }}>
        <div className="eyebrow" style={{ marginBottom: 10, color: 'var(--risk)' }}>Danger zone</div>
        <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
          Account deletion (all financial data, screenshots and learning progress) is coming soon.
          Until then, contact support to delete your account.
        </p>
        <button className="btn ghost" disabled style={{ marginTop: 12, borderColor: 'var(--risk)', color: 'var(--risk)' }}>
          Delete account — coming soon
        </button>
      </div>
    </div>
  );
}
