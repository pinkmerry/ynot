# Shipping Chunked All Eligible Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make customer shipping conversion handle 1, 2, 10, 100, 500, 1,000, 10,000, 50,000, and 100,000 eligible rewards smoothly without a giant confirmation-time database update, while keeping one customer-facing request flow and preventing double-use of rewards.
**Architecture:** Keep the quote/start/current/background pattern, but make confirmation create only a lightweight shipping request/job. The Cloudflare Queue worker claims and submits rewards in bounded Supabase RPC chunks using indexed `for update skip locked` queries, paced queue continuation, idempotency, and active-job guards.
**Tech Stack:** Next.js app routes on Cloudflare/OpenNext, Cloudflare Queue, Supabase Postgres RPC migrations, service-role Supabase client, Node static regression tests.

---

## Current Evidence

- Existing uncommitted shipping pipeline lives in `Database/supabase/migrations/20260620090000_shipping_request_jobs.sql`.
- Existing API route is `Website/src/app/api/ynot/shipping/route.ts`; progress route is `Website/src/app/api/ynot/shipping/current/route.ts`.
- Existing Cloudflare Queue worker is `Website/bulk-open-worker.ts`.
- Customer Bag shipping UI is `Website/src/features/ynot/cr/HistoryExperience.tsx`.
- Legacy `/shipping` collection panel is `Website/src/features/ynot/client.tsx`.
- Static tests are `Website/scripts/test-shipping-flow.mjs` and `Website/scripts/test-reward-conversion-flow.mjs`.
- Review gap: `start_shipping_request_job` currently updates all quoted `collection_items` to `shipping_preparing` in one transaction. That is not acceptable for 50,000 to 100,000 rewards.
- Review gap: legacy `/shipping` panel still uses selected-only shipping behavior.

## Desired Runtime Shape

For the customer:

1. User clicks one shipping button.
2. If they selected rewards, it ships selected rewards.
3. If they selected nothing and choose all eligible from Customer Bag, it ships all eligible rewards.
4. Confirm modal shows total rewards and total reward value before start.
5. After confirm, customer cannot cancel; background processing continues until submitted or retry-required.
6. UI shows preparing progress and can be left safely.

For load:

- Browser calls stay small: quote, start, then paced current-status polling.
- Queue messages contain only `{ type: "shipping_request_process", jobId, attempt }`.
- Start RPC never sends, stores, or mutates 50,000 to 100,000 item IDs for all-eligible jobs.
- Worker chunks are the only place that touches many `collection_items`.
- Default chunk size is 2,000 and max chunk size remains 5,000.
- Continuation delay is 1 second so Supabase does not receive an immediate tight loop.

Expected chunk count:

| Eligible rewards | Worker RPC chunks at 2,000/chunk | Expected behavior |
| --- | ---: | --- |
| 1 | 1 | Immediate or near-immediate submit |
| 2 | 1 | Immediate or near-immediate submit |
| 10 | 1 | Immediate or near-immediate submit |
| 100 | 1 | Immediate or near-immediate submit |
| 500 | 1 | Immediate or near-immediate submit |
| 1,000 | 1 | One bounded RPC |
| 10,000 | 5 | Smooth background processing |
| 50,000 | 25 | Smooth background processing over paced queue messages |
| 100,000 | 50 | Longer background processing, but no heavy single transaction |

This intentionally does not target "5 calls max" for 100,000 rewards. Five calls would require 20,000 rows per transaction, which is the risky shape we are removing.

## Security Model

- Only service-role API routes can execute shipping and conversion RPCs.
- Public browser requests continue to use same-origin checks, verified-anchor checks, rate limits, idempotency keys, and action-token resolution.
- All-eligible shipping does not accept item IDs from the browser.
- Selected shipping accepts action tokens only, resolves them server-side, and caps selected IDs at `MAX_SELECTED_SHIPPING_ITEMS = 10_000`.
- A profile can have only one active shipping job through `shipping_request_jobs_active_profile_idx`.
- Reward conversion must be blocked while an active shipping job exists so owned rewards cannot be converted after shipping confirmation but before the worker claims them.
- Shipping start must remain idempotent and safe to replay by quote token or idempotency key.
- Customer-facing DTOs must not expose quote hashes, raw collection IDs, idempotency keys, service-role details, or internal shipping request IDs.
- Logs must never include `SUPABASE_SERVICE_ROLE_KEY`, full request bodies, quote hashes, or large item arrays.

