import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/card-catalog-metadata.ts", import.meta.url),
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
const metadata = cjsModule.exports;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("exposes the requested catalog dropdown options", () => {
  assert.deepEqual(
    plain(metadata.catalogCategoryOptions.map((option) => option.label)),
    ["Single Cards", "Packs", "Boxes", "Cases", "Sets", "Supplies"],
  );
  assert.deepEqual(
    plain(metadata.cardConditionOptions.map((option) => option.label)),
    ["Sealed", "Raw", "Graded"],
  );
  assert.deepEqual(
    plain(metadata.gradingServiceOptions.map((option) => option.label)),
    ["PSA", "BGS", "CGC", "Other"],
  );
});

test("keeps the PSA grade dropdown in the image order", () => {
  assert.deepEqual(plain(metadata.cardGradeOptions), [
    "PSA 10 (Gem Mint)",
    "PSA 9 (Mint)",
    "PSA 8 (Near Mint-Mint)",
    "PSA 7 (Near Mint)",
    "PSA 6 (Excellent-Mint)",
    "PSA 5 (Excellent)",
    "PSA 4 (Very Good-Excellent)",
    "PSA 3 (Very Good)",
    "PSA 2 (Good)",
    "PSA 1 (Poor)",
    "PSA Authentic",
  ]);
});

test("normalizes blank and invalid metadata safely", () => {
  assert.equal(metadata.cardLanguageValue("japanese"), "japanese");
  assert.equal(metadata.cardLanguageValue("thai"), null);
  assert.equal(metadata.catalogCategoryValue("packs"), "packs");
  assert.equal(metadata.catalogCategoryValue("unknown"), "single_cards");
  assert.equal(metadata.cardConditionValue("graded"), "graded");
  assert.equal(metadata.cardConditionValue("unknown"), "raw");
  assert.equal(metadata.gradingServiceValue("psa"), "psa");
  assert.equal(metadata.gradingServiceValue("pgx"), null);
  assert.equal(metadata.cardGradeValue("PSA 10 (Gem Mint)"), "PSA 10 (Gem Mint)");
  assert.equal(metadata.cardGradeValue("Ungraded"), "");
  assert.equal(metadata.releaseYearValue("2024"), 2024);
  assert.equal(metadata.releaseYearValue("not-a-year"), null);
});
