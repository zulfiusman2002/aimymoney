-- ============================================================
-- AI MY MONEY · Phase 1.6 — Assets & Valuation History
-- Run AFTER phase-1-5.sql. Idempotent.
-- ============================================================

alter table assets add column if not exists valuation_source text default 'manual estimate';

-- Valuation history: every "update house value" creates a row here,
-- and the parent asset row is updated to the newest valuation.
create table if not exists asset_valuations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  original_currency text not null,
  original_value numeric not null,
  base_currency text not null,
  converted_value numeric not null,
  fx_rate numeric not null default 1,      -- manually entered / stored rate, NOT live market data
  fx_date date default current_date,
  valuation_date date not null default current_date,
  source text default 'manual estimate',   -- manual estimate | agent valuation | statement | screenshot | index
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_asset_valuations on asset_valuations(asset_id, valuation_date desc);

alter table asset_valuations enable row level security;
drop policy if exists "own rows" on asset_valuations;
create policy "own rows" on asset_valuations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
