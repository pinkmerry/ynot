# Launch-Safe Pack Opening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision after code-quality review:** Client-side chunking was rejected because a later chunk failure can partially mutate wallet/collection state while hiding already-awarded items. The final implementation preserves the existing atomic 1/10/100-pack API contract, counts rate limits by pack quantity, proves the RPC returns exact stock-image proof, and caps only the legacy post-RPC hydration fallback.

**Goal:** Make launch-time pack opening safe under burst traffic by removing the production post-RPC hydration hot path, limiting open bursts by pack quantity, preserving atomic 100-pack opens, and proving the public response does not leak house/private fields.

**Architecture:** Keep the database RPC as the single atomic authority for wallet debit, slot locking, prize-unit locking, and collection grants. Move launch protection to three narrow surfaces: RPC payload proof flags, a weighted API rate-limit primitive, and a bounded legacy hydration fallback that never hydrates large opens. Keep customer responses mapped through the existing public DTO so internal IDs, weights, unlock thresholds, and stock metadata never leave the server.

**Tech Stack:** Next.js 16 App Router on OpenNext Cloudflare, TypeScript, Supabase/Postgres RPC migrations, Node `node:test`, Supabase CLI via `npx supabase`.

---

## File Structure

- Create: `Website/scripts/test-gacha-open-launch-safety.mjs`
  - Source-level regression tests for launch safety: proof-flag migration, public response sanitization, weighted rate-limit usage, one-call 100-pack opens, and bounded fallback hydration.
- Modify: `Website/package.json`
  - Add `test:gacha-open-launch-safety`.
- Create: Supabase CLI-generated `Database/supabase/migrations/*_open_gacha_stock_image_proof.sql`
  - Patches `public.open_gacha_campaign(uuid,uuid,integer,text)` so normal awards and replayed opens include the internal `imageResolvedFromStockUnit` proof flag when the image came from `card_stock_units.image_url`.
- Create: Supabase CLI-generated `Database/supabase/migrations/*_weighted_api_rate_limit.sql`
  - Adds `public.consume_api_rate_limit_weighted(text,integer,integer,integer)` for quantity-costed limits.
- Modify: `Website/src/lib/security/rate-limit.ts`
  - Support `cost` in `RateLimitOptions`; increment in-memory and Supabase counters by that cost.
- Modify: `Website/src/lib/supabase/types.ts`
  - Add the generated RPC type for `consume_api_rate_limit_weighted`.
- Modify: `Website/src/app/api/ynot/gacha/open/route.ts`
  - Add lower request limit, profile unit limit, IP unit limit, and large-open hydration fallback cap while preserving 1-100 API quantities.
- Modify: `Website/src/features/ynot/open-intent.ts`
  - Preserve existing atomic-open idempotency keys.
- Modify: `Website/src/features/ynot/client.tsx`
  - Keep 100-pack opens as one API call and surface 429 retry-after messages clearly.

Implementation note: there are currently uncommitted changes in `Website/scripts/test-live-pack-revisions.mjs`, `Website/src/features/ynot/data.ts`, and `Website/src/features/ynot/types.ts`. Do not overwrite or revert those changes; merge around them if any task later touches the same file.

---

### Task 1: Add Launch-Safety Regression Tests

**Files:**
- Create: `Website/scripts/test-gacha-open-launch-safety.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Create the failing launch-safety test file**

Create `Website/scripts/test-gacha-open-launch-safety.mjs` with this complete content:

```js
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const openRouteSource = read("src/app/api/ynot/gacha/open/route.ts");
const rateLimitSource = read("src/lib/security/rate-limit.ts");
const openIntentSource = read("src/features/ynot/open-intent.ts");
const clientSource = read("src/features/ynot/client.tsx");

function latestMigrationWithSuffix(suffix) {
  const migrationsDir = new URL("../../Database/supabase/migrations/", import.meta.url);
  const name = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(suffix))
    .sort()
    .at(-1);
  assert.ok(name, `missing migration ending with ${suffix}`);
  return readFileSync(new URL(name, migrationsDir), "utf8");
}

