-- Adjustable random pack logic.
--
-- Production safety: apply only after the normal Supabase backup/PITR gate and
-- owner approval. This migration is intentionally additive except for replacing
-- the gacha dispatcher RPC with the weight/unlock-aware implementation.

alter table if exists public.draw_rounds
  add column if not exists approval_status text not null default 'not_submitted',
  add column if not exists approval_requested_by uuid references public.admin_users(id),
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approved_by uuid references public.admin_users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by uuid references public.admin_users(id),
  add column if not exists rejected_at timestamptz,
  add column if not exists approval_notes text,
  add column if not exists logic_snapshot jsonb not null default '{"mode":"pure_random"}'::jsonb;

alter table if exists public.draw_rounds
  alter column visibility set default 'private';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'draw_rounds_approval_status_check'
      and conrelid = 'public.draw_rounds'::regclass
  ) then
    alter table public.draw_rounds
      add constraint draw_rounds_approval_status_check
      check (approval_status in ('not_submitted', 'pending_review', 'approved', 'rejected', 'changes_requested'));
  end if;
end $$;

update public.draw_rounds
set approval_status = 'pending_review',
    approval_requested_at = coalesce(approval_requested_at, now()),
    approval_notes = coalesce(
      approval_notes,
      'Existing production pack held for owner review before live/public access.'
    ),
    logic_snapshot = coalesce(logic_snapshot, '{"mode":"pure_random"}'::jsonb),
    status = 'draft',
    visibility = 'private'
where approval_status <> 'approved'
  and (
    status in ('live', 'closed')
    or visibility = 'public'
  );

alter table if exists public.draw_round_prizes
  add column if not exists weight numeric(10, 4) not null default 1,
  add column if not exists unlock_at_sold_pct numeric(5, 2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'draw_round_prizes_weight_positive_check'
      and conrelid = 'public.draw_round_prizes'::regclass
  ) then
    alter table public.draw_round_prizes
      add constraint draw_round_prizes_weight_positive_check
      check (weight >= 0 and weight <= 100000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'draw_round_prizes_unlock_pct_check'
      and conrelid = 'public.draw_round_prizes'::regclass
  ) then
    alter table public.draw_round_prizes
      add constraint draw_round_prizes_unlock_pct_check
      check (unlock_at_sold_pct >= 0 and unlock_at_sold_pct <= 100);
  end if;
end $$;

create index if not exists draw_round_prizes_unlock_weight_idx
  on public.draw_round_prizes(draw_round_id, unlock_at_sold_pct, weight);

drop policy if exists "Anyone can read live draw rounds" on public.draw_rounds;
create policy "Anyone can read live draw rounds"
on public.draw_rounds
for select
to anon, authenticated
using (
  status = 'live'
  and visibility = 'public'
  and approval_status = 'approved'
  and coalesce(is_test, false) = false
);

drop policy if exists "Public can read public campaign categories" on public.draw_round_categories;
create policy "Public can read public campaign categories"
on public.draw_round_categories
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.draw_rounds dr
    join public.store_categories sc on sc.id = draw_round_categories.category_id
    where dr.id = draw_round_categories.draw_round_id
      and dr.status in ('live', 'closed')
      and dr.visibility = 'public'
      and dr.approval_status = 'approved'
      and coalesce(dr.is_test, false) = false
      and sc.is_active = true
      and sc.is_test = false
  )
);

drop policy if exists "Anyone can read public live slot status" on public.draw_slots;
create policy "Anyone can read public live slot status"
on public.draw_slots
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.draw_rounds dr
    where dr.id = draw_slots.draw_round_id
      and dr.status = 'live'
      and dr.visibility = 'public'
      and dr.approval_status = 'approved'
      and coalesce(dr.is_test, false) = false
  )
);

