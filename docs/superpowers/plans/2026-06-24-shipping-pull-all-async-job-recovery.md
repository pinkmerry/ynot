# Shipping And Pull All Async Job Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore production shipping and Pull All async jobs by aligning Supabase job-processing functions with the live schema and preventing the two observed retry loops from recurring.

**Architecture:** Use one additive Supabase migration after the shipped async-job migrations; do not rewrite shipped migrations. Lock both production failure modes with static Node regression tests, regenerate Supabase types after schema changes, and use guarded linked Supabase dry-run/apply verification before checking the existing stuck production jobs.

**Tech Stack:** Supabase Postgres PL/pgSQL migrations, Next.js 16 App Router API routes on OpenNext/Cloudflare, Cloudflare Queue async worker, Node `node:test` static regression scripts, Supabase CLI/Management API verification.

---

## Production Evidence To Preserve

- Shipping request `SH-1006` / job `ad86487d-1edb-4d2b-a13f-118ca6134357` is stuck at `retry_required`, `item_count=504`, `prepared_count=0`.
- Shipping job error is `42703:column "shipping_request_id" of relation "collection_items" does not exist`.
- Existing migration `Database/supabase/migrations/20260620090000_shipping_request_jobs.sql` adds `collection_items.shipping_request_job_id` but its RPCs also write `collection_items.shipping_request_id`.
- Pull All session `BO-1001` / `3107c831-1428-41c0-9bde-fdb821b5e1d5` is stuck at `retry_required`, `target_slots=379`, `processed_slots=0`.
- Pull All error is `42702`, caused by `process_bulk_open_chunk` declaring a PL/pgSQL local variable named `result_payload` and later selecting the `gacha_bulk_open_results.result_payload` column without qualification.
- Both jobs fail before durable progress is committed, so both retry loops show zero processed records.

---

## Task 1: Lock The Shipping Schema Mismatch With A Failing Regression

**Files:**
- `Website/scripts/test-shipping-flow.mjs`
- `Database/supabase/migrations/20260624103616_fix_shipping_and_pull_all_async_jobs.sql`

**Steps:**

- [ ] Add the recovery migration read near the other migration reads in `Website/scripts/test-shipping-flow.mjs`:

```js
const shippingPullAllRecoveryMigration = readOptionalUrl(
  new URL(
    "../../Database/supabase/migrations/20260624103616_fix_shipping_and_pull_all_async_jobs.sql",
    import.meta.url,
  ),
);
```

- [ ] Add this test near the shipping job schema/function tests:

```js
test("shipping recovery migration aligns collection item request link with job processors", () => {
  assert.ok(shippingPullAllRecoveryMigration, "missing shipping + Pull All recovery migration");

  const recoverySql = compactSql(shippingPullAllRecoveryMigration);
  const processChunk = compactSql(functionBlock(shippingJobsMigration, "process_shipping_request_chunk"));
  const requestShippingForItems = compactSql(functionBlock(shippingJobsMigration, "request_shipping_for_items"));
  const updateShippingRequestStatus = compactSql(
    functionBlock(shippingJobsMigration, "update_shipping_request_status"),
  );

  assert.match(
    recoverySql,
    /alter table public\.collection_items add column if not exists shipping_request_id uuid references public\.shipping_requests\(id\) on delete set null/,
    "recovery migration should add the request link used by shipping processors",
  );
  assert.match(
    recoverySql,
    /create index if not exists collection_items_shipping_request_id_idx/,
    "recovery migration should index the request link used by recovery/admin lookups",
  );
  assert.match(
    processChunk,
    /shipping_request_id = job_row\.shipping_request_id/,
    "chunk processor writes the request link when claiming items",
  );
  assert.match(
    requestShippingForItems,
    /shipping_request_id = shipping_row\.id/,
    "legacy fallback writes the same request link",
  );
  assert.match(
    updateShippingRequestStatus,
    /shipping_request_id = null/,
    "status reset path clears the same request link",
  );
});
```

