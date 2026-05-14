#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const checks = [];
function pass(label) { checks.push({ label, status: "pass" }); }
function fail(label, detail) { checks.push({ label, status: "fail", detail }); }
async function read(path) { return readFile(path, "utf8"); }
async function includes(path, needles) {
  const content = await read(path);
  for (const needle of needles) {
    if (!content.includes(needle)) fail(`${path} contains ${needle}`, "Missing required marker.");
    else pass(`${path} contains ${needle}`);
  }
  return content;
}

const migrationPath = "../Database/supabase/migrations/20260509100000_admin_test_categories_inventory.sql";
if (!existsSync(migrationPath)) fail("admin readiness migration exists", "Migration file is missing.");
else await includes(migrationPath, [
  "create table if not exists public.store_categories",
  "create table if not exists public.draw_round_categories",
  "create table if not exists public.draw_round_testers",
  "create table if not exists public.draw_round_prize_units",
  "create table if not exists public.seed_runs",
  "add column if not exists is_test boolean not null default false",
  "Public can read active non-test categories",
  "coalesce(is_test, false) = false",
  "profile_can_open_test_draw_round",
  "get_draw_round_inventory_summary",
  "ensure_draw_round_prize_units",
  "for update skip locked",
  "not_enough_prize_inventory",
  "revoke all on table public.draw_round_prize_units from public, anon, authenticated",
]);

await includes("src/app/api/ynot/admin/categories/route.ts", ["store_categories", "resolveAdminSession", "enforceRateLimit"]);
await includes("src/app/api/ynot/admin/campaigns/route.ts", ["categoryIds", "is_test", "draw_round_categories"]);
await includes("src/app/api/ynot/admin/prizes/route.ts", ["quantity", "planned_quantity", "materialized: false"]);
await includes("src/app/api/ynot/admin/cards/route.ts", ["assetManifestKey", "japan-toreca", "is_test"]);
await includes("src/features/ynot/data.ts", ["getStoreCategories", "get_draw_round_inventory_summary", "draw_round_prize_units"]);
await includes("src/features/ynot/data.ts", ["canReadTestCampaign", "draw_round_testers", "allowTestForCurrentViewer"]);
await includes("src/app/(store)/gacha/[campaignId]/page.tsx", ["allowTestForCurrentViewer: true"]);
await includes("src/app/(store)/gacha/[campaignId]/open/page.tsx", ["allowTestForCurrentViewer: true"]);
await includes("src/features/ynot/client.tsx", ["AdminCategoryForm", "Planned pack quantity", "Production test pack"]);
await includes("tools/seed/seed-production-admin-test-data.mjs", ["ALLOW_PRODUCTION_TEST_SEED", "--dry-run", "--apply", "--cleanup", "draw_round_testers"]);
await includes("docs/runbooks/production-admin-test-data.md", ["Hard gate before production apply", "Owner go/no-go", "non-destructive"]);

const manifest = JSON.parse(await read("tools/seed/assets/asset-manifest.json"));
const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
if (!assets.length) fail("asset manifest has test assets", "No assets found.");
for (const asset of assets) {
  const haystack = JSON.stringify(asset).toLowerCase();
  if (haystack.includes("japan-toreca")) fail(`asset ${asset.key} source policy`, "Japan Toreca references are blocked.");
  else pass(`asset ${asset.key} source policy`);
  if (asset.allowedForProductionTest === true && String(asset.file || "").startsWith("/test-assets/")) pass(`asset ${asset.key} approved path`);
  else fail(`asset ${asset.key} approved path`, "Asset must be marked allowedForProductionTest and use /test-assets/.");
}

const failed = checks.filter((check) => check.status === "fail");
for (const check of checks) {
  const mark = check.status === "pass" ? "✓" : "✗";
  console.log(`${mark} ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
}
if (failed.length) {
  console.error(`Production test readiness verification failed: ${failed.length} issue(s).`);
  process.exit(1);
}
console.log(`Production test readiness verification passed: ${checks.length} checks.`);
