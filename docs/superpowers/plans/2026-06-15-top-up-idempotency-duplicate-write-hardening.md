# Top-Up Idempotency Duplicate-Write Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop duplicate customer top-up writes and duplicate slip/audit side effects while preserving safe public API responses and keeping private pack/business data server-only.

**Architecture:** Add a stable client action intent, require a validated top-up idempotency key at the wallet API boundary, and move the top-up row plus payment-slip row creation into one service-role RPC with database uniqueness. Keep external slip verification and approval/rejection RPC calls in the API route, but make them operate only after the submit RPC returns a single authoritative top-up/slip pair. Public responses remain mapped through existing DTO helpers and never include provider internals, private pack logic, or raw database rows.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase JS, PostgreSQL RPC/migrations, Node `node:test`.

---

## Scope

In scope:
- Customer wallet top-up duplicate-write hardening.
- Stable frontend idempotency keys for top-up submission surfaces.
- A new Supabase RPC that atomically creates `top_up_requests`, `payment_slips`, and the submit audit event.
- A unique database guard for `top_up_requests(profile_id, idempotency_key)`.
- Static regression tests proving API/RPC calls are correctly shaped and public responses stay safe.

Out of scope:
- No changes to pack-opening odds, stock selection, reward selection, owner review logic, or any private pack/business formulas.
- No change to `open_gacha_campaign`; pack opening already has idempotency and public response mapping.
- No production Supabase push during implementation unless the user separately asks for deployment.
- No read-path optimization in this plan; duplicate reads in `Website/src/features/ynot/data.ts` should be a separate plan after duplicate writes are hardened.

Stop condition:
- `npm run test:top-up-flow`, `npm run test:pack-open-privacy`, `npm run test:shipping-flow`, and `npm run typecheck` pass from `Website/`.
- `supabase db push --linked --dry-run --include-all` is reviewed only if live-linked migration validation is explicitly part of the execution task.
- `git diff` shows no public DTO widening and no private pack/business fields added to customer responses.

## File Structure

- Modify: `Website/scripts/test-top-up-flow.mjs`
  - Add source-level regression tests for wallet idempotency, submit RPC usage, migration uniqueness, and safe response mapping.

- Create: `Website/src/features/ynot/action-intent.ts`
  - Shared client helper for stable customer action intent IDs and idempotency keys.
  - Used by top-up now; conversion/shipping can adopt it later in a separate follow-up.

- Modify: `Website/src/features/ynot/cr/WalletExperience.tsx`
  - Send one stable top-up idempotency key per payment/slip attempt.
  - Use an explicit in-flight ref in addition to the current transition state.

- Modify: `Website/src/features/ynot/client.tsx`
  - Apply the same top-up idempotency behavior to the legacy/integrated wallet panel.

- Create: `Database/supabase/migrations/20260615090000_top_up_idempotency.sql`
  - Add unique index for top-up idempotency.
  - Add `public.submit_top_up_request(...)` RPC.
  - Grant execute only to `service_role`.

- Modify: `Website/src/lib/supabase/types.ts`
  - Add the `submit_top_up_request` RPC signature.

- Modify: `Website/src/app/api/ynot/wallet/route.ts`
  - Validate `idempotencyKey` from `FormData`.
  - Use the new RPC for top-up/slip creation.
  - Remove direct top-up/payment-slip/audit inserts from the route.
  - Keep provider verification, auto approval, and auto rejection mapped through safe public DTOs.

---

### Task 1: Lock the Duplicate-Write Expectations With Failing Tests

**Files:**
- Modify: `Website/scripts/test-top-up-flow.mjs`

- [ ] **Step 1: Add migration reader helpers near the existing helper functions**

In `Website/scripts/test-top-up-flow.mjs`, after `function plain(value) { ... }`, insert:

```js
function readMigration(name) {
  return readFileSync(
    new URL(`../../Database/supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
}

