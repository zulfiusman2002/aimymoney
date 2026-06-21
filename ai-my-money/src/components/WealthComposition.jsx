import { fmtMoney } from '../lib/wealth';

// Total Wealth Composition — elegant stacked bar + figures.
// comp = output of composition(); sym = currency symbol; base = base currency code
export default function WealthComposition({ comp, sym, base }) {
  const f = (n) => fmtMoney(n, sym);
  const segs = [
    ['Liquid', comp.liquid, 'var(--c-gold)'],
    ['Semi-liquid', comp.semi, 'var(--c-green)'],
    ['Illiquid', comp.illiquid, '#5b5346'],
  ].filter(([, v]) => v > 0);
  const gross = Math.max(1, comp.gross);

  return (
    <div className="card fade-up" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
        <span className="t-label">Total wealth composition · {base}</span>
        <div>
          <span className="num-hero" style={{ fontSize: '2rem' }}>{f(comp.netWorth)}</span>
          <span className="t-label"> net worth</span>
        </div>
      </div>

      {/* stacked liquidity bar */}
      <div style={{ display: 'flex', height: 14, borderRadius: 8, overflow: 'hidden', marginTop: 16, background: 'var(--c-border)' }}>
        {segs.map(([name, v, color]) => (
          <div key={name} title={`${name} ${f(v)}`}
            style={{ width: `${(v / gross) * 100}%`, background: color, transition: 'width .8s ease' }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
        {segs.map(([name, v, color]) => (
          <span key={name} style={{ fontSize: '.72rem', color: 'var(--c-muted)' }}>
            <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: color, marginRight: 6 }} />
            {name} {f(v)} · {((v / gross) * 100).toFixed(0)}%
          </span>
        ))}
      </div>

      <div className="grid g4" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        {[
          ['Investment wealth', f(comp.invested)],
          ['Non-broker assets', f(comp.nonBroker)],
          ['Liabilities', `−${f(comp.totalLiabilities)}`],
          ['Net worth', f(comp.netWorth)],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="t-label">{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 600, color: label === 'Liabilities' ? 'var(--risk)' : 'var(--ink)' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
