import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const src = readFileSync(
  fileURLToPath(new URL("../src/features/ynot/data.ts", import.meta.url)),
  "utf8",
);
const typesSrc = readFileSync(
  fileURLToPath(new URL("../src/lib/supabase/types.ts", import.meta.url)),
  "utf8",
);

function sliceFn(s, startMarker) {
  const start = s.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const rest = s.slice(start + startMarker.length);
  const nextIdx = rest.search(/\n(?:async function |function |const [a-zA-Z]|export )/);
  return s.slice(start, start + startMarker.length + (nextIdx === -1 ? rest.length : nextIdx));
}

function parseList(name) {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error(`could not find ${name}`);
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

// Every column in the generated draw_rounds Row type.
function drawRoundColumns() {
  const start = typesSrc.indexOf("draw_rounds: {");
  const rowStart = typesSrc.indexOf("Row: {", start);
  const rowEnd = typesSrc.indexOf("};", rowStart);
  const block = typesSrc.slice(rowStart, rowEnd);
  return [...block.matchAll(/\n\s+([a-z_]+):/g)].map((x) => x[1]);
}

const keep = parseList("CAMPAIGN_CUSTOMER_SELECT");
const keepSet = new Set(keep);
const allCols = drawRoundColumns();

test("customer draw_rounds reads use CAMPAIGN_CUSTOMER_SELECT, not select(\"*\")", () => {
  for (const marker of [
    "async function getCampaignsImpl",
    "async function loadPublicCampaignDetailImpl",
  ]) {
    const fn = sliceFn(src, marker);
    assert.doesNotMatch(
      fn,
      /\.from\("draw_rounds"\)\s*\.select\("\*"\)/,
      `${marker} still selects *`,
    );
    assert.match(
      fn,
      /\.select\(CAMPAIGN_CUSTOMER_SELECT\)/,
      `${marker} should select CAMPAIGN_CUSTOMER_SELECT`,
    );
  }
});

test("CAMPAIGN_CUSTOMER_SELECT contains only real draw_rounds columns (no typos)", () => {
  assert.ok(keep.length > 0, "CAMPAIGN_CUSTOMER_SELECT should not be empty");
  for (const c of keep) {
    assert.ok(allCols.includes(c), `"${c}" is not a real draw_rounds column`);
  }
});

// THE safety net: any draw_rounds column a customer consumer reads MUST be in the
// select, or it is undefined at runtime (which typecheck/build do NOT catch,
// because .select() with a runtime string returns the full Row type). This also
// future-proofs: add a `row.new_col` read to a consumer without keeping it → fail.
test("every draw_rounds column read by a customer consumer is in CAMPAIGN_CUSTOMER_SELECT", () => {
  const consumers = [
    sliceFn(src, "function safeCostCoins"),
    sliceFn(src, "function safeDisplayTags"),
    sliceFn(src, "function toYnotCampaign"),
    sliceFn(src, "async function getPublicPrizeLineup"),
    sliceFn(src, "async function resolveLastPrizePreview"),
  ].join("\n");
  const reads = new Set([...consumers.matchAll(/row\.([a-z_]+)/g)].map((m) => m[1]));
  for (const col of reads) {
    if (allCols.includes(col)) {
      assert.ok(
        keepSet.has(col),
        `column "${col}" is read by a customer consumer but missing from CAMPAIGN_CUSTOMER_SELECT`,
      );
    }
  }
  // Cross-file: getCampaignPrizeReadiness (prize-readiness.ts) reads these
  // draw_rounds columns from the passed row — they must be fetched.
  for (const col of [
    "status",
    "approval_status",
    "total_slots",
    "logic_snapshot",
    "last_prize_card_id",
    "last_prize_awarded_at",
  ]) {
    assert.ok(keepSet.has(col), `readiness needs "${col}" in CAMPAIGN_CUSTOMER_SELECT`);
  }
});

test("/packs list is capped to avoid silent PostgREST max_rows truncation", () => {
  const fn = sliceFn(src, "async function getCampaignsImpl");
  assert.match(
    fn,
    /\.limit\(\s*typeof limit === "number" \? limit : CAMPAIGN_LIST_HARD_CAP\s*\)/,
  );
});
