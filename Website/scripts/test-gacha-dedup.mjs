import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const data = readFileSync(fileURLToPath(new URL("../src/features/ynot/data.ts", import.meta.url)), "utf8");

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

test("gacha open history fetches card_stock_units exactly once (deduped)", () => {
  const fn = sliceFn(data, "export async function getGachaOpenHistory");
  const count = (fn.match(/\.from\("card_stock_units"\)/g) ?? []).length;
  assert.equal(count, 1, `expected exactly one card_stock_units fetch in getGachaOpenHistory, found ${count}`);
});
