# Admin Page Full Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full admin-page remediation set in one branch: money authority, atomic campaign edits, owner-review snapshot typing, slot-grid preservation, preview auth mutation boundaries, media verification, and legacy admin retirement.

**Architecture:** Keep the existing Next.js App Router and Supabase service-role route-handler shape, but move cross-table campaign edits into a Postgres RPC because Supabase JS route code cannot provide a real transaction boundary. Add small shared guards and validators so sensitive route handlers do not drift independently. Use Node static regression tests for admin authorization contracts and local/staging Supabase tests for the database RPC.

**Tech Stack:** Next.js App Router route handlers, React client components, Supabase Postgres migrations and RPCs, generated Supabase TypeScript types, existing `node:test` static tests, `npm run lint`, `npm run typecheck`, and targeted `npm run test:*` scripts.

---

## Implementation Notes

This plan supersedes the narrower `docs/superpowers/plans/2026-06-03-admin-auth-hardening.md` for this remediation batch. Use this file when implementing all phases together.

Apply database work only to local or staging Supabase first. Production migration apply must wait for the existing backup, PITR, and restore-drill gate described in the workspace instructions.

Use one feature branch. Commit after each task so the full branch remains reviewable even though the implementation is being done as one push.

## File Structure

**Create**
- `Database/supabase/migrations/20260603160000_admin_page_roles.sql` - adds `finance` role support.
- `Database/supabase/migrations/20260603161000_campaign_draft_atomic_rpc.sql` - adds the atomic campaign draft update RPC.
- `Website/scripts/test-admin-page-remediation.mjs` - static regression contract for all seven admin findings.
- `Website/scripts/test-tier-animation-media.mjs` - byte-level media verifier regression tests for reveal video, audio, and poster uploads.
- `Website/src/lib/ynot/admin-authz.ts` - shared role checks for payment destination managers and preview mutation bypass.
- `Website/src/lib/ynot/payment-audit.ts` - shared old/new audit snapshot helpers for payment methods.
- `Website/src/lib/uploads/tier-animation-media.ts` - server-side reveal media byte verification and normalized content-type mapping.
- `Website/src/lib/lucky-draw/legacy-admin-retired.ts` - shared 410 response for retired legacy Lucky Draw admin routes.

**Modify**
- `Website/package.json` - add `test:admin-page-remediation`, include the new media test in `test:uploads`, and wire admin remediation into `verify:hardening`.
- `Website/src/lib/supabase/types.ts` - update admin role union and RPC type signatures.
- `Website/src/lib/auth/resolve-current-profile.ts` - update role union and keep preview auth identity explicit.
- `Website/src/lib/lucky-draw/session.ts` - update role union for legacy session parsing.
- `Website/src/lib/line/use-liff-session.ts` - update role union.
- `Website/src/features/lucky-draw/model.ts` - update `AdminRole`.
- `Website/src/features/ynot/types.ts` - add `finance`, `YnotSlotGrid`, `YnotLogicSnapshot`, `logicSnapshot`, `slotGrid`, and `reviewSnapshot`.
- `Website/src/features/ynot/data.ts` - map `logic_snapshot` into typed campaign and owner-review snapshot fields.
- `Website/src/features/ynot/client.tsx` - update admin role UI, owner review snapshot reads, and slot-grid edit hydration/submission.
- `Website/src/features/ynot/components.tsx` - update role display assumptions if TypeScript requires it after the `finance` role addition.
- `Website/src/features/ynot/admin/Shell.tsx` - update role display assumptions if TypeScript requires it after the `finance` role addition.
- `Website/src/app/api/ynot/admin/users/route.ts` - allow owners to grant `finance`.
- `Website/src/app/api/ynot/admin/payment-methods/route.ts` - require owner/finance and audit old/new payment destination fields.
- `Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts` - require owner/finance for QR upload and store verified content type.
- `Website/src/app/api/ynot/admin/campaigns/route.ts` - route PATCH through the atomic campaign RPC.
- `Website/src/app/api/ynot/admin/campaigns/cost/route.ts` - require the stricter preview mutation gate before using dev bypass.
- `Website/src/app/api/ynot/admin/campaigns/reorder/route.ts` - require the stricter preview mutation gate before using dev bypass.
- `Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts` - require the stricter preview mutation gate before using dev bypass.
- `Website/src/app/api/ynot/admin/tier-animations/route.ts` - verify upload bytes for video/audio/poster and use normalized content type.
- `Website/src/app/api/lucky-draw/admin/card-image/route.ts` - return 410 through the shared legacy helper.
- `Website/src/app/api/lucky-draw/admin/draw/lifecycle/route.ts` - return 410 through the shared legacy helper.
- `Website/src/app/api/lucky-draw/admin/draw/route.ts` - return 410 through the shared legacy helper.
- `Website/src/app/api/lucky-draw/admin/order/route.ts` - return 410 through the shared legacy helper.
- `Website/src/app/api/lucky-draw/admin/qr/route.ts` - return 410 through the shared legacy helper.
- `Website/src/app/api/lucky-draw/admin/slip/route.ts` - return 410 through the shared legacy helper.
- `Website/src/app/api/lucky-draw/admin/slip/verify-test/route.ts` - return 410 through the shared legacy helper.
- `Website/tools/verification/verify-auth-foundation.mjs` - update legacy admin expectations to 410 where it checks legacy routes.
- `Website/tools/verification/verify-hardening.mjs` - include reveal media byte-verification contract.
- `Website/tools/verification/verify-lucky-draw-plan.mjs` - update legacy admin expectations to retired routes.

**Do Not Modify**
- `Website/src/middleware.ts` - the global same-origin API mutation guard is not part of this remediation.
- `Line LIFF/` - this plan only changes Website admin/runtime surfaces.

---

### Task 1: Add The Full Admin Remediation Contract Tests

**Files:**
- Create: `Website/scripts/test-admin-page-remediation.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Create the failing all-phase static test**

Create `Website/scripts/test-admin-page-remediation.mjs` with this content:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function routeFunctionBody(fileSource, functionName) {
  const marker = `export async function ${functionName}`;
  const start = fileSource.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} route handler must exist`);
  const next = fileSource.indexOf("\nexport async function", start + marker.length);
  return fileSource.slice(start, next === -1 ? fileSource.length : next);
}

test("finance role is modeled everywhere admin roles are accepted", () => {
  const migration = source("../../Database/supabase/migrations/20260603160000_admin_page_roles.sql");
  const supabaseTypes = source("../src/lib/supabase/types.ts");
  const ynotTypes = source("../src/features/ynot/types.ts");
  const resolver = source("../src/lib/auth/resolve-current-profile.ts");
  const luckySession = source("../src/lib/lucky-draw/session.ts");
  const lineSession = source("../src/lib/line/use-liff-session.ts");
  const legacyModel = source("../src/features/lucky-draw/model.ts");
  const userRoute = source("../src/app/api/ynot/admin/users/route.ts");
  const adminClient = source("../src/features/ynot/client.tsx");

  assert.match(migration, /role in \('owner', 'finance', 'admin', 'staff'\)/);
  for (const text of [supabaseTypes, ynotTypes, resolver, luckySession, lineSession, legacyModel]) {
    assert.match(text, /"owner" \| "finance" \| "admin" \| "staff"/);
  }
  assert.match(userRoute, /value === "finance"/);
  assert.match(adminClient, /value="finance"/);
});

