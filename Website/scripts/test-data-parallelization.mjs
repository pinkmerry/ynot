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

test("pack detail fetches wallet slice and campaign in parallel", () => {
  assert.match(packDetail, /getYnotViewer/);
  assert.match(packDetail, /Promise\.all\(\[\s*getYnotDashboardSlice\(\{ wallet: true \}\),\s*getCampaign\(/s);
});

test("gacha detail fetches wallet slice and campaign in parallel", () => {
  assert.match(gachaDetail, /getYnotViewer/);
  assert.match(gachaDetail, /Promise\.all\(\[\s*getYnotDashboardSlice\(\{ wallet: true \}\),\s*getCampaign\(/s);
});
