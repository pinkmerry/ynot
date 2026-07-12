import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migration = readFileSync(
  path.join(
    repoRoot,
    "Database/marketplace-supabase/migrations/20260704120000_marketplace_money_policy_trust_controls.sql",
  ),
  "utf8",
).toLowerCase();

const expectedStateMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260712110000_marketplace_money_policy_expected_state.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readExpectedStateMigration() {
  return readFileSync(expectedStateMigrationPath, "utf8");
}

function compactSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function requirePattern(source, pattern, label) {
  assert.match(source, pattern, label);
}

test("policy table gains the four trust-control columns", () => {
  assert.match(migration, /add column if not exists payout_hold_days integer not null default 10/);
  assert.match(migration, /check \(payout_hold_days between 0 and 30\)/);
  assert.match(migration, /add column if not exists dispute_window_days integer not null default 3/);
  assert.match(migration, /check \(dispute_window_days between 0 and 14\)/);
  assert.match(migration, /add column if not exists listing_auto_live boolean not null default true/);
  assert.match(migration, /add column if not exists slip_auto_verify boolean not null default true/);
});

test("policy json + admin set rpc expose the new fields", () => {
  assert.match(migration, /create or replace function public\.marketplace_money_policy_json/);
  assert.match(migration, /create or replace function public\.marketplace_admin_set_money_policy/);
  assert.match(migration, /p_payout_hold_days/);
  assert.match(migration, /p_dispute_window_days/);
  assert.match(migration, /p_listing_auto_live/);
  assert.match(migration, /p_slip_auto_verify/);
});

test("admin set rpc pins the trust-control param signature", () => {
  // Pin the ordered param list so dropping/reordering a param fails this test.
  assert.match(migration, /p_payout_hold_days\s+integer\s+default\s+null/);
  assert.match(migration, /p_dispute_window_days\s+integer\s+default\s+null/);
  assert.match(migration, /p_listing_auto_live\s+boolean\s+default\s+null/);
  assert.match(migration, /p_slip_auto_verify\s+boolean\s+default\s+null/);

  const payoutHoldIndex = migration.search(/p_payout_hold_days\s+integer\s+default\s+null/);
  const disputeWindowIndex = migration.search(/p_dispute_window_days\s+integer\s+default\s+null/);
  const listingAutoLiveIndex = migration.search(/p_listing_auto_live\s+boolean\s+default\s+null/);
  const slipAutoVerifyIndex = migration.search(/p_slip_auto_verify\s+boolean\s+default\s+null/);

  assert.ok(payoutHoldIndex < disputeWindowIndex, "p_payout_hold_days must precede p_dispute_window_days");
  assert.ok(disputeWindowIndex < listingAutoLiveIndex, "p_dispute_window_days must precede p_listing_auto_live");
  assert.ok(listingAutoLiveIndex < slipAutoVerifyIndex, "p_listing_auto_live must precede p_slip_auto_verify");

  // Pin the grant tail: the last two positional args before the closing paren
  // must be the two new boolean trust-control params, so dropping one fails.
  assert.match(migration, /boolean,\s*boolean\s*\)\s*to service_role/);
});

test("route and lib carry the new fields", () => {
  const money = readFileSync(path.join(appRoot, "src/lib/marketplace/money.ts"), "utf8");
  assert.match(money, /payoutHoldDays/);
  assert.match(money, /disputeWindowDays/);
  assert.match(money, /listingAutoLive/);
  assert.match(money, /slipAutoVerify/);
  const route = readFileSync(
    path.join(appRoot, "src/app/api/ynot/marketplace/admin/money-policy/route.ts"),
    "utf8",
  );
  assert.match(route, /"payoutHoldDays"/);
});

// ---------------------------------------------------------------------------
// Money policy optimistic-concurrency guard (review finding on d678a267).
// marketplace_admin_set_money_policy never conditioned its write on which
// policy row was currently active, so a stale admin tab (FeesSettingsForm
// or MarketplaceMoneyPolicyControls) could silently clobber another
// admin's just-saved fee change. 20260712110000_marketplace_money_policy_
// expected_state.sql adds a p_expected_policy_id uuid default null
// parameter and a precondition that raises marketplace_money_policy_stale
// when the active policy has moved on.
// ---------------------------------------------------------------------------

