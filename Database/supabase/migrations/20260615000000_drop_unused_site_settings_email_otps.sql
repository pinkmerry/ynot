-- Drop two confirmed-unused tables to reduce schema sprawl. Verified 2026-06-15.
--
-- site_settings: created in 20260507032000_phase2_platform_wallet_gacha.sql but
--   never read or written by any application code, RPC, trigger, or verification
--   script. Its only attachments are an admin-read RLS policy and a
--   touch_updated_at trigger; both are removed automatically by the cascade.
--
-- email_otps: created in 20260513000000_identity_first_anchors.sql for an early
--   email-OTP / identity-link flow that was superseded by
--   pending_signup_email_codes (20260522080000). No application code references
--   it; the live OTP routes use pending_signup_email_codes only.
--
-- Neither table has an inbound foreign key, so cascade cannot drop a live table.
-- This migration changes nothing used by stock, pack creation, edit-live pack,
-- coin conversion, or image flows. Both drops are reversible from their original
-- creating migrations if ever needed.

drop table if exists public.site_settings cascade;
drop table if exists public.email_otps cascade;
