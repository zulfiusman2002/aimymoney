import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    nav('/onboarding');
  };

  return (
    <div className="auth-shell">
      <div className="auth-left">
        <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#fff', marginBottom: 48 }}>
          AI <span style={{ color: '#B8860B' }}>My</span> Money
        </div>
        <h2 style={{ fontSize: 'clamp(1.6rem,4vw,2.2rem)', fontWeight: 700, color: '#fff', letterSpacing: '-.025em', lineHeight: 1.15, marginBottom: 20 }}>
          Start understanding<br />your money.
        </h2>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '.9375rem', lineHeight: 1.65, marginBottom: 36 }}>
          Takes 3 minutes to set up. No card required.<br />Your data is private and encrypted.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[['📊','Track income & expenses in one place'], ['📸','Update investments via screenshot'], ['🧠','AI briefing from your real numbers'], ['🎯','See if every goal is on track']].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: '1.2rem', width: 32, textAlign: 'center' }}>{icon}</div>
              <span style={{ color: 'rgba(255,255,255,.65)', fontSize: '.9rem' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="auth-right">
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--c-ink)', letterSpacing: '-.025em', marginBottom: 8 }}>Create your account</h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '.9rem' }}>Free to start. Takes about 3 minutes.</p>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="field">
            <label className="field-label">Email address</label>
            <input className="field-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input className="field-input" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          {err && <div style={{ background: 'var(--c-red-bg)', color: 'var(--c-red)', fontSize: '.8rem', padding: '10px 14px', borderRadius: 'var(--r-md)', fontWeight: 500 }}>{err}</div>}
          <button className="btn btn-gold w-full" style={{ marginTop: 4 }} disabled={busy}>
            {busy ? 'Creating account…' : 'Create account →'}
          </button>
        </form>
        <p style={{ marginTop: 16, fontSize: '.75rem', color: 'var(--c-muted)', textAlign: 'center', lineHeight: 1.6 }}>
          By creating an account you agree to use this for personal educational guidance only. Not regulated financial advice.
        </p>
        <p style={{ marginTop: 20, textAlign: 'center', fontSize: '.875rem', color: 'var(--c-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--c-gold)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
