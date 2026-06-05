import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataSource = readFileSync(
  new URL("../src/features/ynot/data.ts", import.meta.url),
  "utf8",
);

function sliceBetween(start, end) {
  const from = dataSource.indexOf(start);
  const to = dataSource.indexOf(end, from + 1);
  assert.ok(from !== -1, `expected to find: ${start}`);
  assert.ok(to !== -1 && to > from, `expected to find: ${end} after ${start}`);
  return dataSource.slice(from, to);
}

test("cached public detail loader returns only the public projection", () => {
  const impl = sliceBetween(
    "async function loadPublicCampaignDetailImpl",
    "const getPublicCampaignDetailCached",
  );
  assert.match(impl, /return publicYnotCampaign\(/);
  assert.ok(
    !/\breturn campaign;\b/.test(impl),
    "must not return the raw (house-data) campaign from the cached loader",
  );
});

test("public prize preview allows bundle quantity but hides internal stock planning", () => {
  const preview = sliceBetween(
    "function publicPrizePreview",
    "function publicPrizeLineup",
  );
  assert.match(preview, /bundleQuantity:\s*prize\.bundleQuantity/);
  assert.doesNotMatch(preview, /plannedQuantity/);
  assert.doesNotMatch(preview, /stockUnitFilter/);
  assert.doesNotMatch(preview, /stockUnitGroupKey/);
});

test("public campaign projection hides pack banner storage path", () => {
  const projection = sliceBetween(
    "function publicYnotCampaign",
    "function localOwnerMockPrizeLineup",
  );
  assert.match(
    projection,
    /bannerImageStoragePath:\s*undefined/,
    "customer campaign props must not include internal Supabase storage paths",
  );
});

test("cached public detail loader returns sold-out campaigns through the public projection", () => {
  const impl = sliceBetween(
    "async function loadPublicCampaignDetailImpl",
    "const getPublicCampaignDetailCached",
  );
  assert.match(
    impl,
    /if \(!campaign\.openable && !campaign\.soldOut\) return null;/,
    "sold-out public packs must reach the customer detail renderer",
  );
  assert.doesNotMatch(
    impl,
    /if \(!campaign\.openable\) return null;/,
    "sold-out public packs must not be treated as missing campaigns",
  );
  assert.match(
    impl,
    /return publicYnotCampaign\(campaign\);/,
    "sold-out public packs must still use the public projection",
  );
});

test("campaign inventory mapper preserves zero remaining slots for final open", () => {
  const inventoryMapper = sliceBetween(
    "function inventorySummariesFromJson",
    "function soldPctForCampaign",
  );
  assert.match(
    inventoryMapper,
    /remainingSlots:\s*optionalNumericValue\(item\.remainingSlots\)/,
    "remainingSlots: 0 must survive the JSON mapper after the final prize is opened",
  );
  assert.doesNotMatch(
    inventoryMapper,
    /remainingSlots:\s*Number\(item\.remainingSlots\)\s*\|\|\s*undefined/,
    "remainingSlots: 0 must not be collapsed into undefined",
  );

  const campaignMapper = sliceBetween(
    "function toYnotCampaign",
    "function publicPrizePreview",
  );
  assert.match(
    campaignMapper,
    /inventory\?\.availableUnits === undefined \? undefined : inventory\.availableUnits/,
    "availableUnits: 0 must be preserved so sold-out fallback stays true",
  );
  assert.doesNotMatch(
    campaignMapper,
    /inventory\?\.availableUnits && inventory\.availableUnits > 0/,
  );
});

test("cached public detail loader excludes test campaigns", () => {
  const impl = sliceBetween(
    "async function loadPublicCampaignDetailImpl",
    "const getPublicCampaignDetailCached",
  );
  assert.match(impl, /\.eq\("is_test",\s*false\)/);
});

test("admins never read from the public detail cache", () => {
  const fn = sliceBetween(
    "export async function getCampaign(",
    "async function getPaymentMethodsImpl",
  );
  assert.match(
    fn,
    /!viewer\.isAdmin[\s\S]{0,160}getPublicCampaignDetailCached\(/,
    "the cache lookup must be gated behind !viewer.isAdmin",
  );
});

test("public detail cache is invalidated by existing campaign mutations", () => {
  const region = sliceBetween(
    "const getPublicCampaignDetailCached",
    "export async function getCampaign(",
  );
  assert.match(region, /tags:\s*\[[^\]]*"campaigns"[^\]]*\]/);
});