drop policy if exists "Anyone can read public live draw prizes" on public.draw_round_prizes;
create policy "Anyone can read public live draw prizes"
on public.draw_round_prizes
for select
to anon, authenticated
using (
  coalesce(is_test, false) = false
  and not (coalesce(metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
  and coalesce(unlock_at_sold_pct, 0) <= (
    select
      case
        when coalesce(dr.total_slots, 0) <= 0 then 100::numeric
        else least(
          100::numeric,
          (
            count(*) filter (where ds.status in ('picked', 'opened'))::numeric
            / greatest(dr.total_slots, 1)::numeric
          ) * 100
        )
      end
    from public.draw_rounds dr
    left join public.draw_slots ds on ds.draw_round_id = dr.id
    where dr.id = draw_round_prizes.draw_round_id
      and dr.status = 'live'
      and dr.visibility = 'public'
      and dr.approval_status = 'approved'
      and coalesce(dr.is_test, false) = false
    group by dr.id, dr.total_slots
  )
  and exists (
    select 1
    from public.draw_rounds dr
    where dr.id = draw_round_prizes.draw_round_id
      and dr.status = 'live'
      and dr.visibility = 'public'
      and dr.approval_status = 'approved'
      and coalesce(dr.is_test, false) = false
  )
);

create or replace function public.open_gacha_campaign(
  p_profile_id uuid,
  p_draw_round_id uuid,
  p_quantity integer default 1,
  p_idempotency_key text default null
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
  slot_id uuid;
  unit_id uuid;
  unit_prize_id uuid;
  unit_card_id uuid;
  unit_tier text;
  unit_value_thb integer;
  unit_weight numeric;
  unit_unlock_at_sold_pct numeric;
  total_cost integer;
  position_index integer;
  ledger_id uuid;
  open_item_id uuid;
  new_collection_item_id uuid;
  available_slot_count integer;
  available_unit_count integer;
  sold_pct numeric;
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
      return jsonb_build_object('status', existing_open.status, 'openId', existing_open.id, 'publicCode', existing_open.public_code, 'replayed', true);
    end if;
  end if;

  select * into campaign
  from public.draw_rounds
  where id = p_draw_round_id
    and status = 'live'
    and visibility = 'public'
    and approval_status = 'approved'
  for update;

  if campaign.id is null then
    raise exception 'campaign_not_live';
  end if;

  if coalesce(campaign.is_test, false) = true and not public.profile_can_open_test_draw_round(p_draw_round_id, p_profile_id) then
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

  select
    case
      when coalesce(campaign.total_slots, 0) <= 0 then 100::numeric
      else least(
        100::numeric,
        (
          count(*) filter (where status in ('picked', 'opened'))::numeric
          / greatest(campaign.total_slots, 1)::numeric
        ) * 100
      )
    end
  into sold_pct
  from public.draw_slots
  where draw_round_id = p_draw_round_id;

  total_cost := coalesce(campaign.cost_coins, greatest(1, ceil(campaign.price_thb::numeric / 100)::integer)) * p_quantity;

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

  insert into public.gacha_opens(profile_id, draw_round_id, cost_coins, quantity, status, idempotency_key, metadata)
  values (p_profile_id, p_draw_round_id, total_cost, p_quantity, 'completed', p_idempotency_key, jsonb_build_object('campaignSlug', campaign.slug, 'isTest', coalesce(campaign.is_test, false), 'logic', coalesce(campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb)))
  returning * into open_row;

  insert into public.coin_ledger(
    profile_id,
    wallet_profile_id,
    entry_type,
    amount_coins,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  ) values (
    p_profile_id,
    p_profile_id,
    'gacha_spend',
    -total_cost,
    locked_wallet.balance_coins,
    locked_wallet.balance_coins - total_cost,
    'gacha_open',
    open_row.id,
    p_idempotency_key,
    jsonb_build_object('drawRoundId', p_draw_round_id, 'quantity', p_quantity, 'isTest', coalesce(campaign.is_test, false), 'logic', coalesce(campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb))
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
    select id into slot_id
    from public.draw_slots
    where draw_round_id = p_draw_round_id
      and status = 'available'
    order by slot_number asc
    limit 1
    for update skip locked;

    if slot_id is null then
      raise exception 'not_enough_available_slots';
    end if;

    update public.draw_slots
    set status = 'opened', opened_at = now()
    where id = slot_id;

    select
      units.id,
      units.draw_round_prize_id,
      units.card_id,
      prizes.tier,
      prizes.value_thb,
      prizes.weight,
      prizes.unlock_at_sold_pct
    into
      unit_id,
      unit_prize_id,
      unit_card_id,
      unit_tier,
      unit_value_thb,
      unit_weight,
      unit_unlock_at_sold_pct
    from public.draw_round_prize_units units
    join public.draw_round_prizes prizes on prizes.id = units.draw_round_prize_id
    where units.draw_round_id = p_draw_round_id
      and units.status = 'available'
      and coalesce(prizes.weight, 1) > 0
      and coalesce(prizes.unlock_at_sold_pct, 0) <= sold_pct
      and not (coalesce(prizes.metadata, '{}'::jsonb) @> '{"adminHidden": true}'::jsonb)
    order by -ln(greatest(random(), 0.000000000001)) / greatest(coalesce(prizes.weight, 1)::double precision, 0.000000000001)
    limit 1
    for update of units skip locked;

    if unit_id is null then
      raise exception 'not_enough_unlocked_prize_inventory';
    end if;

    insert into public.gacha_open_items(gacha_open_id, card_id, draw_round_prize_id, draw_round_prize_unit_id, tier, value_thb, result_position)
    values (open_row.id, unit_card_id, unit_prize_id, unit_id, unit_tier, unit_value_thb, position_index)
    returning id into open_item_id;

    insert into public.collection_items(profile_id, card_id, source_type, source_id, status, serial_no)
    values (p_profile_id, unit_card_id, 'gacha_open', open_row.id, 'owned', open_row.public_code || '-' || lpad(position_index::text, 2, '0'))
    returning id into new_collection_item_id;

    update public.draw_round_prize_units
    set status = 'awarded',
        profile_id = p_profile_id,
        gacha_open_id = open_row.id,
        gacha_open_item_id = open_item_id,
        collection_item_id = new_collection_item_id,
        awarded_at = now(),
        metadata = metadata || jsonb_build_object('slotId', slot_id, 'position', position_index, 'soldPctAtAward', sold_pct, 'weight', unit_weight, 'unlockAtSoldPct', unit_unlock_at_sold_pct)
    where id = unit_id;

    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'cardId', unit_card_id,
      'tier', unit_tier,
      'valueThb', unit_value_thb,
      'position', position_index,
      'prizeUnitId', unit_id,
      'soldPct', sold_pct
    ));
  end loop;

  insert into public.audit_events(actor_profile_id, event_type, draw_round_id, gacha_open_id, metadata)
  values (p_profile_id, 'gacha_opened', p_draw_round_id, open_row.id, jsonb_build_object('quantity', p_quantity, 'cost_coins', total_cost, 'isTest', coalesce(campaign.is_test, false), 'logic', coalesce(campaign.logic_snapshot, '{"mode":"pure_random"}'::jsonb)));

  return jsonb_build_object(
    'status', 'completed',
    'openId', open_row.id,
    'publicCode', open_row.public_code,
    'costCoins', total_cost,
    'items', result_items,
    'remaining', (
      select coalesce(summary, '{}'::jsonb)
      from jsonb_array_elements(public.get_draw_round_inventory_summary(p_draw_round_id, p_profile_id)) with ordinality as s(summary, ord)
      order by ord
      limit 1
    )
  );
end;
$$;

revoke all on function public.open_gacha_campaign(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.open_gacha_campaign(uuid, uuid, integer, text) to service_role;
