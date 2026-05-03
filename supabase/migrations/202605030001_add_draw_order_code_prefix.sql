alter table public.draw_rounds
add column if not exists order_code_prefix text not null default 'LD';

alter table public.draw_rounds
drop constraint if exists draw_rounds_order_code_prefix_check;

alter table public.draw_rounds
add constraint draw_rounds_order_code_prefix_check
check (order_code_prefix ~ '^[A-Z0-9][A-Z0-9-]{0,15}$');

alter table public.orders
alter column public_code drop default;

create or replace function app_private.assign_order_public_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prefix_value text;
begin
  if new.public_code is not null and btrim(new.public_code) <> '' then
    return new;
  end if;

  select coalesce(nullif(order_code_prefix, ''), 'LD')
  into prefix_value
  from public.draw_rounds
  where id = new.draw_round_id;

  new.public_code := coalesce(prefix_value, 'LD') || '-' || nextval('public.order_public_code_seq')::text;
  return new;
end;
$$;

drop trigger if exists orders_assign_public_code on public.orders;
create trigger orders_assign_public_code
before insert on public.orders
for each row execute function app_private.assign_order_public_code();
