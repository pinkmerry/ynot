# Wallet Top-Up Flow Test Report

- Run id: `TOPUP-QA-20260526T100937Z`
- Created: 2026-05-26T10:09:37Z
- Target: local dev server `http://localhost:3022`
- Scope: wallet top-up customer flow, server validation, admin review surface, and safe edge cases
- Mutation boundary: no valid top-up was submitted, no slip was approved/rejected, and no wallet coins were credited

## Executive Result

PASS with safety limits.

The customer wallet page, admin top-up page, server-owned package catalog, upload validation, and safe API edge cases all passed on localhost. The automated test suite now includes repeatable top-up flow coverage through `npm run test:top-up-flow`.

Full successful submission and admin approval were intentionally not executed because that would create financial test data, upload a slip, and potentially credit coins against the configured Supabase project. Run that only with an isolated test payment method and cleanup window.

## Automated Test Cases Added

Source: `scripts/test-top-up-flow.mjs`

| ID | Area | Scenario | Expected result | Result |
| --- | --- | --- | --- | --- |
| TUP-001 | Package catalog | Fixed server-side packages are available | starter/player/collector/whale map to expected THB/coin amounts | PASS |
| TUP-002 | Package catalog | Unknown package id | `getTopUpPackage()` returns `null` | PASS |
| TUP-003 | Tamper resistance | Browser-supplied `amountThb`/`coinAmount` fields | Wallet POST uses `topUpPackage.amountThb` and `topUpPackage.coins`, not form values | PASS |
| TUP-004 | Auth | Unauthenticated `GET /api/ynot/wallet` | HTTP 401, login required | PASS |
| TUP-005 | Auth/session | Preview-authenticated `GET /api/ynot/wallet` | HTTP 200 with `wallet`, `topUps`, `paymentMethods` payload shape | PASS |
| TUP-006 | Required fields | Missing payment method | HTTP 400, payment method required | PASS |
| TUP-007 | Required fields | Invalid package id | HTTP 400, invalid top-up package | PASS |
| TUP-008 | Required fields | Missing transfer slip | HTTP 400, slip upload required | PASS |
| TUP-009 | File validation | Unsupported MIME type | HTTP 400, JPG/PNG/WEBP only | PASS |
| TUP-010 | File validation | File declared as image but bytes are HTML | HTTP 400, content does not match supported image type | PASS |
| TUP-011 | Payment method validation | Valid PNG header with nonexistent payment method id | HTTP 400, payment method is not active | PASS |

## Manual/Route Smoke Evidence

| Area | Evidence | Result |
| --- | --- | --- |
| Customer wallet UI | `/wallet` with preview auth rendered `Wallet`, `Coin balance`, `Top Up`, `Payment method`, and `Upload transfer slip` | PASS |
| Admin top-up UI | `/admin/top-ups` with preview auth rendered `Manual payment confirmation`, `Approve`, `Reject`, `pending`, `approved`, `rejected`, `duplicate`, and `provider_error` labels | PASS |
| Admin top-up API | `GET /api/ynot/admin/top-ups` with preview auth returned HTTP 200 and `{"topUps":[]}` on the local data set | PASS |

## Commands Run

| Command | Result |
| --- | --- |
| `npm run test:top-up-flow` | PASS, 11/11 |
| `npm run test:uploads` | PASS, 8/8 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 errors and 3 existing warnings |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Existing Warnings

`npm run lint` still reports the same warnings unrelated to this top-up test pass:

- `src/features/ynot/PackOpenPrototype.tsx`: `<img>` optimization warning
- `src/features/ynot/client.tsx`: `<img>` optimization warning
- `src/features/ynot/components.tsx`: unused `duplicatePacksForDisplay`

## Not Tested

- Valid slip submission that creates a real `top_up_requests` row
- Supabase Storage upload success for a real slip image
- Live Slip2Go provider success/duplicate/reference matching
- Admin approve/reject RPCs on a real pending top-up
- Final wallet coin credit after approval

These are intentionally excluded from this safe pass because they mutate financial records. Recommended next step is an isolated E2E run using a test-only payment method, a RUN_ID-tagged pending top-up, and cleanup verification in `audit_events`, `top_up_requests`, `payment_slips`, `wallet_accounts`, and `coin_ledger`.
