-- A normal marketplace cart must not reject a buyer merely because the cart
-- has more than three distinct listings. The existing group lifecycle keeps
-- one child order per listing, so only the arbitrary group-size ceiling is
-- removed; the minimum of two remains because a single listing uses the
-- established single-listing checkout route.

alter table public.marketplace_checkout_groups
  drop constraint if exists marketplace_checkout_groups_item_count_check;

alter table public.marketplace_checkout_groups
  add constraint marketplace_checkout_groups_item_count_check
  check (item_count >= 2);

-- Recreate the already deployed mixed-source creator with its exact current
-- accounting and lifecycle logic, replacing only the two-to-three validation
-- with a two-or-more validation. Reading the preceding migration's deployed
-- function avoids a second divergent copy of the financial transaction.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.marketplace_create_multi_listing_checkout(uuid[],uuid,uuid,text,text,text,integer,integer,jsonb)'::regprocedure
  )
  into function_definition;

  if function_definition is null then
    raise exception 'marketplace_checkout_group_function_missing';
  end if;

  function_definition := regexp_replace(
    function_definition,
    E'if listing_count not between 2 and 3[[:space:]]+or array_length\\(p_listing_ids, 1\\) not between 2 and 3 then[[:space:]]+raise exception ''marketplace_checkout_listing_count_invalid'';[[:space:]]+end if;',
    E'if listing_count < 2 then\n    raise exception ''marketplace_checkout_listing_count_invalid'';\n  end if;'
  );

  if position('if listing_count < 2 then' in function_definition) = 0 then
    raise exception 'marketplace_checkout_group_limit_replacement_failed';
  end if;

  execute function_definition;
end;
$$;
