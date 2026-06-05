-- One-shot owner cleanup: fully remove the dead TEST pack op2000coins
-- ("วัน พีช ทู พีช", draw_round ff718dac-7259-40f2-9587-535642cdcc52, archived) so
-- it stops showing up as a "Random pack usage" assignment on the cards it held.
--
-- The verified owner RPC public.purge_test_draw_round() does the full FK-safe
-- teardown (refund the 900k test coins to the two OWNER test accounts, release the
-- 429 dummy "Test 1" units, delete the round's gacha_opens / collection_items /
-- audit_events / prize_units / prizes / round). But it (correctly) refuses while any
-- awarded card from this pack is still in a shipping order. This pack's opens are
-- referenced by 4 TEST shipping requests (SH-1001..1004, owner account, fake
-- tracking) via 12 shipping line-items.
--
-- So we first delete ONLY those 12 shipping line-items (the ones pointing at THIS
-- pack's collection_items), then run the purge. We deliberately do NOT delete the
-- shipping_request headers: SH-1004 also carries one FOREIGN item — the awarded
-- "Gol D. Roger OP09-118" from a different gacha_open — which must stay intact.
-- Removing the line-items is enough to clear the purge guard.
--
-- Atomic: one DO block = one transaction. The RPC's own guards (owner, non-live,
-- no orders, no remaining exchange/shipping) still apply as defense in depth.
do $$
declare
  v_round    uuid := 'ff718dac-7259-40f2-9587-535642cdcc52';
  -- Owner admin running this cleanup (":: YUYA"); the RPC is owner-gated.
  v_admin    uuid := '4182935a-8b9f-4632-8d5b-7aba8bea770c';
  v_open_ids uuid[];
  v_round_ci uuid[];
  v_del_items int;
  v_result   jsonb;
begin
  -- Fail fast if the round is gone or somehow live (the RPC re-checks too).
  -- Idempotent: this one-shot was applied manually; Supabase's migration runner
  -- may re-apply the file. If the round is already gone, the purge is done -> no-op.
  if not exists (select 1 from public.draw_rounds where id = v_round) then
    raise notice 'purge_op2000coins_pack: round % already purged, nothing to do', v_round;
    return;
  end if;
  -- Safety: never touch a live pack.
  if not exists (
    select 1 from public.draw_rounds where id = v_round and status <> 'live'
  ) then
    raise exception 'round_is_live: %', v_round;
  end if;

  v_open_ids := array(
    select id from public.gacha_opens where draw_round_id = v_round
  );
  v_round_ci := array(
    select ci.id
    from public.collection_items ci
    where ci.source_type = 'gacha_open'
      and ci.source_id = any(v_open_ids)
  );

  -- 1. Remove ONLY the shipping line-items that point at THIS dead pack's cards.
  --    This unblocks the purge guard while leaving every shipping_request header
  --    and any foreign line-item (SH-1004's "Gol D. Roger OP09-118") untouched.
  delete from public.shipping_request_items
  where collection_item_id = any(v_round_ci);
  get diagnostics v_del_items = row_count;
  raise notice 'purge_op2000coins_pack: removed % shipping line-items tied to this pack', v_del_items;
  -- Verified count = 12 (across SH-1001..1004). Abort on drift rather than proceed
  -- on a silent 0-row delete; atomic, so this rolls back nothing harmful.
  if v_del_items <> 12 then
    raise exception 'shipping_item_count_drift: removed % (expected 12)', v_del_items;
  end if;

  -- 2. Full FK-safe teardown via the verified owner RPC. The final `delete
  --    draw_rounds` succeeds because every FK into draw_rounds is CASCADE or
  --    SET NULL (confirmed: card_stock_ledger.draw_round_id is ON DELETE SET NULL,
  --    card_stock_reservations.draw_round_id is ON DELETE CASCADE).
  v_result := public.purge_test_draw_round(v_round, v_admin);
  raise notice 'purge_op2000coins_pack: purge result = %', v_result;
end $$;
