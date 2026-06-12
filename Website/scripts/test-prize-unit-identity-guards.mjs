import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration = read(
  "../Database/supabase/migrations/20260611160000_prize_unit_identity_checker_and_live_edit_guards.sql",
);
const dataSource = read("src/features/ynot/data.ts");
const prizeReadinessSource = read("src/features/ynot/prize-readiness.ts");
const stockSkuUsageSource = read("src/features/ynot/stock-sku-usage.ts");
const typesSource = read("src/features/ynot/types.ts");
const clientSource = read("src/features/ynot/client.tsx");
const openRoute = read("src/app/api/ynot/gacha/open/route.ts");
const { outputText } = ts.transpileModule(stockSkuUsageSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const cjsModule = { exports: {} };
vm.runInNewContext(outputText, {
  exports: cjsModule.exports,
  module: cjsModule,
  require,
});
const stockSku = cjsModule.exports;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("migration defines prize unit identity mismatch checker", () => {
  assert.match(
    migration,
    /create or replace function public\.get_draw_round_prize_unit_identity_mismatches\(/,
  );
  assert.match(migration, /draw_round_prize_units/);
  assert.match(migration, /draw_round_prizes/);
  assert.match(migration, /card_stock_units/);
  assert.match(migration, /card_stock_unit_matches_prize_filter/);
  assert.match(migration, /unitCardMismatch/);
  assert.match(migration, /stockCardMismatch/);
  assert.match(migration, /stockFilterMismatch/);
  assert.match(migration, /missingStockUnit/);
  assert.match(migration, /intendedStockUnitGroupKey/);
  assert.match(migration, /intendedStockSkuId/);
  assert.match(migration, /intendedStockSku/);
  assert.match(migration, /intendedStockLabel/);
  assert.match(migration, /intendedStockUnitFilter/);
  assert.match(migration, /jsonb_build_object\(\s*'unitCardMismatch'/);
  assert.match(migration, /primaryReason/);
});

test("migration defines assertion helper that raises prize_unit_identity_mismatch", () => {
  assert.match(
    migration,
    /create or replace function public\.assert_draw_round_prize_unit_identity\(/,
  );
  assert.match(migration, /raise exception 'prize_unit_identity_mismatch'/);
});

test("checker RPC is service-role only at the DB boundary", () => {
  assert.match(
    migration,
    /revoke all on function public\.get_draw_round_prize_unit_identity_mismatches\(uuid\) from public, anon, authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_draw_round_prize_unit_identity_mismatches\(uuid\) to service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.get_draw_round_prize_unit_identity_mismatches\(uuid\) to [^;]*authenticated/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.assert_draw_round_prize_unit_identity\(uuid\) from public, anon, authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.assert_draw_round_prize_unit_identity\(uuid\) to service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.assert_draw_round_prize_unit_identity\(uuid\) to [^;]*authenticated/i,
  );
});

test("approval guard rejects reserved stock identity drift before materialization", () => {
  assert.match(migration, /reserved_stock_identity_mismatch/);
  assert.match(migration, /card_stock_unit_matches_prize_filter/);
  assert.match(migration, /stock\.card_id is distinct from prizes\.card_id/);
  assert.match(migration, /stock\.status = ''reserved''/);
  assert.match(
    migration,
    /public\.assert_draw_round_prize_unit_identity\(p_draw_round_id\)/,
  );
});

test("live edit guard releases unawarded identity changes and checks final materialization", () => {
  assert.match(migration, /v_identity_changed/);
  assert.match(migration, /prize_identity_locked_after_award/);
  assert.match(migration, /public\._release_live_prize_units/);
  assert.match(
    migration,
    /public\.assert_draw_round_prize_unit_identity\(p_draw_round_id\)/,
  );
});

test("live revision publish keeps edit RPC call and asserts prize unit identity", () => {
  assert.match(migration, /public\.edit_live_campaign_inventory/);
  assert.match(
    migration,
    /public\.assert_draw_round_prize_unit_identity\(revision\.draw_round_id\)/,
  );
});

test("ordinary publish asserts prize unit identity immediately before going live", () => {
  assert.match(
    migration,
    /'public\.publish_campaign\(uuid,uuid,text\)'::regprocedure/,
  );
  assert.match(
    migration,
    /public\.assert_draw_round_prize_unit_identity\(p_draw_round_id\);\s*[\s\S]*update public\.draw_rounds\s+set status = ''live'',\s+visibility = ''public'',/,
  );
});

test("admin data exposes intended-vs-actual prize unit diagnostics", () => {
  assert.match(dataSource, /get_draw_round_prize_unit_identity_mismatches/);
  assert.match(dataSource, /getPrizeUnitIdentityMismatchesByCampaign/);
  assert.match(dataSource, /getAdminPackMonitor[\s\S]*identityMismatchCount/);
  assert.match(dataSource, /getAdminPackMonitor[\s\S]*identityMismatches/);
  assert.match(dataSource, /getAdminPackMonitor[\s\S]*identityMismatchCheckFailed/);
  assert.match(dataSource, /getLivePackMonitor[\s\S]*identityMismatchCount/);
  assert.match(dataSource, /getLivePackMonitor[\s\S]*identityMismatches/);
  assert.match(dataSource, /getLivePackMonitor[\s\S]*identityMismatchCheckFailed/);
  assert.match(dataSource, /identityMismatchCount/);
  assert.match(dataSource, /identityMismatches/);
  assert.match(dataSource, /identityMismatchCheckFailed/);
  assert.match(prizeReadinessSource, /identityMismatchCount/);
  assert.match(prizeReadinessSource, /identityMismatchCheckFailed/);
  assert.match(prizeReadinessSource, /Prize stock identity checker failed/);
  assert.match(stockSkuUsageSource, /actualStockCardId/);
  assert.match(stockSkuUsageSource, /actualStockSkuId/);
  assert.match(stockSkuUsageSource, /identityMismatch/);
  assert.match(stockSkuUsageSource, /normalizePrizeUnitIdentityMismatches/);
});

test("admin checker failures surface as degraded diagnostics, not clean empty mismatches", () => {
  const helperBody = between(
    dataSource,
    "async function getPrizeUnitIdentityMismatches(",
    "async function getPrizeUnitIdentityMismatchesByCampaign(",
  );
  assert.match(helperBody, /failed: true/);
  assert.match(helperBody, /mismatches:\s*\[\]/);
  assert.doesNotMatch(helperBody, /return\s+\[\]/);
  assert.match(dataSource, /identityMismatchResult\.failed/);
  assert.match(prizeReadinessSource, /failed:\s*true/);
  assert.match(prizeReadinessSource, /identityMismatchCheckFailed:\s*identityMismatchCheck\.failed/);
});

test("exported admin contracts include prize unit identity diagnostics", () => {
  assert.match(typesSource, /export type YnotPrizeUnitIdentityMismatch/);
  assert.match(typesSource, /intendedStockUnitGroupKey/);
  assert.match(typesSource, /intendedStockSkuId/);
  assert.match(typesSource, /intendedStockSku/);
  assert.match(typesSource, /intendedStockLabel/);
  assert.match(typesSource, /intendedStockUnitFilter/);
  assert.match(typesSource, /reason:\s*\{[\s\S]*unitCardMismatch/);
  assert.match(typesSource, /primaryReason/);
  assert.match(typesSource, /YnotCampaign[\s\S]*identityMismatchCount/);
  assert.match(typesSource, /YnotCampaign[\s\S]*identityMismatches/);
  assert.match(typesSource, /YnotCampaign[\s\S]*identityMismatchCheckFailed/);
  assert.match(typesSource, /YnotLivePackMonitor[\s\S]*identityMismatchCount/);
  assert.match(typesSource, /YnotLivePackMonitor[\s\S]*identityMismatchCheckFailed/);
  assert.match(typesSource, /YnotPackMonitor[\s\S]*identityMismatchCount/);
  assert.match(typesSource, /YnotPackMonitor[\s\S]*identityMismatchCheckFailed/);
  assert.match(typesSource, /stockUnitUsages\?: Array<\{[\s\S]*actualStockCardId/);
  assert.match(typesSource, /stockUnitUsages\?: Array<\{[\s\S]*actualStockSkuId/);
  assert.match(typesSource, /stockUnitUsages\?: Array<\{[\s\S]*identityMismatch/);
});

test("admin stock usage display surfaces identity mismatches", () => {
  assert.match(clientSource, /identityMismatchUsageCount/);
  assert.match(clientSource, /identity mismatch/);
});

test("mismatch parser preserves intended and actual identity with multiple reason flags", () => {
  const parsed = stockSku.normalizePrizeUnitIdentityMismatches([
    {
      drawRoundId: "round-1",
      prizeId: "prize-1",
      prizeUnitId: "unit-1",
      status: "available",
      prizeCardId: "card-y-ticket",
      unitCardId: "card-luffy",
      stockCardId: "card-sabo",
      stockUnitId: "stock-1",
      stockSkuId: "actual-sku-id",
      stockLabel: "Actual PSA 10",
      intendedStockUnitGroupKey: "stock-sku:intended-sku-id",
      intendedStockSkuId: "intended-sku-id",
      intendedStockSku: "Y-TICKET-PSA10",
      intendedStockLabel: "Y-Ticket PSA 10",
      intendedStockUnitFilter: { condition: "graded", grade: "PSA 10" },
      reason: {
        unitCardMismatch: true,
        stockCardMismatch: true,
        missingStockUnit: false,
        stockFilterMismatch: true,
      },
      primaryReason: "unitCardMismatch",
    },
    {
      drawRoundId: "round-1",
      prizeId: "prize-2",
      prizeUnitId: "unit-2",
      status: "available",
      reason: "missingStockUnit",
    },
    {
      drawRoundId: "round-1",
      prizeId: "prize-3",
      prizeUnitId: "unit-3",
      status: "available",
      reason: {},
    },
  ]);

  assert.equal(parsed.length, 2);
  assert.deepEqual(plain(parsed[0].reason), {
    unitCardMismatch: true,
    stockCardMismatch: true,
    missingStockUnit: false,
    stockFilterMismatch: true,
  });
  assert.equal(parsed[0].primaryReason, "unitCardMismatch");
  assert.equal(parsed[0].stockCardId, "card-sabo");
  assert.equal(parsed[0].intendedStockSkuId, "intended-sku-id");
  assert.equal(parsed[0].intendedStockSku, "Y-TICKET-PSA10");
  assert.equal(parsed[0].intendedStockLabel, "Y-Ticket PSA 10");
  assert.deepEqual(plain(parsed[0].intendedStockUnitFilter), {
    condition: "graded",
    grade: "PSA 10",
  });
  assert.deepEqual(plain(parsed[1].reason), {
    unitCardMismatch: false,
    stockCardMismatch: false,
    missingStockUnit: true,
    stockFilterMismatch: false,
  });
  assert.equal(parsed[1].primaryReason, "missingStockUnit");
});

test("customer open route stays on open_gacha_campaign and does not add identity blocks", () => {
  assert.match(openRoute, /\.rpc\("open_gacha_campaign"/);
  assert.match(openRoute, /not_enough_available_slots/);
  assert.match(openRoute, /not_enough_prize_inventory/);
  assert.doesNotMatch(openRoute, /prize_unit_identity_mismatch/);
  assert.doesNotMatch(openRoute, /assert_draw_round_prize_unit_identity/);
});
