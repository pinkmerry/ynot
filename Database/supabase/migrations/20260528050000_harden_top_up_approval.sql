-- Prevent wallet crediting from slips that failed verification or were already
-- attached to another accepted payment. The API route has the same guard, but
-- the RPC is the final wallet-credit boundary.

create or replace function public.approve_top_up_request(
  p_top_up_request_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  locked_topup public.top_up_requests%rowtype;
  latest_slip public.payment_slips%rowtype;
  locked_wallet public.wallet_accounts%rowtype;
  inserted_ledger_id uuid;
  existing_ledger public.coin_ledger%rowtype;
  admin_is_active boolean;
begin
  select exists(select 1 from public.admin_users au where au.id = p_admin_id and au.is_active)
  into admin_is_active;
  if not admin_is_active then
    raise exception 'admin_access_required';
  end if;

  select * into locked_topup
  from public.top_up_requests
  where id = p_top_up_request_id
  for update;

  if locked_topup.id is null then
    raise exception 'top_up_not_found';
  end if;

  if locked_topup.status = 'approved' then
    select * into existing_ledger
    from public.coin_ledger
    where reference_type = 'top_up_request'
      and reference_id = locked_topup.id
      and entry_type = 'top_up'
    limit 1;
    return jsonb_build_object('status', 'approved', 'topUpId', locked_topup.id, 'ledgerId', existing_ledger.id);
  end if;

  if locked_topup.status not in ('pending_slip', 'pending_review') then
    raise exception 'top_up_not_reviewable';
  end if;

  select * into latest_slip
  from public.payment_slips
  where top_up_request_id = locked_topup.id
  order by uploaded_at desc
  limit 1
  for update;

  if latest_slip.id is null then
    raise exception 'top_up_slip_required';
  end if;

  if latest_slip.duplicate_of_slip_id is not null
    or latest_slip.verification_status not in ('valid', 'manual_review') then
    raise exception 'top_up_slip_not_approvable:%', latest_slip.verification_status;
  end if;

  insert into public.wallet_accounts(profile_id)
  values (locked_topup.profile_id)
  on conflict (profile_id) do nothing;

  select * into locked_wallet
  from public.wallet_accounts
  where profile_id = locked_topup.profile_id
  for update;

  update public.top_up_requests
  set
    status = 'approved',
    reviewed_by_admin_id = p_admin_id,
    reviewed_at = now(),
    admin_note = p_admin_note,
    submitted_at = coalesce(submitted_at, now())
  where id = locked_topup.id
  returning * into locked_topup;

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
    locked_topup.profile_id,
    locked_topup.profile_id,
    'top_up',
    locked_topup.coin_amount,
    locked_wallet.balance_coins,
    locked_wallet.balance_coins + locked_topup.coin_amount,
    'top_up_request',
    locked_topup.id,
    locked_topup.idempotency_key,
    p_admin_id,
    jsonb_build_object('public_code', locked_topup.public_code, 'amount_thb', locked_topup.amount_thb)
  )
  returning id into inserted_ledger_id;

  update public.wallet_accounts
  set balance_coins = balance_coins + locked_topup.coin_amount,
      version = version + 1
  where profile_id = locked_topup.profile_id;

  update public.payment_slips
  set reviewed_by = p_admin_id,
      reviewed_at = now()
  where top_up_request_id = locked_topup.id;

  insert into public.audit_events(actor_admin_id, event_type, top_up_request_id, metadata)
  values (p_admin_id, 'top_up_approved', locked_topup.id, jsonb_build_object('public_code', locked_topup.public_code, 'coin_amount', locked_topup.coin_amount));

  return jsonb_build_object('status', 'approved', 'topUpId', locked_topup.id, 'ledgerId', inserted_ledger_id);
end;
$$;

revoke all on function public.approve_top_up_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_top_up_request(uuid, uuid, text) to service_role;