- [ ] Run the focused test and confirm the expected red state before the migration exists:

```bash
cd Website
npm run test:shipping-flow
```

**Expected evidence:** the test fails because `20260624103616_fix_shipping_and_pull_all_async_jobs.sql` is not present yet.

---

## Task 2: Lock The Pull All `result_payload` Ambiguity With A Failing Regression

**Files:**
- `Website/scripts/test-bulk-open-migration.mjs`
- `Database/supabase/migrations/20260624103616_fix_shipping_and_pull_all_async_jobs.sql`

**Steps:**

- [ ] Add the recovery migration path and loader near the existing migration path constants in `Website/scripts/test-bulk-open-migration.mjs`:

```js
const asyncJobRecoveryMigrationPath =
  "../../Database/supabase/migrations/20260624103616_fix_shipping_and_pull_all_async_jobs.sql";

function asyncJobRecoveryMigrationSource() {
  return readFileSync(new URL(asyncJobRecoveryMigrationPath, import.meta.url), "utf8");
}
```

- [ ] Add this test near the existing `process_bulk_open_chunk` tests:

```js
test("bulk open recovery migration removes result payload PL/pgSQL ambiguity", () => {
  const source = asyncJobRecoveryMigrationSource();
  const processChunk = compactSql(functionBlock(source, "process_bulk_open_chunk"));

  requirePattern(
    processChunk,
    /result_payload_value jsonb/,
    "processor should use a local result payload name that cannot collide with table columns",
  );
  assert.doesNotMatch(
    processChunk,
    /\bresult_payload jsonb\b/,
    "processor must not declare a local result_payload variable",
  );
  requirePattern(
    processChunk,
    /from public\.gacha_bulk_open_results (?:as )?results/,
    "highlight query must alias gacha_bulk_open_results",
  );
  requirePattern(
    processChunk,
    /results\.result_payload as public_payload/,
    "highlight query must qualify the result payload column",
  );
  requirePattern(
    processChunk,
    /results\.bulk_open_sequence/,
    "highlight query must qualify bulk open sequence",
  );
  requirePattern(
    processChunk,
    /results\.status = 'awarded'/,
    "highlight query must qualify result status",
  );
  requirePattern(
    processChunk,
    /last_error_code = left\(sqlstate \|\| ':' \|\| sqlerrm, 200\)/,
    "future retry rows should preserve SQLSTATE and SQLERRM together",
  );
});
```

- [ ] Run the focused test and confirm the expected red state before the migration exists:

```bash
cd Website
npm run test:bulk-open-migration
```

**Expected evidence:** the test fails because the recovery migration is not present yet.

---

## Task 3: Create The Additive Recovery Migration

**File:**
- `Database/supabase/migrations/20260624103616_fix_shipping_and_pull_all_async_jobs.sql`

**Steps:**

- [ ] Create the migration with this opening SQL:

```sql
-- Repair async shipping and Pull All job processors observed stuck in production:
-- SH-1006 failed because collection_items.shipping_request_id was referenced by shipping RPCs but absent.
-- BO-1001 failed because process_bulk_open_chunk had an ambiguous result_payload reference.

alter table public.collection_items
  add column if not exists shipping_request_id uuid references public.shipping_requests(id) on delete set null;

create index if not exists collection_items_shipping_request_id_idx
  on public.collection_items(shipping_request_id, acquired_at, id)
  where shipping_request_id is not null;
```

- [ ] Append a recreated `public.process_bulk_open_chunk(uuid, integer, text)` function to the same migration. Use the current function body from `Database/supabase/migrations/20260619090000_bulk_open_sessions.sql`, starting at:

```sql
create or replace function public.process_bulk_open_chunk(
  p_session_id uuid,
  p_chunk_size integer default 25,
  p_worker_id text default null
)
```

and ending at that function's closing:

```sql
$$;
```

- [ ] In the copied function declaration block, replace the local `result_payload` variable with this exact name:

