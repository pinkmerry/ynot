-- One-shot owner cleanup: release the 21 real graded cards that are stuck in
-- status='allocated' on the dead TEST pack op2000coins ("วัน พีช ทู พีช",
-- draw_round ff718dac-7259-40f2-9587-535642cdcc52, archived). The pack was opened
-- to exhaustion by two OWNER test accounts (27 opens, 900k test coins); every real
-- graded unit it held is awarded + reserved and can't be reused until released.
--
-- SAFE / non-destructive: no DELETEs. We do NOT touch the round, the coin ledger,
-- the gacha_opens, the collection_items, or the (test) shipping records — so the
-- award + shipping history stays intact and the shipping_request_items FK stays
-- valid. We only:
--   1. mark each unit's reservation 'released' (it is RESTRICT — must release, not delete),
--   2. detach the dead-round prize_unit from the physical unit (card_stock_unit_id := null,
--      keeping status='awarded' + collection_item_id so the award history is preserved),
--   3. flip each unit back to 'available' and clear its allocation pointers.
--
-- The 429 dummy "Test 1" units (cert_number IS NULL) are intentionally left alone.
--
-- Scoped to an explicit 21-id manifest and guarded: aborts unless every id is still
-- exactly status='allocated' on this round, so a drifted state can't be half-applied.
do $$
declare
  v_round  uuid := 'ff718dac-7259-40f2-9587-535642cdcc52';
  v_ids    uuid[] := array[
    '6fa8c878-8d48-48a7-a9c4-0010b8d69ebc', -- Marshall D. Teach op09-093
    '3090075c-a6fe-4f8c-89c1-5ffc5dd62455', -- Sanji op06-119
    '5e05dff4-4b08-4665-87e8-82d9fee22ae8', -- Saint Ethanbaron V. Nusjuro op13-080
    '9ab1b8f7-67a0-416e-b0bf-67a9b87d2b0f', -- Monkey D. Luffy st21-014
    'ad121ff4-bac4-42b2-a852-831460c3fd13', -- Nami eb03-053
    '933f9f7b-3fae-42c4-a4d0-accdf4b2c41e', -- Saint Marcus Mars op13-091
    '6042d616-a360-4d1d-8b84-32329ce74c47', -- Saint Topman Warcury op13-089
    'c480ce9a-9828-44e0-bc39-4addead3e372', -- Vinsmoke Reiju eb03-031
    'ce4a3ac5-5e35-4851-9fb3-fea265d3f7e8', -- Boa Handcock eb03-026
    '91d6493b-9c09-440a-8592-94a60db63726', -- Tashigi eb03-018
    '8f7ffe43-5530-4f8b-928c-ae47fe2fbe03', -- Saint Jaygarcia Saturn op13-083
    '38f4d44a-327f-4e6a-8e38-a9fc1d807b03', -- Koala eb03-042
    '4d8de779-4f80-472b-9c1a-ec6297c3061e', -- Perona eb03-045
    'f6c402c8-e330-4bc1-86a2-735ef68e108f', -- Roronoa Zoro prb02-006
    '6c8a43ca-a4c9-45ab-8150-0102fe42fa70', -- Kaya op03-044
    'e4a836d5-353a-4623-8ffc-92ea88c1caf3', -- Monkey D. Luffy op01-003
    'fda799f9-1cad-4c9c-9a67-58e9f68c1bce', -- Gecko Moria op06-080
    'bafc5d80-9ac6-4356-9d00-d2d37f6c3609', -- Dracule Mihawk op01-070
    '785a0f0c-2b1b-4604-97fb-5d5991885447', -- Roronoa Zoro op01-001
    'b68ffda7-67e8-43aa-ae57-343f3b0eddde', -- Shanks op09-004 (in a test shipping req; unit freed, shipping kept)
    'ce14614f-6d98-4bf3-85d4-ef9ce988a147'  -- Kaido op04-044
  ];
  -- Owner admin running this cleanup (":: YUYA"), for release attribution.
  v_admin    uuid := '4182935a-8b9f-4632-8d5b-7aba8bea770c';
  v_expected int := array_length(v_ids, 1);
  v_match    int;
  v_resv     int;
  v_detached int;
  v_freed    int;
begin
  -- Precondition: every manifest id must still be allocated to THIS round.
  select count(*) into v_match
  from public.card_stock_units
  where id = any(v_ids)
    and allocated_draw_round_id = v_round
    and status = 'allocated';
  -- Idempotent: this one-shot was applied manually; Supabase's migration runner
  -- may re-apply the file. If none of the manifest units are still allocated to
  -- the round, the work is already done (or the round was purged) -> clean no-op.
  if v_match = 0 then
    raise notice 'release_op2000coins_stuck_stock: nothing allocated to round %, already done', v_round;
    return;
  end if;
  if v_match <> v_expected then
    raise exception 'precondition_failed: expected % units allocated to round %, found %',
      v_expected, v_round, v_match;
  end if;

  -- 1. Release the reservations holding these units (RESTRICT FK -> terminal state).
  --    Attribute the release + leave an audit note in metadata.
  update public.card_stock_reservations
     set status = 'released',
         released_at = now(),
         released_by_admin_id = v_admin,
         metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('released_reason', 'release_op2000coins_stuck_stock'),
         updated_at = now()
   where stock_unit_id = any(v_ids)
     and status in ('reserved', 'allocated');
  get diagnostics v_resv = row_count;
  if v_resv <> v_expected then
    raise exception 'reservation_count_mismatch: released % of % expected', v_resv, v_expected;
  end if;

  -- 2. Detach THIS dead round's prize_units from the physical unit. Keep status='awarded'
  --    + collection_item_id so the award/shipping history is preserved untouched.
  --    Scoped to v_round for defense-in-depth (verified 1:1 unit->prize_unit invariant).
  update public.draw_round_prize_units
     set card_stock_unit_id = null, updated_at = now()
   where card_stock_unit_id = any(v_ids)
     and draw_round_id = v_round;
  get diagnostics v_detached = row_count;
  if v_detached <> v_expected then
    raise exception 'prize_unit_count_mismatch: detached % of % expected', v_detached, v_expected;
  end if;

  -- 3. Free the units back to 'available' and clear their allocation pointers.
  update public.card_stock_units
     set status = 'available',
         allocated_draw_round_id = null,
         allocated_draw_round_prize_id = null,
         updated_at = now()
   where id = any(v_ids)
     and status = 'allocated';
  get diagnostics v_freed = row_count;

  raise notice 'release_op2000coins_stuck_stock: freed % units (reservations released=%, prize_units detached=%)',
    v_freed, v_resv, v_detached;

  if v_freed <> v_expected then
    raise exception 'release_count_mismatch: freed % of % expected', v_freed, v_expected;
  end if;
end $$;
