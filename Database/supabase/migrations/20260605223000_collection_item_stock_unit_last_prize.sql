-- collection_item_stock_unit_last_prize
-- Private linkage for the exact stock unit awarded to a collection item.
-- Customer APIs may use this to resolve images/grade, but must never expose
-- these IDs, selected stock filters, cert numbers, or house logic.

create schema if not exists app_private;

alter table public.collection_items
  add column if not exists card_stock_unit_id uuid
    references public.card_stock_units(id) on delete restrict,
  add column if not exists gacha_open_item_id uuid
    references public.gacha_open_items(id) on delete set null;

revoke select on public.collection_items from public, anon, authenticated;
grant select (
  id,
  profile_id,
  card_id,
  source_type,
  source_id,
  status,
  serial_no,
  acquired_at,
  convert_coin_value_snapshot,
  convert_expires_at,
  created_at,
  updated_at
) on public.collection_items to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'collection_items'
     )
  then
    alter publication supabase_realtime drop table public.collection_items;
  end if;
end $$;

create index if not exists collection_items_card_stock_unit_idx
  on public.collection_items(card_stock_unit_id)
  where card_stock_unit_id is not null;

create index if not exists collection_items_gacha_open_item_idx
  on public.collection_items(gacha_open_item_id)
  where gacha_open_item_id is not null;

create or replace function app_private.last_prize_convert_coin_value(
  last_prize_metadata jsonb
)
returns integer
language sql
stable
as $$
  select case
    when coalesce(last_prize_metadata ->> 'convertCoinValue', '') ~ '^[0-9]+$'
      then greatest(0, least(10000000, (last_prize_metadata ->> 'convertCoinValue')::integer))
    else null
  end;
$$;

create or replace function app_private.collection_convert_deadline(
  p_acquired_at timestamptz,
  p_deadline_days integer
)
returns timestamptz
language sql
stable
as $$
  select case
    when coalesce(p_deadline_days, 0) > 0
      then coalesce(p_acquired_at, now()) + (p_deadline_days || ' days')::interval
    else null
  end;
$$;

