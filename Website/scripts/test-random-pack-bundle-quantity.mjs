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
    const readiness = read("Website/src/features/ynot/stock-readiness.ts");
    assert.match(readiness, /bundleQuantityForPrize/);
    assert.match(readiness, /stockUnitsForPrize[\s\S]*planned[\s\S]*bundle/i);
    assert.match(readiness, /plannedQuantityForPrize/);

    const prizeReadiness = read("Website/src/features/ynot/prize-readiness.ts");
    assert.match(prizeReadiness, /bundleQuantity\?: number/);
    assert.match(prizeReadiness, /totalPrizeUnits[\s\S]*plannedQuantityForPrize/i);
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

  it("keeps bronze single-card catalog prizes selectable beside Random PSA10", () => {
    const client = read("Website/src/features/ynot/client.tsx");
    const catalogFilter = between(
      client,
      "function prizeCatalogCardsFor",
      "function cardMatchesCampaignSeries",
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
  });
});
