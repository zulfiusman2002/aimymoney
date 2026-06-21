import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setErr(error.message); else nav('/app');
  };

  return (
    <div className="auth-shell">
      {/* Left panel */}
      <div className="auth-left">
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#fff', marginBottom: 48 }}>
            AI <span style={{ color: '#B8860B' }}>My</span> Money
          </div>
          <h2 style={{ fontSize: 'clamp(1.6rem,4vw,2.2rem)', fontWeight: 700, color: '#fff', letterSpacing: '-.025em', lineHeight: 1.15, marginBottom: 16 }}>
            Your financial<br />command centre.
          </h2>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '.9375rem', lineHeight: 1.65 }}>
            Every pound accounted for. Every goal tracked.<br />AI working from your real numbers.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {['Budget · Investments · Goals', 'Net Worth · Projector · AI Advisor', 'Learn — finance that sticks'].map((t) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(184,134,11,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#B8860B' }} />
              </div>
              <span style={{ color: 'rgba(255,255,255,.65)', fontSize: '.9rem' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="auth-right">
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--c-ink)', letterSpacing: '-.025em', marginBottom: 8 }}>Welcome back</h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '.9rem' }}>Sign in to continue to your dashboard.</p>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="field">
            <label className="field-label">Email address</label>
            <input className="field-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input className="field-input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {err && <div style={{ background: 'var(--c-red-bg)', color: 'var(--c-red)', fontSize: '.8rem', padding: '10px 14px', borderRadius: 'var(--r-md)', fontWeight: 500 }}>{err}</div>}
          <button className="btn btn-primary w-full" style={{ marginTop: 4 }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{ marginTop: 28, textAlign: 'center', fontSize: '.875rem', color: 'var(--c-muted)' }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: 'var(--c-gold)', fontWeight: 600 }}>Create one free</Link>
        </p>
      </div>
    </div>
  );
}
