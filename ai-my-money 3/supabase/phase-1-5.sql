-- ============================================================
-- AI MY MONEY · Phase 1.5 — Connected Wealth Intelligence Layer
-- Run AFTER schema.sql in the Supabase SQL Editor. Idempotent.
-- ============================================================

-- ---------- 1. ASSETS (non-broker wealth, separate from holdings) ----------
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  asset_class text not null,             -- property | commercial_property | land | gold | pension | cash | vehicle | collectible | other
  liquidity text default 'illiquid',     -- liquid | semi_liquid | illiquid
  original_currency text not null default 'GBP',
  original_value numeric not null default 0,
  base_currency text not null default 'GBP',
  converted_value numeric not null default 0,
  fx_rate numeric not null default 1,
  fx_date date default current_date,
  valuation_date date default current_date,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_assets_user on assets(user_id) where is_active;

-- ---------- 2. FX fields on holdings + snapshots ----------
alter table investment_holdings
  add column if not exists original_currency text,
  add column if not exists original_value numeric,
  add column if not exists base_currency text,
  add column if not exists converted_value numeric,
  add column if not exists fx_rate numeric default 1,
  add column if not exists fx_date date;

alter table investment_snapshots
  add column if not exists base_currency text,
  add column if not exists converted_total numeric,
  add column if not exists fx_rate numeric default 1,
  add column if not exists fx_date date;

-- Per-user FX rates (editable; conversions always record the rate used)
create table if not exists fx_rates (
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null,
  base_currency text not null default 'GBP',
  rate_to_base numeric not null,         -- 1 unit of currency = rate_to_base units of base
  updated_at timestamptz default now(),
  primary key (user_id, currency)
);

-- ---------- 3. MONTHLY FINANCIAL SNAPSHOTS ----------
create table if not exists monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,                   -- 'YYYY-MM'
  total_income numeric default 0,
  total_expenses numeric default 0,
  fixed_expenses numeric default 0,
  variable_expenses numeric default 0,
  one_time_expenses numeric default 0,
  total_savings numeric default 0,
  savings_rate numeric default 0,
  total_invested numeric default 0,      -- broker/holdings wealth (base currency)
  total_assets numeric default 0,        -- assets table wealth (base currency)
  total_liabilities numeric default 0,
  net_worth numeric default 0,
  emergency_fund numeric default 0,
  goal_progress jsonb default '[]',      -- [{goal_id, name, pct, on_track}]
  learning_xp int default 0,
  computed_at timestamptz default now(),
  unique (user_id, month)
);

-- ---------- 4. INSIGHTS ENGINE ----------
create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  detail text not null,
  severity text default 'info',          -- info | good | warning | risk
  source_modules text[] default '{}',    -- e.g. {budget,goals} {portfolio,learn}
  linked_goal_id uuid references goals(id) on delete set null,
  recommended_module_id int references learn_modules(id),
  status text default 'active',          -- active | dismissed | resolved
  created_at timestamptz default now()
);
create index if not exists idx_insights_user on insights(user_id, status);

-- ---------- RLS ----------
alter table assets enable row level security;
alter table fx_rates enable row level security;
alter table monthly_snapshots enable row level security;
alter table insights enable row level security;

do $$
declare t text;
begin
  foreach t in array array['assets','fx_rates','monthly_snapshots','insights'] loop
    execute format('drop policy if exists "own rows" on %I', t);
    execute format(
      'create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t
    );
  end loop;
end $$;
