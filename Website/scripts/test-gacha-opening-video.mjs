import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function sectionBetween(source, startPattern, endPattern, label) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `${label} start exists`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `${label} end exists`);
  return rest.slice(0, end);
}

function loadTsModule(path) {
  const source = read(path);
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
  return cjsModule.exports;
}

test("gacha overlay remains downstream of one settled normal-open result", () => {
  const client = read("src/features/ynot/client.tsx");
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  const fireOpen = sectionBetween(
    client,
    /function fireOpen\b/,
    /function openAgain\b/,
    "fireOpen",
  );
  const normalOverlay = sectionBetween(
    client,
    /const revealOverlay =/,
    /const pullAllOverlay =/,
    "normal reveal overlay",
  );

  assert.equal(
    (fireOpen.match(/postJson\("\/api\/ynot\/gacha\/open"/g) ?? []).length,
    1,
  );
  assert.match(fireOpen, /setRevealResult\(result\)/);
  assert.match(fireOpen, /applyWalletBalanceCoins/);
  assert.match(fireOpen, /setRemainingState/);
  assert.match(normalOverlay, /result=\{revealResult\}/);
  assert.match(normalOverlay, /quantity=\{quantity\}/);
  assert.doesNotMatch(overlay, /postJson\(|fetch\(|createServiceSupabaseClient/);
});

test("normal and Pull All keep one shared final-result overlay", () => {
  const client = read("src/features/ynot/client.tsx");
  const normalOverlay = sectionBetween(
    client,
    /const revealOverlay =/,
    /const pullAllOverlay =/,
    "normal reveal overlay",
  );
  const pullAllOverlay = sectionBetween(
    client,
    /const pullAllOverlay =/,
    /const pendingOverlay =/,
    "Pull All reveal overlay",
  );

  assert.match(normalOverlay, /<GachaRevealOverlay/);
  assert.match(normalOverlay, /tierAnimations=\{tierAnimations\}/);
  assert.match(pullAllOverlay, /<GachaRevealOverlay/);
  assert.match(pullAllOverlay, /result=\{pullAllRevealOverlayResult\}/);
  assert.match(pullAllOverlay, /displayQuantity=\{pullAllRevealSession\.totalPurchasedRewards\}/);
  assert.match(pullAllOverlay, /tierAnimations=\{tierAnimations\}/);
});

test("final prize summary retains result, tier, Last Prize, and actions", () => {
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  const summary = sectionBetween(
    overlay,
    /\{stage === "summary"/,
    /\{stage !== "summary"/,
    "final prize summary",
  );

  assert.match(summary, /tierLabel\(highestTier, language\)/);
  assert.match(summary, /items\.map\(\(item\)/);
  assert.match(summary, /className="gacha-reveal-card-image"/);
  assert.match(summary, /item\.isLastPrize === true/);
  assert.match(summary, /LAST ONE PRIZE!/);
  assert.match(summary, /onOpenAgain\?\.\(option\.quantity\)/);
  assert.match(summary, /onPullAllAgain\?\.\(\)/);
  assert.match(summary, /onClick=\{onFinish\}/);
  assert.match(summary, /onClick=\{onClose\}/);
});
