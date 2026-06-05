-- Owner-only admin tool: fully purge a NON-LIVE (draft/closed/archived) random
-- pack and all its play data, refund the coins spent opening it, and release the
-- stock it held — atomically, in one transaction.
--
-- Why a dedicated RPC: the normal archive/release path
-- (release_campaign_reservations) hard-rejects packs with AWARDED inventory, and
-- the catalog "delete card" path is blocked while any pack references the card or
-- active stock exists. A test pack that was opened to exhaustion (awarded units +
-- gacha_opens + collection_items + coin spend) can't be removed by those paths.
--
-- Guards (defense in depth — the API also owner-gates the action):
--   * caller must be an active OWNER admin,
--   * the pack must NOT be live/public (never touch a real live pack),
--   * no awarded card from this pack may already be in an exchange/shipping order
--     (those are real fulfilment records — refuse rather than destroy them).
--
-- FK-safe order (verified against every referencing migration):
--   gacha_opens -> draw_rounds is ON DELETE RESTRICT and audit_events.draw_round_id
--   is NO ACTION, so opens + audit must be deleted before the round. prize_units ->
--   prizes is RESTRICT, so units are deleted before prizes. card_stock_units
--   allocation pointers are ON DELETE SET NULL (leaving status='allocated'
--   orphaned), so stock is explicitly flipped back to 'available' here.