```sql
  result_payload_value jsonb;
```

- [ ] In the award-result payload assignment block, use this exact target variable:

```sql
      result_payload_value := jsonb_build_object(
        'slotIndex', current_slot_index,
        'cardId', selected_card.id,
        'cardName', selected_card.name,
        'imageUrl', selected_card.image_url,
        'rarity', selected_card.rarity,
        'tier', selected_card.tier,
        'displayTier', public.display_tier_for_result(selected_card.rarity, selected_card.tier, is_last_prize_award),
        'valueThb', selected_card.value_thb,
        'isLastPrize', is_last_prize_award,
        'isConvertedToReward', false,
        'conversionRewardAmount', 0,
        'collectionItemId', collection_item_id,
        'openItemId', open_item_id,
        'packOpeningId', pack_opening_id,
        'bulkOpenSequence', session_row.processed_slots + processed_count + 1,
        'awardedAt', now()
      );
```

- [ ] In the `insert into public.gacha_bulk_open_results` statement, use this exact value for the `result_payload` column:

```sql
        result_payload_value,
```

- [ ] Replace the highlight aggregation query with this exact block:

```sql
    select coalesce(
      jsonb_agg(public_payload order by priority asc, value_for_sort desc nulls last, ranked_bulk_open_sequence asc),
      '[]'::jsonb
    )
    into highlight_items
    from (
      select
        results.result_payload as public_payload,
        results.bulk_open_sequence as ranked_bulk_open_sequence,
        case
          when coalesce((results.result_payload->>'isLastPrize')::boolean, false) then 0
          when results.result_payload->>'displayTier' = 'last_prize' then 0
          when results.result_payload->>'displayTier' = 'rainbow' then 1
          when results.result_payload->>'displayTier' = 'gold' then 2
          when results.result_payload->>'displayTier' = 'silver' then 3
          else 4
        end as priority,
        nullif(results.result_payload->>'valueThb', '')::numeric as value_for_sort
      from public.gacha_bulk_open_results results
      where results.bulk_open_session_id = session_row.id
        and results.status = 'awarded'
      order by priority asc, value_for_sort desc nulls last, results.bulk_open_sequence asc
      limit 100
    ) ranked;
```

- [ ] In the exception handler, preserve both SQLSTATE and SQLERRM using this exact assignment:

```sql
        last_error_code = left(sqlstate || ':' || sqlerrm, 200),
```

- [ ] Keep the function execution boundary at the end of the migration:

```sql
revoke all on function public.process_bulk_open_chunk(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.process_bulk_open_chunk(uuid, integer, text) to service_role;
```

- [ ] Check that the copied function no longer has any unqualified `result_payload` reference in the highlight query:

```bash
rg -n "result_payload|gacha_bulk_open_results|last_error_code" Database/supabase/migrations/20260624103616_fix_shipping_and_pull_all_async_jobs.sql
```

**Expected evidence:** the new migration contains the `collection_items.shipping_request_id` column, the new index, a full `create or replace function public.process_bulk_open_chunk`, a `result_payload_value` local variable, qualified `results.result_payload` references, and no local declaration named `result_payload jsonb`.

---

## Task 4: Regenerate Or Patch Supabase Types

**File:**
- `Website/src/lib/supabase/types.ts`

**Steps:**

- [ ] Prefer regenerating linked public schema types without printing secrets:

```bash
cd Website
set -a
source .env.local
set +a
npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" --schema public > src/lib/supabase/types.ts
```

- [ ] If type generation is blocked by local CLI auth or network, patch only the `collection_items` type in `Website/src/lib/supabase/types.ts` so it includes:

```ts
shipping_request_id: string | null
```

in `Row`, and:

```ts
shipping_request_id?: string | null
```

in both `Insert` and `Update`.

- [ ] Verify the type surface contains both async request links:

```bash
rg -n "shipping_request_id|shipping_request_job_id" Website/src/lib/supabase/types.ts
```

