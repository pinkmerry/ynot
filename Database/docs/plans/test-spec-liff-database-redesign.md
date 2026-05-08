# Test Spec — Same-Database LIFF + Website Architecture

## Migration/Schema Tests

- Apply migrations on local/staging from clean current schema.
- Capture pre/post counts for existing LIFF tables: `profiles`, `admin_users`, `draw_rounds`, `draw_slots`, `orders`, `payment_slips`, `order_picks`, `cards`, `draw_round_prizes`, `lucky_draw_realtime_events`.
- Assert no existing `profiles.id` or `admin_users.profile_id` changes.
- Assert every existing non-null `profiles.line_user_id` has a `user_identities(provider in ('legacy_line','line'))` row.
- Assert `profiles.line_user_id` accepts null and remains unique when non-null.
- Assert `profiles.auth_user_id` is unique nullable and references `auth.users`.
- Regenerate Supabase types and run typecheck after this phase; `profiles.line_user_id` is nullable in generated types and app session code does not require it from DB.
- Assert `user_addresses` is created in Phase 1, backfills existing profile address fields where present, and owner/admin RLS works.
- Assert `payment_slips` owner XOR constraint: exactly one of `order_id` or `top_up_request_id`.
- Assert `wallet_accounts` exists and balance-changing RPCs lock/update it.
- Assert ledger reference uniqueness constraints prevent duplicate top-up/gacha/exchange/refund effects.
- Assert identity rows use exact provider subjects: verified normalized email for email, Google `sub` or documented identity ID fallback, LINE `sub`.

## Auth/Identity Tests

- Email signup creates auth user, profile, and identity row.
- Google login creates/links auth identity and profile.
- Existing LINE session route still upserts/loads same profile by LINE subject.
- Logged-in website user connecting unused LINE subject links identity to same profile after valid OAuth `state` and ID-token `nonce` validation.
- LINE subject already attached to another non-empty profile creates merge request.
- LINE connect/login rejects missing/mismatched/replayed `state` and `nonce`.
- Production LIFF session creation fails closed when `LINE_SESSION_SECRET` is absent; no service-role fallback signs cookies.
- Admin merge transaction moves/consolidates identities, ledger, inventory, addresses, exchange/shipping rows, and writes audit events.

## RLS/Security Tests

- Anonymous cannot read private profile, identity, address, slip, ledger, collection, exchange, shipping, or audit rows.
- Authenticated user can read/update only own profile/address and own allowed request rows.
- User A cannot access User B slip/ledger/collection/exchange/shipping rows.
- Admin can access management rows only when `admin_users.is_active = true`.
- Security-definer helpers live outside exposed schema.
- Views exposed to clients are `security_invoker` or access-revoked.
- Payment slip storage remains private; signed/admin/server access only.

## Payment/Ledger Tests

- Top-up request can be created by owner profile only.
- Slip upload respects MIME/size/path ownership.
- `idempotency_keys` is created before payment/ledger RPCs and duplicate idempotency replay returns a safe repeated/no-op result.
- Admin approval changes top-up status to approved and inserts exactly one positive ledger row.
- Duplicate approval retry returns same result or no-op without double credit.
- Rejection does not credit ledger and stores review note/audit event.

## Gacha/Collection Tests

- `open_gacha` rejects unauthenticated, insufficient balance, inactive campaign, and limit violations.
- Successful open atomically locks `wallet_accounts`, inserts negative ledger, gacha open, result items, collection items, audit, and realtime event.
- Duplicate idempotency key or duplicate financial reference does not double spend or double issue collection items; gacha/exchange/shipping reuse the Phase 3 idempotency infrastructure.
- Concurrent gacha opens cannot overdraw balance.

## Exchange/Shipping Tests

- Exchange submit locks owned collection items.
- Exchange approval consumes items and credits ledger exactly once.
- Shipping request locks owned items and requires valid own address.
- Admin shipping update stores tracking and item status transitions.

## LIFF Compatibility Tests

- `/api/line/session` still verifies LINE and writes session cookie.
- `/api/lucky-draw` legacy order path still works for LINE users while supported.
- `/api/lucky-draw/picks` still enforces duplicate/exact slot checks and `claim_order_slots` behavior.
- Existing public realtime event table still triggers legacy LIFF refetch for public-safe draw events.
- Private/user/admin realtime events use RLS-scoped stream and cannot be read by anonymous users or other profiles.
- Legacy order/slip writes do not expose private order/payment identifiers through public realtime.
- Top-up slip inserts do not emit public `payments` events.
- Anonymous users can read only public draw/card/slot-safe realtime topics.
- Generated Supabase types and typecheck pass after each schema phase that changes app-visible schema.

## E2E Acceptance

- Website user signs up without LINE, tops up by slip, admin approves, opens gacha, sees collection, requests exchange/shipping.
- Same user connects LINE and sees the same balance/history/collection.
- Existing LIFF user flow still works.
- Non-admin cannot see admin navigation and receives server denial for admin APIs.
- Admin can manage settings/payment methods/campaigns/cards/top-ups/slips/merge/exchange/shipping/ranking/audit.
