-- Product alerts: "notify me when listed" subscriptions for products that
-- currently have no active listing.
--
-- Notification DELIVERY is explicitly out of scope for this migration.
-- There is no notification channel (email, push, LINE, etc.) yet. Alerts
-- are stored here and surfaced in admin stats only, until a delivery
-- channel ships and starts consuming rows in the 'active' state.

create table if not exists public.marketplace_product_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  alert_state text not null default 'active'
    check (alert_state in ('active', 'cancelled', 'notified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_product_alerts_state_idx
  on public.marketplace_product_alerts(alert_state, created_at desc);
create index if not exists marketplace_product_alerts_account_idx
  on public.marketplace_product_alerts(account_id, alert_state, created_at desc);
create unique index if not exists marketplace_product_alerts_active_unique_idx
  on public.marketplace_product_alerts(product_id, account_id)
  where alert_state = 'active';

drop trigger if exists marketplace_product_alerts_touch_updated_at on public.marketplace_product_alerts;
create trigger marketplace_product_alerts_touch_updated_at
before update on public.marketplace_product_alerts
for each row execute function public.marketplace_touch_updated_at();

alter table public.marketplace_product_alerts enable row level security;
revoke all on public.marketplace_product_alerts from public, anon, authenticated;
grant select, insert, update on public.marketplace_product_alerts to service_role;

create or replace function public.marketplace_subscribe_product_alert(
  p_product_id uuid,
  p_account_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_alert public.marketplace_product_alerts%rowtype;
begin
  if not exists (
    select 1 from public.marketplace_products where id = p_product_id
  ) then
    raise exception 'marketplace_alert_product_missing';
  end if;
  insert into public.marketplace_product_alerts
    (product_id, account_id)
  values (p_product_id, p_account_id)
  on conflict do nothing
  returning * into v_alert;
  if v_alert.id is null then
    select * into v_alert from public.marketplace_product_alerts
    where product_id = p_product_id and account_id = p_account_id
      and alert_state = 'active';
  end if;
  return to_jsonb(v_alert);
end $$;

create or replace function public.marketplace_cancel_product_alert(
  p_product_id uuid,
  p_account_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_alert public.marketplace_product_alerts%rowtype;
begin
  update public.marketplace_product_alerts
     set alert_state = 'cancelled'
   where product_id = p_product_id and account_id = p_account_id and alert_state = 'active'
   returning * into v_alert;
  if v_alert.id is null then
    raise exception 'marketplace_alert_not_active';
  end if;
  return to_jsonb(v_alert);
end $$;

drop function if exists public.marketplace_list_product_alerts(uuid);

create or replace function public.marketplace_list_product_alerts(
  p_account_id uuid,
  p_limit integer default 100
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  from (
    select *
    from public.marketplace_product_alerts
    where account_id = p_account_id
    order by created_at desc
    limit greatest(p_limit, 1)
  ) a;
$$;

revoke all on function public.marketplace_subscribe_product_alert(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.marketplace_cancel_product_alert(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.marketplace_list_product_alerts(uuid, integer)
from public, anon, authenticated;

grant execute on function public.marketplace_subscribe_product_alert(uuid, uuid)
to service_role;
grant execute on function public.marketplace_cancel_product_alert(uuid, uuid)
to service_role;
grant execute on function public.marketplace_list_product_alerts(uuid, integer)
to service_role;