---

## Implementation Tasks

### Task 1: Lock The Desired Behavior With Failing Tests

- [x] Edit `Website/scripts/test-shipping-flow.mjs`.
- [x] Rename the current test `"shipping start reserves items and background processor submits request chunks"` to `"shipping start creates a lightweight job and background processor claims bounded chunks"`.
- [x] In that test, replace the start assertion that requires mass item reservation:

```js
assert.match(start, /update public\.collection_items[\s\S]*set status = 'shipping_preparing'/);
```

with assertions that prove the opposite:

```js
assert.doesNotMatch(
  start,
  /update public\.collection_items[\s\S]*set status = 'shipping_preparing'/,
);
assert.doesNotMatch(start, /get diagnostics locked_count = row_count/);
assert.match(process, /for update skip locked/);
assert.match(process, /limit p_limit/);
assert.match(process, /ci\.status = 'owned'/);
assert.match(process, /set status = 'shipping_requested'/);
assert.match(process, /shipping_claim_mismatch|shipping_quote_changed/);
```

- [x] In `"shipping quote is non-mutating..."`, add an assertion that all-eligible quote does not persist a huge item-ID array:

```js
assert.match(
  quote,
  /case\s+when p_selection_mode = 'selected'[\s\S]*selected_ids[\s\S]*else '\{\}'::uuid\[\]/,
);
```

- [x] In `"Cloudflare worker can continue and recover shipping request jobs"`, add assertions:

```js
assert.match(workerSource, /const SHIPPING_REQUEST_PROCESS_LIMIT = 2000/);
assert.match(workerSource, /const SHIPPING_REQUEST_CONTINUE_DELAY_SECONDS = 1/);
assert.match(workerSource, /const SHIPPING_REQUEST_RECOVERY_DELAY_SECONDS = 1/);
```

- [x] Add a new test in `Website/scripts/test-shipping-flow.mjs` named `"customer shipping polling is paced for large background jobs"`.
- [x] Assert both shipping UI files poll current status at 5 seconds, not 3 seconds:

```js
assert.match(historySource, /window\.setInterval\(refresh, 5000\)/);
assert.match(clientSource, /window\.setInterval\(refresh, 5000\)/);
```

- [x] Update `"customer shipping panel requires a complete address..."` to allow selected or all-eligible behavior in `Website/src/features/ynot/client.tsx`:

```js
assert.match(openShippingBody, /shippingSelectionMode/);
assert.match(openShippingBody, /selectionMode:\s*shippingSelectionMode/);
assert.match(openShippingBody, /shippingSelectionMode === "selected" \? selectedItems\.map/);
assert.match(openShippingBody, /: \[\]/);
```

- [x] Add a new test in `Website/scripts/test-reward-conversion-flow.mjs` named `"conversion is blocked while a shipping request job is active"`.
- [x] Assert both quote and start conversion functions check active shipping jobs:

```js
requirePattern(
  quote,
  /shipping_request_jobs[\s\S]*status in \('preparing', 'processing', 'retry_required'\)/,
  "conversion quote must not start while shipping is claiming owned rewards",
);
requirePattern(
  start,
  /shipping_request_jobs[\s\S]*status in \('preparing', 'processing', 'retry_required'\)/,
  "conversion start must not race an active shipping job",
);
requirePattern(
  source,
  /shipping_request_active_exists|shipping_request_active_blocks_conversion/,
  "conversion RPC must expose a specific active-shipping error",
);
```

- [x] Run the focused tests and confirm they fail for the expected reasons:

```bash
npm run test:shipping-flow
npm run test:reward-conversion-flow
```

