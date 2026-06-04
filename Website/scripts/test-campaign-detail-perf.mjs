import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readinessSource = readFileSync(
  new URL("../src/features/ynot/prize-readiness.ts", import.meta.url),
  "utf8",
);

test("readiness no longer counts prize units one prize at a time", () => {
  assert.ok(
    !/\bcountPrizeUnits\s*\(/.test(readinessSource),
    "the per-prize countPrizeUnits loop must be gone (it was the N+1 storm)",
  );
});

test("readiness aggregates prize-unit counts from a single bulk read", () => {
  assert.match(readinessSource, /aggregateNonVoidPrizeUnitCounts\(/);
  assert.match(
    readinessSource,
    /\.from\("draw_round_prize_units"\)[\s\S]{0,200}\.eq\("draw_round_id"/,
    "must read all non-void units for the campaign in one query",
  );
});
