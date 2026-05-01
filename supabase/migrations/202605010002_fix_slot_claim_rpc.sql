create or replace function public.claim_order_slots(
  p_order_id uuid,
  p_slot_numbers integer[],
  p_actor_profile_id uuid default null,
  p_actor_admin_id uuid default null
)
returns table(order_id uuid, slot_number integer, pick_source text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  locked_order public.orders%rowtype;
  requested_count integer;
  actor_is_admin boolean;
  source_value text;
  bad_slot_count integer;
begin
  if p_slot_numbers is null then
    raise exception 'slot_numbers_required';
  end if;

  select coalesce(exists (
    select 1
    from public.admin_users au
    where au.id = p_actor_admin_id
      and au.is_active
  ), false)
  into actor_is_admin;

  if cardinality(p_slot_numbers) = 0 and not actor_is_admin then
    raise exception 'slot_numbers_required';
  end if;

  select count(distinct requested.slot_number)
  into requested_count
  from unnest(p_slot_numbers) as requested(slot_number);

  if requested_count <> cardinality(p_slot_numbers) then
    raise exception 'duplicate_slot_numbers';
  end if;

  select *
  into locked_order
  from public.orders
  where id = p_order_id
  for update;

  if locked_order.id is null then
    raise exception 'order_not_found';
  end if;

  if locked_order.status not in ('approved_for_pick', 'picked') then
    raise exception 'order_not_approved_for_pick';
  end if;

  if not actor_is_admin and locked_order.profile_id is distinct from p_actor_profile_id then
    raise exception 'not_allowed_to_pick_for_order';
  end if;

  if requested_count > locked_order.quantity then
    raise exception 'pick_count_exceeds_order_quantity';
  end if;

  select count(*)
  into bad_slot_count
  from unnest(p_slot_numbers) as requested(slot_number)
  left join public.draw_slots ds
    on ds.draw_round_id = locked_order.draw_round_id
    and ds.slot_number = requested.slot_number
  where ds.id is null or ds.status in ('opened', 'void');

  if bad_slot_count > 0 then
    raise exception 'invalid_slot_numbers';
  end if;

  perform 1
  from public.draw_slots ds
  where ds.draw_round_id = locked_order.draw_round_id
    and ds.slot_number = any(p_slot_numbers)
  for update;

  if exists (
    select 1
    from public.order_picks op
    join public.draw_slots ds on ds.id = op.draw_slot_id
    where ds.draw_round_id = locked_order.draw_round_id
      and ds.slot_number = any(p_slot_numbers)
      and op.order_id <> locked_order.id
  ) then
    raise exception 'slot_already_picked';
  end if;

  delete from public.order_picks op
  using public.draw_slots ds
  where op.draw_slot_id = ds.id
    and op.order_id = locked_order.id
    and ds.draw_round_id = locked_order.draw_round_id
    and (cardinality(p_slot_numbers) = 0 or ds.slot_number <> all(p_slot_numbers))
    and locked_order.status <> 'opened';

  update public.draw_slots ds
  set status = 'available'
  where ds.draw_round_id = locked_order.draw_round_id
    and not exists (
      select 1
      from public.order_picks op
      where op.draw_slot_id = ds.id
    )
    and ds.status = 'picked';

  source_value := case when actor_is_admin then 'admin' else 'customer' end;

  insert into public.order_picks (
    order_id,
    draw_slot_id,
    picked_by_profile_id,
    picked_by_admin_id,
    pick_source
  )
  select
    locked_order.id,
    ds.id,
    case when source_value = 'customer' then p_actor_profile_id else null end,
    case when source_value = 'admin' then p_actor_admin_id else null end,
    source_value
  from public.draw_slots ds
  where ds.draw_round_id = locked_order.draw_round_id
    and ds.slot_number = any(p_slot_numbers)
  on conflict on constraint order_picks_order_id_draw_slot_id_key do nothing;

  update public.draw_slots ds
  set status = 'picked'
  where ds.draw_round_id = locked_order.draw_round_id
    and ds.slot_number = any(p_slot_numbers);

  update public.orders o
  set status = case
      when requested_count = locked_order.quantity then 'picked'
      else 'approved_for_pick'
    end
  where o.id = locked_order.id;

  insert into public.audit_events (
    actor_profile_id,
    actor_admin_id,
    event_type,
    draw_round_id,
    order_id,
    metadata
  )
  values (
    case when source_value = 'customer' then p_actor_profile_id else null end,
    case when source_value = 'admin' then p_actor_admin_id else null end,
    'slot_picked',
    locked_order.draw_round_id,
    locked_order.id,
    jsonb_build_object('slot_numbers', p_slot_numbers, 'source', source_value)
  );

  return query
  select op.order_id, ds.slot_number, op.pick_source
  from public.order_picks op
  join public.draw_slots ds on ds.id = op.draw_slot_id
  where op.order_id = locked_order.id
  order by ds.slot_number;
end;
$$;

revoke all on function public.claim_order_slots(uuid, integer[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_order_slots(uuid, integer[], uuid, uuid) to service_role;