function sourceBlock(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing block start: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing block end: ${label}`);
  return source.slice(startIndex, endIndex);
}

test("RPC proof migration marks stock-unit images without widening the public response", () => {
  const migration = latestMigrationWithSuffix("_open_gacha_stock_image_proof.sql");
  const publicOpenItemType = sourceBlock(
    openRouteSource,
    "type PublicOpenItem = {",
    "type PublicOpenResult = {",
    "public open item type",
  );
  const publicMapper = sourceBlock(
    openRouteSource,
    "function toPublicOpenItem",
    "function toPublicOpenResult",
    "public item mapper",
  );

  assert.match(migration, /imageResolvedFromStockUnit/);
  assert.match(
    migration,
    /'imageResolvedFromStockUnit',\s*nullif\(stock\.image_url,\s*''\)\s+is\s+not\s+null/i,
  );
  assert.match(
    migration,
    /'imageResolvedFromStockUnit',\s*unit_image_resolved_from_stock_unit/i,
  );
  assert.doesNotMatch(publicOpenItemType, /imageResolvedFromStockUnit|cardId|prizeUnitId|draw_round|card_stock|weight|unlockAtSoldPct/);
  assert.doesNotMatch(publicMapper, /imageResolvedFromStockUnit|cardId:|prizeUnitId:|draw_round_prize_unit_id|card_stock_unit_id|weight|unlockAtSoldPct/);
});

test("weighted API rate limit increments by pack quantity", () => {
  const migration = latestMigrationWithSuffix("_weighted_api_rate_limit.sql");

  assert.match(migration, /create or replace function public\.consume_api_rate_limit_weighted/);
  assert.match(migration, /p_cost integer default 1/);
  assert.match(migration, /effective_cost := greatest\(coalesce\(p_cost,\s*1\),\s*1\)/);
  assert.match(migration, /limits\.count \+ effective_cost/);
  assert.match(rateLimitSource, /cost\?: number/);
  assert.match(rateLimitSource, /normalizedRateLimitCost/);
  assert.match(rateLimitSource, /p_cost: cost/);
  assert.match(rateLimitSource, /existing\.count \+ cost/);
});

test("pack open API has request, profile-unit, and IP-unit launch guards", () => {
  assert.match(openRouteSource, /const gachaOpenRequestRateLimit = \{/);
  assert.match(openRouteSource, /const gachaOpenProfileUnitRateLimit = \{/);
  assert.match(openRouteSource, /const gachaOpenIpUnitRateLimit = \{/);
  assert.match(openRouteSource, /const MAX_OPEN_HYDRATION_ITEMS = 20;/);
  assert.match(openRouteSource, /scope: "ynot:gacha:open:units"/);
  assert.match(openRouteSource, /scope: "ynot:gacha:open:units:ip"/);
  assert.match(openRouteSource, /cost: quantity/);
  assert.match(openRouteSource, /quantity < 1 \|\| quantity > 100/);
  assert.match(openRouteSource, /items\.length <= MAX_OPEN_HYDRATION_ITEMS/);
  assert.doesNotMatch(openRouteSource, /open_quantity_chunk_required/);
});

test("100-pack opens remain one weighted API call", () => {
  const fireOpen = sourceBlock(
    clientSource,
    "function fireOpen",
    "function openAgain",
    "fire open handler",
  );
  assert.match(fireOpen, /postJson\("\/api\/ynot\/gacha\/open"/);
  assert.match(fireOpen, /quantity: targetQuantity/);
  assert.match(fireOpen, /openIntentIdempotencyKey\(\s*openIntentId \?\? null,\s*campaign\.id,\s*targetQuantity/s);
  assert.doesNotMatch(fireOpen, /for \(const chunk of chunks\)/);
  assert.doesNotMatch(clientSource, /GACHA_OPEN_RPC_CHUNK_SIZE|openQuantityChunks|mergeOpenResults/);
  assert.doesNotMatch(openIntentSource, /chunkIndex|part-\$\{safeChunkIndex\}/);
});
```

- [ ] **Step 2: Add the package script**

In `Website/package.json`, add this script next to the other `test:gacha-*` scripts:

```json
"test:gacha-open-launch-safety": "node --test scripts/test-gacha-open-launch-safety.mjs"
```

- [ ] **Step 3: Run the new test to verify it fails**

Run:

```bash
cd Website
npm run test:gacha-open-launch-safety
```

Expected: FAIL because the proof migration, weighted limiter migration, API launch guards, and hydration cap are not implemented yet.

- [ ] **Step 4: Commit the failing tests**

```bash
git add Website/scripts/test-gacha-open-launch-safety.mjs Website/package.json
git commit -m $'Define launch safety tests before pack-open hardening\n\nConstraint: launch fixes must prove no public payload widening and no unbounded 100-pack RPC.\nRejected: relying only on existing source-shape tests | they missed the live RPC proof-flag mismatch.\nConfidence: high\nScope-risk: narrow\nDirective: Keep these tests source-only; live Supabase checks belong in verification steps.\nTested: npm run test:gacha-open-launch-safety (expected failure)\nNot-tested: implementation not started'
```

---

### Task 2: Patch `open_gacha_campaign` to Emit Stock-Image Proof

**Files:**
- Create: Supabase CLI-generated `Database/supabase/migrations/*_open_gacha_stock_image_proof.sql`
- Test: `Website/scripts/test-gacha-open-launch-safety.mjs`
- Test: `Website/scripts/test-gacha-open-performance-shape.mjs`
- Test: `Website/scripts/test-subsku-image-routing.mjs`

- [ ] **Step 1: Generate the migration file**

Run:

```bash
cd Database
SUPABASE_TELEMETRY_DISABLED=1 npx supabase migration new open_gacha_stock_image_proof
```

Expected: Supabase CLI prints a new migration path ending in `_open_gacha_stock_image_proof.sql`.

- [ ] **Step 2: Fill the generated migration**

Replace the generated migration file content with this SQL:

```sql
-- open_gacha_stock_image_proof
--
-- Emit an internal proof flag when open_gacha_campaign has already resolved a
-- normal award image from the exact awarded stock unit. The Next.js API strips
-- this flag from the public response, but uses it to skip expensive fallback
-- hydration during launch traffic.

do $migration$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public.open_gacha_campaign(uuid,uuid,integer,text)'::regprocedure
  )
  into fn;

  if fn is null then
    raise exception 'open_gacha_campaign_not_found';
  end if;

  fn := replace(
    fn,
$snippet$  unit_card_image_url text;
  unit_display_tier text;$snippet$,
$snippet$  unit_card_image_url text;
  unit_image_resolved_from_stock_unit boolean;
  unit_display_tier text;$snippet$
  );

  fn := replace(
    fn,
$snippet$          'imageUrl', coalesce(stock.image_url, cards.image_url),
          'tier', items.tier,$snippet$,
$snippet$          'imageUrl', coalesce(stock.image_url, cards.image_url),
          'imageResolvedFromStockUnit', nullif(stock.image_url, '') is not null,
          'tier', items.tier,$snippet$
  );

  fn := replace(
    fn,
$snippet$      cards.name,
      coalesce(stock.image_url, cards.image_url),
      coalesce($snippet$,
$snippet$      cards.name,
      coalesce(stock.image_url, cards.image_url),
      nullif(stock.image_url, '') is not null,
      coalesce($snippet$
  );

  fn := replace(
    fn,
$snippet$      unit_card_name,
      unit_card_image_url,
      unit_display_tier,$snippet$,
$snippet$      unit_card_name,
      unit_card_image_url,
      unit_image_resolved_from_stock_unit,
      unit_display_tier,$snippet$
  );

  fn := replace(
    fn,
$snippet$      'imageUrl', unit_card_image_url,
      'tier', unit_tier,$snippet$,
$snippet$      'imageUrl', unit_card_image_url,
      'imageResolvedFromStockUnit', unit_image_resolved_from_stock_unit,
      'tier', unit_tier,$snippet$
  );

  if fn not like '%''imageResolvedFromStockUnit'', nullif(stock.image_url, '''') is not null%'
    or fn not like '%unit_image_resolved_from_stock_unit boolean%'
    or fn not like '%''imageResolvedFromStockUnit'', unit_image_resolved_from_stock_unit%'
    or fn like '%''imageResolvedFromStockUnit'', true%'
  then
    raise exception 'open_gacha_stock_image_proof_patch_failed';
  end if;

  execute fn;
end;
$migration$;
```

- [ ] **Step 3: Run proof-flag tests**

Run:

```bash
cd Website
npm run test:gacha-open-launch-safety
npm run test:gacha-open-performance
npm run test:subsku-images
```

Expected: `test:gacha-open-launch-safety` still fails on rate-limit/API/client sections, while the RPC proof migration assertions pass. The existing performance and sub-SKU image tests pass.

- [ ] **Step 4: Commit the RPC proof patch**

```bash
git add Database/supabase/migrations/*_open_gacha_stock_image_proof.sql
git commit -m $'Let stock-image-proven opens skip API hydration\n\nConstraint: the flag is internal proof for server fast-path logic and must not enter public DTOs.\nRejected: accepting any catalog image as proof | that would weaken exact awarded-stock image validation.\nConfidence: high\nScope-risk: moderate\nDirective: Keep imageResolvedFromStockUnit stripped from customer responses.\nTested: npm run test:gacha-open-performance; npm run test:subsku-images; npm run test:gacha-open-launch-safety (remaining expected failures outside RPC proof)\nNot-tested: production migration apply'
```

---

### Task 3: Add Weighted API Rate Limiting

**Files:**
- Create: Supabase CLI-generated `Database/supabase/migrations/*_weighted_api_rate_limit.sql`
- Modify: `Website/src/lib/security/rate-limit.ts`
- Modify: `Website/src/lib/supabase/types.ts`
- Test: `Website/scripts/test-gacha-open-launch-safety.mjs`

- [ ] **Step 1: Generate the weighted limiter migration**

Run:

```bash
cd Database
SUPABASE_TELEMETRY_DISABLED=1 npx supabase migration new weighted_api_rate_limit
```

Expected: Supabase CLI prints a new migration path ending in `_weighted_api_rate_limit.sql`.

- [ ] **Step 2: Fill the generated migration**

Replace the generated migration file content with this SQL:

```sql
-- weighted_api_rate_limit
--
-- Quantity-costed limiter for expensive mutations. Existing
-- consume_api_rate_limit(text,integer,integer) remains in place for normal
-- request-count limits.

create or replace function public.consume_api_rate_limit_weighted(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_cost integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_reset timestamptz;
  limiter public.api_rate_limits%rowtype;
  effective_cost integer;
begin
  if coalesce(length(trim(p_key)), 0) = 0 then
    raise exception 'rate limit key is required';
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit configuration';
  end if;

  effective_cost := greatest(coalesce(p_cost, 1), 1);
  next_reset := now() + make_interval(secs => p_window_seconds);

  insert into public.api_rate_limits as limits(key, window_start, expires_at, count, updated_at)
  values (p_key, now(), next_reset, effective_cost, now())
  on conflict (key) do update set
    window_start = case when limits.expires_at <= now() then now() else limits.window_start end,
    expires_at = case when limits.expires_at <= now() then next_reset else limits.expires_at end,
    count = case when limits.expires_at <= now() then effective_cost else limits.count + effective_cost end,
    updated_at = now()
  returning * into limiter;

  return jsonb_build_object(
    'allowed', limiter.count <= p_limit,
    'remaining', greatest(p_limit - limiter.count, 0),
    'resetAt', limiter.expires_at,
    'cost', effective_cost
  );
end;
$$;

revoke all on function public.consume_api_rate_limit_weighted(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit_weighted(text, integer, integer, integer) to service_role;
```

- [ ] **Step 3: Modify the rate-limit helper**

In `Website/src/lib/security/rate-limit.ts`, make these changes.

Change `RateLimitOptions` to:

```ts
type RateLimitOptions = {
  limit: number;
  windowMs: number;
  cost?: number;
};
```

Add this helper after `now()`:

```ts
function normalizedRateLimitCost(options: RateLimitOptions) {
  const cost = Number(options.cost ?? 1);
  return Number.isInteger(cost) && cost > 0 ? cost : 1;
}
```

Replace `checkInMemoryRateLimit` with:

```ts
function checkInMemoryRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const currentTime = now();
  const cost = normalizedRateLimitCost(options);
  cleanup(currentTime);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= currentTime) {
    buckets.set(key, { count: cost, resetAt: currentTime + options.windowMs });
    return {
      allowed: cost <= options.limit,
      remaining: Math.max(0, options.limit - cost),
      resetAt: currentTime + options.windowMs,
    };
  }

  if (existing.count + cost > options.limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += cost;
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - existing.count),
    resetAt: existing.resetAt,
  };
}
```

Replace `checkSupabaseRateLimit` with:

```ts
async function checkSupabaseRateLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const fallbackResetAt = now() + options.windowMs;
  const cost = normalizedRateLimitCost(options);
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("consume_api_rate_limit_weighted", {
    p_key: key,
    p_limit: options.limit,
    p_window_seconds: Math.max(1, Math.ceil(options.windowMs / 1000)),
    p_cost: cost,
  });
  if (error) throw error;
  return parseSupabaseLimitResult(data, fallbackResetAt) ?? {
    allowed: false,
    remaining: 0,
    resetAt: fallbackResetAt,
  };
}
```

- [ ] **Step 4: Update Supabase generated types**

In `Website/src/lib/supabase/types.ts`, add this function entry under `Database["public"]["Functions"]`:

```ts
      consume_api_rate_limit_weighted: {
        Args: {
          p_key: string;
          p_limit: number;
          p_window_seconds: number;
          p_cost?: number;
        };
        Returns: Json;
      };
```

- [ ] **Step 5: Run the launch-safety test**

Run:

```bash
cd Website
npm run test:gacha-open-launch-safety
```

Expected: The weighted rate-limit assertions pass; API route assertions still fail until the route guards and hydration cap land.

- [ ] **Step 6: Commit weighted limiter support**

```bash
git add Database/supabase/migrations/*_weighted_api_rate_limit.sql Website/src/lib/security/rate-limit.ts Website/src/lib/supabase/types.ts
git commit -m $'Rate limit expensive opens by pack quantity\n\nConstraint: one quantity=100 open must not count the same as one quantity=1 open.\nRejected: looping the old limiter per pack unit | it would add up to 100 extra RPCs before the actual open.\nConfidence: high\nScope-risk: moderate\nDirective: Use costed limits only for expensive mutations; simple routes can keep cost omitted.\nTested: npm run test:gacha-open-launch-safety (remaining expected failures outside limiter)\nNot-tested: production migration apply'
```

---

### Task 4: Guard the Pack-Open API for Launch Bursts

**Files:**
- Modify: `Website/src/app/api/ynot/gacha/open/route.ts`
- Test: `Website/scripts/test-gacha-open-launch-safety.mjs`
- Test: `Website/scripts/test-pack-open-privacy.mjs`

- [ ] **Step 1: Replace the single request limiter with launch guard constants**

In `Website/src/app/api/ynot/gacha/open/route.ts`, replace `gachaOpenRateLimit` with:

```ts
const gachaOpenRequestRateLimit = {
  // One customer can still open again quickly, but scripted POST loops are
  // bounded before they reach the wallet/RPC path.
  limit: 30,
  windowMs: 60_000,
};

const gachaOpenProfileUnitRateLimit = {
  // Counts pack units, not HTTP requests. One honest 100-pack open fits while
  // repeated bulk loops are held before they reach the RPC.
  limit: 120,
  windowMs: 60_000,
};

const gachaOpenIpUnitRateLimit = {
  // Shared-IP guard for launch abuse. This is intentionally higher than the
  // profile limit so normal households are not blocked before attackers are.
  limit: 600,
  windowMs: 60_000,
};

const MAX_OPEN_HYDRATION_ITEMS = 20;
```

- [ ] **Step 2: Parse the request body before the unit limiter**

In the `POST` handler, replace this section:

```ts
  const limited = await enforceRateLimit(request, "ynot:gacha:open", gachaOpenRateLimit, session.profileId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as { campaignId?: unknown; quantity?: unknown; idempotencyKey?: unknown } | null;
```

with:

```ts
  const requestLimited = await enforceRateLimit(
    request,
    "ynot:gacha:open",
    gachaOpenRequestRateLimit,
    session.profileId,
  );
  if (requestLimited) return requestLimited;

  const body = await request.json().catch(() => null) as { campaignId?: unknown; quantity?: unknown; idempotencyKey?: unknown } | null;
```

- [ ] **Step 3: Add weighted profile/IP limiters and cap legacy hydration**

Immediately after the existing quantity validation:

```ts
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return Response.json({ error: "Quantity must be between 1 and 100." }, { status: 400 });
```

add:

```ts
  const profileUnitLimited = await enforceRateLimit(
    request,
    "ynot:gacha:open:units",
    { ...gachaOpenProfileUnitRateLimit, cost: quantity },
    session.profileId,
  );
  if (profileUnitLimited) return profileUnitLimited;

  const ipUnitLimited = await enforceRateLimit(
    request,
    "ynot:gacha:open:units:ip",
    { ...gachaOpenIpUnitRateLimit, cost: quantity },
  );
  if (ipUnitLimited) return ipUnitLimited;
```

Keep the existing `quantity < 1 || quantity > 100` validation unchanged so the
100-pack button remains one atomic RPC call. In the post-RPC response section,
limit the legacy hydration fallback:

```ts
  const shouldHydrate = Boolean(
    openId &&
      items.length <= MAX_OPEN_HYDRATION_ITEMS &&
      needsOpenItemHydration(items),
  );
```

- [ ] **Step 4: Run route/privacy tests**

Run:

```bash
cd Website
npm run test:gacha-open-launch-safety
npm run test:pack-open-privacy
```

Expected: API launch-guard assertions pass and public privacy tests still pass.

- [ ] **Step 5: Commit API launch guards**

```bash
git add Website/src/app/api/ynot/gacha/open/route.ts
git commit -m $'Bound pack-open bursts before the RPC\n\nConstraint: launch traffic needs both request and pack-unit limits because quantity=100 is one HTTP call.\nRejected: only lowering request count | it still lets a single request carry too much DB work.\nConfidence: high\nScope-risk: moderate\nDirective: Keep all open responses mapped through toPublicOpenResult after these guards.\nTested: npm run test:gacha-open-launch-safety (remaining expected client failure); npm run test:pack-open-privacy\nNot-tested: production Cloudflare traffic'
```

---

### Task 5: Preserve Atomic 100-Pack Opens in the Client

**Files:**
- Modify: `Website/src/features/ynot/client.tsx`
- Test: `Website/scripts/test-pack-opening-flow.mjs`
- Test: `Website/scripts/test-gacha-open-launch-safety.mjs`

- [ ] **Step 1: Keep one API call per open action**

Keep `GachaOpenPanel.fireOpen` sending one `POST /api/ynot/gacha/open` call
with `quantity: targetQuantity`. Do not split 100-pack opens in the browser.
This preserves the existing single-RPC authority for wallet debit, slot locking,
prize-unit locking, and collection grants.

- [ ] **Step 2: Improve 429 user messaging**

In the `catch` block inside `fireOpen`, replace:

```ts
        setMessage(
          error instanceof Error ? error.message : "Could not open gacha.",
        );
```

with:

```ts
        setMessage(
          retryAfterMessage(error) ??
            (error instanceof Error ? error.message : "Could not open gacha."),
        );
```

- [ ] **Step 3: Update existing opening-flow tests**

In `Website/scripts/test-pack-opening-flow.mjs`, inside the `"auto-start open uses intent-derived idempotency and strips replay URL after success"` test, add:

```js
  assert.match(fireOpen, /quantity: targetQuantity/);
  assert.doesNotMatch(fireOpen, /for \(const chunk of chunks\)/);
```

- [ ] **Step 4: Run client flow tests**

Run:

```bash
cd Website
npm run test:pack-opening-flow
npm run test:gacha-open-launch-safety
```

Expected: Both tests pass.

- [ ] **Step 5: Commit atomic-open client behavior**

```bash
git add Website/src/features/ynot/client.tsx Website/scripts/test-pack-opening-flow.mjs
git commit -m $'Keep bulk pack opens atomic under launch limits\n\nConstraint: the 100-pack button must remain one recoverable wallet/inventory action.\nRejected: client-side chunking | a later chunk failure can partially mutate customer state.\nConfidence: high\nScope-risk: moderate\nDirective: Keep rate-limit cost and hydration caps around the atomic RPC instead of splitting customer actions.\nTested: npm run test:pack-opening-flow; npm run test:gacha-open-launch-safety\nNot-tested: live bulk-open user session'
```

---

### Task 6: Full Verification and Production Migration Gate

**Files:**
- No source changes expected unless a check fails.

- [ ] **Step 1: Run targeted test suite**

Run:

```bash
cd Website
npm run test:gacha-open-launch-safety
npm run test:gacha-open-performance
npm run test:pack-opening-flow
npm run test:gacha-open-bundle
npm run test:subsku-images
npm run test:pack-open-privacy
```

Expected: all tests PASS.

- [ ] **Step 2: Run typecheck, dependency audit, and Cloudflare build**

Run:

```bash
cd Website
npm run typecheck
npm audit --omit=dev
npm run cf:build:website
```

Expected: typecheck PASS, audit reports `found 0 vulnerabilities`, and OpenNext Cloudflare build completes with `Worker saved in .open-next/worker.js`.

- [ ] **Step 3: Dry-run Supabase production migrations**

Run:

```bash
cd Database
set -a
source ../Website/.env.local
set +a
SUPABASE_TELEMETRY_DISABLED=1 npx supabase migration list --linked
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db push --linked --dry-run --include-all
```

Expected: migration list connects successfully and dry-run shows only the two new launch-safety migrations pending.

- [ ] **Step 4: Apply production migrations after dry-run is clean**

Run:

```bash
cd Database
set -a
source ../Website/.env.local
set +a
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db push --linked --include-all --yes
SUPABASE_TELEMETRY_DISABLED=1 npx supabase migration list --linked
```

Expected: both new migrations are listed as applied locally and remotely.

- [ ] **Step 5: Verify live RPC and direct-execute permissions**

Run:

```bash
cd Database
set -a
source ../Website/.env.local
set +a
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db query --linked --output table "select pg_get_functiondef('public.open_gacha_campaign(uuid,uuid,integer,text)'::regprocedure) like '%imageResolvedFromStockUnit%' as has_stock_image_proof_flag, pg_get_functiondef('public.open_gacha_campaign(uuid,uuid,integer,text)'::regprocedure) like '%''imageResolvedFromStockUnit'', unit_image_resolved_from_stock_unit%' as has_new_open_proof, pg_get_functiondef('public.open_gacha_campaign(uuid,uuid,integer,text)'::regprocedure) like '%''imageResolvedFromStockUnit'', nullif(stock.image_url, '''') is not null%' as has_replay_proof;"
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db query --linked --output table "select rolname, has_function_privilege(rolname, 'public.open_gacha_campaign(uuid,uuid,integer,text)', 'EXECUTE') as can_execute from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname;"
```

Expected:

```text
has_stock_image_proof_flag | has_new_open_proof | has_replay_proof
true                       | true               | true

rolname       | can_execute
anon          | false
authenticated | false
service_role  | true
```

- [ ] **Step 6: Commit final verification marker**

If all previous commits already contain source changes, create an empty verification commit:

```bash
git commit --allow-empty -m $'Verify launch-safe pack opening gates\n\nConstraint: production launch must avoid the known Cloudflare 1102 hydration path and bound 100-pack burst load.\nRejected: claiming safety from source tests only | live RPC function definition must prove the production proof flag exists.\nConfidence: high\nScope-risk: moderate\nDirective: Do not raise per-request quantity above 20 without a staged load test and Cloudflare CPU evidence.\nTested: npm run test:gacha-open-launch-safety; npm run test:gacha-open-performance; npm run test:pack-opening-flow; npm run test:gacha-open-bundle; npm run test:subsku-images; npm run test:pack-open-privacy; npm run typecheck; npm audit --omit=dev; npm run cf:build:website; supabase db push --linked --dry-run --include-all; supabase db push --linked --include-all --yes; live RPC proof query; live RPC privilege query\nNot-tested: arbitrary public launch traffic above the configured limits'
```

---

## Production Stop Conditions

Stop and do not deploy if any of these are true:

- The live RPC proof query returns `false` for any proof column.
- `anon` or `authenticated` can execute `open_gacha_campaign`.
- `test:pack-open-privacy` shows `imageResolvedFromStockUnit`, raw IDs, `logicMode`, `remaining`, `weight`, or `unlockAtSoldPct` in customer DTOs.
- `npm run cf:build:website` fails.
- Supabase dry-run lists older unexpected pending migrations before the two launch-safety migrations.
- Cloudflare tail or dashboard shows new 1102 errors during the controlled post-deploy smoke window.

## Launch Defaults

- Per API request: existing 1-100 pack quantities remain supported.
- Per profile: max 30 open requests/minute and 120 pack units/minute.
- Per IP: max 600 pack units/minute.
- 100-pack button: one API call and one atomic `open_gacha_campaign` RPC.
- Legacy post-RPC hydration fallback: max 20 items; stock-image-proven RPC payloads skip hydration.
- Public response: unchanged customer fields only: `status`, `openId` as public code, `publicCode`, `costCoins`, `items`, and optional `replayed`; item fields remain `name`, `imageUrl`, `displayTier`, `valueThb`, `position`, `isLastPrize`, and `bundleQuantity`.

## Self-Review

Spec coverage:
- Handles many players opening packs: Task 3 and Task 4 add shared weighted rate limits.
- Handles some players opening many packs quickly: Task 4 counts pack units before the RPC while Task 5 preserves the atomic 100-pack action.
- Avoids house info leak: Task 1 and Task 6 assert no private fields enter public response types or mappers.
- Avoids known Cloudflare 1102 path: Task 2 makes the route fast path usable in production; Task 6 verifies live function definition.
- Keeps wallet/inventory authority atomic: no task moves grant/debit logic out of `open_gacha_campaign`.

Placeholder scan:
- The only non-literal migration paths are Supabase CLI-generated paths, required by the Supabase workflow. Tests locate those files by exact suffix and fail if they do not exist.
- No implementation step uses unspecified behavior or missing code.

Type consistency:
- `RateLimitOptions.cost` is defined before use.
- `openIntentIdempotencyKey(...)` remains the one-call action idempotency key.
- `YnotGachaOpenResult` is reused without adding customer-visible private fields.
