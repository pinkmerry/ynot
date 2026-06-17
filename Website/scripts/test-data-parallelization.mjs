import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function read(rel) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}
function sliceFn(src, startMarker) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const rest = src.slice(start + startMarker.length);
  const nextIdx = rest.search(/\n(?:async function |function |export )/);
  return src.slice(start, start + startMarker.length + (nextIdx === -1 ? rest.length : nextIdx));
}

const packDetail = read("../src/app/(store)/packs/[slug]/page.tsx");
const gachaDetail = read("../src/app/(store)/gacha/[campaignId]/page.tsx");
const dataSrc = read("../src/features/ynot/data.ts");
const openPage = read("../src/app/(store)/gacha/[campaignId]/open/page.tsx");

test("pack detail fetches wallet slice and campaign in parallel", () => {
  assert.match(packDetail, /getYnotViewer/);
  assert.match(packDetail, /Promise\.all\(\[\s*getYnotDashboardSlice\(\{ wallet: true \}\),\s*getCampaign\(/s);
});

test("gacha detail fetches wallet slice and campaign in parallel", () => {
  assert.match(gachaDetail, /getYnotViewer/);
  assert.match(gachaDetail, /Promise\.all\(\[\s*getYnotDashboardSlice\(\{ wallet: true \}\),\s*getCampaign\(/s);
});

test("getCampaign resolves lineup, readiness, identity and last-prize in one Promise.all", () => {
  const fn = sliceFn(dataSrc, "export async function getCampaign(\n");
  assert.match(fn, /const \[prizeLineup, readiness, identityMismatchResult, lastPrizePreview\] =\s*await Promise\.all\(/s);
  assert.doesNotMatch(fn, /campaign\.lastPrizePreview = await resolveLastPrizePreview/);
});

test("resolveLastPrizePreview fetches card + stock units in parallel", () => {
  const fn = sliceFn(dataSrc, "async function resolveLastPrizePreview");
  assert.match(fn, /const \[cards, units\] = await Promise\.all\(/s);
});

test("getGachaOpenHistory fetches reward units + collection links in parallel", () => {
  const fn = sliceFn(dataSrc, "export async function getGachaOpenHistory");
  assert.match(fn, /const \[rewardPrizeUnits, collectionStockLinks\] =\s*openIds\.length\s*\?\s*await Promise\.all\(/s);
});

test("open page fetches campaign + tier animations in parallel", () => {
  assert.match(openPage, /const \[campaign, tierAnimations\] = await Promise\.all\(\[\s*getOpenCampaignForReveal\(/s);
  assert.doesNotMatch(openPage, /const tierAnimations = await getTierAnimations\(\);/);
});
