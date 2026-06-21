import { Link } from 'react-router-dom';

const Feature = ({ icon, title, body }) => (
  <div style={{ display: 'flex', gap: 16 }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(184,134,11,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{icon}</div>
    <div><div style={{ fontWeight: 600, color: '#fff', marginBottom: 4, fontSize: '.9375rem' }}>{title}</div>
      <div style={{ fontSize: '.875rem', color: 'rgba(255,255,255,.55)', lineHeight: 1.6 }}>{body}</div></div>
  </div>
);

export default function Landing() {
  return (
    <div style={{ minHeight: '100dvh', background: '#1C1C1E', color: '#fff', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}>
      {/* Nav */}
      <nav style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', borderBottom: '1px solid rgba(255,255,255,.08)', position: 'sticky', top: 0, background: 'rgba(28,28,30,.9)', backdropFilter: 'blur(20px)', zIndex: 50 }}>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>AI <span style={{ color: '#B8860B' }}>My</span> Money</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link to="/login"><button style={{ background: 'transparent', border: '1.5px solid rgba(255,255,255,.2)', color: 'rgba(255,255,255,.85)', padding: '8px 20px', borderRadius: 999, fontSize: '.875rem', fontWeight: 500, cursor: 'pointer' }}>Sign in</button></Link>
          <Link to="/signup"><button style={{ background: '#B8860B', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 999, fontSize: '.875rem', fontWeight: 600, cursor: 'pointer' }}>Get started</button></Link>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 32px 64px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(184,134,11,.12)', border: '1px solid rgba(184,134,11,.25)', borderRadius: 999, padding: '6px 16px', fontSize: '.8rem', fontWeight: 500, color: '#B8860B', marginBottom: 28, letterSpacing: '.04em' }}>
          ✦ PRIVATE WEALTH · MADE PERSONAL
        </div>
        <h1 style={{ fontSize: 'clamp(2.4rem, 6vw, 4rem)', fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.08, color: '#fff', marginBottom: 24 }}>
          Your money,<br />understood by AI.
        </h1>
        <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', color: 'rgba(255,255,255,.55)', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.65 }}>
          Track income, expenses, investments and goals. Upload a portfolio screenshot — AI extracts the data. Get daily briefings on your actual financial situation.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/signup"><button style={{ background: '#B8860B', color: '#fff', border: 'none', padding: '15px 32px', borderRadius: 999, fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>Start for free →</button></Link>
          <Link to="/login"><button style={{ background: 'transparent', color: 'rgba(255,255,255,.75)', border: '1.5px solid rgba(255,255,255,.2)', padding: '15px 32px', borderRadius: 999, fontSize: '1rem', fontWeight: 500, cursor: 'pointer' }}>Sign in</button></Link>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', borderBottom: '1px solid rgba(255,255,255,.08)', padding: '28px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'center', gap: 64, flexWrap: 'wrap' }}>
          {[['Screenshot to data', 'Upload any broker screenshot'], ['AI analysis', 'On your real numbers'], ['8 tabs', 'Budget · Goals · Net Worth · Learn']].map(([stat, label]) => (
            <div key={stat} style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff', marginBottom: 4 }}>{stat}</div>
              <div style={{ fontSize: '.8125rem', color: 'rgba(255,255,255,.45)' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.1em', color: '#B8860B', marginBottom: 12 }}>EVERYTHING IN ONE PLACE</div>
          <h2 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 700, letterSpacing: '-.025em', color: '#fff' }}>A wealth OS, not a budgeting app.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
          <Feature icon="📊" title="Budget that thinks" body="Track income, fixed costs, and variable spending. AI spots where your money is leaking." />
          <Feature icon="📸" title="Screenshot portfolio updates" body="Upload a screenshot from any broker. Claude reads it, extracts holdings, you approve — done." />
          <Feature icon="🎯" title="Goal trajectory" body="See exactly if you're on track, how many months away, and what to change to get there faster." />
          <Feature icon="💰" title="True net worth" body="Investments, property, gold, pension, cash — minus liabilities. One real number." />
          <Feature icon="📈" title="Wealth projector" body="20-year projections from your actual numbers. Sliders for savings rate, returns, inflation." />
          <Feature icon="🧠" title="AI that knows your data" body="Ask anything. The advisor reads your real income, portfolio, and goals before answering." />
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '28px 32px', textAlign: 'center' }}>
        <p style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.3)', letterSpacing: '.05em' }}>
          EDUCATIONAL GUIDANCE · NOT REGULATED FINANCIAL ADVICE · YOUR DATA STAYS YOURS
        </p>
      </div>
    </div>
  );
}
