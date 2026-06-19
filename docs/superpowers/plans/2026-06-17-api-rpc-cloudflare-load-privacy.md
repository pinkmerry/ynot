# API RPC Cloudflare Load Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce avoidable Cloudflare Worker compute/subrequest load across the YNOTT API/RPC paths while preserving pack-open, top-up, admin, Last Prize, and public privacy behavior.

**Architecture:** Keep prize selection, wallet debit, idempotency, inventory unlock, and Last Prize award logic in the existing database contracts. Add narrow service-role RPC wrappers/aggregates for repeated read work, batch only compatible rate-limit checks, and keep public API DTOs as explicit allowlists so house logic stays server/admin-side. Each change starts with static regression tests that prove the intended API/RPC call shape and forbidden public fields.

**Tech Stack:** Next.js App Router API routes, TypeScript, Supabase Postgres RPC/migrations, Node test runner, OpenNext Cloudflare Worker runtime.

---

## Scope And Non-Negotiable Contracts

- Do not change `public.open_gacha_campaign` selection math, wallet debit, idempotency, draw slot updates, prize unit assignment, inventory-gated unlock math, or Last Prize final-open award logic.
- Do not expose these fields in customer/public responses: `weight`, `unlockAtSoldPct`, `soldPct`, `logic_snapshot`, `logicMode`, `stockUnitFilter`, `stockUnitGroupKey`, `certNumber`, `gemrateId`, `stockUnitId`, `drawRoundPrizeUnitIds`, `intendedStock`, `identityMismatch`, `primaryReason`, raw `tier`, or raw internal IDs.
- Admin/service-role code may read internal fields when needed, but public DTOs must be allowlisted and tested.
- Preserve the current first request-rate-limit gate position in `Website/src/app/api/ynot/gacha/open/route.ts`; batch only the two quantity-dependent unit gates so invalid-body abuse behavior does not drift.
- New database functions that expose public-safe DTOs still run through service-role API routes unless explicitly designed and tested for direct public grants.

## File Structure

- Create `Website/scripts/test-api-rpc-cloudflare-privacy.mjs`: static regression suite for API/RPC call shape, public privacy allowlists, and broad-read removals.
- Modify `Website/package.json`: add `test:api-rpc-cloudflare-privacy`.
- Create `Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql`: add batched rate-limit RPC, public pack-open reveal wrapper, public Last Prize preview RPC, and admin card usage aggregate.
- Modify `Website/src/lib/security/rate-limit.ts`: keep `enforceRateLimit`, add `enforceRateLimits` for compatible batched checks.
- Modify `Website/src/app/api/ynot/gacha/open/route.ts`: call the new reveal wrapper, batch the two quantity unit limits, keep public DTO output unchanged, and keep legacy hydration only when the wrapper is missing or an explicit compatibility flag is enabled.
- Modify `Website/src/lib/supabase/types.ts`: add typed RPC entries for new functions.
- Modify `Website/src/lib/lucky-draw/data.ts`: add `getCardCatalogByIds` next to `getCardCatalog`.
- Modify `Website/src/features/ynot/data.ts`: use narrow RPCs/helpers for Last Prize preview, collection/history/shipping card lookup, action-token reuse, top-up select narrowing, and admin cards.
- Modify `Website/src/app/api/ynot/admin/cards/route.ts`: replace high-row stock status reads with `get_card_usage_summary`, and return a narrow admin card payload after create/update.

---

### Task 1: Add API/RPC Privacy And Load Contract Tests

**Files:**
- Create: `Website/scripts/test-api-rpc-cloudflare-privacy.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Create the failing regression test file**

Create `Website/scripts/test-api-rpc-cloudflare-privacy.mjs` with this complete content:

```js
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function latestMigrationBySuffix(suffix) {
  const dir = new URL("../../Database/supabase/migrations/", import.meta.url);
  const file = readdirSync(dir).filter((name) => name.endsWith(suffix)).sort().at(-1);
  assert.ok(file, `missing migration with suffix ${suffix}`);
  return readFileSync(new URL(file, dir), "utf8");
}

