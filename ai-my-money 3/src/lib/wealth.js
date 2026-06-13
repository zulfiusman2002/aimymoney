// Shared wealth math — mirrors the backend intelligence classification
// so Dashboard, Investments and (later) Projector agree on the numbers.

export const ASSET_CLASSES = [
  ['property', 'House / residential property', 'illiquid'],
  ['commercial_property', 'Commercial property', 'illiquid'],
  ['land', 'Land', 'illiquid'],
  ['gold', 'Gold', 'liquid'],
  ['pension', 'Pension', 'illiquid'],
  ['cash', 'Cash', 'liquid'],
  ['vehicle', 'Vehicle', 'semi_liquid'],
  ['other', 'Other asset', 'semi_liquid'],
];

export const LIQUIDITY_LABELS = {
  liquid: 'Liquid', semi_liquid: 'Semi-liquid', illiquid: 'Illiquid',
};

const INV_LIQUID = new Set(['cash', 'gold']);
const INV_SEMI = new Set(['etf', 'uk_stocks', 'us_stocks', 'indian_stocks', 'mutual_funds', 'crypto', 'bonds']);

export function snapshotValue(s) {
  return Number(s.converted_total ?? s.total_value ?? 0);
}

/** assets: rows from `assets`; latestSnaps: latest investment_snapshot per asset_type; liabilities rows */
export function composition(assets, latestSnaps, liabilities) {
  const invested = latestSnaps.reduce((a, s) => a + snapshotValue(s), 0);
  const nonBroker = assets.reduce((a, x) => a + Number(x.converted_value || 0), 0);
  let liquid = 0, semi = 0, illiquid = 0;
  for (const a of assets) {
    const v = Number(a.converted_value || 0);
    if (a.liquidity === 'liquid') liquid += v;
    else if (a.liquidity === 'semi_liquid') semi += v;
    else illiquid += v;
  }
  for (const s of latestSnaps) {
    const v = snapshotValue(s);
    if (INV_LIQUID.has(s.asset_type)) liquid += v;
    else if (INV_SEMI.has(s.asset_type)) semi += v;
    else illiquid += v;
  }
  const totalLiabilities = liabilities.reduce((a, l) => a + Number(l.amount || 0), 0);
  const gross = invested + nonBroker;
  return { invested, nonBroker, liquid, semi, illiquid, totalLiabilities, gross, netWorth: gross - totalLiabilities };
}

export function fmtMoney(n, sym) {
  return `${sym}${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

export const symFor = (cur) => ({ GBP: '£', USD: '$', EUR: '€', INR: '₹' }[cur] || (cur ? cur + ' ' : ''));
