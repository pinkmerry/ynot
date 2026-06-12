-- weighted_api_rate_limit
--
-- Count high-cost API operations by units instead of only HTTP requests. This
-- lets pack opening preserve normal play while stopping high-volume bursts.

create or replace function public.consume_api_rate_limit_weighted(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_cost integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_reset timestamptz;
  limiter public.api_rate_limits%rowtype;
  effective_cost integer;
begin
  if coalesce(length(trim(p_key)), 0) = 0 then
    raise exception 'rate limit key is required';
  end if;

  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit configuration';
  end if;

  effective_cost := greatest(coalesce(p_cost, 1), 1);
  next_reset := now() + make_interval(secs => p_window_seconds);

  insert into public.api_rate_limits as limits(
    key,
    window_start,
    expires_at,
    count,
    updated_at
  )
  values (
    p_key,
    now(),
    next_reset,
    effective_cost,
    now()
  )
  on conflict (key) do update
  set
    window_start = case
      when limits.expires_at <= now() then now()
      else limits.window_start
    end,
    expires_at = case
      when limits.expires_at <= now() then next_reset
      else limits.expires_at
    end,
    count = case
      when limits.expires_at <= now() then effective_cost
      else limits.count + effective_cost
    end,
    updated_at = now()
  returning * into limiter;

  return jsonb_build_object(
    'allowed', limiter.count <= p_limit,
    'remaining', greatest(p_limit - limiter.count, 0),
    'resetAt', limiter.expires_at,
    'cost', effective_cost
  );
end;
$$;

revoke all on function public.consume_api_rate_limit_weighted(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit_weighted(text, integer, integer, integer) to service_role;
