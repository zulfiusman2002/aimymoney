import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="onb" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="eyebrow" style={{ color: 'var(--brass)', marginBottom: 18 }}>Private wealth, made personal</div>
        <h1 style={{ fontSize: '3.4rem' }}>AI <em style={{ color: 'var(--brass)' }}>My</em> Money</h1>
        <p className="sub" style={{ fontSize: '1rem', maxWidth: 460, margin: '18px auto 0' }}>
          Your income, expenses, investments and goals — read, analysed and
          explained by AI. Update your portfolio with a screenshot. Learn the
          habits that quietly build wealth.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 38, flexWrap: 'wrap' }}>
          <Link to="/signup"><button className="btn brass">Create your account</button></Link>
          <Link to="/login"><button className="btn ghost" style={{ color: 'var(--paper)', borderColor: 'rgba(246,242,234,.3)' }}>Sign in</button></Link>
        </div>
        <p style={{ marginTop: 48, fontSize: '.62rem', letterSpacing: '.1em', color: 'rgba(246,242,234,.35)' }}>
          EDUCATIONAL GUIDANCE · NOT REGULATED FINANCIAL ADVICE · YOUR DATA STAYS YOURS
        </p>
      </div>
    </div>
  );
}
