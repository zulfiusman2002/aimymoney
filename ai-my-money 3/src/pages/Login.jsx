import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setErr(error.message); else navigate('/app');
  };

  return (
    <div className="onb">
      <div className="panel" style={{ maxWidth: 400 }}>
        <h1 style={{ fontSize: '2rem' }}>Welcome back</h1>
        <p className="sub">Sign in to your financial command centre.</p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 18, marginTop: 30 }}>
          <div className="field"><label>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
          <div className="field"><label>Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
          {err && <div style={{ color: '#e2a08c', fontSize: '.78rem' }}>{err}</div>}
          <button className="btn brass" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="sub" style={{ marginTop: 22, fontSize: '.78rem' }}>
          New here? <Link to="/signup" style={{ color: 'var(--brass)' }}>Create an account</Link>
        </p>
      </div>
    </div>
  );
}
