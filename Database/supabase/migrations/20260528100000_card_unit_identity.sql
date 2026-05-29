-- ============================================================================
-- Product → Unit split, phase 1 (additive, non-destructive)
--
-- Moves the *physical-item* identity (condition, grade, grading service,
-- cert number, GemRate id) DOWN from `public.cards` (the product / catalog
-- row) to `public.card_stock_units` (the individual stock item), and adds a
-- `quantity` column so a single unit row can represent bulk raw/sealed stock
-- while graded slabs stay 1-per-unit with a unique cert.
--
-- This migration is intentionally ADDITIVE:
--   * new columns are added to card_stock_units and backfilled from the
--     parent card, so nothing is lost;
--   * the legacy columns on `cards` are LEFT IN PLACE — application code
--     keeps working while it is migrated to read from the unit level. A
--     later cleanup migration drops them once the app no longer reads them.
--   * the unique-cert constraint is DEFERRED (see bottom) because existing
--     data may have several units backfilled from one card that carried a
--     cert; that must be de-duplicated by hand before the constraint is safe.
--
-- `cards.search_name` stays unique on purpose: in the new model there is one
-- product per name and many units beneath it, so product-name uniqueness is
-- still correct.
-- ============================================================================

-- 1) Unit-level identity columns -------------------------------------------------
alter table public.card_stock_units
  add column if not exists condition text,
  add column if not exists grade text,
  add column if not exists grading_service text,
  add column if not exists cert_number text,
  add column if not exists gemrate_id text,
  add column if not exists quantity integer not null default 1;

-- quantity is a count of physical copies represented by the row
-- (graded slab = 1; raw/sealed bulk = N). Never negative.
alter table public.card_stock_units
  drop constraint if exists card_stock_units_quantity_check;
alter table public.card_stock_units
  add constraint card_stock_units_quantity_check check (quantity >= 0);

-- 2) Backfill unit identity from the parent card --------------------------------
-- grade / condition / grading_service / gemrate_id can legitimately repeat
-- across raw units, so copy them to every unit. cert_number is preserved as-is
-- here; de-duplication happens before the unique index is added (see bottom).
update public.card_stock_units u
set
  condition       = coalesce(u.condition, c.condition, 'raw'),
  grade           = coalesce(u.grade, c.grade),
  grading_service = coalesce(u.grading_service, c.grading_service),
  cert_number     = coalesce(u.cert_number, c.cert_number),
  gemrate_id      = coalesce(u.gemrate_id, c.gemrate_id)
from public.cards c
where u.card_id = c.id;

-- ensure condition is always populated going forward
update public.card_stock_units set condition = 'raw' where condition is null or condition = '';

alter table public.card_stock_units
  alter column condition set default 'raw';

alter table public.card_stock_units
  drop constraint if exists card_stock_units_condition_check;
alter table public.card_stock_units
  add constraint card_stock_units_condition_check
  check (condition in ('sealed', 'raw', 'graded'));

-- 3) Lookup index for catalog grouping (product → its units) --------------------
create index if not exists card_stock_units_card_condition_idx
  on public.card_stock_units (card_id, condition, status);

-- 4) Realtime publication (units already published; no-op guard) -----------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'card_stock_units'
    ) then
      alter publication supabase_realtime add table public.card_stock_units;
    end if;
  end if;
end $$;

-- ============================================================================
-- DEFERRED — run only after verifying no duplicate certs exist.
--
--   -- find collisions first:
--   select cert_number, count(*)
--   from public.card_stock_units
--   where cert_number is not null and cert_number <> ''
--   group by cert_number having count(*) > 1;
--
--   -- once clean, enforce one physical slab per cert:
--   create unique index card_stock_units_cert_number_key
--     on public.card_stock_units (cert_number)
--     where cert_number is not null and cert_number <> '';
-- ============================================================================
