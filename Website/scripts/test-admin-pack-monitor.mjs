import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  const url = new URL(path, import.meta.url);
  assert.ok(existsSync(url), `missing expected admin pack monitor file: ${path}`);
  return readFileSync(url, "utf8");
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const PRIVATE_MONITOR_TOKENS = [
  "stock_unit_id",
  "stockUnitId",
  "draw_round_prize_unit_id",
  "drawRoundPrizeUnitId",
  "card_stock_unit_id",
  "cardStockUnitId",
  "stockUnitFilter",
  "stock_unit_filter",
  "weight",
  "unlockAtSoldPct",
  "unlock_at_sold_pct",
  "certNumber",
  "cert_number",
  "gemrateId",
  "gemrate_id",
  "metadata",
  "adminMetadata",
];

test("admin pack monitor TypeScript contracts are exported", () => {
  const typesSource = read("../src/features/ynot/types.ts");

  assert.match(typesSource, /export type YnotPrizeTier = "normal" \| "high";/);
  assert.match(typesSource, /export type YnotPrizeDisplayTier = "rainbow" \| "gold" \| "silver" \| "bronze";/);
  assert.match(typesSource, /export type YnotPackMonitorPrizeUnit = \{/);
  assert.match(typesSource, /export type YnotPackMonitorPrize = \{/);
  assert.match(typesSource, /export type YnotPackMonitorSummary = \{/);
  assert.match(typesSource, /export type YnotPackMonitor = \{/);

  const monitorType = between(
    typesSource,
    "export type YnotPackMonitor = {",
    "export type YnotAddress",
  );
  assert.match(monitorType, /summary: YnotPackMonitorSummary;/);
  assert.match(monitorType, /prizes: YnotPackMonitorPrize\[\];/);
  assert.match(monitorType, /totalPrizeUnits: number;/);
  assert.match(monitorType, /remainingPrizeUnits: number;/);
  assert.match(monitorType, /outPrizeUnits: number;/);
  assert.match(monitorType, /prizeRows: number;/);
  assert.match(monitorType, /winnerRows: number;/);
});

test("admin pack monitor contracts expose only dashboard-safe fields", () => {
  const typesSource = read("../src/features/ynot/types.ts");
  const monitorContracts = between(
    typesSource,
    "export type YnotPackMonitorPrizeUnit = {",
    "export type YnotAddress",
  );

  for (const token of PRIVATE_MONITOR_TOKENS) {
    assert.doesNotMatch(
      monitorContracts,
      new RegExp(`\\b${token}\\b`),
      `monitor contracts must not expose private field ${token}`,
    );
  }

  for (const safeField of [
    "ownerLabel",
    "ownerEmail",
    "ownerLineUserId",
    "publicOpenCode",
    "remainingQuantity",
    "outQuantity",
    "remainingUnits",
    "outUnits",
    "isSoldOut",
  ]) {
    assert.match(monitorContracts, new RegExp(`\\b${safeField}\\b`));
  }
});

test("admin pack monitor data loader exists and returns the safe contract", () => {
  const dataSource = read("../src/features/ynot/data.ts");
  const loaderSource = between(
    dataSource,
    "export async function getAdminPackMonitor",
    "function liveRevisionPrizeRows",
  );

  assert.match(loaderSource, /YnotPackMonitor/);
  assert.match(loaderSource, /resolveAdminSession/);
  assert.match(loaderSource, /get_admin_pack_monitor_prize_units/);
  assert.match(loaderSource, /monitorPrizeStatsFromJson/);
  assert.match(loaderSource, /statsByPrizeId/);
  assert.match(loaderSource, /summary:/);
  assert.match(loaderSource, /prizes:/);
  assert.match(loaderSource, /totals:/);
  assert.match(loaderSource, /ADMIN_PACK_MONITOR_WINNERS_PER_PRIZE_LIMIT/);
  assert.match(loaderSource, /winnerRows: outPrizeUnits/);
  assert.match(loaderSource, /if \(prizesError\) throw prizesError;/);
  assert.doesNotMatch(loaderSource, /readOrEmpty\(/);
  assert.doesNotMatch(loaderSource, /\.from\("draw_round_prize_units"\)/);

  for (const token of PRIVATE_MONITOR_TOKENS) {
    assert.doesNotMatch(
      loaderSource,
      new RegExp(`\\b${token}\\b`),
      `monitor loader must map away private field ${token}`,
    );
  }
});

test("live revision status lookup is compact and avoids owner economics", () => {
  const dataSource = read("../src/features/ynot/data.ts");
  const statusLoaderSource = between(
    dataSource,
    "export async function getLivePackRevisionStatus",
    "export async function getLivePackRevisionReview",
  );

  assert.match(statusLoaderSource, /draw_round_live_revisions/);
  assert.match(statusLoaderSource, /draw_round_id,status,created_at,updated_at,reviewed_at/);
  assert.match(statusLoaderSource, /\.in\("status", \["pending_review", "approved"\]\)/);
  assert.doesNotMatch(statusLoaderSource, /prize_snapshot/);
  assert.doesNotMatch(statusLoaderSource, /scalar_patch/);
  assert.doesNotMatch(statusLoaderSource, /logic_snapshot/);
  assert.doesNotMatch(statusLoaderSource, /weight/);
  assert.doesNotMatch(statusLoaderSource, /unlock_at_sold_pct/);
});

test("admin pack monitor page renders no house/private stock identifiers", () => {
  const pageSource = read("../src/app/admin/ynot/live-packs/[slug]/monitor/page.tsx");

  assert.match(pageSource, /getAdminPackMonitor/);
  assert.match(pageSource, /getLivePackRevisionStatus/);
  assert.match(pageSource, /Needs owner review/);
  assert.match(pageSource, /Review & republish/);
  assert.match(pageSource, /\/admin\/campaigns\/\$\{summary\.campaignId\}\/review/);
  assert.match(pageSource, /YnotPackMonitor/);
  assert.match(pageSource, /remaining/i);
  assert.match(pageSource, /sold[- ]?out/i);
  assert.match(pageSource, /winner/i);
  assert.match(pageSource, /dynamic = "force-dynamic"/);
  assert.match(pageSource, /revalidate = 0/);
  assert.match(pageSource, /connection/);
  assert.match(pageSource, /latest \{prize\.winners\.length\.toLocaleString\(\)\}/);
  assert.doesNotMatch(pageSource, /setInterval|router\.refresh|refreshInterval/);

  for (const token of PRIVATE_MONITOR_TOKENS) {
    assert.doesNotMatch(
      pageSource,
      new RegExp(`\\b${token}\\b`),
      `monitor page must not render or reference private field ${token}`,
    );
  }
});

test("admin random pack surfaces link to the monitor without private query params", () => {
  const dashboardSource = read("../src/app/admin/page.tsx");
  const clientSource = read("../src/features/ynot/client.tsx");
  const tableSource = between(
    clientSource,
    "export function AdminCampaignTable",
    "function DeletePackConfirmModal",
  );

  assert.match(
    dashboardSource,
    /\/admin\/ynot\/live-packs\/\$\{c\.slug\}\/monitor/,
  );
  assert.match(dashboardSource, /\/admin\/campaigns\/\$\{c\.id\}\/edit/);
  assert.match(
    tableSource,
    /\/admin\/ynot\/live-packs\/\$\{campaign\.slug\}\/monitor/,
  );
  assert.doesNotMatch(`${dashboardSource}\n${tableSource}`, /stockUnitFilter/);
  assert.doesNotMatch(`${dashboardSource}\n${tableSource}`, /cardStockUnitId/);
  assert.doesNotMatch(`${dashboardSource}\n${tableSource}`, /drawRoundPrizeUnitId/);
});

test("admin pack monitor RPC is bounded and service-role only", () => {
  const migrationSource = read(
    "../../Database/supabase/migrations/20260606010000_admin_pack_monitor_prize_units.sql",
  );
  const typesSource = read("../src/lib/supabase/types.ts");

  assert.match(migrationSource, /get_admin_pack_monitor_prize_units/);
  assert.match(migrationSource, /security definer/i);
  assert.match(migrationSource, /set search_path = public, pg_temp/i);
  assert.match(migrationSource, /least\(100, greatest\(0, coalesce\(p_winners_per_prize, 20\)\)\)/);
  assert.match(migrationSource, /row_number\(\) over/i);
  assert.match(migrationSource, /winner_rank <= args\.winner_limit/);
  assert.match(
    migrationSource,
    /revoke all on function public\.get_admin_pack_monitor_prize_units\(uuid, uuid, integer\)\s+from public, anon, authenticated;/i,
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.get_admin_pack_monitor_prize_units\(uuid, uuid, integer\)\s+to service_role;/i,
  );
  assert.match(typesSource, /get_admin_pack_monitor_prize_units/);
});
