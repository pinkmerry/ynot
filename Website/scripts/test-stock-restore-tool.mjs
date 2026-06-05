import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("pack stock restore tool is dry-run and production-gated by default", () => {
  const source = read("tools/ops/restore-pack-stock.mjs");
  assert.match(source, /apply:\s*false/);
  assert.match(source, /ALLOW_PRODUCTION_STOCK_RESTORE/);
  assert.match(source, /I_UNDERSTAND_THIS_CREATES_REPLACEMENT_STOCK/);
  assert.match(source, /YNOT_ENV=production|NODE_ENV=production/);
  assert.match(source, /--campaign-id|--campaign-slug/);
});

test("pack stock restore creates replacement stock without releasing awarded rows", () => {
  const source = read("tools/ops/restore-pack-stock.mjs");
  const migration = read("../Database/supabase/migrations/20260605224000_restore_awarded_pack_stock.sql");
  assert.match(source, /\.from\("draw_round_prize_units"\)[\s\S]*\.eq\("status", "awarded"\)/);
  assert.match(source, /\.rpc\("restore_awarded_pack_stock"/);
  assert.match(migration, /insert into public\.card_stock_units/);
  assert.match(migration, /insert into public\.card_stock_ledger/);
  assert.match(migration, /insert into public\.audit_events/);
  assert.match(migration, /on conflict \(source_type, source_id\)/);
  assert.doesNotMatch(source, /\.from\("card_stock_units"\)[\s\S]*\.(update|delete)\(/);
  assert.doesNotMatch(source, /\.from\("draw_round_prize_units"\)[\s\S]*\.(update|delete)\(/);
  assert.doesNotMatch(migration, /update public\.draw_round_prize_units|delete from public\.draw_round_prize_units/);
});

test("pack stock restore RPC accepts only proven awarded pack sources", () => {
  const migration = read("../Database/supabase/migrations/20260605224000_restore_awarded_pack_stock.sql");
  assert.match(migration, /stock\.status <> 'allocated'[\s\S]*raise exception 'source_stock_not_consumed'/);
  assert.match(migration, /create temporary table _eligible_restore_sources/);
  assert.match(migration, /join public\.draw_round_prize_units prize_unit[\s\S]*prize_unit\.status = 'awarded'/);
  assert.match(migration, /join public\.draw_rounds round[\s\S]*round\.last_prize_stock_unit_id = sources\.source_stock_unit_id[\s\S]*round\.last_prize_awarded_at is not null/);
  assert.match(migration, /sources\.source_draw_round_prize_unit_id is null/);
  assert.match(migration, /sources\.source_collection_item_id = round\.last_prize_collection_item_id/);
  assert.match(migration, /sources\.source_gacha_open_id = round\.last_prize_awarded_open_id/);
  assert.match(migration, /raise exception 'restore_source_not_awarded'/);
  assert.doesNotMatch(migration, /from _restore_sources sources\n\s+join public\.card_stock_units source_unit/);
});

test("pack stock restore keeps unique slab identifiers private metadata-only", () => {
  const source = read("tools/ops/restore-pack-stock.mjs");
  const migration = read("../Database/supabase/migrations/20260605224000_restore_awarded_pack_stock.sql");
  assert.match(source, /uniqueIdentifiersCopied:\s*false/);
  assert.match(migration, /'originalCertNumber', source_unit\.cert_number/);
  assert.match(migration, /'originalGemrateId', source_unit\.gemrate_id/);
  assert.match(migration, /\n\s*null,\n\s*null,\n\s*nullif\(source_unit\.image_url/);
  assert.match(migration, /'uniqueIdentifiersCopied', false/);
});

test("pack stock restore apply is atomic and idempotent in a database RPC", () => {
  const source = read("tools/ops/restore-pack-stock.mjs");
  const migration = read("../Database/supabase/migrations/20260605224000_restore_awarded_pack_stock.sql");
  assert.match(migration, /create unique index if not exists card_stock_units_production_stock_restore_source_key/);
  assert.match(migration, /create unique index if not exists card_stock_ledger_production_restore_stock_created_key/);
  assert.match(migration, /create or replace function public\.restore_awarded_pack_stock/);
  assert.match(migration, /on conflict \(stock_unit_id\)[\s\S]*sourceType' = 'production_stock_restore'[\s\S]*do nothing/);
  assert.match(migration, /grant execute on function public\.restore_awarded_pack_stock/);
  assert.doesNotMatch(source, /\.from\("card_stock_units"\)[\s\S]*\.insert\(/);
  assert.doesNotMatch(source, /\.from\("card_stock_ledger"\)[\s\S]*\.insert\(/);
  assert.doesNotMatch(source, /\.from\("audit_events"\)[\s\S]*\.insert\(/);
});

test("pack stock restore apply calls RPC for repair-only existing replacements", () => {
  const source = read("tools/ops/restore-pack-stock.mjs");
  assert.match(source, /item\.reason === "replacement_already_exists"/);
  assert.match(source, /options\.apply && applyableItems\.length/);
  assert.doesNotMatch(source, /options\.apply && plan\.restoreItems\.length/);
  assert.doesNotMatch(source, /rerun dry-run to refresh the plan/);
});

test("package exposes the guarded stock restore command", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(
    pkg.scripts["ops:restore-pack-stock"],
    "node tools/ops/restore-pack-stock.mjs",
  );
  assert.equal(pkg.scripts["test:stock-restore-tool"], "node --test scripts/test-stock-restore-tool.mjs");
});