**Expected evidence:** `collection_items` has both `shipping_request_job_id` and `shipping_request_id` in generated or patched TypeScript types.

---

## Task 5: Run Focused And Platform Verification

**Commands:**

```bash
cd Website
npm run test:shipping-flow
npm run test:bulk-open-migration
npm run test:bulk-open-api-flow
npm run test:reward-conversion-flow
npm run verify:platform
npm run typecheck
npm run lint
npm run build
git diff --check
```

**Expected evidence:**
- Shipping test passes and proves the recovery migration adds `collection_items.shipping_request_id`.
- Bulk-open migration test passes and proves `process_bulk_open_chunk` cannot collide on `result_payload`.
- API flow and reward conversion tests still pass.
- Typecheck, lint, build, and whitespace checks pass.

---

## Task 6: Guard Production Supabase Migration Apply

**Working directory:**
- `Database/`

**Steps:**

- [ ] Inspect linked migration status first:

```bash
cd Database
set -a
source ../Website/.env.local
set +a
SUPABASE_TELEMETRY_DISABLED=1 npx supabase migration list --linked
```

- [ ] Run a dry-run and confirm the only pending migration is `20260624103616_fix_shipping_and_pull_all_async_jobs.sql`:

```bash
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db push --linked --dry-run --include-all
```

- [ ] If the dry-run shows any extra pending migration, stop the apply path and inspect why the linked ledger differs from local migration history.

- [ ] Apply only after the dry-run is clean:

```bash
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db push --linked --include-all --yes
```

- [ ] Re-run the linked migration status:

```bash
SUPABASE_TELEMETRY_DISABLED=1 npx supabase migration list --linked
```

**Expected evidence:** production Supabase records `20260624103616_fix_shipping_and_pull_all_async_jobs.sql` as applied, with no surprise migration drift.

---

## Task 7: Verify Production Recovery For Both Stuck Jobs

**Working directory:**
- `Website/`

**Steps:**

- [ ] Run this read-only verification script from a shell that has `Website/.env.local` loaded. It prints job status only and does not print secrets:

```bash
cd Website
set -a
source .env.local
set +a
node --input-type=module <<'NODE'
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: shippingJob, error: shippingJobError } = await supabase
  .from("shipping_request_jobs")
  .select("id, shipping_request_id, request_number, status, item_count, prepared_count, retry_count, last_error_code, updated_at")
  .eq("request_number", "SH-1006")
  .single();
if (shippingJobError) throw shippingJobError;

const { count: shippingItems, error: shippingItemsError } = await supabase
  .from("shipping_request_items")
  .select("id", { count: "exact", head: true })
  .eq("shipping_request_id", shippingJob.shipping_request_id);
if (shippingItemsError) throw shippingItemsError;

const { data: bulkSession, error: bulkSessionError } = await supabase
  .from("gacha_bulk_open_sessions")
  .select("id, request_number, status, target_slots, processed_slots, open_items_awarded, collection_items_created, retry_count, last_error_code, updated_at")
  .eq("request_number", "BO-1001")
  .single();
if (bulkSessionError) throw bulkSessionError;

const { count: bulkResults, error: bulkResultsError } = await supabase
  .from("gacha_bulk_open_results")
  .select("id", { count: "exact", head: true })
  .eq("bulk_open_session_id", bulkSession.id);
if (bulkResultsError) throw bulkResultsError;

console.log(JSON.stringify({
  shipping: {
    requestNumber: shippingJob.request_number,
    status: shippingJob.status,
    itemCount: shippingJob.item_count,
    preparedCount: shippingJob.prepared_count,
    retryCount: shippingJob.retry_count,
    lastErrorCode: shippingJob.last_error_code,
    requestItems: shippingItems,
    updatedAt: shippingJob.updated_at,
  },
  pullAll: {
    requestNumber: bulkSession.request_number,
    status: bulkSession.status,
    targetSlots: bulkSession.target_slots,
    processedSlots: bulkSession.processed_slots,
    openItemsAwarded: bulkSession.open_items_awarded,
    collectionItemsCreated: bulkSession.collection_items_created,
    retryCount: bulkSession.retry_count,
    lastErrorCode: bulkSession.last_error_code,
    results: bulkResults,
    updatedAt: bulkSession.updated_at,
  },
}, null, 2));
NODE
```