create or replace function app_private.uuid_from_text(p_value text)
returns uuid
language sql
stable
as $$
  select case
    when coalesce(p_value, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then p_value::uuid
    else null
  end;
$$;

create or replace function app_private.sync_collection_item_stock_from_prize_unit()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if new.collection_item_id is null then
    return new;
  end if;

  update public.collection_items item
  set card_stock_unit_id = coalesce(new.card_stock_unit_id, item.card_stock_unit_id),
      gacha_open_item_id = coalesce(new.gacha_open_item_id, item.gacha_open_item_id),
      updated_at = now()
  where item.id = new.collection_item_id
    and (
      (
        new.card_stock_unit_id is not null
        and item.card_stock_unit_id is distinct from new.card_stock_unit_id
      )
      or (
        new.gacha_open_item_id is not null
        and item.gacha_open_item_id is distinct from new.gacha_open_item_id
      )
    );

  return new;
end;
$$;

drop trigger if exists draw_round_prize_units_sync_collection_item_stock
  on public.draw_round_prize_units;
create trigger draw_round_prize_units_sync_collection_item_stock
  after insert or update of card_stock_unit_id, gacha_open_item_id, collection_item_id
  on public.draw_round_prize_units
  for each row
  execute function app_private.sync_collection_item_stock_from_prize_unit();

create or replace function app_private.sync_last_prize_collection_item()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_open_item_id uuid;
  v_convert_coin_value integer;
begin
  if new.last_prize_collection_item_id is null
    or new.last_prize_stock_unit_id is null
    or new.last_prize_card_id is null then
    return new;
  end if;

  select app_private.uuid_from_text(unit.metadata #>> '{lastPrizeAward,gachaOpenItemId}')
    into v_open_item_id
  from public.card_stock_units unit
  where unit.id = new.last_prize_stock_unit_id
  limit 1;

  if v_open_item_id is null and new.last_prize_awarded_open_id is not null then
    select item.id
      into v_open_item_id
    from public.gacha_open_items item
    where item.gacha_open_id = new.last_prize_awarded_open_id
      and item.card_id = new.last_prize_card_id
      and item.tier = 'last_prize'
    order by item.result_position desc, item.created_at desc, item.id desc
    limit 1;
  end if;

  v_convert_coin_value := app_private.last_prize_convert_coin_value(new.last_prize_metadata);

  update public.collection_items item
  set card_stock_unit_id = new.last_prize_stock_unit_id,
      gacha_open_item_id = coalesce(v_open_item_id, item.gacha_open_item_id),
      convert_coin_value_snapshot = case
        when item.convert_coin_value_snapshot is null and v_convert_coin_value is not null
          then v_convert_coin_value
        else item.convert_coin_value_snapshot
      end,
      convert_expires_at = case
        when item.convert_expires_at is null
          and v_convert_coin_value is not null
          and v_convert_coin_value > 0
          and coalesce(new.convert_deadline_days, 0) > 0
          then app_private.collection_convert_deadline(item.acquired_at, new.convert_deadline_days)
        else item.convert_expires_at
      end,
      updated_at = now()
  where item.id = new.last_prize_collection_item_id
    and (
      item.card_stock_unit_id is distinct from new.last_prize_stock_unit_id
      or (
        v_open_item_id is not null
        and item.gacha_open_item_id is distinct from v_open_item_id
      )
      or (
        item.convert_coin_value_snapshot is null
        and v_convert_coin_value is not null
      )
      or (
        item.convert_expires_at is null
        and v_convert_coin_value is not null
        and v_convert_coin_value > 0
        and coalesce(new.convert_deadline_days, 0) > 0
      )
    );

  return new;
end;
$$;

drop trigger if exists draw_rounds_sync_last_prize_collection_item
  on public.draw_rounds;
create trigger draw_rounds_sync_last_prize_collection_item
  after insert or update of
    last_prize_metadata,
    last_prize_awarded_open_id,
    last_prize_stock_unit_id,
    last_prize_collection_item_id
  on public.draw_rounds
  for each row
  execute function app_private.sync_last_prize_collection_item();

-- Existing normal prize awards: collection item -> prize unit -> stock unit.
update public.collection_items item
set card_stock_unit_id = coalesce(unit.card_stock_unit_id, item.card_stock_unit_id),
    gacha_open_item_id = coalesce(unit.gacha_open_item_id, item.gacha_open_item_id),
    updated_at = now()
from public.draw_round_prize_units unit
where unit.collection_item_id = item.id
  and (
    (
      unit.card_stock_unit_id is not null
      and item.card_stock_unit_id is distinct from unit.card_stock_unit_id
    )
    or (
      unit.gacha_open_item_id is not null
      and item.gacha_open_item_id is distinct from unit.gacha_open_item_id
    )
  );

update public.collection_items item
set card_stock_unit_id = round.last_prize_stock_unit_id,
    gacha_open_item_id = coalesce(
      app_private.uuid_from_text(unit.metadata #>> '{lastPrizeAward,gachaOpenItemId}'),
      open_item.id,
      item.gacha_open_item_id
    ),
    convert_coin_value_snapshot = case
      when item.convert_coin_value_snapshot is null
        and app_private.last_prize_convert_coin_value(round.last_prize_metadata) is not null
        then app_private.last_prize_convert_coin_value(round.last_prize_metadata)
      else item.convert_coin_value_snapshot
    end,
    convert_expires_at = case
      when item.convert_expires_at is null
        and app_private.last_prize_convert_coin_value(round.last_prize_metadata) is not null
        and app_private.last_prize_convert_coin_value(round.last_prize_metadata) > 0
        and coalesce(round.convert_deadline_days, 0) > 0
        then app_private.collection_convert_deadline(item.acquired_at, round.convert_deadline_days)
      else item.convert_expires_at
    end,
    updated_at = now()
from public.draw_rounds round
left join public.card_stock_units unit
  on unit.id = round.last_prize_stock_unit_id
left join lateral (
  select open_item.id
  from public.gacha_open_items open_item
  where open_item.gacha_open_id = round.last_prize_awarded_open_id
    and open_item.card_id = round.last_prize_card_id
    and open_item.tier = 'last_prize'
  order by open_item.result_position desc, open_item.created_at desc, open_item.id desc
  limit 1
) open_item on true
where round.last_prize_collection_item_id = item.id
  and round.last_prize_stock_unit_id is not null
  and (
    item.card_stock_unit_id is distinct from round.last_prize_stock_unit_id
    or (
      coalesce(
        app_private.uuid_from_text(unit.metadata #>> '{lastPrizeAward,gachaOpenItemId}'),
        open_item.id
      ) is not null
      and item.gacha_open_item_id is distinct from coalesce(
        app_private.uuid_from_text(unit.metadata #>> '{lastPrizeAward,gachaOpenItemId}'),
        open_item.id
      )
    )
    or (
      item.convert_coin_value_snapshot is null
      and app_private.last_prize_convert_coin_value(round.last_prize_metadata) is not null
    )
    or (
      item.convert_expires_at is null
      and app_private.last_prize_convert_coin_value(round.last_prize_metadata) is not null
      and app_private.last_prize_convert_coin_value(round.last_prize_metadata) > 0
      and coalesce(round.convert_deadline_days, 0) > 0
    )
  );
