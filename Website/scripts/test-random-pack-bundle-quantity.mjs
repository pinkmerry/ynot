import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function latestMigrationContaining(needle) {
  const dir = path.join(repoRoot, "Database/supabase/migrations");
  const matches = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) => readFileSync(path.join(dir, file), "utf8").includes(needle));
  assert.ok(matches.length > 0, `expected a migration containing ${needle}`);
  return readFileSync(path.join(dir, matches.at(-1)), "utf8");
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

describe("random pack bundled prizes", () => {
  it("adds durable bundle quantity columns without exposing metadata grants", () => {
    const sql = latestMigrationContaining("draw_round_prizes_bundle_quantity_check");
    assert.match(sql, /alter table if exists public\.draw_round_prizes[\s\S]*add column if not exists bundle_quantity integer not null default 1/i);
    assert.match(sql, /alter table if exists public\.gacha_open_items[\s\S]*add column if not exists bundle_quantity integer not null default 1/i);
    assert.match(sql, /draw_round_prizes_bundle_quantity_check/i);
    assert.match(sql, /bundle_quantity between 1 and 100/i);
    assert.match(sql, /grant select \([\s\S]*bundle_quantity[\s\S]*\) on public\.draw_round_prizes to anon, authenticated/i);
    assert.doesNotMatch(sql, /grant select \([\s\S]*metadata[\s\S]*\) on public\.draw_round_prizes to anon, authenticated/i);
  });

  it("keeps planned quantity as slot count and multiplies only physical stock", () => {
    const bundleQuantity = read("Website/src/features/ynot/bundle-quantity.ts");
    assert.match(bundleQuantity, /export function stockUnitsToWinSlots/);
    assert.match(
      bundleQuantity,
      /Math\.floor\([\s\S]*Math\.trunc\(physical\) \/ normalizeBundleQuantity\(bundleQuantity\)/,
    );
    assert.match(bundleQuantity, /return Math\.min\(slots, planned\)/);

    const readiness = read("Website/src/features/ynot/stock-readiness.ts");
    assert.match(readiness, /bundleQuantityForPrize/);
    assert.match(readiness, /stockUnitsForPrize[\s\S]*planned[\s\S]*bundle/i);
    assert.match(readiness, /plannedQuantityForPrize/);

    const prizeReadiness = read("Website/src/features/ynot/prize-readiness.ts");
    assert.match(prizeReadiness, /bundleQuantity\?: number/);
    assert.match(prizeReadiness, /stockUnitsToWinSlots/);
    assert.match(prizeReadiness, /availablePrizeUnits[\s\S]*availableWinSlots/i);
  });

  it("serializes bundle quantity through admin create and live edit APIs", () => {
    const campaignsRoute = read("Website/src/app/api/ynot/admin/campaigns/route.ts");
    assert.match(campaignsRoute, /bundleQuantity/);
    assert.match(campaignsRoute, /bundle_quantity: normalizeBundleQuantity/);
    assert.match(campaignsRoute, /"bundleQuantity"/);

    const client = read("Website/src/features/ynot/client.tsx");
    assert.match(client, /bundleQuantity: defaultBundleQuantity/);
    assert.match(client, /Per win/);
    assert.match(client, /prizeRequiredStockUnits/);
  });

  it("opens one public reward while awarding all bundled collection rows", () => {
    const sql = latestMigrationContaining("bundle_quantity_snapshot");
    assert.match(sql, /bundle_quantity_snapshot/i);
    assert.match(sql, /select[\s\S]*for update skip locked/i);
    assert.match(sql, /jsonb_build_object\([\s\S]*'bundleQuantity'[\s\S]*\)/i);
    assert.match(sql, /insert into public\.collection_items/i);
    assert.match(sql, /for claimed_unit in/i);
  });

  it("keeps Last One Prize as the final slot in the latest open RPC", () => {
    const sql = latestMigrationContaining("last_prize_final_slot");
    const openRpc = between(
      sql,
      "create or replace function public.open_gacha_campaign",
      "revoke all on function public.open_gacha_campaign",
    );
    assert.match(openRpc, /last_prize_needed/);
    assert.match(
      openRpc,
      /normal_units_needed := p_quantity - case when last_prize_needed then 1 else 0 end/i,
    );
    assert.match(openRpc, /available_unit_count < normal_units_needed/i);
    assert.match(openRpc, /'tier', 'last_prize'/);
    assert.match(openRpc, /'displayTier', 'last_prize'/);
    assert.match(openRpc, /'isLastPrize', true/);
    assert.match(openRpc, /'bundleQuantity', 1/);
    assert.match(openRpc, /open_row\.public_code \|\| '-LP'/);
    assert.match(openRpc, /'reason', 'last_prize_final_slot'/);
    assert.doesNotMatch(openRpc, /p_quantity \+ 1/);
    assert.doesNotMatch(openRpc, /'stockUnitId'/);

    assert.match(sql, /last_prize_normal_prize_target/);
    assert.match(sql, /last_prize_stock_required/);
    assert.match(sql, /v_public_total_slots/);
  });

  it("stages live Last Prize edits for owner-reviewed publish", () => {
    const campaignsRoute = read("Website/src/app/api/ynot/admin/campaigns/route.ts");
    const liveBlock = between(
      campaignsRoute,
      'if (current.status === "live") {',
      'if (current.status !== "draft")',
    );
    const revisionMigration = latestMigrationContaining("draw_round_live_revisions");
    const lastPrizeLockMigration = latestMigrationContaining("last_prize_identity_locked_after_award");

    assert.match(liveBlock, /createLivePackRevision/);
    assert.match(liveBlock, /requiresOwnerReview: true/);
    assert.doesNotMatch(liveBlock, /edit_live_campaign_inventory/);
    assert.match(campaignsRoute, /lastPrizePatchChangesAwardedIdentity/);
    assert.match(campaignsRoute, /last_prize_awarded_at/);
    assert.match(campaignsRoute, /last_prize_metadata/);
    assert.match(revisionMigration, /last_prize_metadata = case/);
    assert.match(revisionMigration, /revision\.scalar_patch \? 'last_prize_metadata'/);
    assert.match(revisionMigration, /public\.edit_live_campaign_inventory/);
    assert.match(lastPrizeLockMigration, /campaign\.last_prize_awarded_at is not null/);
    assert.match(lastPrizeLockMigration, /revision\.scalar_patch \? 'last_prize_card_id'/);
    assert.match(lastPrizeLockMigration, /revision\.scalar_patch \? 'last_prize_metadata'/);
  });

  it("public APIs allow bundleQuantity but keep internal reward data private", () => {
    const openRoute = read("Website/src/app/api/ynot/gacha/open/route.ts");
    assert.match(openRoute, /bundleQuantity\?: number/);
    assert.match(openRoute, /bundleQuantity: publicBundleQuantity/);
    assert.doesNotMatch(openRoute, /drawRoundPrizeUnitId:/);
    assert.doesNotMatch(openRoute, /stockUnitFilter:/);

    const data = read("Website/src/features/ynot/data.ts");
    assert.match(data, /bundleQuantity/);
    assert.match(data, /bundleGroupItemIds/);
    const publicLineupMapper = between(
      data,
      "async function getPublicPrizeLineup",
      "async function getPublicPrizeLineupsIndividually",
    );
    assert.doesNotMatch(publicLineupMapper, /stockUnitFilter/);
  });

  it("renders xN badges on the related customer surfaces", () => {
    const packDetail = read("Website/src/features/ynot/cr/PackDetailExperience.tsx");
    const client = read("Website/src/features/ynot/client.tsx");
    const history = read("Website/src/features/ynot/cr/HistoryExperience.tsx");
    const pulls = read("Website/src/features/ynot/cr/AllPullsExperience.tsx");
    assert.match(packDetail, /QuantityBadge/);
    assert.match(client, /QuantityBadge/);
    assert.match(history, /QuantityBadge/);
    assert.match(pulls, /QuantityBadge/);
  });

  it("uses an admin combobox instead of a full-page native select", () => {
    const client = read("Website/src/features/ynot/client.tsx");
    const css = read("Website/src/app/globals.css");
    assert.match(client, /role="combobox"/);
    assert.match(client, /role="listbox"/);
    assert.match(client, /createPortal\(/);
    assert.match(client, /admin-prize-combobox__menu/);
    assert.match(client, /Browse all items/);
    assert.match(client, /No catalog item matches that search[\s\S]*browse/);
    assert.match(css, /admin-prize-combobox__popover--portal/);
    assert.match(
      css,
      /admin-prize-combobox__popover \{[\s\S]*color:\s*#f4efe1;/,
    );
    assert.match(
      css,
      /admin-prize-combobox__search input \{[\s\S]*color:\s*#f4efe1\s*!important;/,
    );
    assert.match(css, /admin-prize-combobox__search input::placeholder/);
    assert.match(
      css,
      /button\.admin-prize-combobox__option[\s\S]*height:\s*auto\s*!important/,
    );
    assert.match(
      css,
      /admin-prize-table-head \{\s*grid-template-columns: 90px minmax\(180px, 1fr\) minmax\(220px, 1\.1fr\) 130px 80px 110px 120px auto;/,
    );
    assert.doesNotMatch(
      client,
      /showSearch=\{false\}[\s\S]*AdminPrizeCardPicker/,
    );
  });

  it("keeps bronze catalog item selection available for every sub-category", () => {
    const client = read("Website/src/features/ynot/client.tsx");
    const catalogFilter = between(
      client,
      "function prizeCatalogCardsFor",
      "function cardMatchesCampaignSeries",
    );
    assert.match(
      catalogFilter,
      /if \(catalogCategory !== "single_cards"\) return categorizedCards;/,
    );
    assert.match(
      catalogFilter,
      /const randomPsa10Cards = canPrizeDisplayTierUseRandomPsa10/,
    );
    assert.match(catalogFilter, /const specificCards = categorizedCards\.filter/);
    assert.match(
      catalogFilter,
      /return \[\.\.\.randomPsa10Cards, \.\.\.specificCards\]/,
    );
    assert.doesNotMatch(
      catalogFilter,
      /return categorizedCards\.filter\(isRandomPsa10Card\)/,
    );

    const campaignsRoute = read("Website/src/app/api/ynot/admin/campaigns/route.ts");
    const campaignValidator = between(
      campaignsRoute,
      "const randomPsa10TierMismatched",
      "if (randomPsa10TierMismatched)",
    );
    assert.match(
      campaignValidator,
      /isRandomPsa10 && !canPrizeDisplayTierUseRandomPsa10\(displayTier\)/,
    );
    assert.doesNotMatch(campaignValidator, /\? !isRandomPsa10\s*: isRandomPsa10/);

    const prizesRoute = read("Website/src/app/api/ynot/admin/prizes/route.ts");
    const livePrizeValidator = between(
      prizesRoute,
      'if (prizeCategory === "psa10_card")',
      "const reviewReset",
    );
    assert.match(
      livePrizeValidator,
      /isRandomPsa10 && !canPrizeDisplayTierUseRandomPsa10\(displayTier\)/,
    );
    assert.doesNotMatch(livePrizeValidator, /allowedForTier/);
    assert.match(
      client,
      /every sub-category can use matching catalog items/,
    );
  });
});
