#!/usr/bin/env node
import {
  check,
  finish,
  includes,
  marketplaceMigrationFiles,
  marketplaceSql,
  matches,
  notMatches,
  readRepo,
} from "./marketplace-verification-helpers.mjs";

const sql = marketplaceSql();
const compactSql = sql.replace(/\s+/g, " ").toLowerCase();
const snkrdunkParityMigration = readRepo(
  "Database/marketplace-supabase/migrations/20260630120000_marketplace_snkrdunk_parity.sql",
).replace(/\s+/g, " ").toLowerCase();

function statementPattern(start, objectName, end) {
  return new RegExp(`${start}[^;]*${objectName}[^;]*${end};`);
}

const tables = Array.from(
  compactSql.matchAll(/create table if not exists public\.(marketplace_[a-z0-9_]+)/g),
  (match) => match[1],
);
check("marketplace migrations define service-owned tables", tables.length >= 18);

for (const table of tables) {
  includes(compactSql, `alter table public.${table} enable row level security`, `${table} enables RLS`);
}

for (const sensitiveTable of [
  "marketplace_accounts",
  "marketplace_idempotency_keys",
  "marketplace_audit_events",
  "marketplace_inventory_sources",
  "marketplace_inventory_items",
  "marketplace_listing_snapshots",
  "marketplace_pending_payment_orders",
  "marketplace_orders",
  "marketplace_payment_proofs",
  "marketplace_refund_requests",
  "marketplace_reconciliation_items",
  "marketplace_seller_submissions",
  "marketplace_seller_payouts",
  "marketplace_provider_payment_events",
  "marketplace_admin_commands",
  "marketplace_public_seller_profiles",
  "marketplace_cart_items",
  "marketplace_watchlist_items",
]) {
  matches(
    compactSql,
    statementPattern("revoke all on", `public\\.${sensitiveTable}\\b`, "from public, anon, authenticated"),
    `${sensitiveTable} revokes browser-role table access`,
  );
  matches(
    compactSql,
    statementPattern("grant all on", `public\\.${sensitiveTable}\\b`, "to service_role"),
    `${sensitiveTable} grants table access to service_role only`,
  );
}

matches(
  compactSql,
  /revoke all on[^;]*public\.marketplace_public_listing_snapshots[^;]*from public, anon, authenticated;/,
  "public listing snapshots revoke browser-role direct view access",
);
matches(
  compactSql,
  /grant select on[^;]*public\.marketplace_public_listing_snapshots[^;]*to service_role;/,
  "public listing snapshots grant service_role verification access",
);
matches(
  snkrdunkParityMigration,
  /create(?: or replace)? view public\.marketplace_public_listing_snapshots with \(security_invoker = true\)[\s\S]*revoke all on public\.marketplace_public_listing_snapshots[\s\S]*from public, anon, authenticated[\s\S]*grant select on public\.marketplace_public_listing_snapshots to service_role/,
  "SNKRDUNK parity recreated public listing snapshot view keeps security_invoker and service-only grants",
);
matches(compactSql, /revoke all on function public\.marketplace_[^(]+\([^;]+from public, anon, authenticated/g, "marketplace RPC execute is revoked from browser roles");
matches(compactSql, /grant execute on function public\.marketplace_[^(]+\([^;]+to service_role/g, "marketplace RPC execute is granted to service_role");
notMatches(compactSql, /grant (select|insert|update|delete|all) on[^;]+marketplace_[^;]+to (anon|authenticated)/, "marketplace tables are not granted to anon/authenticated");

for (const { name, text } of marketplaceMigrationFiles()) {
  if (text.includes("security definer")) {
    matches(text, /security definer\s+set search_path = public, pg_temp/gi, `${name} pins search_path on security definer functions`);
  }
}

finish("marketplace RLS");
