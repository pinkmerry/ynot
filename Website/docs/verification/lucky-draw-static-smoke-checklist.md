# Lucky Draw Static + Smoke Verification Checklist

This artifact supports the approved architecture/UI plan without adding test dependencies.
Run it from the worktree root:

```bash
node tools/verification/verify-lucky-draw-plan.mjs
```

Optional modes:

```bash
node tools/verification/verify-lucky-draw-plan.mjs --strict-shell
node tools/verification/verify-lucky-draw-plan.mjs --base-url=http://localhost:3000
```

- `--strict-shell` turns direct `fetch(...)` / `createBrowserSupabaseClient` usage in `src/features/lucky-draw/shell/*` from migration warnings into failures.
- `--base-url` performs unauthenticated admin endpoint smoke requests against a running local server. These requests must be rejected safely and must not mutate data.

## Static invariants

### Server-only secrets

Pass criteria:
- Client components do not reference `SUPABASE_SERVICE_ROLE_KEY`, `SLIP2GO_SECRET_KEY`, `LINE_SESSION_SECRET`, `LINE_CHANNEL_SECRET`, or `LINE_MESSAGING_API_ACCESS_TOKEN`.
- Client components do not import `@/lib/supabase/server` or `@/lib/slip2go/client`.

### Realtime subscriptions

Pass criteria:
- Every `postgres_changes` subscription targets only `lucky_draw_realtime_events`.
- The client does not subscribe directly to raw sensitive tables such as `orders`, `payment_slips`, `profiles`, `admin_users`, `draw_slots`, or `payment_qr_codes`.
- Browser smoke must confirm realtime events cause a refetch of `/api/lucky-draw` rather than streaming raw order/payment/profile payloads.

### App shell ownership

Pass criteria:
- `src/app/page.tsx` remains a thin route entry and has no direct `fetch(...)` or `createBrowserSupabaseClient` usage.
- During incremental extraction, direct data/realtime ownership in `src/features/lucky-draw/shell/LuckyDrawShell.tsx` is reported as a warning.
- At the final shell-shrink target, run `--strict-shell`; the feature shell should have no direct `fetch(...)` or `createBrowserSupabaseClient` usage.

### Feature view extraction

Pass criteria:
- Customer views are implemented in `src/features/lucky-draw/customer/*View.tsx`.
- Profile view is implemented in `src/features/lucky-draw/profile/ProfileView.tsx`.
- Admin view is implemented in `src/features/lucky-draw/admin/AdminView.tsx`.
- `src/features/lucky-draw/shell/views.tsx` must not own customer/profile/admin view implementations.
- Feature view files must not be re-export-only stubs.

### Admin route inventory

The smoke inventory must include:
- `/api/lucky-draw/admin/order`
- `/api/lucky-draw/admin/draw`
- `/api/lucky-draw/admin/draw/lifecycle`
- `/api/lucky-draw/admin/slip`
- `/api/lucky-draw/admin/slip/verify-test`
- `/api/lucky-draw/admin/qr`
- `/api/lucky-draw/admin/card-image`

## Manual smoke checklist

Use three states:
1. Non-admin session: valid LINE/customer session with no active admin role.
2. Admin session: valid owner/admin session with `admin_users.is_active = true`.
3. Demo/unconfigured state: missing/disabled Supabase config in local/test environment; do not use production credentials.

### A. Non-admin UI

Expected:
- Home/checkout/pick/orders/profile are visible as appropriate.
- Admin nav item is hidden.
- Admin panel is not rendered.
- Direct client-side attempt to enter admin view falls back to profile.

### B. Non-admin admin API rejection

Representative calls without admin session:

```bash
curl -i -X PATCH http://localhost:3000/api/lucky-draw/admin/order
curl -i -X PATCH http://localhost:3000/api/lucky-draw/admin/draw
curl -i -X POST http://localhost:3000/api/lucky-draw/admin/draw/lifecycle
curl -i http://localhost:3000/api/lucky-draw/admin/slip
curl -i -X POST http://localhost:3000/api/lucky-draw/admin/slip/verify-test
curl -i -X POST http://localhost:3000/api/lucky-draw/admin/qr
curl -i -X POST http://localhost:3000/api/lucky-draw/admin/card-image
```

Expected:
- `401`, `403`, or safe validation rejection before mutation.
- No database mutation occurs.

### C. Admin UI

Expected:
- Admin nav item is visible.
- Admin dashboard loads.
- Order controls are visible.
- Draw lifecycle controls are visible.
- QR/card upload and slip/admin tools are visible only to admin.

### D. Customer order flow

Endpoint: `POST /api/lucky-draw`

Expected:
- Without LINE session: `401`.
- With LINE session and configured Supabase: order creation succeeds or fails with validation error.
- With `configured:false`: no real order is persisted; server mutation fails safely.

### E. Pick flow

Endpoint: `POST /api/lucky-draw/picks`

Expected:
- Without LINE session: `401`.
- Duplicate slot numbers are rejected.
- Non-admin exact quantity mismatch is rejected.
- Valid approved order pick succeeds.

### F. Realtime event/refetch

Setup:
- Open customer or admin browser.
- Trigger a safe state change or insert a test `lucky_draw_realtime_events` row.

Expected:
- Client receives the generic event.
- Client refetches `/api/lucky-draw`.
- Client does not receive raw order/payment/profile payload through realtime.

### G. Dry-run slip verification

Endpoint: `POST /api/lucky-draw/admin/slip/verify-test`

Expected admin response includes:

```json
{
  "ok": true,
  "dryRun": true,
  "databaseMutated": false
}
```

Expected database result:
- `orders` unchanged.
- `payment_slips` unchanged.
- `draw_slots` unchanged.
- No order status changes to approved from dry-run alone.

### H. Profile separation

Endpoints/UI:
- `GET /api/lucky-draw/profile`
- `PATCH /api/lucky-draw/profile`

Expected:
- Profile can be viewed/updated from profile UI.
- Checkout and orders views do not become profile-management surfaces.
- Profile save failure does not mutate order state.

### I. Demo/unconfigured mode

Expected:
- `/api/lucky-draw` may return `configured:false` with demo read state.
- Admin/payment/mutation endpoints return safe failure.
- UI does not claim production persistence.
- No admin/payment bypass appears.