function sourceBefore(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing marker: ${marker}`);
  return source.slice(0, markerIndex);
}

function functionBody(source, functionName) {
  const functionStart = source.indexOf(`function ${functionName}`);
  assert.notEqual(functionStart, -1, `Missing function: ${functionName}`);
  const bodyStart = source.indexOf("{", functionStart);
  assert.notEqual(bodyStart, -1, `Missing function body: ${functionName}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }

  assert.fail(`Unclosed function body: ${functionName}`);
}
```

- [ ] **Step 2: Add a failing test for API and DB idempotency**

In `Website/scripts/test-top-up-flow.mjs`, after the `"wallet POST uses server-resolved amount for storage and slip checks"` test, insert:

```js
test("wallet POST requires client idempotency and delegates top-up/slip creation to RPC", () => {
  const walletRoute = readFileSync(
    new URL("../src/app/api/ynot/wallet/route.ts", import.meta.url),
    "utf8",
  );
  const migration = readMigration("20260615090000_top_up_idempotency.sql");
  const typesSource = readFileSync(
    new URL("../src/lib/supabase/types.ts", import.meta.url),
    "utf8",
  );

  const beforeSubmitRpc = sourceBefore(walletRoute, 'supabase.rpc("submit_top_up_request"');
  const submitRpcCall = walletRoute.slice(
    walletRoute.indexOf('supabase.rpc("submit_top_up_request"'),
    walletRoute.indexOf("});", walletRoute.indexOf('supabase.rpc("submit_top_up_request"')) + 3,
  );

  assert.match(walletRoute, /const TOP_UP_IDEMPOTENCY_KEY_RE\s*=/);
  assert.match(walletRoute, /function normalizeTopUpIdempotencyKey/);
  assert.match(beforeSubmitRpc, /normalizeTopUpIdempotencyKey\(form\.get\("idempotencyKey"\)\)/);
  assert.match(beforeSubmitRpc, /if\s*\(!idempotencyKey\)/);
  assert.match(beforeSubmitRpc, /fetchExistingTopUpByIdempotency\(supabase,\s*session\.profileId,\s*idempotencyKey\)/);
  assert.match(beforeSubmitRpc, /replayTopUpResponse\(existingTopUp,\s*200\)/);

  assert.match(submitRpcCall, /p_top_up_id:\s*topUpId/);
  assert.match(submitRpcCall, /p_profile_id:\s*session\.profileId/);
  assert.match(submitRpcCall, /p_payment_method_id:\s*paymentMethodId/);
  assert.match(submitRpcCall, /p_amount_thb:\s*resolvedTopUp\.value\.amountThb/);
  assert.match(submitRpcCall, /p_coin_amount:\s*resolvedTopUp\.value\.coins/);
  assert.match(submitRpcCall, /p_customer_note:\s*customerNote/);
  assert.match(submitRpcCall, /p_idempotency_key:\s*idempotencyKey/);
  assert.match(submitRpcCall, /p_slip_file_sha256:\s*slipHash/);
  assert.match(submitRpcCall, /p_slip_verification_status:\s*localDuplicateSlip \? "duplicate" : "unverified"/);
  assert.match(submitRpcCall, /p_slip_duplicate_of_slip_id:\s*localDuplicateSlip\?\.id \?\? null/);

  assert.doesNotMatch(walletRoute, /const idempotencyKey = randomUUID\(\)/);
  assert.doesNotMatch(walletRoute, /\.from\("top_up_requests"\)\s*\.insert/);
  assert.doesNotMatch(walletRoute, /\.from\("payment_slips"\)\.insert/);
  assert.doesNotMatch(walletRoute, /\.from\("audit_events"\)\.insert\(\{[\s\S]*event_type:\s*"top_up_submitted"/);

  assert.match(
    migration,
    /create unique index if not exists top_up_requests_profile_idempotency_unique_idx\s+on public\.top_up_requests\s*\(\s*profile_id,\s*idempotency_key\s*\)\s+where idempotency_key is not null;/i,
  );
  assert.match(migration, /create or replace function public\.submit_top_up_request\(/);
  assert.match(migration, /insert into public\.top_up_requests/);
  assert.match(migration, /insert into public\.payment_slips/);
  assert.match(migration, /insert into public\.audit_events/);
  assert.match(migration, /grant execute on function public\.submit_top_up_request/);
  assert.doesNotMatch(migration, /open_gacha_campaign/i);
  assert.doesNotMatch(migration, /draw_round_prizes|draw_round_prize_units|logic_snapshot|weight|unlock_at_sold_pct/i);

  assert.match(typesSource, /submit_top_up_request:\s*\{\s*Args:/);
  assert.match(typesSource, /p_idempotency_key:\s*string/);
  assert.match(typesSource, /p_slip_file_sha256:\s*string/);
});
```

- [ ] **Step 3: Add a failing test for frontend stable top-up intent keys**

In `Website/scripts/test-top-up-flow.mjs`, after the test from Step 2, insert:

```js
test("wallet top-up UIs send stable idempotency keys and block duplicate submits", () => {
  const actionIntent = readFileSync(
    new URL("../src/features/ynot/action-intent.ts", import.meta.url),
    "utf8",
  );
  const walletExperience = readFileSync(
    new URL("../src/features/ynot/cr/WalletExperience.tsx", import.meta.url),
    "utf8",
  );
  const legacyClient = readFileSync(
    new URL("../src/features/ynot/client.tsx", import.meta.url),
    "utf8",
  );

  assert.match(actionIntent, /export function createYnotActionIntentId/);
  assert.match(actionIntent, /export function ynotActionIdempotencyKey/);
  assert.match(actionIntent, /ynot-topup/);

  for (const source of [walletExperience, legacyClient]) {
    assert.match(source, /createYnotActionIntentId\("topup"\)/);
    assert.match(source, /ynotActionIdempotencyKey\("topup"/);
    assert.match(source, /topUpSubmitInFlightRef/);
    assert.match(source, /if\s*\(topUpSubmitInFlightRef\.current\)\s*return/);
    assert.match(source, /form\.set\("idempotencyKey",\s*topUpIdempotencyKey\)/);
    assert.doesNotMatch(source, /form\.set\("idempotencyKey",\s*crypto\.randomUUID\(\)\)/);
  }
});
```

- [ ] **Step 4: Run the focused test and verify it fails**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:top-up-flow
```

Expected: FAIL. The new tests should fail because `action-intent.ts` and `20260615090000_top_up_idempotency.sql` do not exist yet, and the wallet route still creates a fresh server-side idempotency key.

- [ ] **Step 5: Commit the failing tests**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/scripts/test-top-up-flow.mjs
git commit -m $'Lock top-up idempotency expectations\n\nConstraint: duplicate customer top-up writes must be stopped without exposing provider or private pack data.\nRejected: relying on UI disabled state only | browser retries and double submits must be safe at the API and DB layer.\nConfidence: high\nScope-risk: narrow\nDirective: Keep the tests failing until the DB RPC, API route, and wallet UI all use the same stable idempotency contract.\nTested: npm run test:top-up-flow fails on the new idempotency expectations\nNot-tested: implementation not added yet'
```

---

### Task 2: Add the Top-Up Submit RPC and Database Uniqueness

**Files:**
- Create: `Database/supabase/migrations/20260615090000_top_up_idempotency.sql`
- Modify: `Website/src/lib/supabase/types.ts`
- Test: `Website/scripts/test-top-up-flow.mjs`

- [ ] **Step 1: Create the migration**

Create `Database/supabase/migrations/20260615090000_top_up_idempotency.sql`:

```sql
-- Top-up idempotency and atomic submit RPC.
-- This migration does not touch pack-opening RPCs, prize metadata, or private pack logic.

create unique index if not exists top_up_requests_profile_idempotency_unique_idx
on public.top_up_requests(profile_id, idempotency_key)
where idempotency_key is not null;

create or replace function public.submit_top_up_request(
  p_top_up_id uuid,
  p_profile_id uuid,
  p_payment_method_id uuid,
  p_amount_thb integer,
  p_coin_amount integer,
  p_customer_note text,
  p_idempotency_key text,
  p_slip_file_path text,
  p_slip_original_filename text,
  p_slip_file_sha256 text,
  p_slip_storage_provider text default 'supabase',
  p_slip_verification_status text default 'unverified',
  p_slip_provider_code text default null,
  p_slip_provider_message text default null,
  p_slip_provider_response jsonb default '{}'::jsonb,
  p_slip_duplicate_of_slip_id uuid default null,
  p_slip_verified_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  top_up_row public.top_up_requests%rowtype;
  slip_row public.payment_slips%rowtype;
begin
  if p_top_up_id is null then
    raise exception 'top_up_id_required';
  end if;
  if p_profile_id is null then
    raise exception 'profile_required';
  end if;
  if p_payment_method_id is null then
    raise exception 'payment_method_required';
  end if;
  if p_amount_thb is null or p_amount_thb <= 0 then
    raise exception 'invalid_top_up_amount';
  end if;
  if p_coin_amount is null or p_coin_amount <= 0 then
    raise exception 'invalid_coin_amount';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_slip_file_path is null or length(trim(p_slip_file_path)) = 0 then
    raise exception 'slip_file_path_required';
  end if;
  if p_slip_original_filename is null or length(trim(p_slip_original_filename)) = 0 then
    raise exception 'slip_original_filename_required';
  end if;
  if p_slip_file_sha256 is null or length(trim(p_slip_file_sha256)) <> 64 then
    raise exception 'slip_file_sha256_required';
  end if;

  select *
  into top_up_row
  from public.top_up_requests
  where profile_id = p_profile_id
    and idempotency_key = p_idempotency_key
  limit 1;

  if top_up_row.id is not null then
    select *
    into slip_row
    from public.payment_slips
    where top_up_request_id = top_up_row.id
    order by uploaded_at desc
    limit 1;

    return jsonb_build_object(
      'status', top_up_row.status,
      'topUpId', top_up_row.id,
      'paymentSlipId', slip_row.id,
      'replayed', true
    );
  end if;

  insert into public.top_up_requests(
    id,
    profile_id,
    payment_method_id,
    amount_thb,
    coin_amount,
    status,
    submitted_at,
    customer_note,
    idempotency_key
  )
  values (
    p_top_up_id,
    p_profile_id,
    p_payment_method_id,
    p_amount_thb,
    p_coin_amount,
    'pending_review',
    now(),
    nullif(trim(coalesce(p_customer_note, '')), ''),
    trim(p_idempotency_key)
  )
  returning * into top_up_row;

  insert into public.payment_slips(
    top_up_request_id,
    storage_provider,
    file_path,
    original_filename,
    file_sha256,
    verification_status,
    provider_code,
    provider_message,
    provider_response,
    duplicate_of_slip_id,
    verified_at
  )
  values (
    top_up_row.id,
    coalesce(nullif(trim(p_slip_storage_provider), ''), 'supabase'),
    trim(p_slip_file_path),
    trim(p_slip_original_filename),
    lower(trim(p_slip_file_sha256)),
    coalesce(nullif(trim(p_slip_verification_status), ''), 'unverified'),
    nullif(trim(coalesce(p_slip_provider_code, '')), ''),
    nullif(trim(coalesce(p_slip_provider_message, '')), ''),
    coalesce(p_slip_provider_response, '{}'::jsonb),
    p_slip_duplicate_of_slip_id,
    p_slip_verified_at
  )
  returning * into slip_row;

  insert into public.audit_events(
    actor_profile_id,
    event_type,
    top_up_request_id,
    metadata
  )
  values (
    p_profile_id,
    'top_up_submitted',
    top_up_row.id,
    jsonb_build_object(
      'public_code', top_up_row.public_code,
      'amount_thb', p_amount_thb,
      'coin_amount', p_coin_amount
    )
  );

  return jsonb_build_object(
    'status', top_up_row.status,
    'topUpId', top_up_row.id,
    'paymentSlipId', slip_row.id,
    'replayed', false
  );
exception
  when unique_violation then
    select *
    into top_up_row
    from public.top_up_requests
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if top_up_row.id is null then
      raise;
    end if;

    select *
    into slip_row
    from public.payment_slips
    where top_up_request_id = top_up_row.id
    order by uploaded_at desc
    limit 1;

    return jsonb_build_object(
      'status', top_up_row.status,
      'topUpId', top_up_row.id,
      'paymentSlipId', slip_row.id,
      'replayed', true
    );
end;
$$;

revoke all on function public.submit_top_up_request(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  uuid,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.submit_top_up_request(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  uuid,
  timestamptz
) to service_role;
```

- [ ] **Step 2: Update Supabase RPC types**

In `Website/src/lib/supabase/types.ts`, inside `Database["public"]["Functions"]`, add this entry near the existing top-up RPCs:

```ts
      submit_top_up_request: {
        Args: {
          p_top_up_id: string;
          p_profile_id: string;
          p_payment_method_id: string;
          p_amount_thb: number;
          p_coin_amount: number;
          p_customer_note?: string | null;
          p_idempotency_key: string;
          p_slip_file_path: string;
          p_slip_original_filename: string;
          p_slip_file_sha256: string;
          p_slip_storage_provider?: string | null;
          p_slip_verification_status?: string | null;
          p_slip_provider_code?: string | null;
          p_slip_provider_message?: string | null;
          p_slip_provider_response?: Json | null;
          p_slip_duplicate_of_slip_id?: string | null;
          p_slip_verified_at?: string | null;
        };
        Returns: Json;
      };
```

- [ ] **Step 3: Run the focused test and verify DB/type expectations pass**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:top-up-flow
```

Expected: still FAIL because the route and UI have not been updated, but the migration and type assertions in `"wallet POST requires client idempotency..."` should now pass.

- [ ] **Step 4: Commit the migration and type signature**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Database/supabase/migrations/20260615090000_top_up_idempotency.sql Website/src/lib/supabase/types.ts
git commit -m $'Add top-up submit idempotency RPC\n\nConstraint: top-up and slip creation must be one database action keyed by profile plus idempotency key.\nRejected: direct API inserts with best-effort cleanup | retries can still create extra business rows and audit rows.\nConfidence: high\nScope-risk: moderate\nDirective: Do not call this RPC from anon/authenticated clients; route it only through the service-role wallet API.\nTested: npm run test:top-up-flow still fails only on route/UI expectations\nNot-tested: linked Supabase dry-run or live migration apply'
```

---

### Task 3: Add Client Action Intent Helpers

**Files:**
- Create: `Website/src/features/ynot/action-intent.ts`
- Test: `Website/scripts/test-top-up-flow.mjs`

- [ ] **Step 1: Create the helper file**

Create `Website/src/features/ynot/action-intent.ts`:

```ts
export type YnotActionIntentKind = "topup" | "convert" | "shipping";

const actionIntentPrefixes: Record<YnotActionIntentKind, string> = {
  topup: "ynot-topup",
  convert: "ynot-convert",
  shipping: "ynot-shipping",
};

const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const actionIntentPatterns: Record<YnotActionIntentKind, RegExp> = {
  topup: new RegExp(`^ynot-topup-${uuidPattern}$`, "i"),
  convert: new RegExp(`^ynot-convert-${uuidPattern}$`, "i"),
  shipping: new RegExp(`^ynot-shipping-${uuidPattern}$`, "i"),
};

function cleanIdempotencyPart(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function createYnotActionIntentId(kind: YnotActionIntentKind) {
  return `${actionIntentPrefixes[kind]}-${crypto.randomUUID()}`;
}

export function normalizeYnotActionIntentId(
  kind: YnotActionIntentKind,
  value: unknown,
) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return actionIntentPatterns[kind].test(clean) ? clean.toLowerCase() : null;
}

export function ynotActionIdempotencyKey(
  kind: YnotActionIntentKind,
  intentId: string | null,
  parts: unknown[] = [],
) {
  const normalized = normalizeYnotActionIntentId(kind, intentId);
  const safeIntent = normalized ?? createYnotActionIntentId(kind);
  const safeParts = parts.map(cleanIdempotencyPart).filter(Boolean);
  const prefix = actionIntentPrefixes[kind];
  return safeParts.length
    ? `${prefix}:${safeParts.join(":")}:${safeIntent}`
    : `${prefix}:${safeIntent}`;
}
```

- [ ] **Step 2: Run the focused test and verify helper assertions pass**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:top-up-flow
```

Expected: still FAIL because `WalletExperience`, `client.tsx`, and `wallet/route.ts` have not been updated, but the `action-intent.ts` assertions should now pass.

- [ ] **Step 3: Commit the helper**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/action-intent.ts
git commit -m $'Add customer action intent keys\n\nConstraint: duplicate-write prevention needs stable user-action identity, not one random key per POST attempt.\nRejected: generating idempotency keys inside the wallet route | the server cannot distinguish a retry from a new intent.\nConfidence: high\nScope-risk: narrow\nDirective: Use action intent helpers for customer mutation retries; do not encode private pack or provider internals in key parts.\nTested: npm run test:top-up-flow still fails only on route/UI expectations\nNot-tested: browser interaction'
```

---

### Task 4: Update Wallet Top-Up UI Surfaces

**Files:**
- Modify: `Website/src/features/ynot/cr/WalletExperience.tsx`
- Modify: `Website/src/features/ynot/client.tsx`
- Test: `Website/scripts/test-top-up-flow.mjs`

- [ ] **Step 1: Update `WalletExperience.tsx` imports**

In `Website/src/features/ynot/cr/WalletExperience.tsx`, add these imports near the existing imports:

```ts
import { useRef } from "react";
import {
  createYnotActionIntentId,
  ynotActionIdempotencyKey,
} from "../action-intent";
```

If the file already imports from `react`, combine the imports so the final React import includes `useMemo`, `useRef`, `useState`, and `useTransition`.

- [ ] **Step 2: Add stable top-up intent state to `WalletExperience`**

Inside `WalletExperience`, after the existing `useTransition()` line, add:

```ts
  const topUpSubmitInFlightRef = useRef(false);
  const topUpIntentRef = useRef(createYnotActionIntentId("topup"));
```

- [ ] **Step 3: Reset the intent when the user changes the slip**

Find the slip `<input>` in `WalletExperience.tsx`. Replace its `onChange` handler with:

```tsx
onChange={(event) => {
  setSlip(event.target.files?.[0] ?? null);
  topUpIntentRef.current = createYnotActionIntentId("topup");
}}
```

- [ ] **Step 4: Update `WalletExperience.submit()`**

At the start of `function submit()`, before validation, add:

```ts
    if (topUpSubmitInFlightRef.current) return;
```

Inside the `startSubmit(async () => { ... })` callback, set the in-flight flag and append the idempotency key:

```ts
    topUpSubmitInFlightRef.current = true;
    startSubmit(async () => {
      try {
        const topUpIdempotencyKey = ynotActionIdempotencyKey("topup", topUpIntentRef.current, [
          selectedMethod.id,
          customMode ? "custom" : picked.id,
          buyThb,
        ]);
        const form = new FormData();
        form.set("paymentMethodId", selectedMethod.id);
        form.set("customerNote", note);
        form.set("idempotencyKey", topUpIdempotencyKey);
```

Keep the existing package/custom/slip fields after that block. In the success block, immediately after `setSlip(null);`, add:

```ts
        topUpIntentRef.current = createYnotActionIntentId("topup");
```

Add a `finally` block before the callback closes:

```ts
      } finally {
        topUpSubmitInFlightRef.current = false;
      }
```

- [ ] **Step 5: Update `client.tsx` imports**

In `Website/src/features/ynot/client.tsx`, add `useRef` to the React import if it is not already imported, and add:

```ts
import {
  createYnotActionIntentId,
  ynotActionIdempotencyKey,
} from "./action-intent";
```

- [ ] **Step 6: Add stable top-up intent state to the legacy `TopUpPanel`**

Inside the top-up panel component that currently has `const [isPending, startTransition] = useTransition();`, add:

```ts
  const topUpSubmitInFlightRef = useRef(false);
  const topUpIntentRef = useRef(createYnotActionIntentId("topup"));
```

- [ ] **Step 7: Reset the legacy intent when slip changes**

Replace the legacy top-up slip input `onChange` with:

```tsx
onChange={(event) => {
  setSlip(event.target.files?.[0] ?? null);
  topUpIntentRef.current = createYnotActionIntentId("topup");
}}
```

- [ ] **Step 8: Update the legacy `submit()`**

At the start of the legacy `submit()` function, add:

```ts
    if (topUpSubmitInFlightRef.current) return;
```

Inside the transition callback, before creating `FormData`, add:

```ts
        topUpSubmitInFlightRef.current = true;
        const topUpIdempotencyKey = ynotActionIdempotencyKey("topup", topUpIntentRef.current, [
          selectedMethod.id,
          selected.id,
        ]);
```

After `form.set("customerNote", note);`, add:

```ts
        form.set("idempotencyKey", topUpIdempotencyKey);
```

After `setSlip(null);`, add:

```ts
        topUpIntentRef.current = createYnotActionIntentId("topup");
```

Add a `finally` block that always clears the in-flight ref:

```ts
      } finally {
        topUpSubmitInFlightRef.current = false;
      }
```

- [ ] **Step 9: Run the focused test and verify UI expectations pass**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:top-up-flow
```

Expected: still FAIL because the wallet API route has not been updated, but the `"wallet top-up UIs send stable idempotency keys..."` test should pass.

- [ ] **Step 10: Commit the UI changes**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/cr/WalletExperience.tsx Website/src/features/ynot/client.tsx
git commit -m $'Send stable top-up idempotency keys\n\nConstraint: customer double-clicks and browser retries must reuse the same top-up action identity.\nRejected: transition disabled state as the only guard | it does not prove backend duplicate-write safety.\nConfidence: high\nScope-risk: narrow\nDirective: Reset the top-up intent only when the user changes the slip or a submit succeeds.\nTested: npm run test:top-up-flow still fails only on wallet route expectations\nNot-tested: manual browser top-up flow'
```

---

### Task 5: Route Wallet POST Through the Submit RPC

**Files:**
- Modify: `Website/src/app/api/ynot/wallet/route.ts`
- Test: `Website/scripts/test-top-up-flow.mjs`

- [ ] **Step 1: Add idempotency types and helpers near existing route helpers**

In `Website/src/app/api/ynot/wallet/route.ts`, after `type ResolvedTopUpAmount = { ... };`, add:

```ts
type SubmitTopUpRpcResult = {
  status?: unknown;
  topUpId?: unknown;
  paymentSlipId?: unknown;
  replayed?: unknown;
};

const TOP_UP_IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9:_-]{16,180}$/;

function normalizeTopUpIdempotencyKey(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return TOP_UP_IDEMPOTENCY_KEY_RE.test(clean) ? clean : null;
}

function rpcString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rpcBoolean(value: unknown) {
  return value === true;
}
```

- [ ] **Step 2: Add replay and row-load helpers after `resolveTopUpAmount`**

Add:

```ts
async function fetchExistingTopUpByIdempotency(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  profileId: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase
    .from("top_up_requests")
    .select("*")
    .eq("profile_id", profileId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchTopUpById(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  topUpId: string,
) {
  const { data, error } = await supabase
    .from("top_up_requests")
    .select("*")
    .eq("id", topUpId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function replayTopUpResponse(
  topUp: NonNullable<Awaited<ReturnType<typeof fetchTopUpById>>>,
  status = 200,
) {
  return jsonNoStore(
    {
      topUp: publicTopUp(toTopUp(topUp)),
      autoApproved: topUp.status === "approved",
      autoRejected: topUp.status === "rejected",
      replayed: true,
    },
    { status },
  );
}

function submitTopUpErrorMessage(message?: string) {
  if (!message) return "Could not submit this top-up. Please refresh and try again.";
  if (message.includes("invalid_idempotency_key")) return "Invalid idempotency key.";
  if (message.includes("payment_method_required")) return "Payment method is required.";
  if (message.includes("invalid_top_up_amount")) return "Invalid top-up amount.";
  if (message.includes("slip_file_sha256_required")) return "Transfer slip upload is required.";
  return "Could not submit this top-up. Please refresh and try again.";
}
```

- [ ] **Step 3: Validate idempotency before expensive slip processing**

Inside `POST`, immediately after:

```ts
  const form = await request.formData();
```

add:

```ts
  const idempotencyKey = normalizeTopUpIdempotencyKey(form.get("idempotencyKey"));
  if (!idempotencyKey) {
    return jsonNoStore({ error: "Invalid idempotency key." }, { status: 400 });
  }
```

- [ ] **Step 4: Fetch replay before validating and uploading the slip**

Move `const supabase = createServiceSupabaseClient();` to immediately after the idempotency validation, then add:

```ts
  const existingTopUp = await fetchExistingTopUpByIdempotency(
    supabase,
    session.profileId,
    idempotencyKey,
  );
  if (existingTopUp) return replayTopUpResponse(existingTopUp, 200);
```

Remove the later duplicate `const supabase = createServiceSupabaseClient();`.

- [ ] **Step 5: Replace direct top-up/slip/audit inserts with the RPC**

Replace the block from:

```ts
  const idempotencyKey = randomUUID();
  const { data: topUp, error: topUpError } = await supabase
    .from("top_up_requests")
```

through the `audit_events` insert with:

```ts
  const topUpId = randomUUID();
  const filePath = `topups/${session.profileId}/${topUpId}/${Date.now()}-${cleanFileName(slipFile.name)}`;
  const { error: uploadError } = await supabase.storage.from(slipBucketName).upload(filePath, slipFile, { contentType: magicCheck.contentType, upsert: false });
  if (uploadError) {
    console.warn("wallet_top_up_slip_upload_failed", {
      topUpId,
      message: uploadError.message,
    });
    return jsonNoStore(
      { error: "Could not upload this slip. Please try again." },
      { status: 500 },
    );
  }

  const initialProviderResponse: Json = localDuplicateSlip
    ? { source: "local_file_hash", duplicateSlipId: localDuplicateSlip.id }
    : { source: "manual_top_up_upload" };

  const { data: submitData, error: submitError } = await supabase.rpc("submit_top_up_request", {
    p_top_up_id: topUpId,
    p_profile_id: session.profileId,
    p_payment_method_id: paymentMethodId,
    p_amount_thb: resolvedTopUp.value.amountThb,
    p_coin_amount: resolvedTopUp.value.coins,
    p_customer_note: customerNote,
    p_idempotency_key: idempotencyKey,
    p_slip_file_path: filePath,
    p_slip_original_filename: slipFile.name,
    p_slip_file_sha256: slipHash,
    p_slip_storage_provider: "supabase",
    p_slip_verification_status: localDuplicateSlip ? "duplicate" : "unverified",
    p_slip_provider_code: localDuplicateSlip ? "LOCAL_DUPLICATE" : null,
    p_slip_provider_message: localDuplicateSlip ? "This slip image was already used on another approved payment." : null,
    p_slip_provider_response: initialProviderResponse,
    p_slip_duplicate_of_slip_id: localDuplicateSlip?.id ?? null,
    p_slip_verified_at: localDuplicateSlip ? new Date().toISOString() : null,
  });

  if (submitError) {
    await supabase.storage.from(slipBucketName).remove([filePath]);
    const replayTopUp = await fetchExistingTopUpByIdempotency(
      supabase,
      session.profileId,
      idempotencyKey,
    );
    if (replayTopUp) return replayTopUpResponse(replayTopUp, 200);
    return jsonNoStore(
      { error: submitTopUpErrorMessage(submitError.message) },
      { status: 409 },
    );
  }

  const submitResult = (submitData ?? {}) as SubmitTopUpRpcResult;
  if (rpcBoolean(submitResult.replayed)) {
    await supabase.storage.from(slipBucketName).remove([filePath]);
    const replayTopUpId = rpcString(submitResult.topUpId);
    const replayTopUp = replayTopUpId
      ? await fetchTopUpById(supabase, replayTopUpId)
      : await fetchExistingTopUpByIdempotency(supabase, session.profileId, idempotencyKey);
    if (replayTopUp) return replayTopUpResponse(replayTopUp, 200);
  }

  const submittedTopUpId = rpcString(submitResult.topUpId);
  const paymentSlipId = rpcString(submitResult.paymentSlipId);
  if (!submittedTopUpId || !paymentSlipId) {
    await supabase.storage.from(slipBucketName).remove([filePath]);
    return jsonNoStore(
      { error: "Could not submit this top-up. Please refresh and try again." },
      { status: 500 },
    );
  }

  const topUp = await fetchTopUpById(supabase, submittedTopUpId);
  if (!topUp) {
    return jsonNoStore(
      { error: "Could not load this top-up. Please refresh and try again." },
      { status: 500 },
    );
  }
```

- [ ] **Step 6: Update slip references after the RPC**

Replace all `slip.id` references in `POST` with `paymentSlipId`.

Replace this update target:

```ts
      .eq("id", slip.id);
```

with:

```ts
      .eq("id", paymentSlipId);
```

- [ ] **Step 7: Keep approval/rejection RPC calls unchanged except IDs**

Confirm the route still calls:

```ts
await supabase.rpc("reject_top_up_request", {
  p_top_up_request_id: topUp.id,
  p_admin_id: autoAdmin.id,
  p_admin_note: `Auto-rejected after Slip2Go returned ${finalStatus.replace(/_/g, " ")}. Customer needs to upload a matching slip.`,
});
```

and:

```ts
await supabase.rpc("approve_top_up_request", {
  p_top_up_request_id: topUp.id,
  p_admin_id: autoAdmin.id,
  p_admin_note: "Auto-approved after Slip2Go verified amount, receiver, date, and duplicate checks.",
});
```

Do not pass action tokens, public codes, or untrusted body values to these approval/rejection RPCs.

- [ ] **Step 8: Run the focused test and verify it passes**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:top-up-flow
```

Expected: PASS.

- [ ] **Step 9: Commit the route update**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/app/api/ynot/wallet/route.ts
git commit -m $'Route top-up submits through idempotent RPC\n\nConstraint: wallet API must create at most one business top-up per customer intent while keeping provider details server-side.\nRejected: retrying direct inserts after upload | it can multiply rows and audit events under duplicate submits.\nConfidence: high\nScope-risk: moderate\nDirective: Keep approval/rejection RPC calls on internal top-up IDs resolved server-side.\nTested: npm run test:top-up-flow\nNot-tested: live Slip2Go provider response'
```

---

### Task 6: Verify Privacy and Existing RPC Contracts

**Files:**
- Verify: `Website/scripts/test-top-up-flow.mjs`
- Verify: `Website/scripts/test-pack-open-privacy.mjs`
- Verify: `Website/scripts/test-shipping-flow.mjs`
- Verify: `Website/src/app/api/ynot/gacha/open/route.ts`
- Verify: `Website/src/app/api/ynot/shipping/route.ts`
- Verify: `Website/src/lib/ynot/card-conversion-api.ts`

- [ ] **Step 1: Run customer top-up tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:top-up-flow
```

Expected: PASS. Confirms top-up API uses the submit RPC, stable idempotency keys, safe DTO mapping, same-origin protection, strict slip approval checks, and no provider internals in customer wallet history.

- [ ] **Step 2: Run pack-open privacy tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-open-privacy
```

Expected: PASS. Confirms this top-up work did not widen public pack-open responses or expose private pack/business fields.

- [ ] **Step 3: Run shipping flow tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:shipping-flow
```

Expected: PASS. Confirms existing shipping API/RPC idempotency and public response mapping still hold.

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Inspect sensitive-field diff**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git diff -- Website/src/app/api/ynot/wallet/route.ts Website/src/features/ynot/cr/WalletExperience.tsx Website/src/features/ynot/client.tsx Database/supabase/migrations/20260615090000_top_up_idempotency.sql
```

Expected:
- Wallet route returns `publicTopUp(toTopUp(...))`.
- New migration does not mention `open_gacha_campaign`, prize tables, private pack logic, odds, weights, unlock thresholds, or stock-target metadata.
- Frontend idempotency keys include only safe action identity parts: payment method action token, package/custom label, amount, and random action intent.

- [ ] **Step 6: Commit verification evidence**

If all commands pass and no code changes are needed, create an empty verification commit:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git commit --allow-empty -m $'Verify top-up duplicate-write hardening\n\nConstraint: duplicate-write fix must preserve existing pack-open and shipping privacy boundaries.\nRejected: claiming safety from top-up tests alone | pack-open and shipping API/RPC contracts are adjacent customer money/reward surfaces.\nConfidence: high\nScope-risk: narrow\nDirective: Do not deploy the migration without a linked dry-run and explicit release step.\nTested: npm run test:top-up-flow; npm run test:pack-open-privacy; npm run test:shipping-flow; npm run typecheck\nNot-tested: production Supabase apply; live Slip2Go callback behavior'
```

---

## Self-Review

Spec coverage:
- Duplicate data: Tasks 1, 2, and 5 prevent duplicate top-up business rows with a stable client key, API validation, RPC replay, and DB uniqueness.
- API/RPC correctness: Tasks 1, 2, 5, and 6 assert resolved IDs and safe RPC parameters. Approval/rejection RPC calls remain server-side and use internal IDs only after route-side validation.
- No house/private data leak: Tasks 1, 2, and 6 explicitly block migration changes to pack-opening/prize/private logic and run the existing pack-open privacy tests.
- Current shipping/pack-open behavior: Task 6 verifies existing shipping and pack-open privacy contracts after the change.

Placeholder scan:
- No task uses placeholder filenames, unspecified commands, or unspecified tests.
- The migration filename is exact: `20260615090000_top_up_idempotency.sql`.
- Every code-changing step includes the code to add or the exact block shape to verify.

Type consistency:
- `submit_top_up_request` RPC args in the migration match the `Website/src/lib/supabase/types.ts` signature and the `wallet/route.ts` RPC call.
- `topUpSubmitInFlightRef`, `createYnotActionIntentId`, and `ynotActionIdempotencyKey` names match across tests and implementation tasks.
- Public response mapping remains `publicTopUp(toTopUp(...))` in replay and success paths.
