import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    navigate('/onboarding');
  };

  return (
    <div className="onb">
      <div className="panel" style={{ maxWidth: 400 }}>
        <h1 style={{ fontSize: '2rem' }}>Create your account</h1>
        <p className="sub">Two minutes of setup. A lifetime of clarity.</p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 18, marginTop: 30 }}>
          <div className="field"><label>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
          <div className="field"><label>Password</label>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password" placeholder="At least 8 characters" /></div>
          {err && <div style={{ color: '#e2a08c', fontSize: '.78rem' }}>{err}</div>}
          <button className="btn brass" disabled={busy}>{busy ? 'Creating…' : 'Start setup'}</button>
        </form>
        <p className="sub" style={{ marginTop: 22, fontSize: '.78rem' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--brass)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
