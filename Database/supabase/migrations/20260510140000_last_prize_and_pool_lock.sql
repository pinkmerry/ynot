-- Sprint 3 — Last prize (ラストワン賞) + pool edit lock.
-- Lets admins designate one prize unit as a guaranteed reward for whoever
-- opens the very last available unit of a campaign. Also adds a guard
-- preventing admin-level edits/inserts/deletes of prize_units once the
-- campaign goes live, so the published pool composition is immutable
-- while players are pulling.

-- 1. last-prize columns -------------------------------------------------------

alter table public.draw_round_prize_units
  add column if not exists is_last_prize boolean not null default false;

create unique index if not exists draw_round_prize_units_one_last_prize_per_round
  on public.draw_round_prize_units(draw_round_id)
  where is_last_prize = true;

alter table public.draw_rounds
  add column if not exists last_prize_unit_id uuid references public.draw_round_prize_units(id)
    on delete set null;

comment on column public.draw_round_prize_units.is_last_prize is
  'When true, this unit is the guaranteed last-prize reward for whoever pulls when only one prize unit remains.';
comment on column public.draw_rounds.last_prize_unit_id is
  'Pointer to the designated last-prize unit. Updated by set_draw_round_last_prize_unit().';

-- 2. admin RPC to designate the last-prize unit -------------------------------

