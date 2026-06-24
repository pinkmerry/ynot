import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTsModule(path, cache = new Map()) {
  const moduleUrl = new URL(path, import.meta.url);
  const cacheKey = moduleUrl.href;
  const cached = cache.get(cacheKey);
  if (cached) return cached.exports;

  const source = readFileSync(moduleUrl, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const cjsModule = { exports: {} };
  cache.set(cacheKey, cjsModule);
  const localRequire = (specifier) => {
    if (specifier.startsWith(".")) {
      const childPath = specifier.endsWith(".ts") ? specifier : `${specifier}.ts`;
      return loadTsModule(new URL(childPath, moduleUrl).href, cache);
    }
    return require(specifier);
  };
  vm.runInNewContext(outputText, {
    exports: cjsModule.exports,
    module: cjsModule,
    require: localRequire,
  });
  return cjsModule.exports;
}

const bulkOpen = loadTsModule("../src/features/ynot/bulk-open.ts");

test("bulk open launch constants match the cost and UI contract", () => {
  assert.equal(bulkOpen.BULK_OPEN_HIGHLIGHT_LIMIT, 100);
  assert.equal(bulkOpen.BULK_OPEN_RESULTS_PAGE_SIZE_MAX, 1000);
  assert.equal(bulkOpen.BULK_OPEN_PROCESS_BUDGET_MAX, 1000);
  assert.deepEqual(Array.from(bulkOpen.bulkOpenActiveStatuses), [
    "queued",
    "processing",
    "retry_required",
  ]);
  assert.equal(bulkOpen.isBulkOpenActiveStatus("queued"), true);
  assert.equal(bulkOpen.isBulkOpenActiveStatus("completed"), false);
});

test("bulk open unknown statuses fail closed instead of pretending to start", () => {
  assert.equal(bulkOpen.normalizeBulkOpenStatus("mystery"), null);
  assert.equal(bulkOpen.toPublicBulkOpenSessionSummary({ status: "mystery" }), null);
});

test("bulk open result page size is capped for huge packs", () => {
  assert.equal(bulkOpen.normalizeBulkOpenResultsPageSize(undefined), 100);
  assert.equal(bulkOpen.normalizeBulkOpenResultsPageSize(0), 100);
  assert.equal(bulkOpen.normalizeBulkOpenResultsPageSize(250), 250);
  assert.equal(bulkOpen.normalizeBulkOpenResultsPageSize(9999), 1000);
  assert.equal(bulkOpen.normalizeBulkOpenResultsPageSize("700"), 700);
});

test("bulk open process budget is capped for worker cost control", () => {
  assert.equal(bulkOpen.normalizeBulkOpenProcessBudget(undefined), 1000);
  assert.equal(bulkOpen.normalizeBulkOpenProcessBudget(0), 1000);
  assert.equal(bulkOpen.normalizeBulkOpenProcessBudget(400), 400);
  assert.equal(bulkOpen.normalizeBulkOpenProcessBudget(5000), 1000);
  assert.equal(bulkOpen.normalizeBulkOpenProcessBudget("750"), 750);
});

test("bulk open customer summary exposes only safe public fields", () => {
  const summary = bulkOpen.toPublicBulkOpenSessionSummary({
    public_code: "BO-123",
    status: "processing",
    target_slots: 400000,
    processed_slots: 1234,
    open_items_awarded: 1200,
    collection_items_created: 1200,
    total_cost_snapshot: 400000,
    highlight_rewards_public: [
      {
        name: "Last Prize",
        imageUrl: "https://example.test/last.png",
        displayTier: "last_prize",
        valueThb: 9999,
        isLastPrize: true,
        rawSlotId: "secret-slot",
      },
    ],
    retry_scheduled_at: "2026-06-19T01:00:00Z",
    queue_job_id: "secret-queue",
    raw_slot_ids: ["secret-slot"],
    private_idempotency_key: "secret-key",
    pack_open_contract_hash_snapshot: "secret-hash",
    reward_weights: { high: 1 },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
    publicCode: "BO-123",
    status: "processing",
    statusLabel: "landing",
    totalPurchasedRewards: 400000,
    landedRewards: 1200,
    settlingRewards: 398800,
    percentComplete: 0.3,
    totalCostCoins: 400000,
    highlights: [
      {
        name: "Last Prize",
        imageUrl: "https://example.test/last.png",
        displayTier: "last_prize",
        valueThb: 9999,
        isLastPrize: true,
      },
    ],
  });
  const serialized = JSON.stringify(summary);
  for (const forbidden of [
    "rawSlotId",
    "queue_job_id",
    "raw_slot_ids",
    "private_idempotency_key",
    "pack_open_contract_hash_snapshot",
    "reward_weights",
    "secret",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} leaked`);
  }
});

test("bulk open highlight DTO is capped and prioritizes Last Prize safely", () => {
  const highlights = [
    { name: "Bronze", displayTier: "bronze", valueThb: 10 },
    { name: "Rainbow", displayTier: "rainbow", valueThb: 1000 },
    { name: "Last", displayTier: "last_prize", valueThb: 5000, isLastPrize: true },
    ...Array.from({ length: 150 }, (_, index) => ({
      name: `Reward ${index}`,
      displayTier: "silver",
      valueThb: index,
    })),
  ];
  const publicHighlights = bulkOpen.toPublicBulkOpenHighlights(highlights);

  assert.equal(publicHighlights.length, 100);
  assert.equal(publicHighlights[0].isLastPrize, true);
  assert.equal(publicHighlights[1].displayTier, "rainbow");
  assert.deepEqual(Object.keys(publicHighlights[0]).sort(), [
    "displayTier",
    "imageUrl",
    "isLastPrize",
    "name",
    "valueThb",
  ]);
});

test("bulk open highlights treat explicit Last Prize flag as highest priority", () => {
  const publicHighlights = bulkOpen.toPublicBulkOpenHighlights([
    { name: "Rainbow", displayTier: "rainbow", valueThb: 1000 },
    { name: "Flagged Last Prize", displayTier: "bronze", valueThb: 5, isLastPrize: true },
  ]);

  assert.equal(publicHighlights[0].name, "Flagged Last Prize");
  assert.equal(publicHighlights[0].displayTier, "last_prize");
  assert.equal(publicHighlights[0].isLastPrize, true);
});