- [ ] Run the same read-only script again after the queue retry interval.

- [ ] Expected shipping recovery:
  - `SH-1006.status` moves out of `retry_required`.
  - `SH-1006.preparedCount` reaches `504`.
  - `shipping_request_items` count for the request reaches `504`.
  - `lastErrorCode` no longer reports missing `collection_items.shipping_request_id`.

- [ ] Expected Pull All recovery:
  - `BO-1001.processedSlots` becomes greater than `0`.
  - `BO-1001.status` eventually becomes `completed`.
  - `BO-1001.processedSlots` reaches `targetSlots`.
  - `gacha_bulk_open_results` count reaches `targetSlots`.
  - `lastErrorCode` no longer reports `42702`.

- [ ] If either job does not retry after the DB fix, inspect queue/worker logs for the deployed `ynott-website` Cloudflare Worker. Cloudflare Wrangler login is only needed at that point, not for the database root-cause fix.

**Expected evidence:** both production rows show durable progress after the DB migration, proving both stuck loops had the same failure class: database function/schema defects inside async processors.

---

## Task 8: Commit And Push After Verification

**Steps:**

- [ ] Inspect the diff and ensure only intended files changed:

```bash
git status --short
git diff -- Database/supabase/migrations/20260624103616_fix_shipping_and_pull_all_async_jobs.sql Website/scripts/test-shipping-flow.mjs Website/scripts/test-bulk-open-migration.mjs Website/src/lib/supabase/types.ts
```

- [ ] Commit with Lore protocol:

```bash
git add Database/supabase/migrations/20260624103616_fix_shipping_and_pull_all_async_jobs.sql \
  Website/scripts/test-shipping-flow.mjs \
  Website/scripts/test-bulk-open-migration.mjs \
  Website/src/lib/supabase/types.ts

git commit -m "Repair async job processors that blocked production recovery" \
  -m "Constraint: Production SH-1006 and BO-1001 were stuck in retry loops from DB function/schema mismatches." \
  -m "Rejected: Rewriting shipped migrations | unsafe for linked Supabase history." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: Keep async job processors schema-qualified where PL/pgSQL variables can collide with table columns." \
  -m "Tested: npm run test:shipping-flow; npm run test:bulk-open-migration; npm run test:bulk-open-api-flow; npm run test:reward-conversion-flow; npm run verify:platform; npm run typecheck; npm run lint; npm run build; git diff --check" \
  -m "Not-tested: Production recovery until linked migration apply and queue retry verification complete" \
  -m "Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

- [ ] Push only after the commit contains the intended files:

```bash
git push origin HEAD:main
```

**Expected evidence:** GitHub `main` contains the tests, type update, and additive migration. Runtime recovery still depends on the linked Supabase migration being applied and production retry verification passing.

---

## Self-Review Before Completion

- [ ] No shipped migration is edited; all production DB changes are additive in `20260624103616_fix_shipping_and_pull_all_async_jobs.sql`.
- [ ] Shipping root cause is covered by a test that proves the missing `collection_items.shipping_request_id` column exists before processors use it.
- [ ] Pull All root cause is covered by a test that proves `process_bulk_open_chunk` no longer has a PL/pgSQL variable/column ambiguity on `result_payload`.
- [ ] Generated or patched Supabase types include `collection_items.shipping_request_id`.
- [ ] Production apply path uses linked migration dry-run before apply.
- [ ] Production verification checks `SH-1006` and `BO-1001` by request number and confirms durable progress, not just a cleared error field.
- [ ] The final report separates root cause, files changed, tests run, Supabase apply status, and production recovery evidence.
