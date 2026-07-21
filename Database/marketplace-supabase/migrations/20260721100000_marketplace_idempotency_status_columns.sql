-- Repair the idempotency ledger contract used by seller-photo attachment RPCs.
-- Earlier marketplace migrations persist completion state, so production ledgers
-- created from the original foundation must carry these columns before photo
-- uploads can be finalized.

alter table public.marketplace_idempotency_keys
  add column if not exists status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  add column if not exists completed_at timestamptz;

update public.marketplace_idempotency_keys
set
  status = 'completed',
  completed_at = coalesce(completed_at, updated_at, created_at)
where response_payload is not null
  and status = 'processing';