Expected failure before implementation: tests complain that start still updates `collection_items`, worker limits are still 5,000 with zero delay, legacy panel is selected-only, and conversion does not block active shipping jobs.

### Task 2: Make Shipping Quote Lightweight For All-Eligible Jobs

- [x] Edit `Database/supabase/migrations/20260620090000_shipping_request_jobs.sql`.
- [x] Keep `collection_item_ids uuid[] not null default '{}'::uuid[]` for selected-mode compatibility.
- [x] Add a covering partial index for all-eligible quote and worker claims:

```sql
create index if not exists collection_items_shipping_eligible_idx
  on public.collection_items(profile_id, acquired_at, id)
  include (convert_coin_value_snapshot, card_id)
  where status = 'owned';
```

- [x] Keep or replace `collection_items_shipping_request_job_idx` with an index that helps admin/progress lookups after chunk claims:

```sql
create index if not exists collection_items_shipping_request_job_idx
  on public.collection_items(shipping_request_job_id, acquired_at, id)
  where status = 'shipping_requested';
```

- [x] In `prepare_shipping_request_quote`, split selected ID collection from aggregate quote calculation:
  - For `selected`, validate duplicate IDs and store `selected_ids`.
  - For `all_eligible`, set `selected_ids := '{}'::uuid[]`.
  - For both modes, calculate `quoted_count` and `quoted_total` with an indexed scan over owned rows.
- [x] Replace the all-eligible `array_agg(ci.id...)` behavior with this insert shape:

```sql
collection_item_ids = case
  when p_selection_mode = 'selected' then selected_ids
  else '{}'::uuid[]
end
```

- [x] For `selected`, keep the strong quote hash over selected IDs because the selected cap is 10,000.
- [x] For `all_eligible`, use an aggregate fingerprint that does not materialize every ID into a stored array:

```sql
md5(
  quoted_count::text || ':' ||
  quoted_total::text || ':' ||
  coalesce(min_id::text, '') || ':' ||
  coalesce(max_id::text, '') || ':' ||
  coalesce(min_acquired_at::text, '') || ':' ||
  coalesce(max_acquired_at::text, '')
)
```

- [x] Leave the quote non-mutating:
  - no `update public.collection_items`;
  - no `insert into public.shipping_requests`;
  - no `insert into public.shipping_request_items`.

### Task 3: Make Shipping Start A Lightweight Commit

- [x] Edit `start_shipping_request_job` in `Database/supabase/migrations/20260620090000_shipping_request_jobs.sql`.
- [x] Keep the quote row `for update`.
- [x] Keep quote expiry checks, idempotency replay, address snapshot reuse, and active shipping job guard.
- [x] Recalculate current quote count, total, and fingerprint before creating the job.
- [x] Insert into `public.shipping_requests` with status `'preparing'`.
- [x] Insert into `public.shipping_request_jobs` with status `'preparing'`.
- [x] Consume the quote token.
- [x] Insert the `shipping_preparing` audit event.
- [x] Remove these confirmation-time heavy operations from start:
  - `update public.collection_items set status = 'shipping_preparing'`;
  - `get diagnostics locked_count = row_count`;
  - the locked-count equality check.
- [x] Return the same public progress contract:

```json
{
  "status": "preparing",
  "jobId": "...",
  "publicCode": "SH-...",
  "itemCount": 100000,
  "preparedCount": 0,
  "totalCoinValue": 123456,
  "completed": false,
  "shouldContinue": true
}
```

### Task 4: Move All Item Claiming Into The Worker RPC

- [x] Edit `process_shipping_request_chunk` in `Database/supabase/migrations/20260620090000_shipping_request_jobs.sql`.
- [x] Load the associated quote row inside the function because selected jobs need `quote_row.collection_item_ids`:

```sql
select * into quote_row
from public.shipping_request_quote_tokens
where id = job_row.quote_token_id;
```

- [x] Change the chunk select to claim from owned rows, not pre-reserved rows:

