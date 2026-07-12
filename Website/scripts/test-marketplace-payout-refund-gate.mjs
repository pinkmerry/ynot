import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migration = readFileSync(
  path.join(
    repoRoot,
    "Database/marketplace-supabase/migrations/20260704124000_marketplace_payout_refund_gate.sql",
  ),
  "utf8",
).toLowerCase();

function releaseFunctionBody(sql) {
  const start = sql.indexOf("create or replace function public.marketplace_release_seller_payout");
  assert.notEqual(start, -1, "migration must define marketplace_release_seller_payout");
  const next = sql.indexOf("create or replace function public.", start + 1);
  return next === -1 ? sql.slice(start) : sql.slice(start, next);
}

test("migration re-creates marketplace_release_seller_payout exactly once", () => {
  const matches = migration.match(
    /create or replace function public\.marketplace_release_seller_payout/g,
  );
  assert.equal(matches?.length, 1, "expected exactly one live signature to be overridden");
});

test("release gate allows a rejected dispute but still blocks open/approved/refunded", () => {
  const body = releaseFunctionBody(migration);
  assert.match(body, /order_row\.refund_state not in \('none', 'rejected'\)/);
  assert.doesNotMatch(
    body,
    /order_row\.refund_state <> 'none'/,
    "the stale bare gate must not survive in the release body",
  );
});

test("release gate preserves the rest of the eligibility check untouched", () => {
  const body = releaseFunctionBody(migration);
  assert.match(body, /payout_row\.payout_state not in \('held', 'eligible'\)/);
  assert.match(body, /order_row\.payment_state <> 'paid'/);
  assert.match(body, /order_row\.fulfilment_state not in \('shipped', 'completed'\)/);
  assert.match(body, /or has_open_reconciliation then/);
  assert.match(body, /raise exception 'marketplace_payout_not_eligible'/);
});

test("release body preserves idempotency, cascades, audit insert, and return payload", () => {
  const body = releaseFunctionBody(migration);
  assert.match(body, /marketplace_idempotency_key_required/);
  assert.match(body, /marketplace_idempotency_conflict/);
  assert.match(body, /for update/);
  assert.match(body, /set payout_state = 'released'/);
  assert.match(body, /set seller_payout_state = 'released'/);
  assert.match(body, /marketplace_seller_payout_released/);
  assert.match(body, /insert into public\.marketplace_audit_events/);
  assert.match(body, /return rpc_response_payload/);
});

test("re-emits revoke/grant for the exact live signature", () => {
  assert.match(
    migration,
    /revoke all on function public\.marketplace_release_seller_payout\(uuid, text, text, text, uuid, text, text\)\s*\n\s*from public, anon, authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.marketplace_release_seller_payout\(uuid, text, text, text, uuid, text, text\)\s*\n\s*to service_role;/,
  );
});

test("header comment explains the rejected-dispute payout strand and cites the fulfilment precedent", () => {
  assert.match(migration, /rejected/);
  assert.match(migration, /refund_state in \('none', 'rejected'\)/);
});
