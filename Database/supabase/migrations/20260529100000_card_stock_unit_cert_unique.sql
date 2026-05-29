-- ============================================================================
-- Product → Unit split, phase 3 — enforce one physical slab per cert
--
-- A graded cert identifies a single physical slab, so it must be unique across
-- stock units. The phase-1 backfill copied cert_number from the parent card to
-- *every* unit of that card, which can leave duplicates. This migration:
--   1. keeps the cert on the earliest unit per cert and nulls it on the rest
--      (so the constraint can be created without failing), then
--   2. adds the partial unique index.
-- ============================================================================

with ranked as (
  select
    id,
    row_number() over (
      partition by cert_number
      order by created_at asc, id asc
    ) as rn
  from public.card_stock_units
  where cert_number is not null
    and cert_number <> ''
)
update public.card_stock_units u
set cert_number = null,
    updated_at = now()
from ranked r
where u.id = r.id
  and r.rn > 1;

create unique index if not exists card_stock_units_cert_number_key
  on public.card_stock_units (cert_number)
  where cert_number is not null and cert_number <> '';
