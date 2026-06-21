-- ============================================================
-- AI MY MONEY · Phase 2.1.1 — Hardening
-- Run AFTER phase-2-1.sql. Idempotent.
-- ============================================================

-- 1. Remove any duplicate materialised income rows (keep the earliest),
--    then guarantee uniqueness for source-linked records going forward.
delete from income_records a
using income_records b
where a.user_id = b.user_id
  and a.month = b.month
  and a.source_id is not null
  and a.source_id = b.source_id
  and a.created_at > b.created_at;

create unique index if not exists uniq_income_records_source
  on income_records (user_id, month, source_id)
  where source_id is not null;
