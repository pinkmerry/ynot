-- Per-prize convert-to-coin values, configurable deadline, and instant-credit
-- conversion RPC. Replaces the manual `exchange_orders` review flow with an
-- auto-credit path that uses the value the admin locks in at pack creation.
--
-- Production apply remains gated by the repository backup/PITR/restore drill
-- rule in Database/README.md.

-- ---------------------------------------------------------------------------
-- 1. Schema: convert-coin value per prize, deadline per pack, snapshots
-- ---------------------------------------------------------------------------
alter table if exists public.draw_round_prizes
  add column if not exists convert_coin_value integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'draw_round_prizes_convert_coin_value_check'
      and conrelid = 'public.draw_round_prizes'::regclass
  ) then
    alter table public.draw_round_prizes
      add constraint draw_round_prizes_convert_coin_value_check
      check (convert_coin_value >= 0 and convert_coin_value <= 10000000);
  end if;
end $$;

alter table if exists public.draw_rounds
  add column if not exists convert_deadline_days integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'draw_rounds_convert_deadline_days_check'
      and conrelid = 'public.draw_rounds'::regclass
  ) then
    alter table public.draw_rounds
      add constraint draw_rounds_convert_deadline_days_check
      check (convert_deadline_days is null or (convert_deadline_days >= 1 and convert_deadline_days <= 3650));
  end if;
end $$;

alter table if exists public.collection_items
  add column if not exists convert_coin_value_snapshot integer,
  add column if not exists convert_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'collection_items_convert_coin_value_snapshot_check'
      and conrelid = 'public.collection_items'::regclass
  ) then
    alter table public.collection_items
      add constraint collection_items_convert_coin_value_snapshot_check
      check (convert_coin_value_snapshot is null or convert_coin_value_snapshot >= 0);
  end if;
end $$;

create index if not exists collection_items_convert_expires_idx
  on public.collection_items(convert_expires_at)
  where convert_expires_at is not null and status = 'owned';

-- ---------------------------------------------------------------------------
-- 2. Trigger: snapshot convert value + expiry whenever a collection_item is
--    inserted via a gacha_open. Centralizes the lookup so we don't have to
--    touch the six existing award RPCs.
-- ---------------------------------------------------------------------------
create or replace function app_private.snapshot_collection_convert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  match_position integer;
  v_coin_value integer;
  v_deadline_days integer;
begin
  if new.source_type <> 'gacha_open' or new.source_id is null then
    return new;
  end if;

  -- serial_no format: '<public_code>-NN' where NN = result_position
  match_position := nullif(regexp_replace(coalesce(new.serial_no, ''), '^.*-(\d+)$', '\1'), coalesce(new.serial_no, ''))::int;
  if match_position is null then
    return new;
  end if;

  select dp.convert_coin_value, dr.convert_deadline_days
    into v_coin_value, v_deadline_days
  from public.gacha_open_items goi
  join public.draw_round_prizes dp on dp.id = goi.draw_round_prize_id
  join public.draw_rounds dr on dr.id = dp.draw_round_id
  where goi.gacha_open_id = new.source_id
    and goi.result_position = match_position
  limit 1;

  if v_coin_value is not null and new.convert_coin_value_snapshot is null then
    new.convert_coin_value_snapshot := v_coin_value;
  end if;
  if v_deadline_days is not null and v_deadline_days > 0 and new.convert_expires_at is null then
    new.convert_expires_at := coalesce(new.acquired_at, now()) + (v_deadline_days || ' days')::interval;
  end if;

  return new;
end;
$$;

drop trigger if exists collection_items_snapshot_convert on public.collection_items;
create trigger collection_items_snapshot_convert
  before insert on public.collection_items
  for each row execute function app_private.snapshot_collection_convert();

