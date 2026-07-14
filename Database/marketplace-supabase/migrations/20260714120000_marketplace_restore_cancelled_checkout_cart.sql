-- Restore cart rows when a grouped checkout ends without payment.
--
-- Group checkout consumes the selected cart rows while stock is locked. Any
-- terminal failed state must put those rows back so the server cart remains in
-- sync with the review UI and the buyer can retry after cancelling or expiry.

create or replace function public.marketplace_restore_failed_checkout_group_cart()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.checkout_state not in ('cancelled', 'expired')
    or new.payment_state <> 'failed'
  then
    return new;
  end if;

  if old.checkout_state in ('cancelled', 'expired')
    and old.payment_state = 'failed'
  then
    return new;
  end if;

  insert into public.marketplace_cart_items(
    buyer_marketplace_account_id,
    listing_id,
    quantity
  )
  select
    new.buyer_marketplace_account_id,
    checkout_item.listing_id,
    1
  from public.marketplace_checkout_items checkout_item
  where checkout_item.checkout_group_id = new.id
  on conflict (buyer_marketplace_account_id, listing_id) do nothing;

  return new;
end;
$$;

drop trigger if exists marketplace_checkout_groups_restore_failed_cart
on public.marketplace_checkout_groups;

create trigger marketplace_checkout_groups_restore_failed_cart
after update of checkout_state, payment_state
on public.marketplace_checkout_groups
for each row
execute function public.marketplace_restore_failed_checkout_group_cart();

revoke all on function public.marketplace_restore_failed_checkout_group_cart()
from public, anon, authenticated;

grant execute on function public.marketplace_restore_failed_checkout_group_cart()
to service_role;