```sql
select coalesce(array_agg(chunk.id order by chunk.acquired_at, chunk.id), '{}'::uuid[]),
       count(*)::int
into chunk_item_ids, chunk_count
from (
  select ci.id, ci.acquired_at
  from public.collection_items ci
  where ci.profile_id = job_row.profile_id
    and ci.status = 'owned'
    and ci.shipping_request_job_id is null
    and (
      job_row.selection_mode = 'all_eligible'
      or ci.id = any(quote_row.collection_item_ids)
    )
  order by ci.acquired_at, ci.id
  limit p_limit
  for update skip locked
) chunk;
```

- [x] Insert `shipping_request_items` only for `chunk_item_ids`.
- [x] Update only `chunk_item_ids`:

```sql
update public.collection_items
set status = 'shipping_requested',
    shipping_request_job_id = job_row.id,
    shipping_request_id = job_row.shipping_request_id,
    updated_at = now()
where id = any(chunk_item_ids)
  and profile_id = job_row.profile_id
  and status = 'owned'
  and shipping_request_job_id is null;
```

- [x] Validate the update count equals `chunk_count`. If not, raise `shipping_claim_mismatch` so the exception handler records `retry_required`.
- [x] Increment `prepared_count` by the actual updated chunk count.
- [x] Mark `shipping_request_jobs.status = 'submitted'` and `shipping_requests.status = 'submitted'` only when `prepared_count + chunk_count >= item_count`.
- [x] If `chunk_count = 0` and `prepared_count < item_count`, raise `shipping_claim_mismatch` instead of silently submitting a short request.
- [x] Keep `for update skip locked`, `p_limit`, retry handling, heartbeat, and stale-processing recovery.
- [x] Keep `p_limit` validation at `> 0 and <= 5000` even though the worker default becomes 2,000.

### Task 5: Pace Cloudflare Queue Work

- [x] Edit `Website/bulk-open-worker.ts`.
- [x] Change:

```ts
const SHIPPING_REQUEST_PROCESS_LIMIT = 5000;
```

to:

```ts
const SHIPPING_REQUEST_PROCESS_LIMIT = 2000;
const SHIPPING_REQUEST_CONTINUE_DELAY_SECONDS = 1;
const SHIPPING_REQUEST_RECOVERY_DELAY_SECONDS = 1;
```

- [x] In `processShippingRequestJob`, change continuation enqueue options from `{ delaySeconds: 0 }` to:

```ts
{ delaySeconds: SHIPPING_REQUEST_CONTINUE_DELAY_SECONDS }
```

- [x] In `recoverShippingRequestJobs`, change enqueue options from `{ delaySeconds: 0 }` to:

```ts
{ delaySeconds: SHIPPING_REQUEST_RECOVERY_DELAY_SECONDS }
```

- [x] Do not inline `process_shipping_request_chunk` in the API route. Cloudflare request CPU must stay small.

### Task 6: Keep Queue Enqueue Failure Recoverable And Visible In Tests

- [x] Keep `enqueueShippingRequestJob` in `Website/src/app/api/ynot/shipping/route.ts` non-blocking so a Cloudflare queue outage does not roll back the confirmed shipping job.
- [x] Ensure `list_shipping_request_recovery_jobs` includes status `'preparing'`, status `'retry_required'`, and stale status `'processing'`.
- [x] Add or keep static tests proving recovery includes `'preparing'` jobs.
- [x] Keep the warning log sanitized:

```ts
console.warn("shipping_request_enqueue_failed", {
  reason: error instanceof Error ? error.message.split(":").slice(0, 2).join(":") : "unknown",
});
```

- [x] Do not log quote tokens, item IDs, request bodies, or secrets.

### Task 7: Block Conversion While Shipping Is Actively Claiming Rewards

- [x] Edit `Database/supabase/migrations/20260619130000_reward_conversion_jobs.sql`.
- [x] Add this guard to both `prepare_reward_conversion_quote` and `start_reward_conversion`, before selecting or locking convertible rewards:

```sql
if exists (
  select 1
  from public.shipping_request_jobs active_shipping
  where active_shipping.profile_id = p_profile_id
    and active_shipping.status in ('preparing', 'processing', 'retry_required')
) then
  raise exception 'shipping_request_active_blocks_conversion';
end if;
```

- [x] Edit `Website/src/lib/ynot/card-conversion-api.ts`.
- [x] In `conversionErrorMessage`, map the new error:

```ts
if (message.includes("shipping_request_active_blocks_conversion")) {
  return "Your shipping request is still preparing. Please wait until it finishes before converting rewards.";
}
```

- [x] Keep the existing `reward_conversion_active_exists` behavior unchanged.
- [x] This is the security bridge that allows shipping start to avoid a mass item lock while still preventing the user from converting those owned rows before the worker claims them.

### Task 8: Fix Legacy `/shipping` Panel To Use The Same One-Button Path

- [x] Edit `Website/src/features/ynot/client.tsx`.
- [x] Change shipping copy from "card/cards" to "reward/rewards" where it refers to customer bag items.
- [x] In `openShippingConfirm`, derive a mode:

```ts
const shippingSelectionMode: "selected" | "all_eligible" =
  selectedItems.length > 0 ? "selected" : "all_eligible";
```

- [x] Allow the Shipping Request button when no rewards are selected if `ownedItems.length > 0`, the address is complete, and all eligible reward value meets the 1,000 coin minimum.
- [x] For quote request body, send selected IDs only in selected mode:

```ts
selectionMode: shippingSelectionMode,
collectionItemIds:
  shippingSelectionMode === "selected"
    ? selectedItems.map((item) => item.id)
    : [],
addressId: activeAddressId,
```

- [x] Update modal text so the user sees:
  - selected mode: `Request shipping for N selected reward(s)?`
  - all eligible mode: `Request shipping for all N eligible reward(s)?`
  - confirmed: `Preparing shipping request SH-.... You can leave this page while it finishes.`
- [x] After confirm, clear selected rows and keep progress polling until completed.

### Task 9: Pace Customer Progress Polling

- [x] Edit `Website/src/features/ynot/cr/HistoryExperience.tsx`.
- [x] Change shipping current polling interval from `3000` to `5000`.
- [x] Edit `Website/src/features/ynot/client.tsx`.
- [x] Change shipping current polling interval from `3000` to `5000`.
- [x] Keep the first immediate `void refresh()` after progress starts so small jobs still feel responsive.
- [x] Do not increase conversion polling in this shipping fix unless the conversion tests require a shared helper update.

### Task 10: Update Type Surface If Needed

- [x] Run typecheck after SQL and route/UI edits.
- [x] If generated Supabase types are stale, update `Website/src/lib/supabase/types.ts` manually only for the new or changed fields already present in the migration:
  - `shipping_request_quote_tokens.collection_item_ids`;
  - `shipping_request_jobs.selection_mode`;
  - `shipping_request_jobs.prepared_count`;
  - `collection_items.shipping_request_job_id`.
- [x] Do not expose new internal fields to customer API DTOs.

### Task 11: Run Verification

- [x] Run focused shipping tests:

```bash
npm run test:shipping-flow
```

- [x] Run focused conversion tests:

```bash
npm run test:reward-conversion-flow
```

- [x] Run customer security hardening tests because shipping and conversion endpoints share security expectations:

```bash
npm run test:customer-security-hardening
```

- [x] Run typecheck:

```bash
npm run typecheck
```

- [x] Run production build if typecheck passes:

```bash
npm run build
```

- [x] Run whitespace check:

```bash
git diff --check
```

### Task 12: Review The Final Flow Against The Load Target

