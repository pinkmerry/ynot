# ADR — YNot Production Website Architecture

- Created: 2026-05-06T13:16:35.773548Z
- Status: Accepted by RALPLAN draft pending final Critic approval
- Source: `.omx/specs/deep-interview-html-full-website.md`

## Decision

Rebuild the YNot production website on Next.js App Router + Supabase Auth SSR + Supabase Postgres/RLS/RPCs, using the standalone HTML as a design/product reference only. LINE becomes an optional linked identity, not the required session gate.

## Drivers

1. User requires production-ready normal website, not LIFF-first.
2. All 10 customer pages and all admin features must work in first release.
3. Email/password, Google, and optional LINE must merge to one canonical account.
4. Manual bank transfer/QR slip upload and admin approval are fraud-sensitive.
5. Gacha opening, inventory, coin ledger, exchange, shipping, and admin actions require server authority and auditability.
6. Every visible page button must have a real action or runtime-disabled reason.

## Alternatives considered

### Option A — Supabase Auth App Router rebuild with domain modules

Chosen. Cleanly replaces LIFF-first assumptions and supports production route/data/test boundaries.

### Option B — Incremental retrofit of current Lucky Draw modules

Rejected as primary because current modules are LIFF-first and narrower than the 10-page YNot product. Useful patterns may be harvested: service-role isolation, admin revalidation, slip upload/file limits, duplicate-slip checks, realtime event/refetch.

### Option C — Static HTML enhancement

Rejected because static bundled HTML cannot safely become production auth/payment/admin/inventory system.

## Why chosen

Option A aligns code boundaries with the clarified product instead of preserving accidental old constraints. It allows Server Components for initial data/auth, Client Components for interactivity, Supabase Auth SSR for normal sessions, RLS/RPCs for server authority, and explicit tests for every page/button.

## Consequences

- Requires broad schema migration and route/component rebuild.
- Requires `@supabase/ssr`, `src/proxy.ts`, provider setup, and test tooling.
- Existing LIFF/custom cookie session must be removed, replaced, or isolated as optional LINE linking.
- Requires deterministic seed data and full e2e coverage before production claim.

## Architecture decisions

- Canonical auth: Supabase Auth.
- Cookie refresh/auth routing: Next 16 `src/proxy.ts` entrypoint with shared helper under `src/lib/supabase/proxy.ts` if useful.
- LINE: try Supabase custom OAuth/OIDC provider first; if not viable, implement server-side LINE OAuth/ID-token verification and link to canonical Supabase user.
- Money/inventory: Postgres RPC/transactions with idempotency keys/unique constraints.
- Coin balance: derived from `coin_ledger`.
- Storage: private `payment-slips` bucket; admin signed URLs/service route only.
- Realtime: safe event table and authenticated refetch; no raw sensitive stream.
- Admin: route + mutation authorization and RLS; audit every sensitive action.

## Follow-ups

- Configure Supabase Auth providers and callback URLs.
- Confirm LINE custom provider viability and email scope behavior.
- Add schema migrations/RLS/RPCs and seed/reset scripts.
- Add `vitest`, Playwright, and static verification script.
- Build PRD/Test Spec slices with status updates after each execution phase.
