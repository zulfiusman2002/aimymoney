// FX helper. Conversions always record the rate + date used.
// Rates come from the user's fx_rates table; these are only first-run defaults.
import { supabase } from './supabase';

export const DEFAULT_RATES_TO_GBP = { GBP: 1, USD: 0.79, EUR: 0.85, INR: 0.0094, AED: 0.215 };

export async function getRate(userId, currency, base) {
  if (currency === base) return 1;
  const { data } = await supabase.from('fx_rates').select('rate_to_base')
    .eq('user_id', userId).eq('currency', currency).maybeSingle();
  if (data) return Number(data.rate_to_base);
  // default = currency→GBP→base
  const toGbp = DEFAULT_RATES_TO_GBP[currency];
  const baseToGbp = DEFAULT_RATES_TO_GBP[base];
  if (toGbp && baseToGbp) return toGbp / baseToGbp;
  return 1;
}

export async function saveRate(userId, currency, base, rate) {
  await supabase.from('fx_rates').upsert({
    user_id: userId, currency, base_currency: base, rate_to_base: Number(rate),
    updated_at: new Date().toISOString(),
  });
}
