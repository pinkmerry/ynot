import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
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

function between(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${label}`);
  return source.slice(startIndex, endIndex);
}

const directCustomerStockUnitRead =
  /\.from\("card_stock_units"\)[\s\S]*?\.select\([\s\S]*?\)[\s\S]*?\.in\("id",\s*(?!batch\b)[^)]+\)/;

const openQuantity = loadTsModule("../src/features/ynot/open-quantity.ts");
const openRoute = read("../src/app/api/ynot/gacha/open/route.ts");
const client = read("../src/features/ynot/client.tsx");
const revealOverlay = read("../src/features/ynot/GachaRevealOverlay.tsx");
const pullAllQuoteRoute = read("../src/app/api/ynot/gacha/bulk-open/quote/route.ts");
const pullAllStartRoute = read("../src/app/api/ynot/gacha/bulk-open/start/route.ts");
const pullAllClient = read("../src/features/ynot/pull-all-client.ts");
const pullAllConfirmModal = read("../src/features/ynot/cr/PullAllConfirmModal.tsx");
const walletSnapshotHelper = read("../src/lib/ynot/wallet-snapshot.ts");
const data = read("../src/features/ynot/data.ts");
const profileRewardsTabs = read("../src/features/ynot/ProfileRewardsTabs.tsx");
const components = read("../src/features/ynot/components.tsx");
const crHistory = read("../src/features/ynot/cr/HistoryExperience.tsx");
const crAllPulls = read("../src/features/ynot/cr/AllPullsExperience.tsx");
const prizeTier = read("../src/features/ynot/prize-tier.ts");
const ynotTypes = read("../src/features/ynot/types.ts");
const stockSkuPresentation = read("../src/features/ynot/stock-sku-presentation.ts");
const stockSkuUsage = read("../src/features/ynot/stock-sku-usage.ts");
const stockSkuRoute = read("../src/app/api/ynot/admin/stock-skus/route.ts");
const cardStockRoute = read("../src/app/api/ynot/admin/card-stock/route.ts");
const openRpc = read("../../Database/supabase/migrations/20260605210000_last_prize_final_slot.sql");
const subSkuRevealImageMigration = read(
  "../../Database/supabase/migrations/20260606020000_open_gacha_subsku_reveal_image.sql",
);
const stockImageProofMigration = read(
  "../../Database/supabase/migrations/20260607011450_open_gacha_stock_image_proof.sql",
);
const replayRemainingMigration = read(
  "../../Database/supabase/migrations/20260607074906_open_gacha_replay_remaining.sql",
);
const finalQuantitySummaryMigration = read(
  "../../Database/supabase/migrations/20260611102846_last_prize_final_quantity_summary.sql",
);
const lastPrizeBonusMigration = read(
  "../../Database/supabase/migrations/20260612090000_last_prize_bonus_award.sql",
);
const collectionLinkMigration = read(
  "../../Database/supabase/migrations/20260605223000_collection_item_stock_unit_last_prize.sql",
);
const stockSkuMigration = read(
  "../../Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql",
);
const globalStockMigration = read(
  "../../Database/supabase/migrations/20260514045933_global_card_inventory_owner_approval.sql",
);

const pullQuantities = [1, 10, 100];

function advancePublicRemaining(state, quantity) {
  return {
    remainingSlots: Math.max(0, state.remainingSlots - quantity),
    eligibleUnits: Math.max(0, state.eligibleUnits - quantity),
    availableWinSlots: Math.max(0, state.availableWinSlots - quantity),
    availablePrizeUnits: Math.max(0, state.availablePrizeUnits - quantity),
  };
}

test("pack open API sends x1, x10, and x100 pulls to one protected RPC call", () => {
  const postHandler = between(
    openRoute,
    "export async function POST",
    "return Response.json({ result: toPublicOpenResult",
    "open API POST handler",
  );
  const fireOpen = between(
    client,
    "function fireOpen",
    "function openAgain",
    "client fireOpen handler",
  );

  assert.deepEqual(Array.from(openQuantity.allowedOpenQuantityOptions), pullQuantities);
  assert.match(postHandler, /const quantity = Number\(body\?\.quantity \?\? 1\)/);
  assert.match(postHandler, /quantity < 1 \|\| quantity > 100/);
  assert.match(postHandler, /normalizeIdempotencyKey\(body\?\.idempotencyKey\)/);
  assert.match(postHandler, /scope,\s*\{\s*limit:[\s\S]*cost: quantity/);
  assert.match(
    postHandler,
    /supabase\.rpc\("open_gacha_campaign", \{ p_profile_id: session\.profileId, p_draw_round_id: resolvedCampaignId, p_quantity: quantity, p_idempotency_key: idempotencyKey \}\)/,
  );
  assert.doesNotMatch(postHandler, /for \(const chunk of chunks\)|openQuantityChunks|mergeOpenResults/);

  assert.match(fireOpen, /postJson\("\/api\/ynot\/gacha\/open"/);
  assert.match(fireOpen, /quantity: targetQuantity/);
  assert.match(
    fireOpen,
    /openIntentIdempotencyKey\(\s*intentId \?\? openIntentId \?\? null,\s*campaign\.id,\s*targetQuantity/s,
  );
  assert.doesNotMatch(fireOpen, /for \(const chunk of chunks\)|Promise\.all/);

  assert.match(openRpc, /open_quantity_options integer\[\] := array\[1, 10, 100\]/);
  assert.match(openRpc, /if not p_quantity = any\(open_quantity_options\) then[\s\S]*invalid_open_quantity_option/);
  assert.match(openRpc, /total_cost :=[\s\S]*\* p_quantity;/);
  assert.match(openRpc, /for position_index in 1\.\.p_quantity loop/);
  assert.match(openRpc, /available_slot_count < p_quantity/);
});

test("normal pack opens debit exactly quantity cost and replay before wallet mutation", () => {
  const openFunctionStart = openRpc.lastIndexOf("create or replace function public.open_gacha_campaign");
  assert.notEqual(openFunctionStart, -1, "missing latest open_gacha_campaign function");
  const openFunction = openRpc.slice(openFunctionStart);
  const replayIndex = openFunction.indexOf("if p_idempotency_key is not null then");
  const campaignIndex = openFunction.indexOf("select * into campaign");
  const costIndex = openFunction.indexOf("total_cost :=");
  const openInsertIndex = openFunction.indexOf("insert into public.gacha_opens");
  const ledgerIndex = openFunction.indexOf("insert into public.coin_ledger");
  const walletUpdateIndex = openFunction.indexOf("update public.wallet_accounts");

  assert.ok(replayIndex >= 0, "open RPC must have an idempotency replay branch");
  assert.ok(replayIndex < campaignIndex, "replay must happen before campaign locking");
  assert.ok(replayIndex < costIndex, "replay must happen before cost calculation");
  assert.ok(replayIndex < ledgerIndex, "replay must happen before ledger debit");
  assert.ok(replayIndex < walletUpdateIndex, "replay must happen before wallet update");

  assert.match(openFunction, /where profile_id = p_profile_id[\s\S]*and idempotency_key = p_idempotency_key/);
  assert.match(openFunction, /'replayed', true/);
  assert.match(openFunction, /total_cost := coalesce\(campaign\.cost_coins,[\s\S]*\* p_quantity;/);
  assert.ok(costIndex < openInsertIndex, "cost must be frozen on the open row before rewards are awarded");
  assert.ok(openInsertIndex < ledgerIndex, "ledger must reference the committed open row");
  assert.match(openFunction, /values \([\s\S]*total_cost,[\s\S]*p_quantity,[\s\S]*p_idempotency_key,[\s\S]*jsonb_build_object/);
  assert.match(openFunction, /'gacha_spend'[\s\S]*-total_cost[\s\S]*locked_wallet\.balance_coins[\s\S]*locked_wallet\.balance_coins - total_cost/);
  assert.match(openFunction, /set balance_coins = balance_coins - total_cost,\s*version = version \+ 1/);
  assert.match(openFunction, /'costCoins', total_cost/);
});

test("preview open mock uses the same public stock-image projection as reveal hydration", () => {
  assert.match(openRoute, /async function previewImageByPrizeId/);
  assert.match(openRoute, /PREVIEW_STOCK_UNIT_IMAGE_BATCH_SIZE\s*=\s*100/);
  assert.match(openRoute, /\.from\("draw_round_prize_units"\)[\s\S]*\.select\("draw_round_prize_id,card_stock_unit_id"\)/);
  assert.match(openRoute, /index \+= PREVIEW_STOCK_UNIT_IMAGE_BATCH_SIZE/);
  assert.match(openRoute, /stockUnitIds\.slice\([\s\S]*index \+ PREVIEW_STOCK_UNIT_IMAGE_BATCH_SIZE/);
  assert.match(openRoute, /\.from\("card_stock_units"\)[\s\S]*\.select\("id,image_url"\)/);
  assert.match(openRoute, /const prizeImageById = await previewImageByPrizeId/);
  assert.match(
    openRoute,
    /imageUrl:\s*publicRewardImageUrl\(prizeImageById\.get\(prize\.id\),\s*card\?\.imageUrl\)/,
  );
});

test("first and repeated pull choices stay valid for x1, x10, and x100 while stock remains", () => {
  const panel = between(
    client,
    "export function GachaOpenPanel",
    "const pullAllRevealActive =",
    "GachaOpenPanel state and handlers",
  );
  const openAgain = between(
    client,
    "function openAgain",
    "function handleRevealClose",
    "openAgain handler",
  );

  for (const quantity of pullQuantities) {
    let remaining = {
      remainingSlots: quantity * 2,
      eligibleUnits: quantity * 2,
      availableWinSlots: quantity * 2,
      availablePrizeUnits: quantity * 2,
    };

    assert.equal(
      openQuantity.isOpenQuantityAvailable(quantity, remaining),
      true,
      `x${quantity} first pull should be available`,
    );
    remaining = advancePublicRemaining(remaining, quantity);
    assert.equal(
      openQuantity.isOpenQuantityAvailable(quantity, remaining),
      true,
      `x${quantity} repeated pull should still be available after one result`,
    );
    remaining = advancePublicRemaining(remaining, quantity);
    assert.equal(
      openQuantity.isOpenQuantityAvailable(quantity, remaining),
      false,
      `x${quantity} should disable only when no stock remains`,
    );
  }

  assert.match(panel, /const \[remainingState,\s*setRemainingState\]\s*=\s*useState/);
  assert.match(panel, /campaign\.remainingSlots/);
  assert.match(panel, /campaign\.eligiblePrizeUnits/);
  assert.match(panel, /campaign\.availablePrizeUnits/);
  assert.match(panel, /if \(result\.remaining\) \{/);
  assert.match(panel, /setRemainingState\(\(current\) => \(\{[\s\S]*\.\.\.current,[\s\S]*\.\.\.result\.remaining/s);
  assert.match(panel, /const openAgainOptions = openQuantityOptions\.map/);
  assert.match(panel, /const pullAllRepeatOption =/);
  assert.match(panel, /kind: "pull_all"/);
  assert.match(panel, /disabled: quantityDisabled\(option\)/);
  assert.match(client, /onPullAllAgain=\{openPullAllAgain\}/);
  assert.match(revealOverlay, /kind\?: "normal" \| "pull_all"/);
  assert.match(revealOverlay, /onPullAllAgain\?: \(\) => void/);
  assert.match(revealOverlay, /option\.kind === "pull_all"/);
  assert.match(openAgain, /if \(openRequestInFlightRef\.current\) return/);
  assert.match(openAgain, /setRevealResult\(null\)/);
  assert.match(openAgain, /fireOpen\(nextQuantity,\s*createOpenIntentId\(\)\)/);
  assert.match(replayRemainingMigration, /get_draw_round_inventory_summary\(existing_open\.draw_round_id, p_profile_id\)/);
});

test("pack open and Pull All keep wallet balance fresh without full page reload", () => {
  assert.match(walletSnapshotHelper, /from\("wallet_accounts"\)/);
  assert.match(walletSnapshotHelper, /select\("balance_coins,version"\)/);
  assert.match(walletSnapshotHelper, /LOCAL_PREVIEW_WALLET_BALANCE/);

  assert.match(openRoute, /readWalletSnapshot\(session\.profileId\)/);
  assert.match(openRoute, /return Response\.json\(\{\s*result: toPublicOpenResult\(raw, resultItems\),\s*wallet/s);

  assert.match(pullAllQuoteRoute, /readWalletSnapshot\(session\.profileId\)/);
  assert.match(pullAllQuoteRoute, /wallet:\s*await readWalletSnapshot\(session\.profileId\)/);
  assert.match(pullAllStartRoute, /readWalletSnapshot\(session\.profileId\)/);
  assert.match(pullAllStartRoute, /wallet:\s*await readWalletSnapshot\(session\.profileId\)/);

  assert.match(pullAllClient, /export type PublicWalletSnapshot/);
  assert.match(pullAllClient, /walletFromPayload\(payload\)/);
  assert.match(pullAllClient, /wallet: walletFromPayload\(payload\)/);

  assert.match(pullAllConfirmModal, /onWalletSnapshot\?: \(wallet: PublicWalletSnapshot\) => void/);
  assert.match(pullAllConfirmModal, /onWalletSnapshot\?\.\(nextQuote\.wallet\)/);
  assert.match(pullAllConfirmModal, /onWalletSnapshot\?\.\(session\.wallet\)/);

  assert.match(client, /sourceBalanceCoins: number/);
  assert.match(client, /walletBalanceOverride\?\.sourceBalanceCoins === balanceCoins/);
  assert.match(client, /applyWalletBalanceCoins\(publicWalletBalance\(payload\.wallet, walletBalanceCoins\)\)/);
  assert.match(client, /balanceCoins=\{walletBalanceCoins\}/);
  assert.match(client, /onWalletSnapshot=\{handlePullAllWalletSnapshot\}/);
});

test("final-prize exact-left boundaries allow x1, x10, and x100 when the request empties the pack", () => {
  const finalCases = [
    { quantity: 1, remainingSlots: 1, normalOpenableWinSlots: 0 },
    { quantity: 10, remainingSlots: 10, normalOpenableWinSlots: 9 },
    { quantity: 100, remainingSlots: 100, normalOpenableWinSlots: 99 },
  ];

  for (const testCase of finalCases) {
    const inventory = {
      remainingSlots: testCase.remainingSlots,
      normalOpenableWinSlots: testCase.normalOpenableWinSlots,
      finalPrizeAvailableUnits: 1,
    };
    assert.equal(
      openQuantity.openQuantityLimit(inventory),
      testCase.quantity,
      `x${testCase.quantity} should be within final-prize-aware limit`,
    );
    assert.equal(
      openQuantity.isOpenQuantityAvailable(testCase.quantity, inventory),
      true,
      `x${testCase.quantity} should be openable at exact final boundary`,
    );
  }

  assert.match(openRpc, /last_prize_needed := campaign\.last_prize_card_id is not null[\s\S]*available_slot_count <= p_quantity;/);
  assert.match(openRpc, /available_unit_count < normal_units_needed/);
  assert.match(openRpc, /if last_prize_needed and lp_collection_item_id is null and sold_pct >= 100 then/);
  assert.doesNotMatch(openRpc, /last_prize_needed[\s\S]{0,160}p_quantity\s*=\s*1/);
  assert.match(lastPrizeBonusMigration, /normal_units_needed := p_quantity;/);
  assert.match(lastPrizeBonusMigration, /last_prize_substitutes boolean := false/);
  assert.match(lastPrizeBonusMigration, /if lp_bonus_item is not null then/);
  assert.match(
    lastPrizeBonusMigration,
    /'position', case when last_prize_substitutes then position_index else p_quantity \+ 1 end/,
  );
  assert.match(finalQuantitySummaryMigration, /last_prize_available_units/);
  assert.match(finalQuantitySummaryMigration, /ri\.remaining_slots <= coalesce\(nwc\.available_win_slots, 0\) \+ coalesce\(lpc\.last_prize_available_units, 0\)/);
});

test("Last Prize stays first-class in public reveal, history, and collection display", () => {
  const historySource = between(
    data,
    "export async function getGachaOpenHistory",
    "export async function getExchanges",
    "pull history loader",
  );
  const collectionSource = between(
    data,
    "export async function getCollection",
    "export async function getGachaOpenHistory",
    "collection loader",
  );

  assert.match(prizeTier, /export type PublicPrizeDisplayTier = PrizeDisplayTier \| "last_prize"/);
  assert.match(prizeTier, /export function publicPrizeDisplayTierValue/);
  assert.match(prizeTier, /if \(value === "last_prize"\) return "last_prize"/);
  assert.match(prizeTier, /label: "Last Prize"/);
  assert.match(prizeTier, /export function publicPrizeDisplayTierOrder/);
  assert.match(prizeTier, /if \(tier === "last_prize"\) return -1/);
  assert.match(prizeTier, /export function highestPublicPrizeDisplayTier/);

  assert.match(ynotTypes, /export type YnotPublicPrizeDisplayTier =[\s\S]*"last_prize"/);
  assert.match(ynotTypes, /sourceIsLastPrize\?: boolean/);
  assert.match(ynotTypes, /isLastPrize\?: boolean/);
  assert.match(ynotTypes, /displayTier: YnotPublicPrizeDisplayTier/);

  assert.match(revealOverlay, /highestPublicPrizeDisplayTier/);
  assert.match(revealOverlay, /publicPrizeDisplayTierOrder/);
  assert.match(revealOverlay, /tier === "last_prize" \|\| tier === "rainbow"/);
  assert.match(revealOverlay, /highestTier === "last_prize" \? null : findTierAnimation/);
  assert.match(revealOverlay, /LAST ONE PRIZE!/);

  assert.match(collectionSource, /publicPrizeDisplayTierValue\(sourceOpenItem\.tier\)/);
  assert.match(collectionSource, /const sourceIsLastPrize = sourcePrizeTier === "last_prize"/);
  assert.match(collectionSource, /sourceIsLastPrize,/);
  assert.match(historySource, /publicPrizeDisplayTierValue\(item\.tier\)/);
  assert.match(historySource, /isLastPrize: displayTier === "last_prize"/);

  assert.match(profileRewardsTabs, /item\.sourceIsLastPrize \? "LAST PRIZE"/);
  assert.match(profileRewardsTabs, /reward\.isLastPrize \? "Last Prize"/);
  assert.match(components, /collection-last-prize-badge/);
  assert.match(crHistory, /sourceTier === "last_prize"/);
  assert.match(crHistory, /return "last_prize"/);
  assert.match(crHistory, /if \(tier === "last_prize"\) return "LAST PRIZE"/);
  assert.match(crAllPulls, /sourceTier === "last_prize"/);
  assert.match(crAllPulls, /t === "last_prize"/);
  assert.match(crAllPulls, /last_prize: 5/);
});

test("pulled prize images use the awarded stock-unit image in animation, summary, bag, and history", () => {
  const routeHydration = between(
    openRoute,
    "async function hydrateItems",
    "// Dev-only mock pull",
    "open item hydration",
  );
  const spotlight = between(
    revealOverlay,
    "{stage === \"spotlight\" && (",
    "{stage === \"summary\" && (",
    "spotlight animation stage",
  );
  const summary = between(
    revealOverlay,
    "{stage === \"summary\" && (",
    "</footer>",
    "summary stage",
  );
  const collectionSource = between(
    data,
    "export async function getCollection",
    "export async function getGachaOpenHistory",
    "collection loader",
  );
  const historySource = between(
    data,
    "export async function getGachaOpenHistory",
    "export async function getExchanges",
    "pull history loader",
  );
  const shippingSource = between(
    data,
    "export async function getShipping",
    "export async function getAddresses",
    "shipping loader",
  );

  assert.match(subSkuRevealImageMigration, /coalesce\(stock\.image_url, cards\.image_url\)/);
  assert.match(stockImageProofMigration, /imageResolvedFromStockUnit/);
  assert.match(routeHydration, /stockImageUrlByPrizeUnitId/);
  assert.match(routeHydration, /\.from\("draw_round_prize_units"\)[\s\S]*\.select\("id,card_stock_unit_id,status"\)/);
  assert.match(routeHydration, /\.from\("card_stock_units"\)[\s\S]*\.select\("id,image_url"\)/);
  assert.match(routeHydration, /imageUrl:\s*publicRewardImageUrl\(stockImageUrl,\s*item\.imageUrl\s*\?\?\s*card\?\.image_url\s*\?\?\s*null,?\s*\)/);
  assert.match(routeHydration, /if \(item\.isLastPrize === true\)[\s\S]*displayTier: "last_prize"/);

  assert.match(revealOverlay, /const featuredItemImageUrl =[\s\S]*featuredItem\?\.imageUrl/);
  assert.match(spotlight, /src=\{featuredItemImageUrl\}/);
  assert.match(summary, /const itemImageUrl =[\s\S]*item\.imageUrl/);
  assert.match(summary, /className="gacha-reveal-card-image"[\s\S]*src=\{itemImageUrl\}/);

  assert.match(collectionLinkMigration, /card_stock_unit_id uuid[\s\S]*references public\.card_stock_units/);
  assert.match(collectionLinkMigration, /gacha_open_item_id uuid[\s\S]*references public\.gacha_open_items/);
  assert.match(collectionSource, /\.from\("collection_items"\)/);
  assert.match(collectionSource, /\.from\("gacha_open_items"\)[\s\S]*\.select\(\s*"id,gacha_open_id,card_id,draw_round_prize_id,tier,value_thb,result_position,bundle_quantity"/);
  assert.match(collectionSource, /\.from\("draw_round_prize_units"\)[\s\S]*\.select\("collection_item_id,gacha_open_item_id,card_stock_unit_id"\)/);
  assert.match(
    data,
    /readCardStockUnitRowsByIds<\{[\s\S]*id: string;[\s\S]*card_id: string \| null;[\s\S]*image_url: string \| null;[\s\S]*\}>/,
    "pull contract hydration should use the batched stock-unit reader",
  );
  assert.match(collectionSource, /imageUrl:\s*publicSubSkuImageUrl\(wonUnit\?\.imageUrl,\s*card\?\.photoUrl\)/);

  assert.match(historySource, /stockImageUrlByOpenItemId/);
  assert.match(historySource, /gacha_history_collection_stock_links/);
  assert.match(historySource, /\.from\("collection_items"\)[\s\S]*\.select\("gacha_open_item_id,card_stock_unit_id"\)/);
  assert.match(
    historySource,
    /readCardStockUnitRowsByIds<\{\s*id: string;\s*card_id: string \| null;\s*image_url: string \| null;\s*\}>\([\s\S]*"gacha_history_stock_unit_images"[\s\S]*"id,card_id,image_url"/,
  );
  assert.match(historySource, /collectionImageByOpenItemId\.get\(item\.id\) \?\?[\s\S]*rewardImageByOpenItemId\.get\(item\.id\)/);
  assert.match(
    historySource,
    /imageUrl:\s*publicSubSkuImageUrl\(\s*collectionImageByOpenItemId\.get\(item\.id\) \?\?[\s\S]*rewardImageByOpenItemId\.get\(item\.id\),\s*card\?\.photoUrl,?\s*\)/,
  );
  assert.doesNotMatch(collectionSource, directCustomerStockUnitRead);
  assert.doesNotMatch(historySource, directCustomerStockUnitRead);
  assert.doesNotMatch(shippingSource, directCustomerStockUnitRead);
});

test("awards land in user bag with exact open item, prize unit, collection item, and bundle links", () => {
  const collectionSource = between(
    data,
    "export async function getCollection",
    "export async function getGachaOpenHistory",
    "collection loader",
  );
  const normalOpenItemInsert = between(
    openRpc,
    "-- bundle_quantity_snapshot",
    "returning id into open_item_id",
    "normal prize open item insert",
  );

  assert.match(openRpc, /insert into public\.gacha_open_items\(/);
  assert.match(openRpc, /returning id into open_item_id/);
  assert.match(openRpc, /insert into public\.collection_items\(/);
  assert.match(openRpc, /returning id into new_collection_item_id/);
  assert.match(openRpc, /update public\.draw_round_prize_units[\s\S]*set status = 'awarded'/);
  assert.match(openRpc, /gacha_open_id = open_row\.id/);
  assert.match(openRpc, /gacha_open_item_id = open_item_id/);
  assert.match(openRpc, /collection_item_id = new_collection_item_id/);
  assert.match(normalOpenItemInsert, /bundle_quantity[\s\S]*selected_bundle_quantity/);
  assert.match(openRpc, /'bundleQuantity', selected_bundle_quantity/);

  assert.match(collectionLinkMigration, /sync_collection_item_stock_from_prize_unit/);
  assert.match(collectionLinkMigration, /sync_last_prize_collection_item/);
  assert.match(collectionLinkMigration, /last_prize_collection_item_id/);
  assert.match(collectionSource, /sourceOpenItemIdByCollectionItem/);
  assert.match(collectionSource, /stockUnitIdByItem/);
  assert.match(collectionSource, /bundleGroupRows/);
  assert.match(collectionSource, /const bundleQuantity = publicBundleQuantity\(/);
  assert.match(collectionSource, /bundleQuantity,/);
});

test("Global, Main SKU, Sub-SKU, and pack-assigned stock counters stay separated", () => {
  const adminCardsSource = between(
    data,
    "async function getAdminCards",
    "export async function getAdminCampaignPrizeLineup",
    "admin card catalog loader",
  );
  const stockBreakdown = between(
    client,
    "function AdminStockSkuBreakdown",
    "function adminCardCatalogRowSearchText",
    "admin stock breakdown UI",
  );
  const stockSkuSummary = between(
    stockSkuMigration,
    "create or replace function public.get_admin_stock_sku_summary",
    "create or replace function public.get_admin_prize_stock_summaries",
    "stock SKU summary RPC",
  );
  const globalStockSummary = between(
    globalStockMigration,
    "create or replace function public.get_card_stock_summary",
    "create or replace function public.adjust_card_stock_units",
    "global card stock summary RPC",
  );

  assert.match(globalStockSummary, /from public\.card_stock_units/);
  assert.match(globalStockSummary, /count\(\*\) filter \(where status = 'available'\)::integer as available_units/);
  assert.match(stockSkuSummary, /stock\.stock_sku_id/);
  assert.match(stockSkuSummary, /count\(\*\) filter \(where stock\.status = 'available'\)::integer as available_units/);
  assert.match(stockSkuSummary, /'availablePackEquivalent'/);
  assert.match(stockSkuSummary, /'childQuantity'/);

  assert.match(adminCardsSource, /supabase\.rpc\("get_card_stock_summary"/);
  assert.match(adminCardsSource, /supabase\.rpc\("get_admin_prize_stock_summaries"/);
  assert.match(adminCardsSource, /supabase\.rpc\("get_admin_stock_sku_summary"/);
  assert.match(adminCardsSource, /stockSkuGroupsFromSummaryRows\(card, subSkuRows\)/);

  assert.match(stockBreakdown, /const stockSummary = mainSkuStockSummary\(groups\)/);
  assert.match(stockBreakdown, /<span>Sub-SKU stock<\/span>/);
  assert.match(stockBreakdown, /Available global/);
  assert.match(stockBreakdown, /Allocated in random packs/);
  assert.match(stockBreakdown, /Total in system/);
  assert.match(stockBreakdown, /labels\.stockSummary/);
  assert.match(stockBreakdown, /row\.stockAvailable\.toLocaleString\(\)/);
  assert.match(stockBreakdown, /activeUnits\.toLocaleString\(\)[\s\S]*active/);
  assert.match(stockBreakdown, /stockSkuPackUsageByGroup\(groups, row\.prizes\)/);

  assert.match(stockSkuPresentation, /export function mainSkuStockSummary/);
  assert.match(stockSkuPresentation, /export function subSkuStockRows/);
  assert.match(stockSkuUsage, /export function stockSkuPackUsageByGroup/);
  assert.match(stockSkuRoute, /supabase\.rpc\("get_admin_stock_sku_summary"/);
  assert.match(cardStockRoute, /stockSkuId[\s\S]*\? "adjust_stock_sku_units"[\s\S]*: "adjust_card_stock_units"/);
});