test("money policy expected-state migration drops the old 13-param signature before re-creating it", () => {
  assert.ok(existsSync(expectedStateMigrationPath), "missing money policy expected-state migration");
  const sql = compactSql(readExpectedStateMigration());

  requirePattern(
    sql,
    /drop function if exists public\.marketplace_admin_set_money_policy\( text, text, text, uuid, text, integer, integer, integer, text, integer, integer, boolean, boolean \);/,
    "must drop the exact old 13-parameter signature (required so PostgREST named-param dispatch cannot see two overloads)",
  );
  requirePattern(
    sql,
    /create or replace function public\.marketplace_admin_set_money_policy\(/,
    "must re-create marketplace_admin_set_money_policy",
  );
});

test("money policy expected-state migration appends p_expected_policy_id as a trailing defaulted param", () => {
  const sql = compactSql(readExpectedStateMigration());
  requirePattern(
    sql,
    /p_slip_auto_verify boolean default null, p_expected_policy_id uuid default null/,
    "p_expected_policy_id uuid default null must be appended after p_slip_auto_verify, defaulted so existing callers are unaffected",
  );
});

test("money policy expected-state migration's precondition sits immediately after the current-policy lookup, before the coalesce() fallbacks", () => {
  const sql = compactSql(readExpectedStateMigration());
  requirePattern(
    sql,
    /order by effective_from desc limit 1; if p_expected_policy_id is not null and current_policy\.id is distinct from p_expected_policy_id then raise exception 'marketplace_money_policy_stale'; end if; resolved_payout_hold_days := coalesce\(p_payout_hold_days/,
    "the staleness precondition must be adjacent to (immediately after) the current_policy select and before any resolved_* coalesce() fallback reads one of its columns",
  );
});

test("money policy expected-state migration re-issues the service-role-only grants on the new 14-param signature", () => {
  const sql = compactSql(readExpectedStateMigration());
  requirePattern(
    sql,
    /revoke all on function public\.marketplace_admin_set_money_policy\( text, text, text, uuid, text, integer, integer, integer, text, integer, integer, boolean, boolean, uuid \) from public, anon, authenticated;/,
    "dropping the function drops its grants -- must re-revoke browser roles on the new signature",
  );
  requirePattern(
    sql,
    /grant execute on function public\.marketplace_admin_set_money_policy\( text, text, text, uuid, text, integer, integer, integer, text, integer, integer, boolean, boolean, uuid \) to service_role;/,
    "must re-grant execute to service_role only on the new signature",
  );
});

test("updateMarketplaceMoneyPolicy wrapper validates expectedPolicyId as a real uuid and forwards it as p_expected_policy_id", () => {
  const source = readApp("src/lib/marketplace/money.ts");
  assert.match(
    source,
    /function optionalPolicyUuid\(value: unknown, label: string\) \{/,
    "money.ts must validate expectedPolicyId with a real uuid check, not pass it through unchecked",
  );
  assert.match(
    source,
    /!UUID_RE\.test\(value\)/,
    "optionalPolicyUuid must reject non-uuid strings",
  );
  assert.match(
    source,
    /p_expected_policy_id:\s*optionalPolicyUuid\(\s*input\.body\.expectedPolicyId,\s*"expected_policy_id",\s*\)/,
    "wrapper must forward expectedPolicyId to the RPC as p_expected_policy_id",
  );
});

test("supabase-adapter maps marketplace_money_policy_stale to 409 with a refresh-and-review message", () => {
  const source = readApp("src/lib/marketplace/supabase-adapter.ts");
  assert.match(
    source,
    /marketplace_money_policy_stale:\s*\{\s*message:\s*"[^"]+",\s*status:\s*409,\s*\}/,
    "marketplace_money_policy_stale must be a safe RPC error mapped to 409",
  );
});

test("both money-policy UI writers send expectedPolicyId sourced from the policy they loaded, not a hardcoded literal", () => {
  // FeesSettingsForm.tsx (the fuller settings screen) and the overview
  // page's MarketplaceMoneyPolicyControls.tsx are the two independent
  // callers of this RPC (see FeesSettingsForm.tsx's file doc comment).
  // Both must source expectedPolicyId from the policy prop they actually
  // rendered, not a hardcoded literal, or a stale tab would silently
  // defeat the guard.
  const feesSettingsForm = readApp("src/features/marketplace-ui/admin/FeesSettingsForm.tsx");
  assert.match(
    feesSettingsForm,
    /expectedPolicyId:\s*policy\.policyId/,
    "FeesSettingsForm.tsx must send expectedPolicyId: policy.policyId",
  );

  const moneyPolicyControls = readApp("src/features/ynot/MarketplaceMoneyPolicyControls.tsx");
  assert.match(
    moneyPolicyControls,
    /expectedPolicyId:\s*policy\.policyId/,
    "MarketplaceMoneyPolicyControls.tsx must send expectedPolicyId: policy.policyId",
  );
});
