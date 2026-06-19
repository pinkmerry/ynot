-- Add idempotency to the legacy lucky-draw order creation path.
-- Existing rows remain valid because the column is nullable.

alter table public.orders
add column if not exists idempotency_key text;

create unique index if not exists orders_profile_idempotency_unique_idx
on public.orders(profile_id, idempotency_key)
where idempotency_key is not null;
