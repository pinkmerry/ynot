-- Remove obsolete card/prize tone fields after website + LIFF no longer read/write
-- gold/red/blue/green/rose/violet. Apply after the compatibility deploy is live.

-- Historical draw JSON stored LIFF/admin card drafts; strip visual-only tone keys so
-- backups/exported JSON no longer carries the obsolete field.
update public.draw_rounds
set featured_cards = coalesce((
  select jsonb_agg(card - 'tone')
  from jsonb_array_elements(coalesce(featured_cards, '[]'::jsonb)) as card
), '[]'::jsonb)
where featured_cards @? '$[*].tone';

update public.draw_rounds
set chase_cards = coalesce((
  select jsonb_agg(card - 'tone')
  from jsonb_array_elements(coalesce(chase_cards, '[]'::jsonb)) as card
), '[]'::jsonb)
where chase_cards @? '$[*].tone';

-- Drop the database columns last. Application code must already be deployed with
-- no tone reads/writes before this migration is applied to production.
alter table if exists public.draw_round_prizes drop column if exists tone;
alter table if exists public.cards drop column if exists tone;
