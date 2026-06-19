import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const data = readFileSync(fileURLToPath(new URL("../src/features/ynot/data.ts", import.meta.url)), "utf8");
const directCustomerStockUnitRead =
  /\.from\("card_stock_units"\)[\s\S]*?\.select\([\s\S]*?\)[\s\S]*?\.in\("id",\s*(?!batch\b)[^)]+\)/;

function sliceFn(src, startMarker) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const rest = src.slice(start + startMarker.length);
  const nextIdx = rest.search(/\n(?:async function |function |export )/);
  return src.slice(start, start + startMarker.length + (nextIdx === -1 ? rest.length : nextIdx));
}

test("prize-lineup individual fallback fetches campaigns in parallel (no serial N+1)", () => {
  const fn = sliceFn(data, "async function getPublicPrizeLineupsIndividually");
  assert.match(fn, /Promise\.all\(/);
  assert.doesNotMatch(fn, /for \(const row of rows\)/);
});

test("getGachaOpenHistory batches stock-unit image lookups instead of one large PostgREST filter", () => {
  const fn = sliceFn(data, "export async function getGachaOpenHistory");
  assert.match(fn, /readCardStockUnitRowsByIds<\{\s*id: string;\s*card_id: string \| null;\s*image_url: string \| null;\s*\}>/);
  assert.doesNotMatch(fn, directCustomerStockUnitRead);
});

test("card stock-unit batched reader keeps customer hydration reads bounded", () => {
  const helper = sliceFn(data, "async function readCardStockUnitRowsByIds");
  assert.match(data, /const CARD_STOCK_UNIT_ID_BATCH_SIZE = 250;/);
  assert.match(helper, /readSupabaseRows<T>\(/);
  assert.match(helper, /`\$\{label\}_batch_\$\{Math\.floor\(i \/ CARD_STOCK_UNIT_ID_BATCH_SIZE\) \+ 1\}`/);
  assert.match(helper, /\.in\("id", batch\)/);
});
