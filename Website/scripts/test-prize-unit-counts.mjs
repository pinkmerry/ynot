import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/prize-unit-counts.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const cjsModule = { exports: {} };
vm.runInNewContext(outputText, {
  module: cjsModule,
  exports: cjsModule.exports,
  require,
});
const { aggregateNonVoidPrizeUnitCounts } = cjsModule.exports;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("counts non-void total and available subtotal per prize", () => {
  const rows = [
    { draw_round_prize_id: "p1", status: "available" },
    { draw_round_prize_id: "p1", status: "available" },
    { draw_round_prize_id: "p1", status: "awarded" },
    { draw_round_prize_id: "p2", status: "awarded" },
  ];
  const result = aggregateNonVoidPrizeUnitCounts(["p1", "p2"], rows);
  assert.deepEqual(plain(result), [
    { prizeId: "p1", nonVoidCount: 3, availableCount: 2 },
    { prizeId: "p2", nonVoidCount: 1, availableCount: 0 },
  ]);
});

test("returns explicit zeroes for prizes with no rows", () => {
  const result = aggregateNonVoidPrizeUnitCounts(["p1"], []);
  assert.deepEqual(plain(result), [
    { prizeId: "p1", nonVoidCount: 0, availableCount: 0 },
  ]);
});

test("ignores rows whose prize id is null", () => {
  const rows = [{ draw_round_prize_id: null, status: "available" }];
  const result = aggregateNonVoidPrizeUnitCounts(["p1"], rows);
  assert.deepEqual(plain(result), [
    { prizeId: "p1", nonVoidCount: 0, availableCount: 0 },
  ]);
});

test("only returns the requested prize ids, in order", () => {
  const rows = [
    { draw_round_prize_id: "p3", status: "available" },
    { draw_round_prize_id: "p1", status: "available" },
  ];
  const result = aggregateNonVoidPrizeUnitCounts(["p1", "p2"], rows);
  assert.deepEqual(result.map((r) => r.prizeId), ["p1", "p2"]);
});
