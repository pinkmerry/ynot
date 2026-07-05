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
    "Database/marketplace-supabase/migrations/20260704120000_marketplace_money_policy_trust_controls.sql",
  ),
  "utf8",
).toLowerCase();

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
