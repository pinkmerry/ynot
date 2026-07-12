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

test("marketplace_open_buyer_refund_request binds idempotency via the customer idempotency_keys ledger", () => {
  assert.match(
    migration,
    /create or replace function public\.marketplace_open_buyer_refund_request\(\s*p_order_id uuid,\s*p_account_id uuid,\s*p_buyer_ynot_profile_id uuid,\s*p_request_id text,\s*p_idempotency_key text,\s*p_request_hash text,\s*p_reason text\s*\)/,
  );
  assert.match(
    migration,
    /insert into public\.marketplace_idempotency_keys\([\s\S]*?'dispute\.open',[\s\S]*?on conflict \(ynot_profile_id, scope, idempotency_key\) do nothing/,
  );
  assert.match(
    migration,
    /if idempotency_row\.request_hash <> normalized_request_hash then\s*raise exception 'marketplace_idempotency_conflict';/,
  );
  assert.match(
    migration,
    /if idempotency_row\.response_payload is not null then\s*return idempotency_row\.response_payload;/,
  );
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

test("dispute route exists at the ynot path with a POST handler", () => {
  const routeSrc = readFileSync(
    path.join(appRoot, "src/app/api/ynot/marketplace/orders/[orderId]/dispute/route.ts"),
    "utf8",
  );
  assert.match(routeSrc, /export async function POST/);
  assert.match(routeSrc, /Promise<\{\s*orderId:\s*string\s*\}>/);
});

test("dispute POST goes through prepareMarketplaceMutation with the expected allowedFields", () => {
  const routeSrc = readFileSync(
    path.join(appRoot, "src/app/api/ynot/marketplace/orders/[orderId]/dispute/route.ts"),
    "utf8",
  );
  assert.match(routeSrc, /prepareMarketplaceMutation/);
  assert.match(routeSrc, /method:\s*"POST"/);
  assert.match(routeSrc, /accessMode:\s*"customer"/);
  assert.match(routeSrc, /allowedFields:\s*\[\s*"reason"\s*\]/);
  assert.match(routeSrc, /ynot:marketplace:orders:dispute/);
  assert.match(routeSrc, /openBuyerRefundRequest/);
});

test("dispute route validates reason length before calling the lib", () => {
  const routeSrc = readFileSync(
    path.join(appRoot, "src/app/api/ynot/marketplace/orders/[orderId]/dispute/route.ts"),
    "utf8",
  );
  assert.match(routeSrc, /marketplace_dispute_reason_invalid/);
  assert.match(routeSrc, /reason\.length\s*<\s*(MIN_REASON_LENGTH|10)/);
  assert.match(routeSrc, /reason\.length\s*>\s*(MAX_REASON_LENGTH|1000)/);
});

test("dispute route derives orderId from the path param, not the body", () => {
  const routeSrc = readFileSync(
    path.join(appRoot, "src/app/api/ynot/marketplace/orders/[orderId]/dispute/route.ts"),
    "utf8",
  );
  assert.match(routeSrc, /const\s*\{\s*orderId\s*\}\s*=\s*await params/);
  assert.doesNotMatch(routeSrc, /orderId:\s*body\./);
});

test("dispute route derives accountId and buyerYnotProfileId from the session, never the request body", () => {
  const routeSrc = readFileSync(
    path.join(appRoot, "src/app/api/ynot/marketplace/orders/[orderId]/dispute/route.ts"),
    "utf8",
  );
  assert.match(routeSrc, /accountId:\s*account\.accountId/);
  assert.match(routeSrc, /buyerYnotProfileId:\s*profile\.profileId/);
  assert.doesNotMatch(routeSrc, /accountId:\s*body\./);
});

test("dispute route binds the order id into the idempotency hash before calling the lib", () => {
  const routeSrc = readFileSync(
    path.join(appRoot, "src/app/api/ynot/marketplace/orders/[orderId]/dispute/route.ts"),
    "utf8",
  );
  assert.match(
    routeSrc,
    /requestHash:\s*await mutation\.requestHashForTarget\(\s*"dispute\.open",\s*orderId,\s*\)/,
  );
});

test("dispute route response never exposes amounts, seller identity, bank, or payout fields", () => {
  const routeSrc = readFileSync(
    path.join(appRoot, "src/app/api/ynot/marketplace/orders/[orderId]/dispute/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    routeSrc,
    /bank|payout_amount|seller_payout|seller_account_id|refund_amount|buyer_total_satang/i,
  );
});

test("dispute route re-export mirrors the ynot handler", () => {
  const reexport = readFileSync(
    path.join(appRoot, "src/app/api/marketplace/orders/[orderId]/dispute/route.ts"),
    "utf8",
  );
  assert.match(
    reexport,
    /@\/app\/api\/ynot\/marketplace\/orders\/\[orderId\]\/dispute\/route/,
  );
  assert.match(reexport, /POST/);
});
