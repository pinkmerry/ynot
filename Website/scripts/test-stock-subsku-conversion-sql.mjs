import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration creates editable stock SKU and conversion tables", () => {
  assert.match(migration, /create table if not exists public\.stock_skus/i);
  assert.match(migration, /create table if not exists public\.stock_sku_conversion_rules/i);
  assert.match(migration, /alter table public\.stock_skus enable row level security/i);
  assert.match(migration, /alter table public\.stock_sku_conversion_rules enable row level security/i);
  assert.match(migration, /unit_kind text not null/i);
  assert.match(migration, /check \(unit_kind in \('card', 'pack', 'box', 'other'\)\)/i);
  assert.match(migration, /child_quantity integer not null/i);
  assert.match(migration, /check \(child_quantity between 1 and 1000\)/i);
  assert.match(migration, /GEMRATE-/i);
  assert.match(migration, /alter table public\.card_stock_units/i);
  assert.match(migration, /add column if not exists stock_sku_id uuid/i);
  assert.match(migration, /add column if not exists parent_stock_unit_id uuid/i);
  assert.match(migration, /add column if not exists conversion_rule_id uuid/i);
  assert.match(
    migration,
    /foreign key \(parent_stock_unit_id\) references public\.card_stock_units\(id\) on delete set null/i,
  );
});

test("migration exposes summary and mutation RPCs", () => {
  assert.match(migration, /create or replace function public\.get_admin_stock_sku_summary/i);
  assert.match(migration, /create or replace function public\.get_admin_prize_stock_summaries/i);
  assert.match(migration, /create or replace function public\.upsert_stock_sku/i);
  assert.match(migration, /create or replace function public\.adjust_stock_sku_units/i);
  assert.match(migration, /create or replace function public\.adjust_card_stock_units/i);
  assert.match(migration, /create or replace function public\.open_stock_container/i);
  assert.match(migration, /'stockSkuId'/);
  assert.match(migration, /concat\('stock-sku:', sku\.id::text\)/);
  assert.match(migration, /'legacyStockUnitGroupKey', case[\s\S]*stock_sku_counts\.legacy_condition/i);
  assert.match(migration, /legacy_subsku_rows[\s\S]*'stockSkuId', null::uuid/i);
  assert.match(migration, /legacy_subsku_rows[\s\S]*'sourceStockSkuId', legacy\.stock_sku_id/i);
  assert.match(migration, /legacy_normalized_subsku[\s\S]*sku\.unit_kind as stock_unit_kind/i);
  assert.match(migration, /coalesce\(sku\.unit_kind, ''\) <> 'box'/i);
  assert.doesNotMatch(
    migration,
    /legacy_subsku_counts[\s\S]*group by[\s\S]*normalized\.stock_sku_id[\s\S]*active_rules/i,
  );
  assert.match(migration, /grant execute on function public\.open_stock_container/i);
  assert.match(migration, /revoke all on function app_private\.ensure_default_stock_sku/i);
  assert.match(migration, /grant execute on function app_private\.ensure_default_stock_sku/i);
});

test("migration patches related stock movement and live revision RPCs", () => {
  assert.match(migration, /create or replace function public\.edit_card_stock_unit/i);
  assert.match(migration, /p_stock_sku_id uuid default null/i);
  assert.match(migration, /previousStockSkuId/i);
  assert.match(migration, /newStockSkuId/i);
  assert.match(migration, /create or replace function public\.card_stock_unit_matches_prize_filter/i);
  assert.match(migration, /p_prize_metadata ->> 'stockSkuId'/);
  assert.match(migration, /edit_live_campaign_inventory/i);
  assert.match(migration, /_materialize_live_prize_units/i);
  assert.match(migration, /publish_live_campaign_revision/i);
  assert.match(migration, /stockSkuId/i);
  assert.match(migration, /unit_kind = coalesce\(normalized_kind, unit_kind\)/i);
  assert.match(migration, /coalesce\(nullif\(v_unit\.condition, ''\), 'raw'\) = v_condition/i);
  assert.match(migration, /coalesce\(v_unit\.cert_number, ''\) = coalesce\(v_cert_number, ''\)/i);
  assert.match(migration, /v_stock_sku_id := v_unit\.stock_sku_id/i);
  assert.match(migration, /app_private\.ensure_default_stock_sku\(\s*v_unit\.card_id/i);
  assert.match(migration, /stock_sku_id = v_stock_sku_id/i);
  assert.match(migration, /card_stock_unit_matches_prize_filter[\s\S]*sku\.unit_kind <> 'box'/i);
  assert.match(migration, /adjust_card_stock_units[\s\S]*sku\.unit_kind <> 'box'/i);
});

test("open_stock_container atomically consumes box units and creates child pack units", () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /child_quantity/i);
  assert.match(migration, /parent_stock_unit_id/i);
  assert.match(migration, /conversion_rule_id/i);
  assert.match(migration, /'container_opened'/i);
  assert.match(migration, /'container_child_created'/i);
  assert.match(migration, /'archived'/i);
  assert.match(migration, /'stock_created'/i);
  assert.doesNotMatch(migration, /status = 'allocated'[\s\S]{0,120}open_stock_container/i);
});

test("stock SKU mutations validate conversion ownership and ledger exact inserted rows", () => {
  assert.match(migration, /child_stock_sku_not_found/i);
  assert.match(migration, /conversion_cross_card_not_allowed/i);
  assert.match(migration, /child_stock_sku_must_be_pack/i);
  assert.match(migration, /child_stock_sku_conversion_in_use/i);
  assert.match(migration, /target_kind <> 'pack'[\s\S]*child_stock_sku_id = existing_sku\.id/i);
  assert.match(migration, /invalid_conversion_rule_unit_kind/i);
  assert.match(migration, /parent_sku\.unit_kind <> 'box' or child_sku\.unit_kind <> 'pack'/i);
  assert.match(migration, /app_private\.ensure_default_stock_sku\(/);
  assert.match(migration, /v_stock_sku_id/);
  assert.match(migration, /metadata_stock_sku_id/i);
  assert.match(migration, /substring\(metadata_group_key from 11\)::uuid/i);
  assert.match(migration, /stock_sku_id = v_stock_sku_id/i);
  assert.match(migration, /with inserted as \(\s*insert into public\.card_stock_units/i);
  assert.match(migration, /select id, card_id, 'stock_created', p_admin_id/i);
  assert.match(migration, /with child_units as \(\s*insert into public\.card_stock_units/i);
  assert.doesNotMatch(migration, /select id, card_id, 'created', p_admin_id/i);
  assert.doesNotMatch(
    migration,
    /stock_sku_id = sku_row\.id[\s\S]{0,240}created_at >= now\(\) - interval '5 minutes'/i,
  );
  assert.doesNotMatch(
    migration,
    /parent_stock_unit_id = parent_unit\.id[\s\S]{0,240}created_at >= now\(\) - interval '5 minutes'/i,
  );
});

test("restore stock RPC keeps replacement units linked to first-class stock SKUs", () => {
  assert.match(migration, /restore_awarded_pack_stock\(jsonb,uuid,text,uuid\)/i);
  assert.match(migration, /restore_awarded_pack_stock_stock_sku_patch_failed/i);
  assert.match(migration, /stock_sku_id,\s*\n\s*status/i);
  assert.match(migration, /source_unit\.stock_sku_id,\s*\n\s*'available'/i);
  assert.match(migration, /'stockSkuId', source_unit\.stock_sku_id/i);
});
