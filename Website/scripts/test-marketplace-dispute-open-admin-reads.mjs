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
    "Database/marketplace-supabase/migrations/20260704123000_marketplace_dispute_open_and_admin_reads.sql",
  ),
  "utf8",
).toLowerCase();

test("refund_requests gains buyer-open columns", () => {
  assert.match(migration, /alter table public\.marketplace_refund_requests/);
  assert.match(migration, /add column if not exists opened_by text not null default 'admin'/);
  assert.match(migration, /check \(opened_by in \('buyer', 'admin'\)\)/);
  assert.match(migration, /add column if not exists buyer_marketplace_account_id uuid/);
  assert.match(migration, /add column if not exists buyer_reason text/);
  assert.match(migration, /check \(buyer_reason is null or char_length\(buyer_reason\) between 10 and 1000\)/);
});

test("admin_note and actor_admin_role become nullable", () => {
  assert.match(migration, /alter column admin_note drop not null/);
  assert.match(migration, /alter column actor_admin_role drop not null/);
});

test("one open dispute/refund per order partial unique index", () => {
  assert.match(
    migration,
    /create unique index if not exists marketplace_refund_requests_one_open_per_order_idx/,
  );
  assert.match(migration, /on public\.marketplace_refund_requests\(order_id\)/);
  assert.match(migration, /where refund_state = 'requested'/);
});

test("all three functions are created", () => {
  assert.match(migration, /create or replace function public\.marketplace_open_buyer_refund_request/);
  assert.match(migration, /create or replace function public\.marketplace_admin_list_orders/);
  assert.match(migration, /create or replace function public\.marketplace_admin_daily_gmv/);
});

test("dispute rpc reads the active policy window and raises the expected errors", () => {
  assert.match(migration, /dispute_window_days/);
  assert.match(migration, /marketplace_dispute_window_closed/);
  assert.match(migration, /marketplace_dispute_reason_invalid/);
});

test("admin read rpcs are bounded", () => {
  assert.match(migration, /marketplace_admin_list_orders\s*\(\s*p_state text default null,\s*p_limit integer default 100/);
  assert.match(migration, /greatest\(p_limit/);
  assert.match(migration, /marketplace_admin_daily_gmv\s*\(\s*p_days integer default 30/);
  assert.match(migration, /greatest\(p_days/);
});

test("disputes lib calls the buyer-open rpc and guards uuids", () => {
  const disputes = readFileSync(path.join(appRoot, "src/lib/marketplace/disputes.ts"), "utf8");
  assert.match(disputes, /marketplace_open_buyer_refund_request/);
  assert.match(disputes, /assertUuid/);
});

test("admin-orders lib calls both admin read rpcs", () => {
  const adminOrders = readFileSync(path.join(appRoot, "src/lib/marketplace/admin-orders.ts"), "utf8");
  assert.match(adminOrders, /marketplace_admin_list_orders/);
  assert.match(adminOrders, /marketplace_admin_daily_gmv/);
});
