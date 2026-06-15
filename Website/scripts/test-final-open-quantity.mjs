import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadOpenQuantityModule() {
  const source = readFileSync(
    new URL("../src/features/ynot/open-quantity.ts", import.meta.url),
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
    exports: cjsModule.exports,
    module: cjsModule,
    require,
  });
  return cjsModule.exports;
}

const openQuantity = loadOpenQuantityModule();

test("exports shared final-open quantity helpers", () => {
  assert.equal(typeof openQuantity.openQuantityLimit, "function");
  assert.equal(typeof openQuantity.isOpenQuantityAvailable, "function");
});

test("allows x10 when nine normal win slots plus one final prize fill the final ten slots", () => {
  const inventory = {
    remainingSlots: 10,
    normalOpenableWinSlots: 9,
    finalPrizeAvailableUnits: 1,
  };

  assert.equal(openQuantity.openQuantityLimit(inventory), 10);
  assert.equal(openQuantity.isOpenQuantityAvailable(10, inventory), true);
});

test("allows x100 when ninety-nine normal win slots plus one final prize fill the final hundred slots", () => {
  const inventory = {
    remainingSlots: 100,
    normalOpenableWinSlots: 99,
    finalPrizeAvailableUnits: 1,
  };

  assert.equal(openQuantity.openQuantityLimit(inventory), 100);
  assert.equal(openQuantity.isOpenQuantityAvailable(100, inventory), true);
});

test("blocks x100 when only ninety-nine normal win slots and one final prize exist but more than one hundred slots remain", () => {
  const inventory = {
    remainingSlots: 150,
    normalOpenableWinSlots: 99,
    finalPrizeAvailableUnits: 1,
  };

  assert.equal(openQuantity.openQuantityLimit(inventory), 99);
  assert.equal(openQuantity.isOpenQuantityAvailable(100, inventory), false);
});

test("uses eligible public inventory as the safest aggregate limit", () => {
  assert.equal(
    openQuantity.openQuantityLimit({
      remainingSlots: 10,
      eligibleUnits: 9,
      availableWinSlots: 10,
      availablePrizeUnits: 10,
    }),
    9,
  );

  assert.equal(
    openQuantity.openQuantityLimit({
      remainingSlots: 10,
      eligibleUnits: 10,
      availableWinSlots: 10,
      availablePrizeUnits: 10,
    }),
    10,
  );
});

test("treats missing public inventory as unbounded and negative counts as closed", () => {
  assert.equal(openQuantity.openQuantityLimit({}), Number.POSITIVE_INFINITY);
  assert.equal(
    openQuantity.openQuantityLimit({
      remainingSlots: undefined,
      eligibleUnits: undefined,
      availableWinSlots: undefined,
      availablePrizeUnits: undefined,
    }),
    Number.POSITIVE_INFINITY,
  );
  assert.equal(
    openQuantity.openQuantityLimit({
      remainingSlots: 10,
    }),
    0,
  );

  assert.equal(
    openQuantity.openQuantityLimit({
      remainingSlots: 10,
      eligibleUnits: -1,
      availableWinSlots: 10,
      availablePrizeUnits: 10,
    }),
    0,
  );
  assert.equal(
    openQuantity.openQuantityLimit({
      remainingSlots: -1,
      eligibleUnits: 10,
      availableWinSlots: 10,
      availablePrizeUnits: 10,
    }),
    0,
  );
  assert.equal(
    openQuantity.openQuantityLimit({
      remainingSlots: 10,
      normalOpenableWinSlots: -1,
      finalPrizeAvailableUnits: 1,
    }),
    0,
  );
});

test("pull-all of N remaining is allowed when N normal win slots plus one last prize fill them", () => {
  const inventory = { remainingSlots: 10, normalOpenableWinSlots: 10, finalPrizeAvailableUnits: 1 };
  assert.equal(openQuantity.openQuantityLimit(inventory), 10);
  assert.equal(openQuantity.isOpenQuantityAvailable(10, inventory), true);
});

test("pull-all of N remaining is allowed with no last prize when N normal win slots exist", () => {
  const inventory = { remainingSlots: 10, normalOpenableWinSlots: 10, finalPrizeAvailableUnits: 0 };
  assert.equal(openQuantity.openQuantityLimit(inventory), 10);
});

test("pull-all is capped at available when normal stock is short and no last prize", () => {
  const inventory = { remainingSlots: 10, normalOpenableWinSlots: 7, finalPrizeAvailableUnits: 0 };
  assert.equal(openQuantity.openQuantityLimit(inventory), 7);
});

test("inventory summary counts Last Prize only when aggregates can finish the pack", () => {
  const migrationsDir = new URL(
    "../../Database/supabase/migrations/",
    import.meta.url,
  );
  const migrationName = readdirSync(migrationsDir)
    .filter((name) => name.endsWith("_last_prize_final_quantity_summary.sql"))
    .sort()
    .at(-1);
  assert.ok(migrationName, "missing last prize final quantity migration");
  const sql = readFileSync(new URL(migrationName, migrationsDir), "utf8");

  assert.match(sql, /last_prize_available_units/);
  assert.match(
    sql,
    /ri\.remaining_slots <= coalesce\(nwc\.available_win_slots, 0\) \+ coalesce\(lpc\.last_prize_available_units, 0\)/,
  );
  assert.match(
    sql,
    /ri\.remaining_slots <= coalesce\(nwc\.eligible_win_slots, 0\) \+ coalesce\(lpc\.last_prize_available_units, 0\)/,
  );
  assert.match(sql, /'availableWinSlots', pc\.public_available_win_slots/);
  assert.match(sql, /'eligibleUnits', pc\.public_eligible_units/);
  assert.doesNotMatch(sql, /'lastPrizeMetadata'/);
  assert.doesNotMatch(sql, /'stockUnitGroupKey'/);
  assert.doesNotMatch(sql, /'unlockAtSoldPct'/);
});