create or replace function public.purge_test_draw_round(
  p_draw_round_id uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  campaign public.draw_rounds%rowtype;
  v_admin_role text;
  v_open_ids uuid[];
  v_released_stock integer := 0;
  v_refunded_coins bigint := 0;
  v_deleted_opens integer := 0;
  v_deleted_collection integer := 0;
  v_w record;
  v_wallet public.wallet_accounts%rowtype;
begin
  if p_draw_round_id is null then raise exception 'campaign_required'; end if;
  if p_admin_id is null then raise exception 'active_admin_required'; end if;

  -- Owner-only, active admin.
  select role into v_admin_role
  from public.admin_users
  where id = p_admin_id and is_active;
  if v_admin_role is null then raise exception 'active_admin_required'; end if;
  if v_admin_role <> 'owner' then raise exception 'owner_role_required'; end if;

  -- Lock the round for the whole tx so a concurrent open can't race the purge.
  select * into campaign
  from public.draw_rounds where id = p_draw_round_id for update;
  if campaign.id is null then raise exception 'campaign_not_found'; end if;

  -- Never purge a live pack. (Only status='live' AND visibility='public' is
  -- customer-visible; a non-live pack is hidden regardless of its stale
  -- visibility flag, so gate purely on status='live'.)
  if campaign.status = 'live' then
    raise exception 'cannot_purge_live_pack';
  end if;

  v_open_ids := array(
    select id from public.gacha_opens where draw_round_id = p_draw_round_id
  );

  -- Refuse if any awarded card from this pack is in an exchange / shipping order
  -- (real fulfilment data we must not silently destroy).
  if exists (
    select 1 from public.exchange_order_items eoi
    join public.collection_items ci on ci.id = eoi.collection_item_id
    where ci.source_type = 'gacha_open' and ci.source_id = any(v_open_ids)
  ) or exists (
    select 1 from public.shipping_request_items sri
    join public.collection_items ci on ci.id = sri.collection_item_id
    where ci.source_type = 'gacha_open' and ci.source_id = any(v_open_ids)
  ) then
    raise exception 'round_has_exchange_or_shipping_items';
  end if;

  -- Refuse if any legacy lucky-draw order references this round (orders ->
  -- draw_rounds is NO ACTION and would hard-block the final round delete).
  if exists (select 1 from public.orders where draw_round_id = p_draw_round_id) then
    raise exception 'round_has_orders';
  end if;

  -- 1. Refund the coins spent, one consolidated credit per wallet. reference_id is
  --    left NULL so the partial unique index on (reference_type, reference_id,
  --    entry_type) does not collide across multiple profiles; the round id is kept
  --    in metadata. Idempotent via the NOT EXISTS guard.
  for v_w in
    select go.profile_id as profile_id, sum(go.cost_coins)::integer as refund_coins
    from public.gacha_opens go
    where go.draw_round_id = p_draw_round_id
      and go.status = 'completed'
    group by go.profile_id
  loop
    insert into public.wallet_accounts(profile_id)
    values (v_w.profile_id) on conflict (profile_id) do nothing;
    select * into v_wallet
    from public.wallet_accounts where profile_id = v_w.profile_id for update;

    if not exists (
      select 1 from public.coin_ledger
      where entry_type = 'refund'
        and profile_id = v_w.profile_id
        and metadata->>'drawRoundId' = p_draw_round_id::text
    ) then
      insert into public.coin_ledger(
        profile_id, wallet_profile_id, entry_type, amount_coins,
        balance_before, balance_after, reference_type, reference_id, metadata
      ) values (
        v_w.profile_id, v_w.profile_id, 'refund', v_w.refund_coins,
        v_wallet.balance_coins, v_wallet.balance_coins + v_w.refund_coins,
        'draw_round', null,
        jsonb_build_object(
          'reason', 'purge_test_draw_round',
          'drawRoundId', p_draw_round_id,
          'adminId', p_admin_id)
      );
      update public.wallet_accounts
      set balance_coins = balance_coins + v_w.refund_coins,
          version = version + 1
      where profile_id = v_w.profile_id;
      v_refunded_coins := v_refunded_coins + v_w.refund_coins;
    end if;
  end loop;

  -- 2. Delete the original gacha_spend ledger rows (loose reference_id, no cascade).
  delete from public.coin_ledger
  where reference_type = 'gacha_open'
    and reference_id = any(v_open_ids)
    and entry_type = 'gacha_spend';

  -- 3. Delete the cards these opens minted (loose source_id, not cascaded).
  delete from public.collection_items
  where source_type = 'gacha_open' and source_id = any(v_open_ids);
  get diagnostics v_deleted_collection = row_count;

  -- 4. Delete audit rows for the round/opens (draw_round_id is NO ACTION — blocks
  --    the round delete otherwise).
  delete from public.audit_events
  where draw_round_id = p_draw_round_id
     or gacha_open_id = any(v_open_ids);

  -- 5. Delete the opens (RESTRICT from draw_rounds — the primary blocker). This
  --    cascades gacha_open_items and SET-NULLs the prize-unit/last-prize pointers.
  delete from public.gacha_opens where draw_round_id = p_draw_round_id;
  get diagnostics v_deleted_opens = row_count;

  -- 6. Release this pack's reservations (audited before they cascade away).
  update public.card_stock_reservations r
  set status = 'released',
      released_by_admin_id = p_admin_id,
      released_at = now(),
      metadata = coalesce(r.metadata, '{}'::jsonb)
                 || jsonb_build_object('reason', 'purge_test')
  where r.draw_round_id = p_draw_round_id
    and r.status in ('reserved', 'allocated');

  -- 7. Delete this pack's prize units (RESTRICT to prizes — must precede prizes),
  --    flip the slabs this pack held back to 'available' (scoped strictly by
  --    allocated_draw_round_id so a card shared with another pack is untouched),
  --    and ledger each release.
  with freed as (
    delete from public.draw_round_prize_units u
    where u.draw_round_id = p_draw_round_id
    returning u.card_stock_unit_id
  ),
  rel as (
    update public.card_stock_units s
    set status = 'available',
        reserved_by_admin_id = null,
        allocated_draw_round_id = null,
        allocated_draw_round_prize_id = null,
        metadata = coalesce(s.metadata, '{}'::jsonb)
                   || jsonb_build_object('releasedByAdminId', p_admin_id, 'reason', 'purge_test'),
        updated_at = now()
    where s.allocated_draw_round_id = p_draw_round_id
      and s.status in ('allocated', 'reserved')
    returning s.id, s.card_id
  ),
  led as (
    insert into public.card_stock_ledger(
      stock_unit_id, card_id, draw_round_id, event_type, actor_admin_id, metadata)
    select rel.id, rel.card_id, p_draw_round_id, 'reservation_released', p_admin_id,
           jsonb_build_object('reason', 'purge_test')
    from rel
    returning 1
  )
  select count(*)::integer into v_released_stock from rel;

  -- 8. Delete the prizes, then the round. The round delete cascades draw_slots,
  --    draw_round_categories, draw_round_testers, card_stock_reservations and the
  --    realtime-event rows.
  delete from public.draw_round_prizes where draw_round_id = p_draw_round_id;
  delete from public.draw_rounds where id = p_draw_round_id;

  insert into public.audit_events(actor_admin_id, event_type, metadata)
  values (
    p_admin_id, 'test_draw_round_purged',
    jsonb_build_object(
      'drawRoundId', p_draw_round_id,
      'releasedStockUnits', v_released_stock,
      'refundedCoins', v_refunded_coins,
      'deletedOpens', v_deleted_opens,
      'deletedCollectionItems', v_deleted_collection)
  );

  return jsonb_build_object(
    'ok', true,
    'drawRoundId', p_draw_round_id,
    'releasedStockUnits', v_released_stock,
    'refundedCoins', v_refunded_coins,
    'deletedOpens', v_deleted_opens,
    'deletedCollectionItems', v_deleted_collection
  );
end;
$$;

revoke all on function public.purge_test_draw_round(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purge_test_draw_round(uuid, uuid) to service_role;
