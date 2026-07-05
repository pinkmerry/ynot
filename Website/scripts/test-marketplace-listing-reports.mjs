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
    "Database/marketplace-supabase/migrations/20260704121000_marketplace_listing_reports.sql",
  ),
  "utf8",
).toLowerCase();

test("listing reports table carries the required columns and checks", () => {
  assert.match(migration, /create table if not exists public\.marketplace_listing_reports/);
  assert.match(migration, /listing_id uuid not null references public\.marketplace_listing_snapshots\(listing_id\) on delete cascade/);
  assert.match(migration, /reporter_account_id uuid not null references public\.marketplace_accounts\(id\) on delete cascade/);
  assert.match(migration, /reason_code text not null/);
  assert.match(
    migration,
    /check \(reason_code in \('fake_or_cert_mismatch', 'stolen_photos', 'wrong_item', 'pricing_abuse', 'other'\)\)/,
  );
  assert.match(migration, /reason_note text/);
  assert.match(migration, /report_state text not null default 'open'/);
  assert.match(migration, /check \(report_state in \('open', 'dismissed', 'unlisted'\)\)/);
  assert.match(migration, /resolved_by_ynot_profile_id uuid/);
  assert.match(migration, /resolution_note text/);
});

test("listing reports table has RLS, grants, and the touch-updated-at trigger", () => {
  assert.match(
    migration,
    /alter table public\.marketplace_listing_reports enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on public\.marketplace_listing_reports from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select, insert, update on public\.marketplace_listing_reports to service_role/,
  );
  assert.match(
    migration,
    /drop trigger if exists marketplace_listing_reports_touch_updated_at on public\.marketplace_listing_reports/,
  );
  assert.match(
    migration,
    /create trigger marketplace_listing_reports_touch_updated_at[\s\S]*?execute function public\.marketplace_touch_updated_at\(\)/,
  );
});

test("listing reports rpcs exist with revoke/grant discipline", () => {
  assert.match(
    migration,
    /create or replace function public\.marketplace_report_listing/,
  );
  assert.match(
    migration,
    /create or replace function public\.marketplace_admin_list_listing_reports/,
  );
  assert.match(
    migration,
    /create or replace function public\.marketplace_admin_resolve_listing_report/,
  );

  const reportListingRevokeGrant =
    /revoke all on function public\.marketplace_report_listing\([^)]*\)\s*from public, anon, authenticated;[\s\S]*?grant execute on function public\.marketplace_report_listing\([^)]*\)\s*to service_role/;
  const adminListRevokeGrant =
    /revoke all on function public\.marketplace_admin_list_listing_reports\(text, integer\)\s*from public, anon, authenticated;[\s\S]*?grant execute on function public\.marketplace_admin_list_listing_reports\(text, integer\)\s*to service_role/;
  const adminResolveRevokeGrant =
    /revoke all on function public\.marketplace_admin_resolve_listing_report\([^)]*\)\s*from public, anon, authenticated;[\s\S]*?grant execute on function public\.marketplace_admin_resolve_listing_report\([^)]*\)\s*to service_role/;

  assert.match(migration, reportListingRevokeGrant);
  assert.match(migration, adminListRevokeGrant);
  assert.match(migration, adminResolveRevokeGrant);
});

test("report rpc guards the lost-race path against all-null returns", () => {
  assert.match(
    migration,
    /and report_state = 'open';\s*if v_report\.id is null then\s*raise exception 'marketplace_report_not_open';/,
  );
});

test("admin reports list rpc is bounded", () => {
  assert.match(migration, /p_limit integer default 100/);
  assert.match(migration, /limit greatest\(p_limit, 1\)/);
});

test("listing reports migration is idempotent", () => {
  assert.match(migration, /create table if not exists public\.marketplace_listing_reports/);
  assert.match(migration, /create index if not exists/);
  assert.match(migration, /create unique index if not exists/);
  assert.match(migration, /drop trigger if exists/);
  assert.match(migration, /create or replace function/);
});

test("listing reports lib exists and references all three rpcs", () => {
  const lib = readFileSync(
    path.join(appRoot, "src/lib/marketplace/listing-reports.ts"),
    "utf8",
  );
  assert.match(lib, /marketplace_report_listing/);
  assert.match(lib, /marketplace_admin_list_listing_reports/);
  assert.match(lib, /marketplace_admin_resolve_listing_report/);
  assert.match(lib, /export async function reportMarketplaceListing/);
  assert.match(lib, /export async function listMarketplaceListingReports/);
  assert.match(lib, /export async function resolveMarketplaceListingReport/);
  assert.match(lib, /p_limit/);
  assert.match(lib, /assertUuid/);
});
