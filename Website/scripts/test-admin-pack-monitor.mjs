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
    "export async function",
  );

  assert.match(loaderSource, /YnotPackMonitor/);
  assert.match(loaderSource, /viewer\.isAdmin/);
  assert.match(loaderSource, /summary:/);
  assert.match(loaderSource, /prizes:/);
  assert.match(loaderSource, /totals:/);

  for (const token of PRIVATE_MONITOR_TOKENS) {
    assert.doesNotMatch(
      loaderSource,
      new RegExp(`\\b${token}\\b`),
      `monitor loader must map away private field ${token}`,
    );
  }
});

test("admin pack monitor page renders no house/private stock identifiers", () => {
  const pageSource = read("../src/app/admin/ynot/live-packs/[slug]/monitor/page.tsx");

  assert.match(pageSource, /getAdminPackMonitor/);
  assert.match(pageSource, /YnotPackMonitor/);
  assert.match(pageSource, /remaining/i);
  assert.match(pageSource, /sold[- ]?out/i);
  assert.match(pageSource, /winner/i);

  for (const token of PRIVATE_MONITOR_TOKENS) {
    assert.doesNotMatch(
      pageSource,
      new RegExp(`\\b${token}\\b`),
      `monitor page must not render or reference private field ${token}`,
    );
  }
});

test("admin random packs panel links to the monitor without private query params", () => {
  const clientSource = read("../src/features/ynot/client.tsx");
  const panelSource = between(clientSource, "function RandomPacksPanel", "function");

  assert.match(panelSource, /\/admin\/ynot\/live-packs\/[^"']+\/monitor/);
  assert.doesNotMatch(panelSource, /stockUnitFilter/);
  assert.doesNotMatch(panelSource, /cardStockUnitId/);
  assert.doesNotMatch(panelSource, /drawRoundPrizeUnitId/);
});
