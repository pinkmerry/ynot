import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(websiteRoot, "..");
const migrationsRoot = path.join(repoRoot, "Database/marketplace-supabase/migrations");
const activationMigration = path.join(
  migrationsRoot,
  "20260721090000_marketplace_seller_terms_activate.sql",
);
const repairMigration = path.join(
  migrationsRoot,
  "20260721090100_marketplace_seller_terms_activate_existing_accounts.sql",
);

function compactSql(filePath) {
  return readFileSync(filePath, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

test("seller terms acceptance activates consignment selling", () => {
  assert.ok(existsSync(activationMigration), "missing seller-terms activation migration");
  const sql = compactSql(activationMigration);

  assert.match(sql, /create or replace function public\.marketplace_accept_seller_terms/);
  assert.match(sql, /when seller_status in \('none', 'pending_terms', 'pending_review'\) then 'active'/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = public, pg_temp/);
  assert.match(sql, /revoke all on function public\.marketplace_accept_seller_terms/);
  assert.match(sql, /grant execute on function public\.marketplace_accept_seller_terms/);
});

test("already accepted sellers are repaired without changing other review states", () => {
  assert.ok(existsSync(repairMigration), "missing seller-terms account repair migration");
  const sql = compactSql(repairMigration);

  assert.match(sql, /update public\.marketplace_accounts/);
  assert.match(sql, /set seller_status = 'active'/);
  assert.match(sql, /where seller_status = 'pending_review'/);
  assert.match(sql, /and seller_terms_accepted_at is not null/);
  assert.match(sql, /and seller_terms_version is not null/);
});
