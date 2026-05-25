-- L4: 44 of 45 SECURITY DEFINER / trigger functions in the migration history
-- set search_path on the function; app_private.touch_updated_at is the lone
-- exception. Recreate it with a locked search_path for consistency. This is
-- a trigger that runs as the table owner; without a fixed search_path a
-- malicious schema in the caller's path could shadow now() or assign to
-- new.updated_at via a setter trap.
--
-- Behavior unchanged: the function still sets NEW.updated_at = now() and
-- returns NEW. Only the function configuration changes.

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- No grant change needed — the function continues to be called from triggers
-- declared on individual tables, and trigger execution doesn't go through
-- the function's EXECUTE privilege check.
