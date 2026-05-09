# API Boundary: Legacy Lucky Draw, LINE, and YNot Website

Updated: 2026-05-08

## Why this boundary exists

The website and LIFF experience share the same Supabase project. The safest migration shape is to keep legacy LIFF routes stable while new website work moves through the YNot platform routes and shared database/RPC contract.

## Route ownership

### `/api/lucky-draw/*` — legacy Lucky Draw / LIFF compatibility

Use this surface only when changing existing Lucky Draw/LIFF-compatible behavior: classic draw state, existing order/slip/pick flows, old admin draw controls, and compatibility smoke checks.

Rules:
- Preserve server-backed LINE session behavior.
- Do not leak private payment/order identifiers through public realtime payloads.
- Keep fake-slip testing on dry-run admin endpoints only.

### `/api/line/*` — LINE login, callback, and LIFF session truth

Use this surface for LINE OAuth, LIFF ID-token session creation, account linking, and account merge request creation.

Rules:
- Server session creation is the source of truth, not only LIFF client login state.
- LINE conflicts create admin-reviewed merge requests instead of silent profile merges.
- Production must use `LINE_SESSION_SECRET`; do not fall back to service-role key signing.

### `/api/ynot/*` — normal website platform

Use this surface for the production website: wallet/top-up, gacha opens, collection exchange, shipping, admin campaign/card/prize/payment/user operations, and future content studio work.

Rules:
- Admin APIs must call `resolveAdminSession()` before service-role queries/mutations.
- Sensitive customer/admin mutations should use shared rate limiting.
- Money/card operations should go through database RPCs/constraints where possible.
- Public storefront should show real published DB campaigns in production; demo fallback is local/explicit only.

## Shared source of truth

- Supabase migrations live in `../Database/supabase/migrations`.
- Shared schema plans live in `../Database/docs/plans`.
- Website route/UI plans live in `docs/plans`.
- Production data changes remain gated by backup, staging, provider config, and owner go/no-go evidence.

## Future change checklist

Before editing a route, answer:

1. Is this LIFF compatibility, LINE identity, or normal website platform?
2. Does the change need production DB migration first?
3. Is the action admin-only, customer-only, or public?
4. Does it touch money, card ownership, payment slips, or shipping?
5. Which verification script or UAT path proves it works?
