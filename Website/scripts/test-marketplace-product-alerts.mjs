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
    "Database/marketplace-supabase/migrations/20260704122000_marketplace_product_alerts.sql",
  ),
  "utf8",
).toLowerCase();

test("migration states notification delivery is out of scope", () => {
  assert.match(migration, /delivery/);
  assert.match(migration, /no notification channel/);
});

test("product alerts table carries the required columns and checks", () => {
  assert.match(migration, /create table if not exists public\.marketplace_product_alerts/);
  assert.match(migration, /product_id uuid not null references public\.marketplace_products\(id\)/);
  assert.match(migration, /account_id uuid not null references public\.marketplace_accounts\(id\)/);
  assert.match(migration, /alert_state text not null default 'active'/);
  assert.match(migration, /check \(alert_state in \('active', 'cancelled', 'notified'\)\)/);
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.match(migration, /updated_at timestamptz not null default now\(\)/);
});

test("product alerts table has a partial unique index, RLS, grants, and the trigger", () => {
  assert.match(
    migration,
    /create unique index if not exists[\s\S]*?on public\.marketplace_product_alerts\(product_id, account_id\)[\s\S]*?where alert_state = 'active'/,
  );
  assert.match(
    migration,
    /alter table public\.marketplace_product_alerts enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on public\.marketplace_product_alerts from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select, insert, update on public\.marketplace_product_alerts to service_role/,
  );
  assert.match(
    migration,
    /drop trigger if exists marketplace_product_alerts_touch_updated_at on public\.marketplace_product_alerts/,
  );
  assert.match(
    migration,
    /create trigger marketplace_product_alerts_touch_updated_at[\s\S]*?execute function public\.marketplace_touch_updated_at\(\)/,
  );
});

test("product alerts rpcs exist with revoke/grant discipline", () => {
  assert.match(
    migration,
    /create or replace function public\.marketplace_subscribe_product_alert/,
  );
  assert.match(
    migration,
    /create or replace function public\.marketplace_cancel_product_alert/,
  );
  assert.match(
    migration,
    /create or replace function public\.marketplace_list_product_alerts/,
  );

  const subscribeRevokeGrant =
    /revoke all on function public\.marketplace_subscribe_product_alert\([^)]*\)\s*from public, anon, authenticated;[\s\S]*?grant execute on function public\.marketplace_subscribe_product_alert\([^)]*\)\s*to service_role/;
  const cancelRevokeGrant =
    /revoke all on function public\.marketplace_cancel_product_alert\([^)]*\)\s*from public, anon, authenticated;[\s\S]*?grant execute on function public\.marketplace_cancel_product_alert\([^)]*\)\s*to service_role/;
  const listRevokeGrant =
    /revoke all on function public\.marketplace_list_product_alerts\([^)]*\)\s*from public, anon, authenticated;[\s\S]*?grant execute on function public\.marketplace_list_product_alerts\([^)]*\)\s*to service_role/;

  assert.match(migration, subscribeRevokeGrant);
  assert.match(migration, cancelRevokeGrant);
  assert.match(migration, listRevokeGrant);
});

test("subscribe rpc verifies the product exists before inserting", () => {
  assert.match(migration, /marketplace_alert_product_missing/);
});

test("cancel rpc raises when nothing was active to cancel", () => {
  assert.match(migration, /marketplace_alert_not_active/);
});

test("product alerts migration is idempotent", () => {
  assert.match(migration, /create table if not exists public\.marketplace_product_alerts/);
  assert.match(migration, /create index if not exists|create unique index if not exists/);
  assert.match(migration, /drop trigger if exists/);
  assert.match(migration, /create or replace function/);
});

test("product alerts lib exists and references all three rpcs", () => {
  const lib = readFileSync(
    path.join(appRoot, "src/lib/marketplace/product-alerts.ts"),
    "utf8",
  );
  assert.match(lib, /marketplace_subscribe_product_alert/);
  assert.match(lib, /marketplace_cancel_product_alert/);
  assert.match(lib, /marketplace_list_product_alerts/);
  assert.match(lib, /export async function subscribeProductAlert/);
  assert.match(lib, /export async function cancelProductAlert/);
  assert.match(lib, /export async function listProductAlerts/);
});