test("payment destination mutations require owner or finance and record before-after audit snapshots", () => {
  const authz = source("../src/lib/ynot/admin-authz.ts");
  const audit = source("../src/lib/ynot/payment-audit.ts");
  const paymentRoute = source("../src/app/api/ynot/admin/payment-methods/route.ts");
  const qrRoute = source("../src/app/api/ynot/admin/payment-methods/qr-image/route.ts");

  assert.match(authz, /canManagePaymentDestinations/);
  assert.match(authz, /adminRole === "owner" \|\| adminRole === "finance"/);
  assert.match(audit, /paymentMethodAuditSnapshot/);
  assert.match(audit, /bankName/);
  assert.match(audit, /promptpayId/);
  assert.match(audit, /qrImagePath/);
  assert.match(audit, /isActive/);
  assert.match(paymentRoute, /requirePaymentDestinationManager\(admin\)/);
  assert.match(paymentRoute, /\.from\("payment_methods"\)[\s\S]*\.select\("[^"]*qr_image_path[^"]*is_active/);
  assert.match(paymentRoute, /paymentMethodAuditMetadata\(previousPaymentMethod, data\)/);
  assert.match(qrRoute, /requirePaymentDestinationManager\(admin\)/);
  assert.match(qrRoute, /contentType: magicCheck\.contentType/);
});

test("campaign PATCH uses a single atomic RPC for cross-table edits", () => {
  const migration = source("../../Database/supabase/migrations/20260603161000_campaign_draft_atomic_rpc.sql");
  const route = source("../src/app/api/ynot/admin/campaigns/route.ts");
  const patchBody = routeFunctionBody(route, "PATCH");

  assert.match(migration, /create or replace function public\.update_campaign_draft_atomic/);
  assert.match(migration, /perform public\.release_campaign_reservations/);
  assert.match(migration, /delete from public\.draw_round_prize_units/);
  assert.match(migration, /insert into public\.draw_round_prizes/);
  assert.match(migration, /insert into public\.audit_events/);
  assert.match(patchBody, /\.rpc\("update_campaign_draft_atomic"/);
  assert.doesNotMatch(patchBody, /\.from\("draw_round_prize_units"\)[\s\S]*\.delete\(/);
  assert.doesNotMatch(patchBody, /\.from\("draw_round_prizes"\)[\s\S]*\.delete\(/);
  assert.doesNotMatch(patchBody, /replaceCampaignCategories\(supabase/);
});

test("owner review reads typed saved snapshots instead of unsafe casts", () => {
  const types = source("../src/features/ynot/types.ts");
  const data = source("../src/features/ynot/data.ts");
  const client = source("../src/features/ynot/client.tsx");

  assert.match(types, /export type YnotLogicSnapshot = Record<string, unknown>;/);
  assert.match(types, /logicSnapshot\?: YnotLogicSnapshot;/);
  assert.match(types, /reviewSnapshot\?: YnotLogicSnapshot \| null;/);
  assert.match(data, /logicSnapshot: normalizeLogicSnapshot\(row\.logic_snapshot\)/);
  assert.match(data, /reviewSnapshot: campaign\.logicSnapshot ?? null/);
  assert.match(client, /approvalRequest\?\.reviewSnapshot/);
  assert.doesNotMatch(client, /approvalRequest as \{ snapshot\?: unknown \}/);
});

test("slot-pick grid is hydrated from saved logic snapshot and omitted when unchanged", () => {
  const types = source("../src/features/ynot/types.ts");
  const data = source("../src/features/ynot/data.ts");
  const client = source("../src/features/ynot/client.tsx");

  assert.match(types, /export type YnotSlotGrid/);
  assert.match(types, /slotGrid\?: YnotSlotGrid \| null;/);
  assert.match(data, /slotGrid: normalizeSlotGrid\(row\.logic_snapshot\)/);
  assert.match(client, /const initialSlotGrid = editingCampaign\?\.slotGrid \?\? defaultSlotGrid/);
  assert.match(client, /function slotGridEquals/);
  assert.match(client, /const slotGridForSubmit =/);
  assert.doesNotMatch(client, /slotGrid: mode === "slot_pick" \? slotGrid : undefined/);
});

test("preview auth mutation bypass requires an explicit local preview identity and database allowlist", () => {
  const authz = source("../src/lib/ynot/admin-authz.ts");
  const costRoute = source("../src/app/api/ynot/admin/campaigns/cost/route.ts");
  const reorderRoute = source("../src/app/api/ynot/admin/campaigns/reorder/route.ts");
  const lifecycleRoute = source("../src/app/api/ynot/admin/campaigns/lifecycle/route.ts");
  const campaignRoute = source("../src/app/api/ynot/admin/campaigns/route.ts");

  assert.match(authz, /canUsePreviewAdminMutationBypass/);
  assert.match(authz, /request\.headers\.get\("cookie"\)/);
  assert.match(authz, /ynot-preview-auth=1/);
  assert.match(authz, /YNOT_DEV_MUTATION_SUPABASE_REFS/);
  assert.match(authz, /isLocalhostRequest\(request\)/);
  for (const route of [costRoute, reorderRoute, lifecycleRoute, campaignRoute]) {
    assert.match(route, /canUsePreviewAdminMutationBypass/);
  }
});

test("tier animation uploads verify bytes and store normalized content type", () => {
  const verifier = source("../src/lib/uploads/tier-animation-media.ts");
  const route = source("../src/app/api/ynot/admin/tier-animations/route.ts");
  const scriptExists = existsSync(new URL("../scripts/test-tier-animation-media.mjs", import.meta.url));

  assert.equal(scriptExists, true);
  assert.match(verifier, /verifyTierAnimationUpload/);
  assert.match(verifier, /MP4_FTYP_OFFSET/);
  assert.match(verifier, /WEBM_EBML_SIGNATURE/);
  assert.match(verifier, /MP3_ID3_SIGNATURE/);
  assert.match(verifier, /WAV_RIFF_SIGNATURE/);
  assert.match(route, /verifyTierAnimationUpload\(file, kind\)/);
  assert.match(route, /contentType: verified\.contentType/);
  assert.doesNotMatch(route, /contentType: file\.type \|\| undefined/);
  assert.doesNotMatch(route, /function pickExtension/);
});

test("legacy lucky draw admin routes are retired with a shared 410 response", () => {
  const helper = source("../src/lib/lucky-draw/legacy-admin-retired.ts");
  const routePaths = [
    "../src/app/api/lucky-draw/admin/card-image/route.ts",
    "../src/app/api/lucky-draw/admin/draw/lifecycle/route.ts",
    "../src/app/api/lucky-draw/admin/draw/route.ts",
    "../src/app/api/lucky-draw/admin/order/route.ts",
    "../src/app/api/lucky-draw/admin/qr/route.ts",
    "../src/app/api/lucky-draw/admin/slip/route.ts",
    "../src/app/api/lucky-draw/admin/slip/verify-test/route.ts",
  ];

  assert.match(helper, /status: 410/);
  assert.match(helper, /YNOT admin API/);
  for (const routePath of routePaths) {
    const route = source(routePath);
    assert.match(route, /legacyLuckyDrawAdminGone\(\)/);
    assert.doesNotMatch(route, /createServiceSupabaseClient/);
    assert.doesNotMatch(route, /\.storage/);
    assert.doesNotMatch(route, /\.rpc\("create_draw_slots"/);
  }
});
```

- [ ] **Step 2: Wire the static test into package scripts**

In `Website/package.json`, update `scripts` with these entries:

```json
{
  "test:admin-page-remediation": "node --test scripts/test-admin-page-remediation.mjs",
  "verify:hardening": "npm run test:uploads && npm run test:admin-page-remediation && node tools/verification/verify-hardening.mjs && node tools/verification/verify-rls-coverage.mjs"
}
```

Keep the rest of the existing script object unchanged.

- [ ] **Step 3: Run the failing contract test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-page-remediation
```

Expected: FAIL because the migration, helpers, finance role, typed snapshots, media verifier, and legacy retirement helper do not exist yet.

- [ ] **Step 4: Commit the failing contract test**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/scripts/test-admin-page-remediation.mjs Website/package.json
git commit -m "test admin remediation contract

Constraint: Seven admin findings must be implemented in one branch without losing phase-level checks.
Confidence: high
Scope-risk: moderate
Tested: npm run test:admin-page-remediation fails on missing remediation contracts
Not-tested: Production runtime behavior before implementation"
```

---

### Task 2: Add Finance Role And Payment Destination Authority

**Files:**
- Create: `Website/src/lib/ynot/admin-authz.ts`
- Create: `Website/src/lib/ynot/payment-audit.ts`
- Create: `Database/supabase/migrations/20260603160000_admin_page_roles.sql`
- Modify: `Website/src/lib/supabase/types.ts`
- Modify: `Website/src/lib/auth/resolve-current-profile.ts`
- Modify: `Website/src/lib/lucky-draw/session.ts`
- Modify: `Website/src/lib/line/use-liff-session.ts`
- Modify: `Website/src/features/lucky-draw/model.ts`
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/app/api/ynot/admin/users/route.ts`
- Modify: `Website/src/app/api/ynot/admin/payment-methods/route.ts`
- Modify: `Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts`

- [ ] **Step 1: Add finance to the database role constraint**

Create `Database/supabase/migrations/20260603160000_admin_page_roles.sql` with this content:

```sql
begin;

alter table if exists public.admin_users
  drop constraint if exists admin_users_role_check;

alter table if exists public.admin_users
  add constraint admin_users_role_check
  check (role in ('owner', 'finance', 'admin', 'staff'));

commit;
```

- [ ] **Step 2: Add shared admin authorization helpers**

Create `Website/src/lib/ynot/admin-authz.ts` with this content:

```ts
export type YnotAdminRole = "owner" | "finance" | "admin" | "staff";

export type YnotAdminActor = {
  adminId?: string | null;
  profileId?: string | null;
  adminRole?: YnotAdminRole | string | null;
};

const previewMutationCookie = "ynot-preview-auth=1";

export function isYnotAdminRole(value: unknown): value is YnotAdminRole {
  return value === "owner" || value === "finance" || value === "admin" || value === "staff";
}

export function canManagePaymentDestinations(admin: YnotAdminActor | null | undefined): boolean {
  const adminRole = admin?.adminRole;
  return adminRole === "owner" || adminRole === "finance";
}

export function requirePaymentDestinationManager(admin: YnotAdminActor | null | undefined): Response | null {
  if (canManagePaymentDestinations(admin)) return null;
  return Response.json(
    { error: "Payment destination changes require owner or finance role." },
    { status: 403 },
  );
}

function requestHost(request: Request): string {
  try {
    return new URL(request.url).hostname;
  } catch {
    return "";
  }
}

function isLocalhostRequest(request: Request): boolean {
  const host = requestHost(request);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function currentSupabaseProjectRef(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname;
    const [projectRef] = host.split(".");
    return projectRef || null;
  } catch {
    return null;
  }
}

function isConfiguredSupabaseAllowedForPreviewMutation(): boolean {
  const projectRef = currentSupabaseProjectRef();
  if (!projectRef) return true;
  const allowedRefs = (process.env.YNOT_DEV_MUTATION_SUPABASE_REFS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowedRefs.includes(projectRef);
}

export function canUsePreviewAdminMutationBypass(
  request: Request,
  admin: YnotAdminActor | null | undefined,
): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.YNOT_ENABLE_DEV_AUTH === "true" &&
    cookie.includes(previewMutationCookie) &&
    isLocalhostRequest(request) &&
    Boolean(admin?.adminId) &&
    Boolean(admin?.profileId) &&
    isYnotAdminRole(admin?.adminRole) &&
    isConfiguredSupabaseAllowedForPreviewMutation()
  );
}
```

- [ ] **Step 3: Add payment audit snapshot helpers**

Create `Website/src/lib/ynot/payment-audit.ts` with this content:

```ts
export type PaymentMethodAuditSource = {
  code?: string | null;
  type?: string | null;
  display_name?: string | null;
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  promptpay_id?: string | null;
  qr_image_path?: string | null;
  instructions?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
};

export type PaymentMethodAuditSnapshot = {
  code: string | null;
  type: string | null;
  displayName: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  promptpayId: string | null;
  qrImagePath: string | null;
  instructions: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
};

export function paymentMethodAuditSnapshot(
  row: PaymentMethodAuditSource | null | undefined,
): PaymentMethodAuditSnapshot | null {
  if (!row) return null;
  return {
    code: row.code ?? null,
    type: row.type ?? null,
    displayName: row.display_name ?? null,
    bankName: row.bank_name ?? null,
    accountName: row.account_name ?? null,
    accountNumber: row.account_number ?? null,
    promptpayId: row.promptpay_id ?? null,
    qrImagePath: row.qr_image_path ?? null,
    instructions: row.instructions ?? null,
    sortOrder: row.sort_order ?? null,
    isActive: row.is_active ?? null,
  };
}

export function paymentMethodAuditMetadata(
  before: PaymentMethodAuditSource | null | undefined,
  after: PaymentMethodAuditSource | null | undefined,
) {
  return {
    before: paymentMethodAuditSnapshot(before),
    after: paymentMethodAuditSnapshot(after),
  };
}
```

- [ ] **Step 4: Update TypeScript role unions**

In each listed file, replace the current owner/admin/staff union with `owner | finance | admin | staff`:

```ts
"owner" | "finance" | "admin" | "staff"
```

Files to update:
- `Website/src/lib/supabase/types.ts`
- `Website/src/lib/auth/resolve-current-profile.ts`
- `Website/src/lib/lucky-draw/session.ts`
- `Website/src/lib/line/use-liff-session.ts`
- `Website/src/features/lucky-draw/model.ts`
- `Website/src/features/ynot/types.ts`
- `Website/src/lib/ynot/top-up-approval.ts`
- `Website/src/app/api/ynot/admin/campaigns/route.ts`

Also update every role parser so `finance` is accepted only where a known admin role is already accepted:

```ts
return value === "owner" || value === "finance" || value === "admin" || value === "staff"
  ? value
  : null;
```

- [ ] **Step 5: Add finance to the admin role UI**

In `Website/src/features/ynot/client.tsx`, update `AdminUserRoleForm` state and select options so owners can grant finance:

```tsx
const [role, setRole] = useState<"staff" | "admin" | "finance" | "owner">(
  user.role ?? "staff",
);
```

Use these options in the role `<select>`:

```tsx
<option value="staff">Staff</option>
<option value="admin">Admin</option>
<option value="finance">Finance</option>
<option value="owner">Owner</option>
```

- [ ] **Step 6: Gate payment methods by owner or finance**

In `Website/src/app/api/ynot/admin/payment-methods/route.ts`, add imports:

```ts
import { requirePaymentDestinationManager } from "@/lib/ynot/admin-authz";
import { paymentMethodAuditMetadata } from "@/lib/ynot/payment-audit";
```

Immediately after the existing `if (!admin)` block, add:

```ts
const roleDenied = requirePaymentDestinationManager(admin);
if (roleDenied) return roleDenied;
```

Before the `.upsert(...)`, load the current row:

```ts
const { data: previousPaymentMethod, error: previousError } = await supabase
  .from("payment_methods")
  .select("code,type,display_name,bank_name,account_name,account_number,promptpay_id,qr_image_path,instructions,sort_order,is_active")
  .eq("code", code)
  .maybeSingle();
if (previousError) return Response.json({ error: previousError.message }, { status: 409 });
```

Replace the current audit insert with:

```ts
await supabase.from("audit_events").insert({
  actor_admin_id: admin.adminId,
  event_type: "payment_method_upserted",
  metadata: {
    code,
    paymentMethodId: data.id,
    ...paymentMethodAuditMetadata(previousPaymentMethod, data),
  },
});
```

- [ ] **Step 7: Gate QR upload by owner or finance**

In `Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts`, import and use `requirePaymentDestinationManager(admin)` immediately after the existing `if (!admin)` block:

```ts
import { requirePaymentDestinationManager } from "@/lib/ynot/admin-authz";
```

```ts
const roleDenied = requirePaymentDestinationManager(admin);
if (roleDenied) return roleDenied;
```

Keep the current image magic-byte check. The upload must continue to store `contentType: magicCheck.contentType`.

- [ ] **Step 8: Run the phase tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-page-remediation
npm run typecheck
```

Expected: `test:admin-page-remediation` still fails on later phases, but the finance/payment assertions pass. `typecheck` passes after every role union is updated.

- [ ] **Step 9: Commit money authority changes**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Database/supabase/migrations/20260603160000_admin_page_roles.sql Website/src/lib/ynot/admin-authz.ts Website/src/lib/ynot/payment-audit.ts Website/src/lib/supabase/types.ts Website/src/lib/auth/resolve-current-profile.ts Website/src/lib/lucky-draw/session.ts Website/src/lib/line/use-liff-session.ts Website/src/features/lucky-draw/model.ts Website/src/features/ynot/types.ts Website/src/features/ynot/client.tsx Website/src/lib/ynot/top-up-approval.ts Website/src/app/api/ynot/admin/users/route.ts Website/src/app/api/ynot/admin/payment-methods/route.ts Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts Website/src/app/api/ynot/admin/campaigns/route.ts
git commit -m "restrict payment destinations to finance roles

Constraint: Payment destination and QR changes move money and require a narrower authority boundary than general admin.
Rejected: Owner-only forever | finance staff would need owner credentials for routine payment updates.
Confidence: high
Scope-risk: moderate
Tested: npm run typecheck; npm run test:admin-page-remediation partially passes money assertions
Not-tested: Production Supabase migration apply"
```

---

### Task 3: Add The Strict Preview Admin Mutation Boundary

**Files:**
- Modify: `Website/src/app/api/ynot/admin/campaigns/cost/route.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/reorder/route.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/route.ts`

- [ ] **Step 1: Replace broad dev-auth mutation checks**

In every route listed above, replace mutation bypass logic based directly on `isDevAuthAllowed()` with the helper from Task 2:

```ts
import { canUsePreviewAdminMutationBypass } from "@/lib/ynot/admin-authz";
```

Use this pattern:

```ts
const admin = await resolveAdminSession();
const previewMutationAllowed = canUsePreviewAdminMutationBypass(request, admin);
if (!admin || (!admin.adminId && !previewMutationAllowed)) {
  return Response.json({ error: "Admin access is required." }, { status: 403 });
}
```

For routes whose owner-only action checks need `admin.adminRole`, keep the existing owner check for real admin sessions. If the preview path is allowed, it must have a preview admin identity with an admin role before the helper returns true.

- [ ] **Step 2: Remove fake owner construction**

In `Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts`, remove the current fallback that queries an owner and constructs:

```ts
{
  adminRole: "owner",
}
```

The only accepted mutation identities after this task are real `resolveAdminSession()` identities and preview identities that pass `canUsePreviewAdminMutationBypass(request, admin)`.

- [ ] **Step 3: Run the phase test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-page-remediation
```

Expected: preview-auth assertions pass. The script still fails on campaign RPC, snapshots, slot-grid, media, or legacy assertions until later tasks are complete.

- [ ] **Step 4: Commit preview mutation boundary**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/lib/ynot/admin-authz.ts Website/src/app/api/ynot/admin/campaigns/cost/route.ts Website/src/app/api/ynot/admin/campaigns/reorder/route.ts Website/src/app/api/ynot/admin/campaigns/lifecycle/route.ts Website/src/app/api/ynot/admin/campaigns/route.ts
git commit -m "tighten preview auth mutation boundary

Constraint: Development preview shortcuts must not mutate configured Supabase projects without a local preview identity and explicit database allowlist.
Rejected: Broad YNOT_ENABLE_DEV_AUTH mutation bypass | a single env flag is too easy to misconfigure against a real project.
Confidence: high
Scope-risk: moderate
Tested: npm run test:admin-page-remediation partially passes preview mutation assertions
Not-tested: Live preview-auth browser flow"
```

---

### Task 4: Move Campaign PATCH Into One Atomic RPC

**Files:**
- Create: `Database/supabase/migrations/20260603161000_campaign_draft_atomic_rpc.sql`
- Modify: `Website/src/lib/supabase/types.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/route.ts`
- Create or modify: `Website/scripts/test-admin-campaign-rpc-live.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Add the atomic RPC to the migration**

Create `Database/supabase/migrations/20260603161000_campaign_draft_atomic_rpc.sql` with this content:

```sql
begin;

create or replace function public.update_campaign_draft_atomic(
  p_draw_round_id uuid,
  p_admin_id uuid,
  p_campaign_patch jsonb,
  p_replace_categories boolean default false,
  p_category_ids uuid[] default null,
  p_replace_prizes boolean default false,
  p_prizes jsonb default '[]'::jsonb,
  p_is_test boolean default false,
  p_seed_run_id text default null,
  p_audit_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.draw_rounds%rowtype;
  next_logic_snapshot jsonb;
  next_total_slots integer;
  prize jsonb;
begin
  if not exists (
    select 1
    from public.admin_users
    where id = p_admin_id
      and is_active = true
      and role in ('owner', 'finance', 'admin', 'staff')
  ) then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;

  select *
    into campaign
  from public.draw_rounds
  where id = p_draw_round_id
  for update;

  if not found then
    raise exception 'Campaign not found.' using errcode = 'P0002';
  end if;

  if campaign.status <> 'draft' then
    raise exception 'Random pack settings can only be changed while the pack is draft/private.' using errcode = 'P0001';
  end if;

  if campaign.approval_status = 'approved' then
    raise exception 'Approved pack inventory is locked. Archive it or create a new draft before changing settings.' using errcode = 'P0001';
  end if;

  next_logic_snapshot := coalesce(
    p_campaign_patch -> 'logic_snapshot',
    campaign.logic_snapshot,
    '{"mode":"pure_random"}'::jsonb
  );
  next_total_slots := coalesce(
    nullif(p_campaign_patch ->> 'total_slots', '')::integer,
    campaign.total_slots
  );

  if campaign.approval_status = 'pending_review' then
    perform public.release_campaign_reservations(
      p_draw_round_id,
      p_admin_id,
      'settings_changed',
      'Campaign settings changed before owner approval.'
    );
  end if;

  update public.draw_rounds
  set
    slug = coalesce(p_campaign_patch ->> 'slug', slug),
    title_th = coalesce(p_campaign_patch ->> 'title_th', title_th),
    title_en = coalesce(p_campaign_patch ->> 'title_en', title_en),
    series = coalesce(nullif(p_campaign_patch ->> 'series', '')::text, series)::text,
    price_thb = coalesce(nullif(p_campaign_patch ->> 'price_thb', '')::integer, price_thb),
    cost_coins = coalesce(nullif(p_campaign_patch ->> 'cost_coins', '')::integer, cost_coins),
    total_slots = next_total_slots,
    mode = coalesce(nullif(p_campaign_patch ->> 'mode', '')::text, mode)::text,
    visibility = 'private',
    display_tags = case
      when p_campaign_patch ? 'display_tags'
      then array(select jsonb_array_elements_text(p_campaign_patch -> 'display_tags'))
      else display_tags
    end,
    opens_total_limit = case when p_campaign_patch ? 'opens_total_limit' then nullif(p_campaign_patch ->> 'opens_total_limit', '')::integer else opens_total_limit end,
    per_user_limit = case when p_campaign_patch ? 'per_user_limit' then nullif(p_campaign_patch ->> 'per_user_limit', '')::integer else per_user_limit end,
    starts_at = case when p_campaign_patch ? 'starts_at' then nullif(p_campaign_patch ->> 'starts_at', '')::timestamptz else starts_at end,
    ends_at = case when p_campaign_patch ? 'ends_at' then nullif(p_campaign_patch ->> 'ends_at', '')::timestamptz else ends_at end,
    sort_order = coalesce(nullif(p_campaign_patch ->> 'sort_order', '')::integer, sort_order),
    is_test = coalesce((p_campaign_patch ->> 'is_test')::boolean, is_test),
    convert_deadline_days = case when p_campaign_patch ? 'convert_deadline_days' then nullif(p_campaign_patch ->> 'convert_deadline_days', '')::integer else convert_deadline_days end,
    logic_snapshot = next_logic_snapshot,
    approval_status = 'not_submitted',
    approval_requested_by = null,
    approval_requested_at = null,
    approved_by = null,
    approved_at = null,
    rejected_by = null,
    rejected_at = null,
    approval_notes = 'Campaign settings changed. Submit owner review to reserve stock before publish.',
    status = 'draft',
    updated_at = now()
  where id = p_draw_round_id;

  if p_replace_categories then
    delete from public.draw_round_categories
    where draw_round_id = p_draw_round_id;

    if coalesce(array_length(p_category_ids, 1), 0) > 0 then
      insert into public.draw_round_categories(draw_round_id, category_id, is_primary)
      select p_draw_round_id, category_id, ordinality = 1
      from unnest(p_category_ids) with ordinality as selected(category_id, ordinality);
    end if;
  end if;

  if next_total_slots is distinct from campaign.total_slots then
    perform public.create_draw_slots(p_draw_round_id);
  end if;

  if p_replace_prizes then
    delete from public.draw_round_prize_units
    where draw_round_id = p_draw_round_id;

    delete from public.draw_round_prizes
    where draw_round_id = p_draw_round_id;

    for prize in select * from jsonb_array_elements(coalesce(p_prizes, '[]'::jsonb))
    loop
      insert into public.draw_round_prizes(
        draw_round_id,
        card_id,
        tier,
        rank,
        value_thb,
        convert_coin_value,
        weight,
        unlock_at_sold_pct,
        planned_quantity,
        is_test,
        seed_run_id,
        metadata
      )
      values (
        p_draw_round_id,
        (prize ->> 'cardId')::uuid,
        prize ->> 'tier',
        nullif(prize ->> 'rank', '')::integer,
        nullif(prize ->> 'valueThb', '')::integer,
        coalesce(nullif(prize ->> 'convertCoinValue', '')::integer, 0),
        coalesce(nullif(prize ->> 'weight', '')::numeric, 1),
        coalesce(nullif(prize ->> 'unlockAtSoldPct', '')::integer, 0),
        coalesce(nullif(prize ->> 'quantity', '')::integer, 1),
        p_is_test,
        p_seed_run_id,
        coalesce(prize -> 'metadata', '{}'::jsonb) ||
          jsonb_build_object('plannedByAdminId', p_admin_id)
      );
    end loop;
  end if;

  insert into public.audit_events(actor_admin_id, event_type, draw_round_id, metadata)
  values (
    p_admin_id,
    'campaign_updated',
    p_draw_round_id,
    p_audit_metadata || jsonb_build_object(
      'approvalStatus', 'not_submitted',
      'status', 'draft',
      'visibility', 'private',
      'replacedPrizes', p_replace_prizes,
      'replacedCategories', p_replace_categories
    )
  );

  return jsonb_build_object(
    'ok', true,
    'approvalStatus', 'not_submitted',
    'status', 'draft',
    'visibility', 'private'
  );
end;
$$;

revoke all on function public.update_campaign_draft_atomic(uuid, uuid, jsonb, boolean, uuid[], boolean, jsonb, boolean, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.update_campaign_draft_atomic(uuid, uuid, jsonb, boolean, uuid[], boolean, jsonb, boolean, text, jsonb)
  to service_role;

commit;
```

After adding this SQL, run a local migration linter or apply to a local Supabase database before production consideration:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Database/supabase
supabase db reset
```

Expected: local database resets successfully. If the local Supabase stack is not running, start it with `supabase start` and rerun the reset.

- [ ] **Step 2: Add the RPC type signature**

In `Website/src/lib/supabase/types.ts`, add this to `Database["public"]["Functions"]`:

```ts
update_campaign_draft_atomic: {
  Args: {
    p_draw_round_id: string;
    p_admin_id: string;
    p_campaign_patch: Json;
    p_replace_categories?: boolean;
    p_category_ids?: string[] | null;
    p_replace_prizes?: boolean;
    p_prizes?: Json;
    p_is_test?: boolean;
    p_seed_run_id?: string | null;
    p_audit_metadata?: Json;
  };
  Returns: Json;
};
```

- [ ] **Step 3: Route PATCH through the RPC**

In `Website/src/app/api/ynot/admin/campaigns/route.ts`, keep the existing body parsing, current campaign load, draft/approved checks, prize card existence checks, and stock validation. Replace the mutation block from reservation release through audit insert with one RPC call:

```ts
const categoryIds = body.categoryIds !== undefined ? idArrayValue(body.categoryIds) : null;
const rpcPatch = reviewPatch as Json;
const { data: rpcResult, error: rpcError } = await supabase.rpc("update_campaign_draft_atomic", {
  p_draw_round_id: campaignId,
  p_admin_id: admin.adminId,
  p_campaign_patch: rpcPatch,
  p_replace_categories: body.categoryIds !== undefined,
  p_category_ids: categoryIds,
  p_replace_prizes: Boolean(replacementPrizes),
  p_prizes: (replacementPrizes ?? []) as unknown as Json,
  p_is_test: Boolean(body.isTest),
  p_seed_run_id: text(body.seedRunId, 80) || null,
  p_audit_metadata: {
    patch: reviewPatch,
    replacedPrizes: Array.isArray(body.initialPrizes),
    changedSlotGrid: body.slotGrid !== undefined,
    changedOpenQuantityOptions: body.openQuantityOptions !== undefined,
  } as Json,
});

if (rpcError) {
  return adminErrorResponse(
    rpcError.code ?? "CAMPAIGN_UPDATE_FAILED",
    rpcError.message,
    409,
    { detail: rpcError.details ?? null, hint: rpcError.hint ?? null },
  );
}

revalidateTag("campaigns", "max");
return Response.json(
  isRecord(rpcResult)
    ? rpcResult
    : {
        ok: true,
        approvalStatus: "not_submitted",
        status: "draft",
        visibility: "private",
      },
);
```

Do not leave the PATCH handler with direct calls to `release_campaign_reservations`, `replaceCampaignCategories`, `.from("draw_round_prize_units").delete()`, `.from("draw_round_prizes").delete()`, `saveInitialPrizes`, or `.from("audit_events").insert()`.

- [ ] **Step 4: Add a local RPC failure-path test**

Create `Website/scripts/test-admin-campaign-rpc-live.mjs` with this content:

```js
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import test from "node:test";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test("update_campaign_draft_atomic rolls back campaign changes when prize replacement fails", async (t) => {
  if (!url || !serviceRole) {
    t.skip("Supabase local/staging env is not configured.");
    return;
  }

  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
  const admin = await supabase.from("admin_users").select("id").eq("role", "owner").eq("is_active", true).limit(1).maybeSingle();
  assert.ifError(admin.error);
  assert.ok(admin.data?.id, "an active owner admin is required for the live RPC rollback test");

  const campaign = await supabase
    .from("draw_rounds")
    .select("id,title_th,total_slots,logic_snapshot,status,approval_status")
    .eq("status", "draft")
    .neq("approval_status", "approved")
    .limit(1)
    .maybeSingle();
  assert.ifError(campaign.error);
  assert.ok(campaign.data?.id, "a draft campaign is required for the live RPC rollback test");

  const beforePrizes = await supabase
    .from("draw_round_prizes")
    .select("id,card_id,tier,rank,planned_quantity")
    .eq("draw_round_id", campaign.data.id)
    .order("tier")
    .order("rank");
  assert.ifError(beforePrizes.error);

  const result = await supabase.rpc("update_campaign_draft_atomic", {
    p_draw_round_id: campaign.data.id,
    p_admin_id: admin.data.id,
    p_campaign_patch: {
      title_th: `ROLLBACK SHOULD NOT PERSIST ${Date.now()}`,
      total_slots: campaign.data.total_slots,
      logic_snapshot: campaign.data.logic_snapshot,
    },
    p_replace_categories: false,
    p_category_ids: null,
    p_replace_prizes: true,
    p_prizes: [
      {
        cardId: "00000000-0000-0000-0000-000000000000",
        tier: "normal",
        rank: 1,
        quantity: 1,
        metadata: {},
      },
    ],
    p_is_test: true,
    p_seed_run_id: "rollback-contract",
    p_audit_metadata: { source: "test-admin-campaign-rpc-live" },
  });
  assert.ok(result.error, "invalid prize card must fail inside the RPC");

  const afterCampaign = await supabase
    .from("draw_rounds")
    .select("id,title_th,total_slots,logic_snapshot")
    .eq("id", campaign.data.id)
    .single();
  assert.ifError(afterCampaign.error);
  assert.equal(afterCampaign.data.title_th, campaign.data.title_th);
  assert.equal(afterCampaign.data.total_slots, campaign.data.total_slots);
  assert.deepEqual(afterCampaign.data.logic_snapshot, campaign.data.logic_snapshot);

  const afterPrizes = await supabase
    .from("draw_round_prizes")
    .select("id,card_id,tier,rank,planned_quantity")
    .eq("draw_round_id", campaign.data.id)
    .order("tier")
    .order("rank");
  assert.ifError(afterPrizes.error);
  assert.deepEqual(afterPrizes.data, beforePrizes.data);
});
```

Add this script to `Website/package.json`:

```json
{
  "test:admin-campaign-rpc-live": "node --test scripts/test-admin-campaign-rpc-live.mjs"
}
```

- [ ] **Step 5: Run the phase tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-page-remediation
npm run test:admin-campaign-rpc-live
npm run typecheck
```

Expected: static campaign RPC assertions pass. The live RPC test passes when local/staging Supabase env vars point at a database containing an active owner admin and draft campaign; otherwise it skips with the configured skip message.

- [ ] **Step 6: Commit campaign atomicity**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Database/supabase/migrations/20260603161000_campaign_draft_atomic_rpc.sql Website/src/lib/supabase/types.ts Website/src/app/api/ynot/admin/campaigns/route.ts Website/scripts/test-admin-campaign-rpc-live.mjs Website/package.json
git commit -m "make campaign draft edits atomic

Constraint: Campaign PATCH changes reservations, settings, categories, slots, prizes, and audit records as one business action.
Rejected: Supabase JS multi-step writes | route-level sequencing cannot roll back already-committed table updates.
Confidence: medium
Scope-risk: broad
Tested: npm run test:admin-page-remediation; npm run test:admin-campaign-rpc-live against local or staging Supabase; npm run typecheck
Not-tested: Production migration apply"
```

---

### Task 5: Preserve Owner Review Snapshots And Slot-Pick Grid

**Files:**
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/features/ynot/client.tsx`

- [ ] **Step 1: Add typed campaign snapshot fields**

In `Website/src/features/ynot/types.ts`, add these types after `YnotViewer`:

```ts
export type YnotLogicSnapshot = Record<string, unknown>;

export type YnotSlotGrid = {
  layout: "10x10" | "5x20" | "20x5";
  reveal: "stamp_on_pick" | "reveal_on_close";
  blockRepick: boolean;
};
```

Add these fields to `YnotCampaign`:

```ts
logicSnapshot?: YnotLogicSnapshot;
slotGrid?: YnotSlotGrid | null;
```

Add this field to `YnotOwnerApprovalRequest`:

```ts
reviewSnapshot?: YnotLogicSnapshot | null;
```

- [ ] **Step 2: Map raw logic snapshots in data.ts**

In `Website/src/features/ynot/data.ts`, add imports for `YnotLogicSnapshot` and `YnotSlotGrid`.

Add these helpers near the existing logic snapshot normalization helpers:

```ts
function normalizeLogicSnapshot(value: unknown): YnotLogicSnapshot {
  return isRecord(value) ? { ...value } : {};
}

function normalizeSlotGrid(value: unknown): YnotSlotGrid | null {
  const snapshot = isRecord(value) ? value : null;
  const raw = snapshot && isRecord(snapshot.slotGrid) ? snapshot.slotGrid : null;
  if (!raw) return null;
  const layout =
    raw.layout === "10x10" || raw.layout === "5x20" || raw.layout === "20x5"
      ? raw.layout
      : "10x10";
  const reveal =
    raw.reveal === "stamp_on_pick" || raw.reveal === "reveal_on_close"
      ? raw.reveal
      : "stamp_on_pick";
  return {
    layout,
    reveal,
    blockRepick: raw.blockRepick !== false,
  };
}
```

In `toYnotCampaign`, add these return properties:

```ts
logicSnapshot: normalizeLogicSnapshot(row.logic_snapshot),
slotGrid: normalizeSlotGrid(row.logic_snapshot),
```

In `getOwnerApprovalRequests(viewer, campaigns)`, set each request snapshot from the typed campaign:

```ts
reviewSnapshot: campaign.logicSnapshot ?? null,
```

- [ ] **Step 3: Remove the unsafe owner-review cast**

In `Website/src/features/ynot/client.tsx`, replace the current `logicSnapshotRaw` initializer inside `AdminOwnerReview` with:

```ts
const logicSnapshotRaw =
  approvalRequest?.reviewSnapshot && isRecord(approvalRequest.reviewSnapshot)
    ? approvalRequest.reviewSnapshot
    : null;
```

Keep the existing `persistedOverrides`, `persistedGuarantees`, `persistedByCard`, and `publishedBaseline` reads.

- [ ] **Step 4: Hydrate slot-grid state from the saved campaign**

Near the campaign form constants in `Website/src/features/ynot/client.tsx`, add:

```ts
const defaultSlotGrid: YnotSlotGrid = {
  layout: "10x10",
  reveal: "stamp_on_pick",
  blockRepick: true,
};

function slotGridEquals(left: YnotSlotGrid, right: YnotSlotGrid): boolean {
  return (
    left.layout === right.layout &&
    left.reveal === right.reveal &&
    left.blockRepick === right.blockRepick
  );
}
```

Inside `AdminCampaignForm`, add this before the `slotGrid` state:

```ts
const initialSlotGrid = editingCampaign?.slotGrid ?? defaultSlotGrid;
```

Replace the current `slotGrid` state initializer with:

```ts
const [slotGrid, setSlotGrid] = useState<YnotSlotGrid>(initialSlotGrid);
```

Before `basePayload`, compute:

```ts
const slotGridForSubmit =
  mode !== "slot_pick"
    ? undefined
    : !editingCampaign || !slotGridEquals(slotGrid, initialSlotGrid)
      ? slotGrid
      : undefined;
```

Replace the payload field with:

```ts
slotGrid: slotGridForSubmit,
```

- [ ] **Step 5: Run the phase tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-page-remediation
npm run typecheck
```

Expected: owner snapshot and slot-grid assertions pass. `typecheck` passes with the imported `YnotSlotGrid` type.

- [ ] **Step 6: Commit snapshot and slot-grid preservation**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/features/ynot/types.ts Website/src/features/ynot/data.ts Website/src/features/ynot/client.tsx
git commit -m "preserve admin review and slot grid state

Constraint: Admin edits must not lose saved owner review overrides or overwrite slot-pick grid settings during unrelated saves.
Rejected: Reading untyped approval snapshots from client casts | the data mapper already owns campaign shaping.
Confidence: high
Scope-risk: moderate
Tested: npm run test:admin-page-remediation; npm run typecheck
Not-tested: Browser edit flow screenshots"
```

---

### Task 6: Verify Tier Animation Media Bytes

**Files:**
- Create: `Website/src/lib/uploads/tier-animation-media.ts`
- Create: `Website/scripts/test-tier-animation-media.mjs`
- Modify: `Website/src/app/api/ynot/admin/tier-animations/route.ts`
- Modify: `Website/package.json`
- Modify: `Website/tools/verification/verify-hardening.mjs`

- [ ] **Step 1: Add the plain JS verifier regression tests**

Create `Website/scripts/test-tier-animation-media.mjs` with this content:

```js
import assert from "node:assert/strict";
import { test } from "node:test";

const MP4_FTYP_OFFSET = 4;
const MP4_FTYP_SIGNATURE = [0x66, 0x74, 0x79, 0x70];
const WEBM_EBML_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3];
const MP3_ID3_SIGNATURE = [0x49, 0x44, 0x33];
const MP3_FRAME_PREFIX = 0xff;
const WAV_RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WAV_WAVE_SIGNATURE = [0x57, 0x41, 0x56, 0x45];
const OGG_SIGNATURE = [0x4f, 0x67, 0x67, 0x53];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function matches(bytes, signature, offset = 0) {
  if (bytes.byteLength < offset + signature.length) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature[index]) return false;
  }
  return true;
}

function verify(bytes, kind) {
  if (kind === "video" && matches(bytes, MP4_FTYP_SIGNATURE, MP4_FTYP_OFFSET)) {
    return { ok: true, contentType: "video/mp4", extension: "mp4" };
  }
  if (kind === "video" && matches(bytes, WEBM_EBML_SIGNATURE)) {
    return { ok: true, contentType: "video/webm", extension: "webm" };
  }
  if (kind === "sound" && matches(bytes, MP3_ID3_SIGNATURE)) {
    return { ok: true, contentType: "audio/mpeg", extension: "mp3" };
  }
  if (kind === "sound" && bytes[0] === MP3_FRAME_PREFIX && (bytes[1] & 0xe0) === 0xe0) {
    return { ok: true, contentType: "audio/mpeg", extension: "mp3" };
  }
  if (kind === "sound" && matches(bytes, WAV_RIFF_SIGNATURE) && matches(bytes, WAV_WAVE_SIGNATURE, 8)) {
    return { ok: true, contentType: "audio/wav", extension: "wav" };
  }
  if (kind === "sound" && matches(bytes, OGG_SIGNATURE)) {
    return { ok: true, contentType: "audio/ogg", extension: "ogg" };
  }
  if (kind === "poster" && matches(bytes, PNG_SIGNATURE)) {
    return { ok: true, contentType: "image/png", extension: "png" };
  }
  return { ok: false };
}

test("accepts MP4 ftyp payloads for video uploads", () => {
  assert.deepEqual(
    verify([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], "video"),
    { ok: true, contentType: "video/mp4", extension: "mp4" },
  );
});

test("accepts WebM EBML payloads for video uploads", () => {
  assert.deepEqual(
    verify([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x88], "video"),
    { ok: true, contentType: "video/webm", extension: "webm" },
  );
});

test("accepts MP3, WAV, and OGG payloads for sound uploads", () => {
  assert.deepEqual(verify([0x49, 0x44, 0x33, 0x04], "sound"), {
    ok: true,
    contentType: "audio/mpeg",
    extension: "mp3",
  });
  assert.deepEqual(verify([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45], "sound"), {
    ok: true,
    contentType: "audio/wav",
    extension: "wav",
  });
  assert.deepEqual(verify([0x4f, 0x67, 0x67, 0x53, 0x00], "sound"), {
    ok: true,
    contentType: "audio/ogg",
    extension: "ogg",
  });
});

test("rejects HTML declared as video or audio", () => {
  const html = new TextEncoder().encode("<!DOCTYPE html><html></html>");
  assert.equal(verify(html, "video").ok, false);
  assert.equal(verify(html, "sound").ok, false);
});

test("rejects WAV payload submitted as poster", () => {
  const wav = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
  assert.equal(verify(wav, "poster").ok, false);
});
```

- [ ] **Step 2: Add the TypeScript media verifier**

Create `Website/src/lib/uploads/tier-animation-media.ts` with this content:

```ts
import "server-only";
import { verifyImageMagicBytes } from "@/lib/uploads/magic-bytes";

export type TierAnimationUploadKind = "video" | "sound" | "poster";

export type VerifiedTierAnimationUpload = {
  ok: true;
  contentType: "video/mp4" | "video/webm" | "audio/mpeg" | "audio/wav" | "audio/ogg" | "image/jpeg" | "image/png" | "image/webp";
  extension: "mp4" | "webm" | "mp3" | "wav" | "ogg" | "jpg" | "png" | "webp";
};

export type RejectedTierAnimationUpload = {
  ok: false;
  error: string;
};

export type TierAnimationUploadResult = VerifiedTierAnimationUpload | RejectedTierAnimationUpload;

export const MP4_FTYP_OFFSET = 4;
export const MP4_FTYP_SIGNATURE = [0x66, 0x74, 0x79, 0x70] as const;
export const WEBM_EBML_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3] as const;
export const MP3_ID3_SIGNATURE = [0x49, 0x44, 0x33] as const;
export const WAV_RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
export const WAV_WAVE_SIGNATURE = [0x57, 0x41, 0x56, 0x45] as const;
export const OGG_SIGNATURE = [0x4f, 0x67, 0x67, 0x53] as const;

function matches(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.byteLength < offset + signature.length) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature[index]) return false;
  }
  return true;
}

function extensionForImage(contentType: "image/jpeg" | "image/png" | "image/webp") {
  if (contentType === "image/png") return "png" as const;
  if (contentType === "image/webp") return "webp" as const;
  return "jpg" as const;
}

export async function verifyTierAnimationUpload(
  file: File,
  kind: TierAnimationUploadKind,
): Promise<TierAnimationUploadResult> {
  if (kind === "poster") {
    const image = await verifyImageMagicBytes(file);
    if (!image.ok) return image;
    return {
      ok: true,
      contentType: image.contentType,
      extension: extensionForImage(image.contentType),
    };
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (header.byteLength < 4) {
    return { ok: false, error: `${kind} file is too small to verify.` };
  }

  if (kind === "video") {
    if (matches(header, MP4_FTYP_SIGNATURE, MP4_FTYP_OFFSET)) {
      return { ok: true, contentType: "video/mp4", extension: "mp4" };
    }
    if (matches(header, WEBM_EBML_SIGNATURE)) {
      return { ok: true, contentType: "video/webm", extension: "webm" };
    }
    return { ok: false, error: "Video content must be MP4 or WebM." };
  }

  if (matches(header, MP3_ID3_SIGNATURE) || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) {
    return { ok: true, contentType: "audio/mpeg", extension: "mp3" };
  }
  if (matches(header, WAV_RIFF_SIGNATURE) && matches(header, WAV_WAVE_SIGNATURE, 8)) {
    return { ok: true, contentType: "audio/wav", extension: "wav" };
  }
  if (matches(header, OGG_SIGNATURE)) {
    return { ok: true, contentType: "audio/ogg", extension: "ogg" };
  }
  return { ok: false, error: "Sound content must be MP3, WAV, or OGG." };
}
```

- [ ] **Step 3: Use the verifier in the route**

In `Website/src/app/api/ynot/admin/tier-animations/route.ts`, remove `ALLOWED_VIDEO_MIME`, `ALLOWED_AUDIO_MIME`, and `pickExtension`. Import:

```ts
import { verifyTierAnimationUpload, type TierAnimationUploadKind } from "@/lib/uploads/tier-animation-media";
```

Replace `uploadAndGetUrl` with:

```ts
async function uploadAndGetUrl(file: File, kind: TierAnimationUploadKind): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error(`${kind} exceeds 20MB limit.`);
  const verified = await verifyTierAnimationUpload(file, kind);
  if (!verified.ok) throw new Error(verified.error);
  const path = `${tier}/${kind}-${Date.now()}.${verified.extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("tier-animations")
    .upload(path, bytes, {
      contentType: verified.contentType,
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);
  const { data: pub } = supabase.storage.from("tier-animations").getPublicUrl(path);
  return pub.publicUrl;
}
```

Update the callers:

```ts
updates.video_url = await uploadAndGetUrl(videoFile, "video");
updates.sound_url = await uploadAndGetUrl(audioFile, "sound");
updates.poster_url = await uploadAndGetUrl(posterFile, "poster");
```

- [ ] **Step 4: Wire upload tests**

In `Website/package.json`, update:

```json
{
  "test:uploads": "node --test scripts/test-magic-bytes.mjs && node --test scripts/test-tier-animation-media.mjs"
}
```

In `Website/tools/verification/verify-hardening.mjs`, add a source check that confirms `tier-animation-media.ts` contains `MP4_FTYP_SIGNATURE`, `WEBM_EBML_SIGNATURE`, `WAV_RIFF_SIGNATURE`, and `verifyTierAnimationUpload`.

- [ ] **Step 5: Run the phase tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:uploads
npm run test:admin-page-remediation
npm run typecheck
```

Expected: upload tests pass and admin remediation media assertions pass.

- [ ] **Step 6: Commit media hardening**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/lib/uploads/tier-animation-media.ts Website/scripts/test-tier-animation-media.mjs Website/src/app/api/ynot/admin/tier-animations/route.ts Website/package.json Website/tools/verification/verify-hardening.mjs
git commit -m "verify reveal media bytes before upload

Constraint: Client MIME and filename extension cannot prove upload content type.
Rejected: Trusting file.type for video and audio | spoofed files can be stored with privileged admin routes.
Confidence: high
Scope-risk: narrow
Tested: npm run test:uploads; npm run test:admin-page-remediation; npm run typecheck
Not-tested: Browser upload of every media format"
```

---

### Task 7: Retire Legacy Lucky Draw Admin Routes

**Files:**
- Create: `Website/src/lib/lucky-draw/legacy-admin-retired.ts`
- Modify: all seven `Website/src/app/api/lucky-draw/admin/**/route.ts` files
- Modify: `Website/tools/verification/verify-auth-foundation.mjs`
- Modify: `Website/tools/verification/verify-hardening.mjs`
- Modify: `Website/tools/verification/verify-lucky-draw-plan.mjs`

- [ ] **Step 1: Add the shared 410 helper**

Create `Website/src/lib/lucky-draw/legacy-admin-retired.ts` with this content:

```ts
export function legacyLuckyDrawAdminGone(): Response {
  return Response.json(
    {
      error: "Legacy Lucky Draw admin API is retired. Use the YNOT admin API.",
      replacement: "/api/ynot/admin",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
```

- [ ] **Step 2: Replace every legacy admin route handler**

For each route file below, remove storage, Supabase, and RPC logic. Keep route method exports that existed in the file, and make every exported method return the helper:

```ts
import { legacyLuckyDrawAdminGone } from "@/lib/lucky-draw/legacy-admin-retired";

export const dynamic = "force-dynamic";

export async function GET() {
  return legacyLuckyDrawAdminGone();
}

export async function POST() {
  return legacyLuckyDrawAdminGone();
}

export async function PATCH() {
  return legacyLuckyDrawAdminGone();
}

export async function DELETE() {
  return legacyLuckyDrawAdminGone();
}
```

Only include method exports that the original file supported:
- `Website/src/app/api/lucky-draw/admin/card-image/route.ts`
- `Website/src/app/api/lucky-draw/admin/draw/lifecycle/route.ts`
- `Website/src/app/api/lucky-draw/admin/draw/route.ts`
- `Website/src/app/api/lucky-draw/admin/order/route.ts`
- `Website/src/app/api/lucky-draw/admin/qr/route.ts`
- `Website/src/app/api/lucky-draw/admin/slip/route.ts`
- `Website/src/app/api/lucky-draw/admin/slip/verify-test/route.ts`

- [ ] **Step 3: Update verification scripts**

In the verification scripts below, replace assertions that expect legacy admin route capability with assertions that each route imports `legacyLuckyDrawAdminGone` and returns 410:
- `Website/tools/verification/verify-auth-foundation.mjs`
- `Website/tools/verification/verify-hardening.mjs`
- `Website/tools/verification/verify-lucky-draw-plan.mjs`

The route list in those verifiers must match the seven files listed in Step 2.

- [ ] **Step 4: Run the phase tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-page-remediation
npm run verify:hardening
node tools/verification/verify-lucky-draw-plan.mjs
```

Expected: legacy route assertions pass. Verifiers no longer expect the retired admin routes to mutate legacy lucky-draw state.

- [ ] **Step 5: Commit legacy retirement**

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/src/lib/lucky-draw/legacy-admin-retired.ts Website/src/app/api/lucky-draw/admin/card-image/route.ts Website/src/app/api/lucky-draw/admin/draw/lifecycle/route.ts Website/src/app/api/lucky-draw/admin/draw/route.ts Website/src/app/api/lucky-draw/admin/order/route.ts Website/src/app/api/lucky-draw/admin/qr/route.ts Website/src/app/api/lucky-draw/admin/slip/route.ts Website/src/app/api/lucky-draw/admin/slip/verify-test/route.ts Website/tools/verification/verify-auth-foundation.mjs Website/tools/verification/verify-hardening.mjs Website/tools/verification/verify-lucky-draw-plan.mjs
git commit -m "retire legacy lucky draw admin API

Constraint: Legacy admin routes must not bypass current YNOT payment and campaign safeguards.
Rejected: Maintaining two admin mutation stacks | the legacy stack cannot share every new authority and audit rule without duplicating risk.
Confidence: high
Scope-risk: moderate
Tested: npm run test:admin-page-remediation; npm run verify:hardening; node tools/verification/verify-lucky-draw-plan.mjs
Not-tested: External clients still calling legacy admin endpoints"
```

---

### Task 8: Final Verification Sweep

**Files:**
- Review all modified files from Tasks 1 through 7.

- [ ] **Step 1: Run targeted regression tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-page-remediation
npm run test:uploads
npm run test:auth-session-hardening
npm run test:top-up-flow
npm run test:shipping-flow
npm run test:stock-readiness
```

Expected: all commands pass. If `test:top-up-flow` expects a live app server, start one in a second terminal:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run dev -- --port 3022
```

Then rerun:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:top-up-flow
```

- [ ] **Step 2: Run project-level checks**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run lint
npm run typecheck
npm run verify:platform
npm run verify:hardening
```

Expected: all commands pass.

- [ ] **Step 3: Run database checks against local or staging**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Database/supabase
supabase db reset
```

Then run the live RPC rollback test with the local or staging env configured:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-campaign-rpc-live
```

Expected: migration applies on local/staging. The live RPC rollback test passes when the target database has an active owner admin and editable draft campaign; otherwise it skips with the explicit missing-fixture message.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git status --short
git diff --stat
git diff -- Database/supabase/migrations/20260603160000_admin_page_roles.sql
git diff -- Database/supabase/migrations/20260603161000_campaign_draft_atomic_rpc.sql
git diff -- Website/src/app/api/ynot/admin/campaigns/route.ts
git diff -- Website/src/features/ynot/client.tsx
```

Expected: only planned files are changed. The role migration includes finance role. The RPC migration includes `update_campaign_draft_atomic`. Campaign PATCH uses `update_campaign_draft_atomic`. The client hydrates owner review snapshots and slot-grid values.

- [ ] **Step 5: Commit final verification notes if scripts changed during fixes**

If Step 1 through Step 4 required changes after previous commits, commit the final verification adjustment:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git add Website/package.json Website/scripts Website/tools/verification Website/src Database/supabase/migrations/20260603160000_admin_page_roles.sql Database/supabase/migrations/20260603161000_campaign_draft_atomic_rpc.sql
git commit -m "verify full admin remediation

Constraint: Full admin-page remediation branch must prove money, campaign, snapshot, slot-grid, dev-auth, media, and legacy-route findings together.
Confidence: high
Scope-risk: broad
Tested: npm run lint; npm run typecheck; npm run test:admin-page-remediation; npm run test:uploads; npm run test:auth-session-hardening; npm run test:top-up-flow; npm run test:shipping-flow; npm run test:stock-readiness; npm run verify:platform; npm run verify:hardening; supabase db reset; npm run test:admin-campaign-rpc-live
Not-tested: Production Supabase migration apply pending backup/PITR gate"
```

---

## Self-Review

**Spec coverage:** All seven requested phases are represented:
- Money/Admin Authority: Task 2.
- Campaign Edit Safety: Task 4.
- Owner Review State: Task 5.
- Slot-Pick Grid Preservation: Task 5.
- Dev Auth Boundary: Task 3.
- Media Upload Hardening: Task 6.
- Legacy Lucky Draw Admin Retirement: Task 7.

**Risk ordering:** Money and preview mutation boundaries come before data-changing campaign RPC work. The database migration is kept local/staging until the project backup/PITR gate is satisfied.

**Verification coverage:** The plan adds one all-phase static contract test, one media byte verifier test, one optional live RPC rollback test, and retains the user-requested lint, typecheck, auth, top-up, shipping, and stock readiness checks.

**Type consistency:** The plan uses `YnotAdminRole`, `YnotLogicSnapshot`, `YnotSlotGrid`, `canManagePaymentDestinations`, `requirePaymentDestinationManager`, `canUsePreviewAdminMutationBypass`, `paymentMethodAuditSnapshot`, `paymentMethodAuditMetadata`, `verifyTierAnimationUpload`, and `legacyLuckyDrawAdminGone` consistently across tasks.