function between(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex !== -1, `missing start marker: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(endIndex !== -1, `missing end marker: ${label}`);
  return source.slice(startIndex, endIndex);
}

function assertNoForbiddenPublicFields(source, label) {
  for (const field of [
    "weight",
    "unlockAtSoldPct",
    "soldPct",
    "logic_snapshot",
    "logicMode",
    "stockUnitFilter",
    "stockUnitGroupKey",
    "certNumber",
    "gemrateId",
    "stockUnitId",
    "drawRoundPrizeUnitIds",
    "intendedStock",
    "identityMismatch",
    "primaryReason",
  ]) {
    assert.doesNotMatch(source, new RegExp(`${field}\\s*:`), `${label} must not expose ${field}`);
  }
  assert.doesNotMatch(source, /\btier\s*:/, `${label} must not expose raw tier`);
}

const packageSource = read("../package.json");
const rateLimitSource = read("../src/lib/security/rate-limit.ts");
const openRouteSource = read("../src/app/api/ynot/gacha/open/route.ts");
const dataSource = read("../src/features/ynot/data.ts");
const luckyDrawDataSource = read("../src/lib/lucky-draw/data.ts");
const adminCardsRouteSource = read("../src/app/api/ynot/admin/cards/route.ts");
const supabaseTypesSource = read("../src/lib/supabase/types.ts");
const migrationSource = latestMigrationBySuffix("_api_rpc_cloudflare_load_privacy.sql");

test("package exposes the API/RPC Cloudflare privacy regression script", () => {
  assert.match(packageSource, /"test:api-rpc-cloudflare-privacy":\s*"node --test scripts\/test-api-rpc-cloudflare-privacy\.mjs"/);
});

test("batched rate-limit RPC is service-role only and keeps weighted costs", () => {
  assert.match(migrationSource, /create or replace function public\.consume_api_rate_limits_weighted\(\s*p_checks jsonb\s*\)/);
  assert.match(migrationSource, /public\.consume_api_rate_limit_weighted\(/);
  assert.match(migrationSource, /p_cost/);
  assert.match(migrationSource, /revoke all on function public\.consume_api_rate_limits_weighted\(jsonb\) from public,\s*anon,\s*authenticated;/);
  assert.match(migrationSource, /grant execute on function public\.consume_api_rate_limits_weighted\(jsonb\) to service_role;/);
  assert.match(supabaseTypesSource, /consume_api_rate_limits_weighted/);
});

test("pack open batches only quantity-dependent unit gates and preserves request gate order", () => {
  assert.match(rateLimitSource, /export async function enforceRateLimits/);
  assert.match(rateLimitSource, /rpc\("consume_api_rate_limits_weighted"/);
  assert.match(openRouteSource, /const requestLimited = await enforceRateLimit\(/);
  assert.match(openRouteSource, /const body = await request\.json\(\)/);
  assert.ok(
    openRouteSource.indexOf("const requestLimited = await enforceRateLimit(") <
      openRouteSource.indexOf("const body = await request.json()"),
    "request burst gate must remain before body parsing",
  );
  assert.match(openRouteSource, /const unitLimited = await enforceRateLimits\(/);
  assert.match(openRouteSource, /gachaOpenProfileUnitRateLimit\.scope/);
  assert.match(openRouteSource, /gachaOpenIpUnitRateLimit\.scope/);
});

test("pack open uses public reveal RPC wrapper and keeps DTO allowlist", () => {
  assert.match(migrationSource, /create or replace function public\.open_gacha_campaign_public_reveal/);
  assert.match(openRouteSource, /rpc\("open_gacha_campaign_public_reveal"/);
  assert.match(openRouteSource, /isMissingFunctionError/);
  assert.match(openRouteSource, /YNOT_PACK_OPEN_COMPAT_HYDRATION/);
  const publicItem = between(openRouteSource, "function toPublicOpenItem", "function toPublicOpenResult", "public open item mapper");
  assert.match(publicItem, /displayTier:/);
  assert.match(publicItem, /bundleQuantity:\s*publicBundleQuantity/);
  assertNoForbiddenPublicFields(publicItem, "pack-open public item");
  assert.match(migrationSource, /'imageResolvedFromStockUnit'/);
  assert.doesNotMatch(migrationSource, /'weight'/);
  assert.doesNotMatch(migrationSource, /'unlockAtSoldPct'/);
  assert.doesNotMatch(migrationSource, /'stockUnitFilter'/);
});

test("public Last Prize preview uses a narrow RPC and returns public fields only", () => {
  assert.match(migrationSource, /create or replace function public\.get_public_last_prize_preview/);
  assert.match(dataSource, /rpc\("get_public_last_prize_preview"/);
  const publicResolver = between(
    dataSource,
    "export async function getLastPrizePreviewForCampaign",
    "function isOwnerReviewLineupRow",
    "public Last Prize resolver",
  );
  assert.doesNotMatch(publicResolver, /from\("draw_rounds"\)\.select\("\*"\)/);
  assert.match(publicResolver, /cardName/);
  assert.match(publicResolver, /cardCode/);
  assert.match(publicResolver, /cardImageUrl/);
  assertNoForbiddenPublicFields(publicResolver, "Last Prize preview resolver");
});

test("admin user detail uses scoped card catalog reads and reuses collection tokens", () => {
  assert.match(luckyDrawDataSource, /export async function getCardCatalogByIds/);
  assert.match(dataSource, /getCardCatalogByIds/);
  assert.doesNotMatch(dataSource, /readOrEmpty\("collection_card_catalog"[\s\S]*getCardCatalog\(supabase\)/);
  assert.doesNotMatch(dataSource, /readOrEmpty\("gacha_history_card_catalog"[\s\S]*getCardCatalog\(supabase\)/);
  assert.doesNotMatch(dataSource, /readOrEmpty\("shipping_card_catalog"[\s\S]*getCardCatalog\(supabase\)/);
  const collectionMapper = between(dataSource, "return Promise.all(items.map(async (item) => {", "export async function getGachaOpenHistory", "collection mapper");
  assert.match(collectionMapper, /id:\s*actionTokenByItemId\.get\(item\.id\)/);
  assert.doesNotMatch(collectionMapper, /id:\s*await collectionItemActionToken/);
});

test("admin card usage uses grouped RPC counts instead of loading stock status rows", () => {
  assert.match(migrationSource, /create or replace function public\.get_card_usage_summary/);
  assert.match(adminCardsRouteSource, /rpc\("get_card_usage_summary"/);
  assert.doesNotMatch(adminCardsRouteSource, /from\("card_stock_units"\)[\s\S]*\.select\("status"\)[\s\S]*\.limit\(50000\)/);
  assert.match(adminCardsRouteSource, /const ADMIN_CARD_RETURN_SELECT =/);
  assert.doesNotMatch(adminCardsRouteSource, /\.select\("\*"\)\.single\(\)/);
});

test("top-up reads do not fetch slip provider messages unless sensitive details are requested", () => {
  assert.match(dataSource, /const TOP_UP_PUBLIC_SELECT =/);
  assert.match(dataSource, /const TOP_UP_ADMIN_SELECT =/);
  assert.match(dataSource, /const TOP_UP_SENSITIVE_SELECT =/);
  const getTopUpsBlock = between(dataSource, "export async function getTopUps", "export function toTopUp", "getTopUps");
  assert.doesNotMatch(getTopUpsBlock, /\.select\("\*"\)/);
  assert.match(getTopUpsBlock, /includeSensitiveSlipDetails\s*\?\s*TOP_UP_SENSITIVE_SELECT\s*:\s*includeAll\s*\?\s*TOP_UP_ADMIN_SELECT\s*:\s*TOP_UP_PUBLIC_SELECT/);
});
```

- [ ] **Step 2: Add the package script**

Modify `Website/package.json` inside the `scripts` object by adding this exact entry near the other `test:*` scripts:

```json
"test:api-rpc-cloudflare-privacy": "node --test scripts/test-api-rpc-cloudflare-privacy.mjs"
```

- [ ] **Step 3: Run the new test and confirm it fails for the missing implementation**

Run:

```bash
cd Website && npm run test:api-rpc-cloudflare-privacy
```

Expected: FAIL with missing script/migration/helper assertions such as `missing migration with suffix _api_rpc_cloudflare_load_privacy.sql`.

- [ ] **Step 4: Commit the failing contract tests**

Run:

```bash
git add Website/package.json Website/scripts/test-api-rpc-cloudflare-privacy.mjs
git commit \
  -m "Lock API RPC load and privacy contracts" \
  -m "Constraint: Public customer responses must stay allowlisted and house fields must remain server/admin-side." \
  -m "Rejected: Optimizing first without tests | too risky for pack-open and Last Prize privacy." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: Keep these tests updated when adding public API/RPC fields." \
  -m "Tested: npm run test:api-rpc-cloudflare-privacy fails on missing implementation" \
  -m "Not-tested: runtime behavior is intentionally unchanged in this test-only commit"
```

---

### Task 2: Batch Compatible Pack-Open Rate-Limit RPC Calls

**Files:**
- Create: `Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql`
- Modify: `Website/src/lib/security/rate-limit.ts`
- Modify: `Website/src/app/api/ynot/gacha/open/route.ts`
- Modify: `Website/src/lib/supabase/types.ts`
- Test: `Website/scripts/test-api-rpc-cloudflare-privacy.mjs`

- [ ] **Step 1: Add the batched rate-limit RPC migration section**

Create `Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql` with this first section:

```sql
-- api_rpc_cloudflare_load_privacy
--
-- Read-path and API/RPC subrequest reductions only. This migration must not
-- change prize selection math, wallet debit, idempotency, inventory unlock
-- logic, or Last Prize award logic.

create or replace function public.consume_api_rate_limits_weighted(
  p_checks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  check_item jsonb;
  check_result jsonb;
  results jsonb := '[]'::jsonb;
  first_blocked jsonb := null;
  check_index integer := 0;
  check_key text;
  check_limit integer;
  check_window_seconds integer;
  check_cost integer;
begin
  if jsonb_typeof(p_checks) is distinct from 'array' then
    raise exception 'rate limit checks must be a json array';
  end if;

  for check_item in
    select value from jsonb_array_elements(p_checks)
  loop
    check_index := check_index + 1;
    check_key := check_item->>'key';
    check_limit := nullif(check_item->>'limit', '')::integer;
    check_window_seconds := nullif(check_item->>'windowSeconds', '')::integer;
    check_cost := coalesce(nullif(check_item->>'cost', '')::integer, 1);

    check_result := public.consume_api_rate_limit_weighted(
      check_key,
      check_limit,
      check_window_seconds,
      check_cost
    ) || jsonb_build_object(
      'key', check_key,
      'limit', check_limit,
      'windowSeconds', check_window_seconds,
      'index', check_index
    );

    results := results || jsonb_build_array(check_result);

    if (check_result->>'allowed')::boolean is false and first_blocked is null then
      first_blocked := check_result;
    end if;
  end loop;

  return jsonb_build_object(
    'allowed', first_blocked is null,
    'checks', results,
    'firstBlocked', first_blocked
  );
end;
$$;

revoke all on function public.consume_api_rate_limits_weighted(jsonb) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limits_weighted(jsonb) to service_role;
```

- [ ] **Step 2: Add Supabase type entries for the batched RPC**

Modify `Website/src/lib/supabase/types.ts` in `Functions` next to `consume_api_rate_limit_weighted`:

```ts
      consume_api_rate_limits_weighted: {
        Args: {
          p_checks: Json;
        };
        Returns: Json;
      };
```

- [ ] **Step 3: Add `enforceRateLimits` to the rate-limit helper**

Modify `Website/src/lib/security/rate-limit.ts` by adding these types after `RateLimitResult`:

```ts
type RateLimitCheck = {
  scope: string;
  options: RateLimitOptions;
  subject?: string | null;
};

type BatchRateLimitResult = {
  allowed: boolean;
  checks: RateLimitResult[];
  firstBlocked: RateLimitResult | null;
};
```

Then add this parser and checker after `checkSupabaseRateLimit`:

```ts
function parseSupabaseBatchLimitResult(value: unknown, fallbackResetAt: number): BatchRateLimitResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const checksRaw = Array.isArray(record.checks) ? record.checks : [];
  const checks = checksRaw.flatMap((item) => {
    const parsed = parseSupabaseLimitResult(item, fallbackResetAt);
    return parsed ? [parsed] : [];
  });
  const firstBlocked = parseSupabaseLimitResult(record.firstBlocked, fallbackResetAt);
  const allowed = record.allowed === true && !firstBlocked;
  if (!checks.length) return null;
  return { allowed, checks, firstBlocked };
}

async function checkSupabaseRateLimits(
  request: Request,
  checks: RateLimitCheck[],
): Promise<BatchRateLimitResult> {
  const fallbackResetAt = now() + Math.max(...checks.map((check) => check.options.windowMs));
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("consume_api_rate_limits_weighted", {
    p_checks: checks.map((check) => ({
      key: rateLimitKey(request, check.scope, check.subject),
      limit: check.options.limit,
      windowSeconds: Math.max(1, Math.ceil(check.options.windowMs / 1000)),
      cost: normalizedRateLimitCost(check.options),
    })),
  });
  if (error) throw error;
  return parseSupabaseBatchLimitResult(data, fallbackResetAt) ?? {
    allowed: false,
    checks: [],
    firstBlocked: { allowed: false, remaining: 0, resetAt: fallbackResetAt },
  };
}
```

Then add this export after `enforceRateLimit`:

```ts
export async function enforceRateLimits(request: Request, checks: RateLimitCheck[]) {
  if (!checks.length) return null;
  const backend = process.env.RATE_LIMIT_BACKEND?.trim().toLowerCase();

  if (backend === "supabase") {
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "Supabase rate-limit backend is not configured." }, { status: 503 });
    }
    try {
      const result = await checkSupabaseRateLimits(request, checks);
      return responseFromResult(result.firstBlocked ?? { allowed: true, remaining: 0, resetAt: now() });
    } catch (error) {
      console.warn(
        "rate_limit_backend_unavailable",
        error instanceof Error ? error.message : String(error),
      );
      return Response.json(
        { error: "Rate-limit backend is unavailable." },
        { status: 503 },
      );
    }
  }

  if (process.env.NODE_ENV === "production" && !envFlag("RATE_LIMIT_ALLOW_IN_MEMORY_PRODUCTION")) {
    return Response.json(
      { error: "Production rate-limit backend is not configured. Set RATE_LIMIT_BACKEND=supabase after applying the api_rate_limits migration." },
      { status: 503 },
    );
  }

  for (const check of checks) {
    const result = checkInMemoryRateLimit(
      rateLimitKey(request, check.scope, check.subject),
      check.options,
    );
    const response = responseFromResult(result);
    if (response) return response;
  }
  return null;
}
```

- [ ] **Step 4: Batch only the quantity-dependent open-route unit gates**

Modify the import in `Website/src/app/api/ynot/gacha/open/route.ts`:

```ts
import { enforceRateLimit, enforceRateLimits } from "@/lib/security/rate-limit";
```

Replace the two separate post-body unit checks with:

```ts
  const unitLimited = await enforceRateLimits(request, [
    {
      scope: gachaOpenProfileUnitRateLimit.scope,
      options: {
        limit: gachaOpenProfileUnitRateLimit.limit,
        windowMs: gachaOpenProfileUnitRateLimit.windowMs,
        cost: quantity,
      },
      subject: session.profileId,
    },
    {
      scope: gachaOpenIpUnitRateLimit.scope,
      options: {
        limit: gachaOpenIpUnitRateLimit.limit,
        windowMs: gachaOpenIpUnitRateLimit.windowMs,
        cost: quantity,
      },
    },
  ]);
  if (unitLimited) return unitLimited;
```

Leave the existing `requestLimited` block before `request.json()` unchanged.

- [ ] **Step 5: Verify the rate-limit contract**

Run:

```bash
cd Website && npm run test:api-rpc-cloudflare-privacy && npm run test:rate-limits
```

Expected: `test:rate-limits` PASS. `test:api-rpc-cloudflare-privacy` may still fail on later tasks that are not implemented yet.

- [ ] **Step 6: Commit the rate-limit batching**

Run:

```bash
git add Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql Website/src/lib/security/rate-limit.ts Website/src/app/api/ynot/gacha/open/route.ts Website/src/lib/supabase/types.ts
git commit \
  -m "Batch compatible pack-open rate-limit checks" \
  -m "Constraint: The first request burst gate stays before JSON parsing to preserve abuse handling." \
  -m "Rejected: Moving all three gates into one batch | invalid-body rate-limit behavior would drift." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Batch only rate-limit checks that have the same request parsing preconditions." \
  -m "Tested: npm run test:rate-limits" \
  -m "Not-tested: live Supabase dry-run is saved for final verification"
```

---

### Task 3: Move Pack-Open Reveal Hydration Behind A Public Reveal RPC Wrapper

**Files:**
- Modify: `Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql`
- Modify: `Website/src/app/api/ynot/gacha/open/route.ts`
- Modify: `Website/src/lib/supabase/types.ts`
- Test: `Website/scripts/test-api-rpc-cloudflare-privacy.mjs`

- [ ] **Step 1: Append the public reveal wrapper to the migration**

Append this SQL to `Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql`:

```sql
create or replace function public.open_gacha_campaign_public_reveal(
  p_profile_id uuid,
  p_draw_round_id uuid,
  p_quantity integer,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  base_result jsonb;
  open_id uuid;
  reveal_items jsonb;
begin
  base_result := public.open_gacha_campaign(
    p_profile_id,
    p_draw_round_id,
    p_quantity,
    p_idempotency_key
  );

  if coalesce(base_result->>'openId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return base_result;
  end if;

  open_id := (base_result->>'openId')::uuid;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', oi.card_id,
        'name', coalesce(c.name, 'Mystery card'),
        'imageUrl', nullif(coalesce(su.image_url, c.image_url), ''),
        'imageResolvedFromStockUnit', nullif(su.image_url, '') is not null,
        'displayTier',
          case
            when oi.tier = 'last_prize' or oi.draw_round_prize_id is null then 'last_prize'
            when coalesce(drp.metadata->>'displayTier', '') <> '' then drp.metadata->>'displayTier'
            when oi.tier = 'high' and coalesce(drp.rank, 99) <= 3 then 'rainbow'
            when oi.tier = 'high' then 'gold'
            else 'bronze'
          end,
        'valueThb', oi.value_thb,
        'position', oi.result_position,
        'isLastPrize', oi.tier = 'last_prize' or oi.draw_round_prize_id is null,
        'bundleQuantity', oi.bundle_quantity
      )
      order by oi.result_position
    ),
    '[]'::jsonb
  )
  into reveal_items
  from public.gacha_open_items oi
  join public.cards c on c.id = oi.card_id
  left join public.draw_round_prizes drp on drp.id = oi.draw_round_prize_id
  left join public.draw_round_prize_units dpu on dpu.id = oi.draw_round_prize_unit_id
  left join public.draw_rounds dr on dr.id = p_draw_round_id
  left join public.card_stock_units su
    on su.id = coalesce(
      dpu.card_stock_unit_id,
      case
        when oi.tier = 'last_prize' or oi.draw_round_prize_id is null then dr.last_prize_stock_unit_id
        else null
      end
    )
  where oi.gacha_open_id = open_id;

  return base_result || jsonb_build_object('items', reveal_items);
end;
$$;

revoke all on function public.open_gacha_campaign_public_reveal(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.open_gacha_campaign_public_reveal(uuid, uuid, integer, text) to service_role;
```

- [ ] **Step 2: Add Supabase type entries for the reveal wrapper**

Modify `Website/src/lib/supabase/types.ts` in `Functions`:

```ts
      open_gacha_campaign_public_reveal: {
        Args: {
          p_profile_id: string;
          p_draw_round_id: string;
          p_quantity: number;
          p_idempotency_key?: string | null;
        };
        Returns: Json;
      };
```

- [ ] **Step 3: Call the wrapper from the open route with safe legacy fallback**

Add this import to `Website/src/app/api/ynot/gacha/open/route.ts`:

```ts
import { isMissingFunctionError } from "@/lib/supabase/schema-compat";
```

Replace the direct `open_gacha_campaign` call with:

```ts
  const openArgs = {
    p_profile_id: session.profileId,
    p_draw_round_id: resolvedCampaignId,
    p_quantity: quantity,
    p_idempotency_key: idempotencyKey,
  };
  let usedLegacyOpenRpc = false;
  let { data, error } = await supabase.rpc("open_gacha_campaign_public_reveal", openArgs);
  if (error && isMissingFunctionError(error, "open_gacha_campaign_public_reveal")) {
    usedLegacyOpenRpc = true;
    const legacy = await supabase.rpc("open_gacha_campaign", openArgs);
    data = legacy.data;
    error = legacy.error;
  }
  if (error) return Response.json({ error: openErrorMessage(error.message) }, { status: 409 });
```

Then replace the `shouldHydrate` calculation with:

```ts
  const compatibilityHydrationEnabled =
    process.env.YNOT_PACK_OPEN_COMPAT_HYDRATION?.trim() === "1";
  const shouldHydrate = Boolean(
    (usedLegacyOpenRpc || compatibilityHydrationEnabled) &&
      openId &&
      items.length <= MAX_OPEN_HYDRATION_ITEMS &&
      needsOpenItemHydration(items),
  );
```

- [ ] **Step 4: Verify pack-open privacy and launch safety**

Run:

```bash
cd Website && npm run test:api-rpc-cloudflare-privacy && npm run test:pack-open-privacy && npm run test:gacha-open-launch-safety && npm run test:gacha-open-performance
```

Expected: tests covering pack-open privacy and performance shape PASS. If `test:api-rpc-cloudflare-privacy` still fails, only later-task assertions should remain.

- [ ] **Step 5: Commit the pack-open reveal wrapper**

Run:

```bash
git add Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql Website/src/app/api/ynot/gacha/open/route.ts Website/src/lib/supabase/types.ts
git commit \
  -m "Move pack-open reveal hydration into a public DTO RPC" \
  -m "Constraint: The wrapper calls the existing open_gacha_campaign so award math, wallet debit, idempotency, and Last Prize logic stay unchanged." \
  -m "Rejected: Rewriting open_gacha_campaign selection internals | too broad for a Cloudflare load reduction." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: Never add house fields to the wrapper result; expose only reveal DTO fields consumed by toPublicOpenResult." \
  -m "Tested: npm run test:pack-open-privacy; npm run test:gacha-open-launch-safety; npm run test:gacha-open-performance" \
  -m "Not-tested: live pack open against production database"
```

---

### Task 4: Replace Public Last Prize Preview Broad Reads With A Narrow RPC

**Files:**
- Modify: `Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql`
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/lib/supabase/types.ts`
- Test: `Website/scripts/test-api-rpc-cloudflare-privacy.mjs`

- [ ] **Step 1: Append the public Last Prize preview RPC**

Append this SQL to `Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql`:

```sql
create or replace function public.get_public_last_prize_preview(
  p_slug_or_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  lookup text := trim(coalesce(p_slug_or_id, ''));
  round_row public.draw_rounds%rowtype;
  card_row public.cards%rowtype;
  unit_image text;
begin
  if lookup = '' then
    return null;
  end if;

  select *
  into round_row
  from public.draw_rounds dr
  where (
      dr.slug = lookup
      or (
        lookup ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and dr.id = lookup::uuid
      )
    )
    and dr.status = 'live'
    and dr.visibility = 'public'
    and dr.approval_status = 'approved'
  limit 1;

  if round_row.id is null or round_row.last_prize_card_id is null then
    return null;
  end if;

  select *
  into card_row
  from public.cards c
  where c.id = round_row.last_prize_card_id
  limit 1;

  if card_row.id is null then
    return null;
  end if;

  select nullif(u.image_url, '')
  into unit_image
  from public.card_stock_units u
  where u.card_id = round_row.last_prize_card_id
    and u.status <> 'deleted'
    and public.card_stock_unit_matches_prize_filter(u, round_row.last_prize_metadata)
  order by
    case when nullif(u.image_url, '') is null then 1 else 0 end,
    u.updated_at desc nulls last,
    u.created_at desc nulls last
  limit 1;

  return jsonb_build_object(
    'cardName', coalesce(card_row.name, card_row.card_code, 'Last prize'),
    'cardCode', card_row.card_code,
    'cardImageUrl', coalesce(unit_image, nullif(card_row.image_url, ''))
  );
end;
$$;

revoke all on function public.get_public_last_prize_preview(text) from public, anon, authenticated;
grant execute on function public.get_public_last_prize_preview(text) to service_role;
```

- [ ] **Step 2: Add Supabase type entry for Last Prize preview**

Modify `Website/src/lib/supabase/types.ts` in `Functions`:

```ts
      get_public_last_prize_preview: {
        Args: { p_slug_or_id: string };
        Returns: Json;
      };
```

- [ ] **Step 3: Replace the public resolver with the RPC call**

Replace `getLastPrizePreviewForCampaign` in `Website/src/features/ynot/data.ts` with:

```ts
export async function getLastPrizePreviewForCampaign(
  slugOrId: string,
): Promise<YnotLastPrizePreview | null> {
  if (!isSupabaseConfigured()) return null;
  const lookup = slugOrId.trim();
  if (!lookup) return null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("get_public_last_prize_preview", {
    p_slug_or_id: lookup,
  });
  if (error) {
    if (!isMissingFunctionError(error, "get_public_last_prize_preview")) {
      throw error;
    }
    const column = looksLikeUuid(lookup) ? "id" : "slug";
    const rows = await readSupabaseRows<DrawRoundRow>("last_prize_lookup", () =>
      supabase
        .from("draw_rounds")
        .select("id,last_prize_card_id,last_prize_metadata")
        .eq(column, lookup)
        .eq("status", "live")
        .eq("visibility", "public")
        .eq("approval_status", "approved")
        .limit(1),
    );
    const row = rows[0];
    return row ? resolveLastPrizePreview(supabase, row) : null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  return {
    cardName: typeof record.cardName === "string" && record.cardName ? record.cardName : "Last prize",
    cardCode: typeof record.cardCode === "string" && record.cardCode ? record.cardCode : null,
    cardImageUrl: typeof record.cardImageUrl === "string" && record.cardImageUrl ? record.cardImageUrl : null,
  };
}
```

- [ ] **Step 4: Verify Last Prize preview privacy**

Run:

```bash
cd Website && npm run test:api-rpc-cloudflare-privacy && npm run test:pack-open-privacy && npm run test:campaign-detail-privacy
```

Expected: Last Prize preview assertions PASS and no public privacy regressions.

- [ ] **Step 5: Commit the Last Prize preview RPC**

Run:

```bash
git add Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql Website/src/features/ynot/data.ts Website/src/lib/supabase/types.ts
git commit \
  -m "Narrow the public Last Prize preview read path" \
  -m "Constraint: Public Last Prize preview may show card name/code/image only." \
  -m "Rejected: Returning draw_rounds metadata to the route | unnecessary and increases house-info exposure risk." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep stock filter and selected-unit details inside the database function." \
  -m "Tested: npm run test:campaign-detail-privacy; npm run test:pack-open-privacy" \
  -m "Not-tested: live public pack detail request"
```

---

### Task 5: Scope Admin User 360 Card Catalog Reads And Reuse Collection Tokens

**Files:**
- Modify: `Website/src/lib/lucky-draw/data.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-api-rpc-cloudflare-privacy.mjs`
- Test: `Website/scripts/test-admin-user360-flow.mjs`

- [ ] **Step 1: Add a scoped card catalog helper**

Modify `Website/src/lib/lucky-draw/data.ts` after `getCardCatalog`:

```ts
export async function getCardCatalogByIds(
  supabase: Supabase,
  cardIds: string[],
): Promise<CardCatalogItem[]> {
  const ids = [...new Set(cardIds.filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .in("id", ids)
    .limit(ids.length);

  if (error) throw error;
  return (data ?? []).map(toCatalogItem);
}
```

- [ ] **Step 2: Import the scoped helper in YNOTT data**

Change the import in `Website/src/features/ynot/data.ts`:

```ts
import { getCardCatalog, getCardCatalogByIds, isSupabaseConfigured } from "@/lib/lucky-draw/data";
```

- [ ] **Step 3: Scope `getCollection` card reads to the current collection**

In `getCollection`, replace the initial `Promise.all` that reads `items` and `collection_card_catalog` with:

```ts
  const items = await readOrEmpty("collection", async () => {
    const { data, error } = await supabase
      .from("collection_items")
      .select("*")
      .eq("profile_id", profileId)
      .order("acquired_at", { ascending: false })
      .limit(collectionLimit);
    if (error) throw error;
    return data ?? [];
  });
  const cards = await readOrEmpty("collection_card_catalog_scoped", async () =>
    getCardCatalogByIds(
      supabase,
      items.map((item) => item.card_id).filter((id): id is string => Boolean(id)),
    ),
  );
```

- [ ] **Step 4: Reuse the precomputed collection action token**

In the `getCollection` mapper, replace:

```ts
      id: await collectionItemActionToken(profileId, item.id),
```

with:

```ts
      id: actionTokenByItemId.get(item.id) ?? await collectionItemActionToken(profileId, item.id),
```

- [ ] **Step 5: Scope `getGachaOpenHistory` card reads to returned items**

In `getGachaOpenHistory`, remove `cards` from the first `Promise.all`. After `items` is loaded, add:

```ts
  const cards = await readOrEmpty("gacha_history_card_catalog_scoped", async () =>
    getCardCatalogByIds(
      supabase,
      items.map((item) => item.card_id).filter((id): id is string => Boolean(id)),
    ),
  );
```

Keep the existing `cardsById` mapper unchanged.

- [ ] **Step 6: Scope shipping card reads to shipped/open item cards**

In `getShipping`, replace:

```ts
      readOrEmpty("shipping_card_catalog", async () => getCardCatalog(supabase)),
```

with:

```ts
      Promise.resolve([]),
```

After `openItems` is available and before `const prizeIds = Array.from(`, add:

```ts
    const shippingCardIds = Array.from(
      new Set(
        [
          ...collectionItems.map((item) => item.card_id),
          ...openItems.map((item) => item.card_id),
        ].filter((id): id is string => Boolean(id)),
      ),
    );
    const cards = await readOrEmpty("shipping_card_catalog_scoped", async () =>
      getCardCatalogByIds(supabase, shippingCardIds),
    );
```

- [ ] **Step 7: Verify User 360 and privacy contracts**

Run:

```bash
cd Website && npm run test:api-rpc-cloudflare-privacy && npm run test:admin-user360-flow && npm run test:pack-open-privacy
```

Expected: all three commands PASS for the implemented sections.

- [ ] **Step 8: Commit the scoped admin user reads**

Run:

```bash
git add Website/src/lib/lucky-draw/data.ts Website/src/features/ynot/data.ts
git commit \
  -m "Scope admin user card catalog reads" \
  -m "Constraint: User 360 must keep the same collection, pack reward, shipping, wallet, top-up, exchange, and audit sections." \
  -m "Rejected: Building a large admin user RPC now | higher risk than scoping the known duplicate card reads first." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Directive: Prefer scoped card IDs over full catalog reads inside one-user views." \
  -m "Tested: npm run test:admin-user360-flow; npm run test:pack-open-privacy" \
  -m "Not-tested: browser click-through of every User 360 tab"
```

---

### Task 6: Replace Admin Card Stock Status Row Loads With Aggregate RPC Counts

**Files:**
- Modify: `Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql`
- Modify: `Website/src/app/api/ynot/admin/cards/route.ts`
- Modify: `Website/src/lib/supabase/types.ts`
- Test: `Website/scripts/test-api-rpc-cloudflare-privacy.mjs`

- [ ] **Step 1: Append the admin card usage aggregate RPC**

Append this SQL to `Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql`:

```sql
create or replace function public.get_card_usage_summary(
  p_card_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with stock as (
    select
      count(*)::integer as stock_total,
      count(*) filter (where status = 'available')::integer as stock_available,
      count(*) filter (where status = 'reserved')::integer as stock_reserved,
      count(*) filter (where status = 'allocated')::integer as stock_allocated
    from public.card_stock_units
    where card_id = p_card_id
  ),
  prizes as (
    select count(*)::integer as prize_assignment_count
    from public.draw_round_prizes
    where card_id = p_card_id
  )
  select jsonb_build_object(
    'stockTotal', stock.stock_total,
    'stockAvailable', stock.stock_available,
    'stockReserved', stock.stock_reserved,
    'stockAllocated', stock.stock_allocated,
    'prizeAssignmentCount', prizes.prize_assignment_count
  )
  from stock, prizes;
$$;

revoke all on function public.get_card_usage_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_card_usage_summary(uuid) to service_role;
```

- [ ] **Step 2: Add Supabase type entry for card usage summary**

Modify `Website/src/lib/supabase/types.ts` in `Functions`:

```ts
      get_card_usage_summary: {
        Args: { p_card_id: string };
        Returns: Json;
      };
```

- [ ] **Step 3: Add narrow admin card return select and usage parser**

Modify `Website/src/app/api/ynot/admin/cards/route.ts` near the existing type/helpers:

```ts
const ADMIN_CARD_RETURN_SELECT = [
  "id",
  "card_code",
  "card_number",
  "name",
  "search_name",
  "search_code",
  "series",
  "grade",
  "prize_category",
  "language",
  "release_year",
  "card_set",
  "variant",
  "print_label",
  "catalog_category",
  "condition",
  "grading_service",
  "cert_number",
  "gemrate_id",
  "image_url",
  "image_storage_path",
  "is_test",
  "seed_run_id",
  "asset_source",
  "asset_license",
  "asset_manifest_key",
  "created_at",
  "updated_at",
].join(",");

function usageSummaryFromJson(value: unknown): CardUsageSummary {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const number = (key: string) => {
    const parsed = Number(record[key] ?? 0);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  };
  return {
    stockTotal: number("stockTotal"),
    stockAvailable: number("stockAvailable"),
    stockReserved: number("stockReserved"),
    stockAllocated: number("stockAllocated"),
    prizeAssignmentCount: number("prizeAssignmentCount"),
  };
}
```

- [ ] **Step 4: Replace `cardUsageSummary` row loading**

Replace the body of `cardUsageSummary` in `Website/src/app/api/ynot/admin/cards/route.ts` with:

```ts
  const { data, error } = await supabase.rpc("get_card_usage_summary", {
    p_card_id: cardId,
  });
  if (error) return { error: error.message };
  return { usage: usageSummaryFromJson(data) };
```

- [ ] **Step 5: Replace DELETE active stock row loading**

In `DELETE`, replace the `card_stock_units.select("status").limit(50000)` block with:

```ts
  const { usage, error: usageError } = await cardUsageSummary(supabase, cardId);
  if (usageError) return Response.json({ error: usageError }, { status: 409 });
  const usageSummary =
    usage ??
    ({
      stockTotal: 0,
      stockAvailable: 0,
      stockReserved: 0,
      stockAllocated: 0,
      prizeAssignmentCount: 0,
    } satisfies CardUsageSummary);
  const activeStockCount =
    usageSummary.stockAvailable +
    usageSummary.stockReserved +
    usageSummary.stockAllocated;
  if (activeStockCount > 0) {
    const breakdown = {
      available: usageSummary.stockAvailable,
      reserved: usageSummary.stockReserved,
      allocated: usageSummary.stockAllocated,
    };
    return Response.json(
      {
        ok: false,
        code: "CARD_HAS_ACTIVE_STOCK",
        error: `Cannot delete: ${activeStockCount} active stock unit${activeStockCount === 1 ? "" : "s"} still exist (${breakdown.allocated} allocated to customers, ${breakdown.reserved} reserved, ${breakdown.available} available). Allocated units cannot be removed.`,
        activeStockCount,
        breakdown,
      },
      { status: 409 },
    );
  }
```

- [ ] **Step 6: Use narrow return select for create/update**

Replace both `.select("*").single()` create/update return selectors in the admin cards route with:

```ts
    .select(ADMIN_CARD_RETURN_SELECT)
    .single();
```

- [ ] **Step 7: Verify admin card API shape**

Run:

```bash
cd Website && npm run test:api-rpc-cloudflare-privacy && npm run test:stock-subsku-admin-api && npm run test:rate-limits
```

Expected: admin card tests PASS and static test confirms no `limit(50000)` stock status load remains.

- [ ] **Step 8: Commit admin card aggregate counts**

Run:

```bash
git add Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql Website/src/app/api/ynot/admin/cards/route.ts Website/src/lib/supabase/types.ts
git commit \
  -m "Aggregate admin card usage counts in Postgres" \
  -m "Constraint: Card delete safety messages must keep the same active-stock breakdown." \
  -m "Rejected: Loading up to 50000 stock status rows in the Worker | unnecessary compute and subrequest payload." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Use grouped database counts for admin count-only checks." \
  -m "Tested: npm run test:stock-subsku-admin-api; npm run test:rate-limits" \
  -m "Not-tested: live admin card create/update/delete click path"
```

---

### Task 7: Narrow Top-Up Reads Without Changing Review Behavior

**Files:**
- Modify: `Website/src/features/ynot/data.ts`
- Test: `Website/scripts/test-api-rpc-cloudflare-privacy.mjs`
- Test: `Website/scripts/test-top-up-flow.mjs`

- [ ] **Step 1: Add top-up select constants**

Add these constants near `type TopUpStatus` in `Website/src/features/ynot/data.ts`:

```ts
const TOP_UP_PUBLIC_SELECT = [
  "id",
  "profile_id",
  "amount_thb",
  "coins",
  "payment_method_id",
  "slip_file_path",
  "slip_file_name",
  "slip_file_size",
  "slip_content_type",
  "slip_provider",
  "slip_verification_status",
  "provider_reference",
  "status",
  "created_at",
  "updated_at",
].join(",");

const TOP_UP_ADMIN_SELECT = [
  TOP_UP_PUBLIC_SELECT,
  "admin_note",
  "reviewed_by",
  "reviewed_at",
].join(",");

const TOP_UP_SENSITIVE_SELECT = [
  TOP_UP_ADMIN_SELECT,
  "provider_message",
].join(",");
```

- [ ] **Step 2: Use the narrow select in `getTopUps`**

In `getTopUps`, replace `.select("*")` on `top_up_requests` with:

```ts
      .select(
        includeSensitiveSlipDetails
          ? TOP_UP_SENSITIVE_SELECT
          : includeAll
            ? TOP_UP_ADMIN_SELECT
            : TOP_UP_PUBLIC_SELECT,
      )
```

- [ ] **Step 3: Verify top-up behavior and privacy**

Run:

```bash
cd Website && npm run test:api-rpc-cloudflare-privacy && npm run test:top-up-flow && npm run test:admin-ops-api-rpc-performance
```

Expected: top-up review RPC tests still PASS and static test confirms non-sensitive reads do not fetch provider messages.

- [ ] **Step 4: Commit top-up select narrowing**

Run:

```bash
git add Website/src/features/ynot/data.ts
git commit \
  -m "Narrow top-up read projections" \
  -m "Constraint: Admin review still receives sensitive slip details only when explicitly requested." \
  -m "Rejected: Reusing select star for all top-up views | it fetches provider details when the view does not need them." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Add new top-up fields to the narrow select matching the view that actually needs them." \
  -m "Tested: npm run test:top-up-flow; npm run test:admin-ops-api-rpc-performance" \
  -m "Not-tested: live admin top-up approval click path"
```

---

### Task 8: Final Verification, Supabase Dry-Run, And Review

**Files:**
- Verify only; no code changes expected.

- [ ] **Step 1: Run the targeted regression suite**

Run:

```bash
cd Website && npm run test:api-rpc-cloudflare-privacy && npm run test:pack-open-privacy && npm run test:gacha-open-launch-safety && npm run test:gacha-open-performance && npm run test:admin-user360-flow && npm run test:admin-ops-api-rpc-performance && npm run test:top-up-flow && npm run test:stock-subsku-admin-api && npm run test:rate-limits
```

Expected: all commands PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd Website && npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run Supabase migration dry-run**

Run:

```bash
cd Website && SUPABASE_TELEMETRY_DISABLED=1 npx supabase db push --linked --dry-run --include-all
```

Expected: dry-run reports the new `20260617120000_api_rpc_cloudflare_load_privacy.sql` migration as pending and does not apply it. If the linked project reports drift or migration history mismatch, stop and use the guarded linked-Supabase workflow before any live push.

- [ ] **Step 4: Run whitespace diff check**

Run:

```bash
git diff --check HEAD~7..HEAD
```

Expected: no whitespace errors.

- [ ] **Step 5: Review the public leak boundary one final time**

Run:

```bash
cd Website && rg -n "weight|unlockAtSoldPct|stockUnitFilter|stockUnitGroupKey|certNumber|gemrateId|logic_snapshot|logicMode|drawRoundPrizeUnitIds|intendedStock|identityMismatch|primaryReason" src/app/api/ynot/gacha/open/route.ts src/features/ynot/data.ts scripts/test-api-rpc-cloudflare-privacy.mjs
```

Expected: matches appear only in tests, private/admin-only code, or explicit negative assertions; customer-facing DTO builders must not assign these fields.

- [ ] **Step 6: Commit verification notes if any test-only corrections were needed**

If no corrections were needed, do not create an empty commit. If corrections were needed, run:

```bash
git add Website/scripts/test-api-rpc-cloudflare-privacy.mjs Website/src/lib/security/rate-limit.ts Website/src/app/api/ynot/gacha/open/route.ts Website/src/features/ynot/data.ts Website/src/app/api/ynot/admin/cards/route.ts Website/src/lib/lucky-draw/data.ts Website/src/lib/supabase/types.ts Database/supabase/migrations/20260617120000_api_rpc_cloudflare_load_privacy.sql
git commit \
  -m "Close API RPC load verification gaps" \
  -m "Constraint: Verification fixes only; behavior must match the preceding task contracts." \
  -m "Rejected: Shipping with partial test coverage | public privacy and RPC call shape need explicit evidence." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep final verification evidence attached to the handoff." \
  -m "Tested: full targeted regression suite; npm run typecheck; Supabase dry-run" \
  -m "Not-tested: production deploy"
```

## Self-Review

- Spec coverage: The plan covers API/RPC correctness, Cloudflare compute/subrequest reduction, pack-open behavior preservation, Last Prize privacy, admin User 360 fanout, admin card count aggregation, top-up select narrowing, and final dry-run verification.
- Placeholder scan: No unresolved placeholders are present; every task names concrete files, commands, expected results, and code/SQL snippets.
- Type consistency: New RPC names are consistent across migration, TypeScript Supabase types, static tests, and call sites: `consume_api_rate_limits_weighted`, `open_gacha_campaign_public_reveal`, `get_public_last_prize_preview`, and `get_card_usage_summary`.
