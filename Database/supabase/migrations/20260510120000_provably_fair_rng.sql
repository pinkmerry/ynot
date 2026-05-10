-- Sprint 1 — Provably-fair RNG core (Toreca-parity).
-- Replaces ORDER BY random() in open_gacha_campaign with an HMAC-SHA256 deterministic
-- pick driven by a per-campaign server_seed (committed via published hash) and a
-- per-open client_seed + nonce. Once a campaign is closed, the server_seed can be
-- revealed so anyone can replay the draws and verify the result.

-- 1. draw_rounds: seed columns -------------------------------------------------

alter table public.draw_rounds
  add column if not exists server_seed text,
  add column if not exists server_seed_hash text,
  add column if not exists server_seed_revealed_at timestamptz,
  add column if not exists rng_version smallint not null default 1;

comment on column public.draw_rounds.server_seed is
  'Per-campaign HMAC key. Hidden from clients until server_seed_revealed_at is set.';
comment on column public.draw_rounds.server_seed_hash is
  'sha256(server_seed) — published before any open so the seed is committed.';
comment on column public.draw_rounds.server_seed_revealed_at is
  'When set, the server_seed becomes publicly readable so players can verify draws.';

-- Defense in depth: column-level revoke so even a missing RLS policy or a
-- `select *` from anon/authenticated cannot leak the unrevealed server_seed.
-- get_draw_round_public_rng is the only path clients should use.
revoke select (server_seed) on public.draw_rounds from anon, authenticated;

-- 2. trigger: auto-fill seed + hash on insert ---------------------------------

create or replace function app_private.draw_rounds_fill_seed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.server_seed is null then
    new.server_seed := encode(gen_random_bytes(32), 'hex');
  end if;
  if new.server_seed_hash is null then
    new.server_seed_hash := encode(digest(new.server_seed, 'sha256'), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists draw_rounds_fill_seed on public.draw_rounds;
create trigger draw_rounds_fill_seed
before insert on public.draw_rounds
for each row execute function app_private.draw_rounds_fill_seed();

-- 3. backfill existing draw_rounds --------------------------------------------

update public.draw_rounds
set server_seed = encode(gen_random_bytes(32), 'hex')
where server_seed is null;

update public.draw_rounds
set server_seed_hash = encode(digest(server_seed, 'sha256'), 'hex')
where server_seed_hash is null
  and server_seed is not null;

alter table public.draw_rounds
  alter column server_seed set not null,
  alter column server_seed_hash set not null;

-- 4. gacha_opens / gacha_open_items: rng metadata -----------------------------

alter table public.gacha_opens
  add column if not exists client_seed text,
  add column if not exists rng_version smallint;

alter table public.gacha_open_items
  add column if not exists nonce bigint,
  add column if not exists rng_input text,
  add column if not exists rng_output_hex text,
  add column if not exists rng_pool_size integer,
  add column if not exists rng_pool_index integer;

comment on column public.gacha_opens.client_seed is
  'Player-supplied or auto-generated entropy for one open. Combined with server_seed via HMAC.';
comment on column public.gacha_open_items.rng_input is
  'Exact HMAC input string used to derive this item: client_seed:gacha_open_id:nonce.';
comment on column public.gacha_open_items.rng_output_hex is
  'hex(hmac_sha256(server_seed, rng_input)). Truncated to 56 bits → mod pool_size → index.';

-- 5. drop the old open_gacha_campaign(uuid, uuid, integer, text) --------------

drop function if exists public.open_gacha_campaign(uuid, uuid, integer, text);

-- 6. new open_gacha_campaign with deterministic pick --------------------------

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
  slot_id uuid;
  unit_id uuid;
  unit_prize_id uuid;
  unit_card_id uuid;
  unit_tier text;
  unit_value_thb integer;
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

  -- campaign-level lock serializes all opens for the same draw_round
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

    -- count remaining available units
    select count(*)::integer into v_pool_size
    from public.draw_round_prize_units
    where draw_round_id = p_draw_round_id
      and status = 'available';

    if v_pool_size < 1 then
      raise exception 'not_enough_prize_inventory';
    end if;

    -- HMAC-derive a deterministic index into the available pool
    v_nonce := position_index::bigint;
    v_rng_input := v_client_seed || ':' || open_row.id::text || ':' || v_nonce::text;
    v_rng_hex := encode(hmac(v_rng_input, campaign.server_seed, 'sha256'), 'hex');
    -- take the first 14 hex chars = 56 bits, fits in bigint, then mod pool_size
    v_rng_index := (('x' || substring(v_rng_hex from 1 for 14))::bit(56)::bigint) % v_pool_size::bigint;

    -- resolve the unit at row_number = v_rng_index (ordered by id for stability)
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

    if unit_id is null then
      raise exception 'rng_pick_failed';
    end if;

    -- lock the chosen unit and load tier/value via the prize join
    select units.id, units.draw_round_prize_id, units.card_id, prizes.tier, prizes.value_thb
    into unit_id, unit_prize_id, unit_card_id, unit_tier, unit_value_thb
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
          'rngPoolSize', v_pool_size
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
      'rngPoolIndex', v_rng_index
    ));
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

-- 7. public RNG metadata RPC --------------------------------------------------

create or replace function public.get_draw_round_public_rng(
  p_draw_round_id uuid
)
returns jsonb
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'drawRoundId', dr.id,
    'rngVersion', dr.rng_version,
    'serverSeedHash', dr.server_seed_hash,
    'serverSeedRevealedAt', dr.server_seed_revealed_at,
    'serverSeed', case when dr.server_seed_revealed_at is not null then dr.server_seed else null end
  )
  from public.draw_rounds dr
  where dr.id = p_draw_round_id;
$$;

revoke all on function public.get_draw_round_public_rng(uuid) from public;
grant execute on function public.get_draw_round_public_rng(uuid) to anon, authenticated, service_role;

-- 8. admin reveal of server_seed ---------------------------------------------

create or replace function public.reveal_draw_round_seed(
  p_draw_round_id uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
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

  if campaign.status not in ('closed', 'archived') then
    raise exception 'campaign_not_closed';
  end if;

  if campaign.server_seed_revealed_at is null then
    update public.draw_rounds
    set server_seed_revealed_at = now()
    where id = p_draw_round_id;
    campaign.server_seed_revealed_at := now();

    insert into public.audit_events(
      actor_admin_id, event_type, draw_round_id, metadata
    ) values (
      p_admin_id, 'rng_seed_revealed', p_draw_round_id,
      jsonb_build_object('serverSeedHash', campaign.server_seed_hash)
    );
  end if;

  return jsonb_build_object(
    'drawRoundId', campaign.id,
    'serverSeed', campaign.server_seed,
    'serverSeedHash', campaign.server_seed_hash,
    'serverSeedRevealedAt', campaign.server_seed_revealed_at
  );
end;
$$;

revoke all on function public.reveal_draw_round_seed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reveal_draw_round_seed(uuid, uuid) to service_role;