-- ---------------------------------------------------------------------------
-- 3. RPC: submit_card_conversion — user-facing, auto-credits wallet
-- ---------------------------------------------------------------------------
create or replace function public.submit_card_conversion(
  p_profile_id uuid,
  p_collection_item_ids uuid[],
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  requested_count integer;
  rows_total_coins integer;
  rows_count integer;
  locked_wallet public.wallet_accounts%rowtype;
  ledger_id uuid;
  existing_ledger public.coin_ledger%rowtype;
begin
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_collection_item_ids is null or cardinality(p_collection_item_ids) = 0 then
    raise exception 'collection_items_required';
  end if;

  select count(distinct item_id) into requested_count
  from unnest(p_collection_item_ids) as item_id;
  if requested_count <> cardinality(p_collection_item_ids) then
    raise exception 'duplicate_collection_items';
  end if;

  -- Idempotency replay: if a ledger entry already exists for this key, return it.
  if p_idempotency_key is not null then
    select * into existing_ledger
    from public.coin_ledger
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
      and entry_type = 'exchange_credit'
    limit 1;
    if existing_ledger.id is not null then
      return jsonb_build_object(
        'status', 'completed',
        'replayed', true,
        'ledgerId', existing_ledger.id,
        'totalCoins', existing_ledger.amount_coins,
        'balanceAfter', existing_ledger.balance_after,
        'itemCount', coalesce((existing_ledger.metadata ->> 'itemCount')::int, 0)
      );
    end if;
  end if;

  -- Lock the rows and validate ownership / status / not expired / has a value.
  perform 1
  from public.collection_items ci
  where ci.id = any(p_collection_item_ids)
    and ci.profile_id = p_profile_id
    and ci.status = 'owned'
  for update;

  select
    count(*)::int,
    coalesce(sum(coalesce(convert_coin_value_snapshot, 0)), 0)::int
  into rows_count, rows_total_coins
  from public.collection_items
  where id = any(p_collection_item_ids)
    and profile_id = p_profile_id
    and status = 'owned'
    and convert_coin_value_snapshot is not null
    and convert_coin_value_snapshot > 0
    and (convert_expires_at is null or convert_expires_at > now());

  if rows_count <> requested_count then
    raise exception 'collection_items_not_convertible';
  end if;
  if rows_total_coins <= 0 then
    raise exception 'no_convert_value';
  end if;

  -- Ensure wallet exists then lock it.
  insert into public.wallet_accounts(profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;

  select * into locked_wallet
  from public.wallet_accounts
  where profile_id = p_profile_id
  for update;

  -- Mark items exchanged.
  update public.collection_items
  set status = 'exchanged'
  where id = any(p_collection_item_ids)
    and profile_id = p_profile_id
    and status = 'owned';

  -- Credit wallet.
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
    'exchange_credit',
    rows_total_coins,
    locked_wallet.balance_coins,
    locked_wallet.balance_coins + rows_total_coins,
    'card_conversion',
    null,
    p_idempotency_key,
    jsonb_build_object(
      'itemCount', requested_count,
      'collectionItemIds', to_jsonb(p_collection_item_ids),
      'source', 'submit_card_conversion'
    )
  )
  returning id into ledger_id;

  update public.wallet_accounts
  set balance_coins = balance_coins + rows_total_coins,
      version = version + 1
  where profile_id = p_profile_id;

  insert into public.audit_events(actor_profile_id, event_type, metadata)
  values (
    p_profile_id,
    'card_conversion_submitted',
    jsonb_build_object(
      'itemCount', requested_count,
      'totalCoins', rows_total_coins,
      'ledgerId', ledger_id
    )
  );

  return jsonb_build_object(
    'status', 'completed',
    'ledgerId', ledger_id,
    'totalCoins', rows_total_coins,
    'balanceAfter', locked_wallet.balance_coins + rows_total_coins,
    'itemCount', requested_count,
    'replayed', false
  );
end;
$$;

revoke all on function public.submit_card_conversion(uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.submit_card_conversion(uuid, uuid[], text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Backfill existing owned collection_items with snapshots where possible.
--    For items already in 'owned' status before this migration, attempt to
--    look up the convert value via gacha_open_items + draw_round_prizes.
-- ---------------------------------------------------------------------------
update public.collection_items ci
set convert_coin_value_snapshot = dp.convert_coin_value
from public.gacha_open_items goi
join public.draw_round_prizes dp on dp.id = goi.draw_round_prize_id
where ci.source_type = 'gacha_open'
  and ci.source_id = goi.gacha_open_id
  and ci.status = 'owned'
  and ci.convert_coin_value_snapshot is null
  and goi.result_position = nullif(regexp_replace(coalesce(ci.serial_no, ''), '^.*-(\d+)$', '\1'), coalesce(ci.serial_no, ''))::int
  and dp.convert_coin_value > 0;

-- ---------------------------------------------------------------------------
-- 5. Migrate in-flight exchange_orders to the new auto-credit model.
--    Any orders still in 'submitted' status are honored at the previously
--    promised value (10 coins/card from the legacy hardcoded path) so users
--    don't lose anything they already requested.
-- ---------------------------------------------------------------------------
do $$
declare
  pending_order public.exchange_orders%rowtype;
  pending_items_total integer;
  service_admin_id uuid;
  pending_wallet public.wallet_accounts%rowtype;
begin
  -- Find any active admin to attribute the auto-approvals to (otherwise null).
  select id into service_admin_id
  from public.admin_users
  where is_active = true
  order by created_at asc
  limit 1;

  for pending_order in
    select * from public.exchange_orders
    where status = 'submitted'
    for update
  loop
    select coalesce(sum(coin_value_snapshot), 0)::int
      into pending_items_total
    from public.exchange_order_items
    where exchange_order_id = pending_order.id;

    if pending_items_total <= 0 then
      pending_items_total := pending_order.requested_coin_value;
    end if;
    if pending_items_total <= 0 then
      continue;
    end if;

    insert into public.wallet_accounts(profile_id)
    values (pending_order.profile_id)
    on conflict (profile_id) do nothing;

    select * into pending_wallet
    from public.wallet_accounts
    where profile_id = pending_order.profile_id
    for update;

    update public.exchange_orders
    set status = 'approved',
        approved_coin_value = pending_items_total,
        reviewed_by_admin_id = service_admin_id,
        admin_note = coalesce(admin_note, '') || ' [auto-approved by 20260525100000_card_convert_to_coin migration]'
    where id = pending_order.id;

    update public.collection_items ci
    set status = 'exchanged'
    from public.exchange_order_items eoi
    where eoi.exchange_order_id = pending_order.id
      and eoi.collection_item_id = ci.id
      and ci.status = 'exchange_requested';

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
      created_by_admin_id,
      metadata
    ) values (
      pending_order.profile_id,
      pending_order.profile_id,
      'exchange_credit',
      pending_items_total,
      pending_wallet.balance_coins,
      pending_wallet.balance_coins + pending_items_total,
      'exchange_order',
      pending_order.id,
      pending_order.idempotency_key,
      service_admin_id,
      jsonb_build_object(
        'autoApprovedByMigration', '20260525100000_card_convert_to_coin',
        'publicCode', pending_order.public_code
      )
    );

    update public.wallet_accounts
    set balance_coins = balance_coins + pending_items_total,
        version = version + 1
    where profile_id = pending_order.profile_id;

    insert into public.audit_events(actor_admin_id, event_type, exchange_order_id, metadata)
    values (
      service_admin_id,
      'exchange_approved',
      pending_order.id,
      jsonb_build_object(
        'autoApprovedByMigration', '20260525100000_card_convert_to_coin',
        'amount_coins', pending_items_total
      )
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Drop the legacy exchange RPCs. Tables stay for audit-history visibility.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_exchange_order(uuid, uuid[], text, text);
drop function if exists public.approve_exchange_order(uuid, uuid, integer, text);
drop function if exists public.reject_exchange_order(uuid, uuid, text);
