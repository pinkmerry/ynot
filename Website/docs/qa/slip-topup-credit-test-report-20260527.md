# Slip Upload and Wallet Credit QA

- Run id: `TOPUP-E2E-20260527145834`
- Date: 2026-05-27
- Target: local app at `http://localhost:3022`
- Account used: dev test profile `YNot Test Admin`
- Scope: customer slip upload, top-up request creation, admin approval, wallet credit, ledger correctness, idempotent re-approval, and Slip2Go request mapping

## Acceptance Criteria

| ID | Requirement | Acceptance |
| --- | --- | --- |
| AC-001 | User can upload a slip image for a top-up | `POST /api/ynot/wallet` accepts JPG/PNG/WEBP magic bytes, uploads the object to `payment-slips`, creates one `top_up_requests` row, and creates one `payment_slips` row linked by `top_up_request_id`. |
| AC-002 | Top-up amount is server-authoritative | The browser cannot choose arbitrary coins. `packageId=starter` must create `amount_thb=100` and `coin_amount=100` from `top-up-packages.ts`. |
| AC-003 | Slip verifier checks exact amount | Slip2Go request payload must include `checkAmount: { type: "eq", amount: "100" }` for a 100 THB top-up and must include duplicate and receiver checks. |
| AC-004 | Admin approval credits the exact wallet amount | Approving the top-up changes `wallet_accounts.balance_coins` by exactly `top_up_requests.coin_amount`. For starter, the delta must be `+100`. |
| AC-005 | Approval creates auditable ledger data | Approval creates one `coin_ledger` row with `entry_type=top_up`, `amount_coins=100`, `balance_before`, `balance_after`, `reference_type=top_up_request`, and `reference_id=<top_up_id>`. |
| AC-006 | Approval is idempotent | Re-approving the same already-approved top-up must not credit the wallet again. |
| AC-007 | Admin review status is final | Approved top-up must end as `status=approved` with `reviewed_at` and an admin note. |

## Test Cases

| ID | Scenario | Expected Result | Result |
| --- | --- | --- | --- |
| TUP-E2E-001 | Login with `/api/dev/mock-admin-login`, then GET `/api/ynot/wallet` | Session resolves, wallet payload and active payment methods load | PASS |
| TUP-E2E-002 | Submit generated PNG slip with `packageId=starter` | API returns 201, stores slip object, creates pending top-up with `amount_thb=100`, `coin_amount=100` | PASS |
| TUP-E2E-003 | Query `payment_slips` and storage object | Slip row points at uploaded object under `payment-slips`; object is readable | PASS |
| TUP-E2E-004 | Approve through `PATCH /api/ynot/admin/top-ups` | Top-up becomes approved; wallet balance increases by exactly 100 | PASS |
| TUP-E2E-005 | Query `coin_ledger` | Ledger row records `amount_coins=100`, correct before/after balance, and references the top-up | PASS |
| TUP-E2E-006 | Approve the same top-up again | Wallet balance does not change again | PASS |
| TUP-E2E-007 | Mock Slip2Go success response | Client posts to `/api/verify-slip/qr-image/info` with bearer auth, exact amount `100`, receiver check, duplicate check; response maps to `status=valid` and `autoApprove=true` | PASS |

## Evidence

### Real upload and approval run

- Top-up id: `e85e2379-e32f-48c6-b1a0-57b30024b6e9`
- Public code: `TU-1001`
- Slip id: `2daff596-a809-4c1b-b16d-60c5cf0e3eb3`
- Uploaded file: `TOPUP-E2E-20260527145834.png`
- Payment method: `Main bank / PromptPay`
- Test profile: `1e1d14fc-4324-442e-9049-3f6bb0ac50b5`

| Check | Value |
| --- | --- |
| Top-up amount | `amount_thb=100` |
| Coins requested | `coin_amount=100` |
| Wallet before approval | `49,999` |
| Wallet after approval | `50,099` |
| Wallet after second approval | `50,099` |
| Credited delta | `100` |
| Ledger id | `6681a74f-5055-494b-a6b6-04cda1e7365f` |
| Ledger amount | `amount_coins=100` |
| Ledger balance before/after | `49,999 -> 50,099` |

### Slip2Go note

The local `.env.local` used by `http://localhost:3022` does not contain `SLIP2GO_SECRET_KEY`, so the real upload run recorded the slip verifier status as `provider_error` with message `Slip2Go secret key is not configured.` Admin manual approval still credited the wallet correctly.

The Slip2Go client was separately tested against a local mock provider. It sent:

- `POST /api/verify-slip/qr-image/info`
- `authorization: Bearer mock-secret`
- `checkDuplicate: true`
- `checkReceiver` with Kasikorn account type `01004`
- `checkAmount: { type: "eq", amount: "100" }`

The mock valid response `code=200200` mapped to `status=valid`, `autoApprove=true`, `referenceId=MOCK-REF-100`, and a decoded QR hash.

## Current Conclusion

The wallet-credit critical path is correct for a 100 THB package: upload creates the request, admin confirmation credits exactly 100 coins, the ledger records exactly 100, and duplicate approval does not credit twice.

Live Slip2Go/SlipOK provider verification cannot be proven on this localhost without a real provider key and a real valid bank slip image. The code path and provider payload contract pass against a mock provider, and the system safely falls back to admin manual review when the provider key is missing.
