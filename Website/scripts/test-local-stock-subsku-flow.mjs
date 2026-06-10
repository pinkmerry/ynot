import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/local-stock-subsku-mock.ts", import.meta.url),
  "utf8",
);
const componentSource = readFileSync(
  new URL("../src/features/ynot/LocalStockSubSkuTest.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../src/app/(store)/local-stock-subsku-test/page.tsx", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
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
const helpers = cjsModule.exports;

test("local stock mock counts box and loose pack equivalent", () => {
  const totals = helpers.localStockSubSkuTotals(
    helpers.localStockSubSkuInitialState,
  );
  assert.equal(totals.availableBoxes, 2);
  assert.equal(totals.availableLoosePacks, 10);
  assert.equal(totals.boxPackEquivalent, 48);
  assert.equal(totals.availablePackEquivalent, 58);
});

test("selling three packs decrements total packs and creates image-backed rewards", () => {
  const next = helpers.openLocalStockPacks(
    helpers.localStockSubSkuInitialState,
    3,
  );
  const totals = helpers.localStockSubSkuTotals(next);
  assert.equal(totals.availableBoxes, 2);
  assert.equal(totals.availableLoosePacks, 7);
  assert.equal(totals.availablePackEquivalent, 55);
  assert.equal(totals.soldPackCount, 3);
  assert.equal(next.bag.length, 3);
  assert.equal(next.history.length, 3);
  assert.ok(next.history.every((reward) => reward.imageUrl));
  assert.ok(
    next.history.every(
      (reward) => reward.sourceStockSku === helpers.localStockSubSkus.pack.sku,
    ),
  );
});

test("opening a box converts exactly twenty four child packs", () => {
  const sold = helpers.openLocalStockPacks(
    helpers.localStockSubSkuInitialState,
    3,
  );
  const opened = helpers.openLocalStockBoxes(sold, 1);
  const totals = helpers.localStockSubSkuTotals(opened);
  assert.equal(totals.availableBoxes, 1);
  assert.equal(totals.availableLoosePacks, 31);
  assert.equal(totals.availablePackEquivalent, 55);
  assert.equal(totals.openedBoxCount, 1);
});

test("selling packs auto opens a box when loose packs are short", () => {
  const state = {
    ...helpers.localStockSubSkuInitialState,
    boxStock: 1,
    loosePackStock: 1,
    openedBoxCount: 0,
    soldPackCount: 0,
    pullNumber: 0,
    bag: [],
    history: [],
    events: [],
  };
  const next = helpers.openLocalStockPacks(state, 3);
  const totals = helpers.localStockSubSkuTotals(next);
  assert.equal(totals.availableBoxes, 0);
  assert.equal(totals.availableLoosePacks, 22);
  assert.equal(totals.availablePackEquivalent, 22);
  assert.equal(totals.soldPackCount, 3);
  assert.equal(totals.openedBoxCount, 1);
});

test("localhost page uses production-like customer and admin surfaces", () => {
  assert.match(pageSource, /<Shell>/);
  assert.match(componentSource, /GachaRevealOverlay/);
  assert.match(componentSource, /forceAnimation/);
  assert.match(componentSource, /Customer production flow/);
  assert.match(componentSource, /Admin production flow/);
  assert.match(componentSource, /cr-detail-hero-art/);
  assert.match(componentSource, /cr-dock/);
  assert.match(componentSource, /admin-panel soft-card/);
  assert.match(componentSource, /Detail page · opening reveal · user bag · all pulls/);
});
