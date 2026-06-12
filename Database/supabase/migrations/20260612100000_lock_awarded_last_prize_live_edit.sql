-- Once the Last Prize has been awarded, live revisions may still update future
-- rewards and pack settings, but they must not rewrite the awarded Last Prize
-- card or convert metadata.
do $migration$
declare
  fn text;
  anchor text := $anchor$  update public.draw_rounds
  set$anchor$;
  guard text := $guard$  if campaign.last_prize_awarded_at is not null and (
    (
      revision.scalar_patch ? 'last_prize_card_id'
      and (
        case
          when nullif(revision.scalar_patch->>'last_prize_card_id', '') is null
            then null::uuid
          else nullif(revision.scalar_patch->>'last_prize_card_id', '')::uuid
        end
      ) is distinct from campaign.last_prize_card_id
    )
    or (
      revision.scalar_patch ? 'last_prize_metadata'
      and coalesce(revision.scalar_patch->'last_prize_metadata', 'null'::jsonb)
        is distinct from coalesce(campaign.last_prize_metadata, 'null'::jsonb)
    )
  ) then
    raise exception 'last_prize_identity_locked_after_award';
  end if;

$guard$;
begin
  select pg_get_functiondef(
    'public.publish_live_campaign_revision(uuid,uuid,text)'::regprocedure
  )
  into fn;

  if fn is null or position(anchor in fn) = 0 then
    raise exception 'publish_live_campaign_revision_last_prize_lock_anchor_missing';
  end if;

  if position('last_prize_identity_locked_after_award' in fn) = 0 then
    fn := replace(fn, anchor, guard || anchor);
  end if;

  if position('last_prize_identity_locked_after_award' in fn) = 0 then
    raise exception 'publish_live_campaign_revision_last_prize_lock_patch_failed';
  end if;

  execute fn;
end;
$migration$;
