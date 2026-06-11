-- low_risk_db_optimization
--
-- Low-risk read-path optimization only. This migration must not touch
-- open_gacha_campaign, prize-unit assignment, wallet debit, idempotency, or
-- public pack-open response fields.

create index if not exists draw_round_categories_round_category_idx
  on public.draw_round_categories(draw_round_id, category_id);