- [x] Confirm start RPC contains no `update public.collection_items`.
- [x] Confirm all-eligible quote does not store a giant UUID array.
- [x] Confirm worker default is 2,000 rows per shipping chunk.
- [x] Confirm worker continuation delay is 1 second.
- [x] Confirm selected mode still supports manually selected rewards.
- [x] Confirm all-eligible mode works from Customer Bag and legacy `/shipping`.
- [x] Confirm conversion quote/start are blocked while active shipping job exists.
- [x] Confirm customer response DTOs do not expose internal IDs, hashes, or service-role details.
- [x] Confirm no UI button is left unwired:
  - Customer Bag selected ship button;
  - Customer Bag all-eligible ship button;
  - legacy `/shipping` Shipping Request button;
  - quote modal close/cancel before confirm;
  - confirm button;
  - progress current polling.

---

## Commit Checkpoints

Commit after Task 1:

```bash
git add Website/scripts/test-shipping-flow.mjs Website/scripts/test-reward-conversion-flow.mjs
git commit -m "Define chunked shipping performance contract

Constraint: Shipping must handle 100000 rewards without a confirmation-time mass item update.
Rejected: Five huge chunks | Too much Supabase lock and transaction pressure.
Confidence: high
Scope-risk: narrow
Tested: npm run test:shipping-flow failed as expected; npm run test:reward-conversion-flow failed as expected
Not-tested: Implementation not written yet"
```

Commit after Tasks 2-7:

```bash
git add Database/supabase/migrations/20260620090000_shipping_request_jobs.sql Database/supabase/migrations/20260619130000_reward_conversion_jobs.sql Website/bulk-open-worker.ts Website/src/app/api/ynot/shipping/route.ts Website/src/lib/ynot/card-conversion-api.ts
git commit -m "Move shipping item claims into paced worker chunks

Constraint: Cloudflare request CPU and Supabase transaction size must remain bounded for very large customer bags.
Rejected: Lock all shipping rewards during confirm | It performs one large update for 50000 to 100000 rewards.
Confidence: high
Scope-risk: moderate
Directive: Keep all-eligible shipping free of browser-supplied item IDs and keep conversion blocked during active shipping jobs.
Tested: npm run test:shipping-flow; npm run test:reward-conversion-flow
Not-tested: Production migration not applied"
```

Commit after Tasks 8-12:

```bash
git add Website/src/features/ynot/client.tsx Website/src/features/ynot/cr/HistoryExperience.tsx Website/scripts/test-shipping-flow.mjs Website/scripts/test-reward-conversion-flow.mjs Website/src/lib/supabase/types.ts
git commit -m "Unify shipping UI on the chunked request path

Constraint: Customer Bag and legacy shipping must use the same quote/start/progress behavior.
Rejected: Leave legacy shipping selected-only | Large customer bags would still have a weak path.
Confidence: high
Scope-risk: moderate
Directive: Verify button wiring whenever shipping UI actions change.
Tested: npm run test:shipping-flow; npm run test:reward-conversion-flow; npm run test:customer-security-hardening; npm run typecheck; npm run build; git diff --check
Not-tested: Live production smoke pending deploy"
```

---

## Rollback Plan

- Keep the existing legacy `request_shipping_for_items` function and `submitLegacyShippingFallback` path until production testing passes.
- If chunked shipping fails in production, temporarily disable the new quote/start UI path by forcing the shipping route to use the legacy fallback for selected jobs only.
- Do not allow all-eligible shipping to fall back to legacy direct RPC because legacy is not designed for 50,000 to 100,000 rewards.
- If the worker queue is unavailable, keep confirmed jobs in `preparing`; scheduled recovery re-enqueues them when the queue path returns.

## Acceptance Criteria

- `npm run test:shipping-flow` passes.
- `npm run test:reward-conversion-flow` passes.
- `npm run test:customer-security-hardening` passes.
- `npm run typecheck` passes.
- `npm run build` passes.
- `git diff --check` passes.
- For 100,000 all-eligible rewards, confirm/start does not perform a mass `collection_items` update.
- For 100,000 all-eligible rewards, worker processes approximately 50 chunks at 2,000 rows per chunk.
- User sees total rewards and total reward value before confirm.
- After confirm, user cannot cancel and progress continues in background.
- Conversion is blocked while a shipping job is active.
- Both Customer Bag and legacy `/shipping` route use the same quote/start/progress architecture.