create or replace function public.set_draw_round_last_prize_unit(
  p_draw_round_id uuid,
  p_unit_id uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  unit_row public.draw_round_prize_units%rowtype;
begin
  if p_admin_id is null then
    raise exception 'admin_required';
  end if;

  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_found';
  end if;

  if campaign.status not in ('draft', 'live') then
    raise exception 'campaign_not_editable';
  end if;

  if p_unit_id is null then
    update public.draw_round_prize_units
    set is_last_prize = false
    where draw_round_id = p_draw_round_id
      and is_last_prize = true;

    update public.draw_rounds
    set last_prize_unit_id = null
    where id = p_draw_round_id;

    insert into public.audit_events(actor_admin_id, event_type, draw_round_id, metadata)
    values (p_admin_id, 'last_prize_cleared', p_draw_round_id, '{}'::jsonb);

    return jsonb_build_object('drawRoundId', p_draw_round_id, 'lastPrizeUnitId', null);
  end if;

  select * into unit_row
  from public.draw_round_prize_units
  where id = p_unit_id
  for update;

  if unit_row.id is null or unit_row.draw_round_id <> p_draw_round_id then
    raise exception 'unit_not_in_campaign';
  end if;

  if unit_row.status <> 'available' then
    raise exception 'last_prize_must_be_available';
  end if;

  update public.draw_round_prize_units
  set is_last_prize = false
  where draw_round_id = p_draw_round_id
    and is_last_prize = true
    and id <> p_unit_id;

  update public.draw_round_prize_units
  set is_last_prize = true
  where id = p_unit_id;

  update public.draw_rounds
  set last_prize_unit_id = p_unit_id
  where id = p_draw_round_id;

  insert into public.audit_events(actor_admin_id, event_type, draw_round_id, metadata)
  values (p_admin_id, 'last_prize_set', p_draw_round_id, jsonb_build_object('unitId', p_unit_id));

  return jsonb_build_object('drawRoundId', p_draw_round_id, 'lastPrizeUnitId', p_unit_id);
end;
$$;

revoke all on function public.set_draw_round_last_prize_unit(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_draw_round_last_prize_unit(uuid, uuid, uuid) to service_role;

-- 3. pool-edit lock trigger ---------------------------------------------------
-- After campaign is live, only the gacha RPC may modify prize_units (it sets
-- status = 'awarded' and fills profile/gacha_open/collection refs). Admin /
-- service-role inserts and deletes are blocked. The gacha RPC sets a
-- per-transaction GUC `app.gacha_open_in_progress = '1'` so the trigger can
-- distinguish legitimate award updates from out-of-band tampering.

create or replace function app_private.draw_round_prize_units_lock_after_live()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  campaign_status text;
  in_gacha_open text;
begin
  begin
    in_gacha_open := current_setting('app.gacha_open_in_progress', true);
  exception when others then
    in_gacha_open := null;
  end;

  if tg_op = 'INSERT' then
    select status into campaign_status
    from public.draw_rounds where id = new.draw_round_id;
    if campaign_status in ('live', 'closed', 'archived') and in_gacha_open is distinct from '1' then
      raise exception 'pool_locked_campaign_live';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    select status into campaign_status
    from public.draw_rounds where id = old.draw_round_id;
    if campaign_status in ('live', 'closed', 'archived') and in_gacha_open is distinct from '1' then
      raise exception 'pool_locked_campaign_live';
    end if;
    return old;
  end if;

  -- UPDATE: block changes to identity (card_id, prize_id, draw_round_id) once
  -- live; allow status/awarded/profile/etc. to be updated by the gacha RPC.
  select status into campaign_status
  from public.draw_rounds where id = new.draw_round_id;
  if campaign_status in ('live', 'closed', 'archived') then
    if (new.card_id is distinct from old.card_id)
       or (new.draw_round_prize_id is distinct from old.draw_round_prize_id)
       or (new.draw_round_id is distinct from old.draw_round_id) then
      if in_gacha_open is distinct from '1' then
        raise exception 'pool_locked_identity_immutable_after_live';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists draw_round_prize_units_lock_after_live on public.draw_round_prize_units;
create trigger draw_round_prize_units_lock_after_live
before insert or update or delete on public.draw_round_prize_units
for each row execute function app_private.draw_round_prize_units_lock_after_live();

-- 4. open_gacha_campaign — last-prize override + GUC flag --------------------

drop function if exists public.open_gacha_campaign(uuid, uuid, integer, text, text);

create or replace function public.open_gacha_campaign(
  p_profile_id uuid,
  p_draw_round_id uuid,
  p_quantity integer default 1,
  p_idempotency_key text default null,
  p_client_seed text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  locked_wallet public.wallet_accounts%rowtype;
  existing_open public.gacha_opens%rowtype;
  open_row public.gacha_opens%rowtype;
  v_client_seed text;
  v_pool_size integer;
  v_nonce bigint;
  v_rng_input text;
  v_rng_hex text;
  v_rng_index bigint;
  v_pick_source text;
  slot_id uuid;
  unit_id uuid;
  unit_prize_id uuid;
  unit_card_id uuid;
  unit_tier text;
  unit_value_thb integer;
  unit_is_last_prize boolean;
  total_cost integer;
  position_index integer;
  ledger_id uuid;
  open_item_id uuid;
  new_collection_item_id uuid;
  available_slot_count integer;
  available_unit_count integer;
  result_items jsonb := '[]'::jsonb;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'invalid_open_quantity';
  end if;

  if p_idempotency_key is not null then
    select * into existing_open
    from public.gacha_opens
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;
    if existing_open.id is not null then
      return jsonb_build_object(
        'status', existing_open.status,
        'openId', existing_open.id,
        'publicCode', existing_open.public_code,
        'replayed', true
      );
    end if;
  end if;

  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
    and status = 'live'
    and visibility = 'public'
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_live';
  end if;

  if coalesce(campaign.is_test, false) = true
    and not public.profile_can_open_test_draw_round(p_draw_round_id, p_profile_id) then
    raise exception 'test_campaign_not_allowed';
  end if;

  select count(*)::integer into available_slot_count
  from public.draw_slots
  where draw_round_id = p_draw_round_id
    and status = 'available';

  if available_slot_count < p_quantity then
    raise exception 'not_enough_available_slots';
  end if;

  select count(*)::integer into available_unit_count
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id
    and status = 'available';

  if available_unit_count < p_quantity then
    raise exception 'not_enough_prize_inventory';
  end if;

  total_cost := coalesce(
    campaign.cost_coins,
    greatest(1, ceil(campaign.price_thb::numeric / 100)::integer)
  ) * p_quantity;

  insert into public.wallet_accounts(profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;

  select * into locked_wallet
  from public.wallet_accounts
  where profile_id = p_profile_id
  for update;

  if locked_wallet.balance_coins < total_cost then
    raise exception 'insufficient_balance';
  end if;

  v_client_seed := nullif(trim(coalesce(p_client_seed, '')), '');
  if v_client_seed is null then
    v_client_seed := encode(gen_random_bytes(16), 'hex');
  end if;
  if length(v_client_seed) > 128 then
    raise exception 'invalid_client_seed';
  end if;

  insert into public.gacha_opens(
    profile_id, draw_round_id, cost_coins, quantity, status, idempotency_key,
    client_seed, rng_version, metadata
  ) values (
    p_profile_id, p_draw_round_id, total_cost, p_quantity, 'completed', p_idempotency_key,
    v_client_seed, coalesce(campaign.rng_version, 1),
    jsonb_build_object(
      'campaignSlug', campaign.slug,
      'isTest', coalesce(campaign.is_test, false),
      'serverSeedHash', campaign.server_seed_hash
    )
  )
  returning * into open_row;

  insert into public.coin_ledger(
    profile_id, wallet_profile_id, entry_type, amount_coins,
    balance_before, balance_after, reference_type, reference_id, idempotency_key, metadata
  ) values (
    p_profile_id, p_profile_id, 'gacha_spend', -total_cost,
    locked_wallet.balance_coins, locked_wallet.balance_coins - total_cost,
    'gacha_open', open_row.id, p_idempotency_key,
    jsonb_build_object('drawRoundId', p_draw_round_id, 'quantity', p_quantity, 'isTest', coalesce(campaign.is_test, false))
  )
  returning id into ledger_id;

  update public.wallet_accounts
  set balance_coins = balance_coins - total_cost,
      version = version + 1
  where profile_id = p_profile_id;

  update public.gacha_opens
  set ledger_entry_id = ledger_id
  where id = open_row.id;

  -- Tell the pool-lock trigger that updates from inside this RPC are legit.
  perform set_config('app.gacha_open_in_progress', '1', true);

  for position_index in 1..p_quantity loop
    -- pick next sequential slot
    select id into slot_id
    from public.draw_slots
    where draw_round_id = p_draw_round_id
      and status = 'available'
    order by slot_number asc
    limit 1;

    if slot_id is null then
      raise exception 'not_enough_available_slots';
    end if;

    select count(*)::integer into v_pool_size
    from public.draw_round_prize_units
    where draw_round_id = p_draw_round_id
      and status = 'available';

    if v_pool_size < 1 then
      raise exception 'not_enough_prize_inventory';
    end if;

    -- last-prize override: when only one available unit remains AND that unit
    -- is the campaign's designated last-prize, award it directly.
    if v_pool_size = 1 and campaign.last_prize_unit_id is not null then
      select id into unit_id
      from public.draw_round_prize_units
      where id = campaign.last_prize_unit_id
        and draw_round_id = p_draw_round_id
        and status = 'available';
      if unit_id is not null then
        v_pick_source := 'last_prize';
        v_rng_input := null;
        v_rng_hex := null;
        v_rng_index := 0;
        v_nonce := position_index::bigint;
      end if;
    end if;

    if unit_id is null then
      -- HMAC-derive a deterministic index into the available pool
      v_pick_source := 'hmac';
      v_nonce := position_index::bigint;
      v_rng_input := v_client_seed || ':' || open_row.id::text || ':' || v_nonce::text;
      v_rng_hex := encode(hmac(v_rng_input, campaign.server_seed, 'sha256'), 'hex');
      v_rng_index := (('x' || substring(v_rng_hex from 1 for 14))::bit(56)::bigint) % v_pool_size::bigint;

      with ordered as (
        select u.id,
               row_number() over (order by u.id) - 1 as rn
        from public.draw_round_prize_units u
        where u.draw_round_id = p_draw_round_id
          and u.status = 'available'
      )
      select id into unit_id
      from ordered
      where rn = v_rng_index;
    end if;

    if unit_id is null then
      raise exception 'rng_pick_failed';
    end if;

    select units.id, units.draw_round_prize_id, units.card_id, units.is_last_prize,
           prizes.tier, prizes.value_thb
    into unit_id, unit_prize_id, unit_card_id, unit_is_last_prize,
         unit_tier, unit_value_thb
    from public.draw_round_prize_units units
    join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
    where units.id = unit_id
      and units.status = 'available'
    for update of units;

    if unit_id is null then
      raise exception 'rng_pick_unavailable';
    end if;

    update public.draw_slots
    set status = 'opened', opened_at = now()
    where id = slot_id;

    insert into public.gacha_open_items(
      gacha_open_id, card_id, draw_round_prize_id, draw_round_prize_unit_id,
      tier, value_thb, result_position,
      nonce, rng_input, rng_output_hex, rng_pool_size, rng_pool_index
    ) values (
      open_row.id, unit_card_id, unit_prize_id, unit_id,
      unit_tier, unit_value_thb, position_index,
      v_nonce, v_rng_input, v_rng_hex, v_pool_size, v_rng_index::integer
    )
    returning id into open_item_id;

    insert into public.collection_items(
      profile_id, card_id, source_type, source_id, status, serial_no
    ) values (
      p_profile_id, unit_card_id, 'gacha_open', open_row.id, 'owned',
      open_row.public_code || '-' || lpad(position_index::text, 2, '0')
    )
    returning id into new_collection_item_id;

    update public.draw_round_prize_units
    set status = 'awarded',
        profile_id = p_profile_id,
        gacha_open_id = open_row.id,
        gacha_open_item_id = open_item_id,
        collection_item_id = new_collection_item_id,
        awarded_at = now(),
        metadata = metadata || jsonb_build_object(
          'slotId', slot_id,
          'position', position_index,
          'rngIndex', v_rng_index,
          'rngPoolSize', v_pool_size,
          'pickSource', v_pick_source
        )
    where id = unit_id;

    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'cardId', unit_card_id,
      'tier', unit_tier,
      'valueThb', unit_value_thb,
      'position', position_index,
      'prizeUnitId', unit_id,
      'nonce', v_nonce,
      'rngPoolSize', v_pool_size,
      'rngPoolIndex', v_rng_index,
      'pickSource', v_pick_source,
      'isLastPrize', unit_is_last_prize
    ));

    -- reset for next iteration
    unit_id := null;
  end loop;

  insert into public.audit_events(
    actor_profile_id, event_type, draw_round_id, gacha_open_id, metadata
  ) values (
    p_profile_id, 'gacha_opened', p_draw_round_id, open_row.id,
    jsonb_build_object(
      'quantity', p_quantity,
      'cost_coins', total_cost,
      'isTest', coalesce(campaign.is_test, false),
      'serverSeedHash', campaign.server_seed_hash,
      'clientSeed', v_client_seed
    )
  );

  return jsonb_build_object(
    'status', 'completed',
    'openId', open_row.id,
    'publicCode', open_row.public_code,
    'costCoins', total_cost,
    'clientSeed', v_client_seed,
    'serverSeedHash', campaign.server_seed_hash,
    'rngVersion', coalesce(campaign.rng_version, 1),
    'items', result_items,
    'remaining', (
      select coalesce(summary, '{}'::jsonb)
      from jsonb_array_elements(public.get_draw_round_inventory_summary(p_draw_round_id, p_profile_id))
        with ordinality as s(summary, ord)
      order by ord
      limit 1
    )
  );
end;
$$;

revoke all on function public.open_gacha_campaign(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.open_gacha_campaign(uuid, uuid, integer, text, text) to service_role;

-- 5. expose last-prize info in public odds RPC --------------------------------

create or replace function public.get_draw_round_public_odds(
  p_draw_round_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  total_units integer;
  available_units integer;
  awarded_units integer;
  available_slots integer;
  total_slots integer;
  tiers jsonb := '[]'::jsonb;
  last_prize_card_id uuid;
  last_prize_tier text;
  last_prize_status text;
begin
  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
    and status in ('live', 'closed')
    and visibility = 'public';

  if campaign.id is null then
    return jsonb_build_object('available', false);
  end if;

  select count(*)::integer into total_slots
  from public.draw_slots
  where draw_round_id = p_draw_round_id;

  select count(*)::integer into available_slots
  from public.draw_slots
  where draw_round_id = p_draw_round_id
    and status = 'available';

  select
    count(*)::integer,
    count(*) filter (where status = 'available')::integer,
    count(*) filter (where status = 'awarded')::integer
    into total_units, available_units, awarded_units
  from public.draw_round_prize_units
  where draw_round_id = p_draw_round_id;

  select coalesce(jsonb_agg(row order by tier_label), '[]'::jsonb)
  into tiers
  from (
    select
      jsonb_build_object(
        'tier', prizes.tier,
        'totalUnits', count(units.*)::integer,
        'availableUnits', count(units.*) filter (where units.status = 'available')::integer,
        'awardedUnits', count(units.*) filter (where units.status = 'awarded')::integer
      ) as row,
      prizes.tier as tier_label
    from public.draw_round_prizes prizes
    left join public.draw_round_prize_units units
      on units.draw_round_prize_id = prizes.id
    where prizes.draw_round_id = p_draw_round_id
    group by prizes.tier
  ) tier_rows;

  if campaign.last_prize_unit_id is not null then
    select units.card_id, prizes.tier, units.status
    into last_prize_card_id, last_prize_tier, last_prize_status
    from public.draw_round_prize_units units
    join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
    where units.id = campaign.last_prize_unit_id;
  end if;

  return jsonb_build_object(
    'available', true,
    'drawRoundId', campaign.id,
    'status', campaign.status,
    'totalSlots', coalesce(total_slots, campaign.total_slots),
    'availableSlots', coalesce(available_slots, 0),
    'totalUnits', coalesce(total_units, 0),
    'availableUnits', coalesce(available_units, 0),
    'awardedUnits', coalesce(awarded_units, 0),
    'tiers', tiers,
    'rngVersion', campaign.rng_version,
    'serverSeedHash', campaign.server_seed_hash,
    'serverSeedRevealedAt', campaign.server_seed_revealed_at,
    'lastPrize', case
      when campaign.last_prize_unit_id is null then null
      else jsonb_build_object(
        'unitId', campaign.last_prize_unit_id,
        'cardId', last_prize_card_id,
        'tier', last_prize_tier,
        'status', last_prize_status
      )
    end
  );
end;
$$;

revoke all on function public.get_draw_round_public_odds(uuid) from public;
grant execute on function public.get_draw_round_public_odds(uuid) to anon, authenticated, service_role;
