# ADR — Same-Database Additive Migration for LIFF + Website

## Decision

Use an additive same-database strangler migration. Keep the existing LIFF Supabase database and current business tables, preserve `profiles.id` as the canonical app profile, add Supabase Auth linkage and a `user_identities` registry, then add wallet/gacha/collection/exchange/shipping tables and transactional RPC/server operations using `wallet_accounts` row locks, ledger reference uniqueness, and private/public realtime separation.

## Drivers

- Existing LIFF database/admin/profile data must stay valid.
- Website users must not need LINE.
- Email/password, Google, and LINE must converge to one account/profile.
- Manual slip payments, coin ledger, inventory, exchange, and shipping require production-grade audit and idempotency.
- RLS/storage/realtime policies must protect PII, payment, wallet, inventory, and admin/user activity data.

## Alternatives Considered

### Clean v2 schema with compatibility views

Rejected as the first production step because it increases migration and RLS/view complexity, risks duplicating LIFF/website behavior, and is harder to roll back.

### Minimal patch to LIFF schema

Rejected because making `line_user_id` optional plus `auth_user_id` is not enough for wallet, collection, exchange, shipping, ranking, admin reconciliation, or atomic financial operations.

## Consequences

- Temporary dual-session compatibility is required: Supabase Auth for website and existing signed LIFF session until LIFF is migrated/bridged.
- Schema names such as `draw_rounds` remain for compatibility until a later low-risk rename/view phase.
- More upfront migration/test/RLS/row-locking work is required, but it avoids duplicated accounts and payment/inventory inconsistencies.
- Legacy LIFF cookie compatibility must be hardened immediately with a dedicated production `LINE_SESSION_SECRET`; the legacy cookie mechanism can remain temporarily only after removing production service-role signing fallback.
- `payment_slips` migration must preserve legacy order slips while adding top-up slips with an XOR owner invariant.
- Public/private realtime separation is a Phase 1 safety gate, not a late cleanup.
- Generated types/typecheck are required after every schema phase to avoid app drift.
- `user_identities.provider_subject` semantics are fixed per provider and must not be inferred from mutable metadata.
- `user_addresses` is a Phase 1 schema object with compatibility backfill; account merge request/event tables with explicit event history and RLS are Phase 2 prerequisites for LINE connect conflict handling; `idempotency_keys` is a Phase 3 prerequisite for retryable payment/ledger and later gacha/exchange/shipping operations.

## Follow-ups

1. Write migration SQL in execution mode only.
2. Test on staging/local before production.
3. Generate updated Supabase types after migrations.
4. Implement `resolveCurrentProfile()` and account-link/merge flows.
5. Implement top-up/ledger/gacha/collection/exchange/shipping in phases with RLS and e2e evidence.
