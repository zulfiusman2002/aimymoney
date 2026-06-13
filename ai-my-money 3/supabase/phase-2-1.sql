-- ============================================================
-- AI MY MONEY · Phase 2.1 — Stabilisation & Data Accuracy
-- Run AFTER phase-1-6.sql. Idempotent.
-- ============================================================

-- Month-aware income: income_sources stays as the user's "standard income";
-- income_records is what a given month ACTUALLY was. Editing standard income
-- later never rewrites history.
create table if not exists income_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,                  -- 'YYYY-MM'
  name text not null,
  amount numeric not null default 0,
  type text default 'salary',
  source_id uuid references income_sources(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_income_records on income_records(user_id, month);

alter table income_records enable row level security;
drop policy if exists "own rows" on income_records;
create policy "own rows" on income_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Goal → asset linkage by ID (name column kept for display/back-compat)
alter table goals add column if not exists linked_asset_id uuid references assets(id) on delete set null;

-- Backfill current month's income records from standard income (one-off)
insert into income_records (user_id, month, name, amount, type, source_id)
select user_id, to_char(now(),'YYYY-MM'), name, amount, type, id
from income_sources s
where is_active
  and not exists (
    select 1 from income_records r
    where r.user_id = s.user_id and r.month = to_char(now(),'YYYY-MM')
  );
