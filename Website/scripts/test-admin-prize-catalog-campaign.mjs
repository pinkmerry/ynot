import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const base = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(base, rel), "utf8");

const campaignSection = read(
  "../src/features/ynot/admin/prize-catalog/CampaignPrizesSection.tsx",
);
const screen = read(
  "../src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx",
);
const ledgerRow = read(
  "../src/features/ynot/admin/prize-catalog/LedgerRow.tsx",
);
const page = read("../src/app/admin/prizes/page.tsx");
const catalogApi = read(
  "../src/features/ynot/admin/prize-catalog/catalog-api.ts",
);

const data = read("../src/features/ynot/data.ts");
const types = read("../src/features/ynot/types.ts");

// ---- awardedTo: winner identity in prize pool ----

test("YnotPrizePoolItem exposes awardedTo winners", () => {
  assert.ok(types.includes("awardedTo"), "YnotPrizePoolItem must declare awardedTo");
  assert.ok(types.includes("PrizeWinner"), "types must define a PrizeWinner shape");
});

test("getAdminPrizePool loads winner identity for awarded units", () => {
  const fn = data.slice(data.indexOf("export async function getAdminPrizePool"));
  assert.ok(fn.includes("profile_id"), "prize-pool unit query must select profile_id");
  assert.ok(fn.includes('.from("profiles")'), "must read profiles to resolve winner names");
  assert.ok(fn.includes("awardedTo"), "each prize item must include awardedTo");
  assert.ok(!fn.includes("ownerEmail") && !fn.includes(".email"), "winner email must NOT be loaded (name only)");
});

// ---- CampaignPrizesSection: columns ----

test("Campaign table drops Rank and Value columns", () => {
  assert.ok(!campaignSection.includes("prize.rank"), "Rank cell must be removed");
  assert.ok(!campaignSection.includes("valueThb"), "Value cell must be removed");
  assert.ok(!campaignSection.includes("Value (THB)"), "Value header must be removed");
});

test("Campaign table shows pack-defined tier, total, in-pool, and winners", () => {
  assert.ok(campaignSection.includes("displayTierLabel"), "Tier must use displayTierLabel");
  assert.ok(campaignSection.includes("totalUnits"), "must show Total (totalUnits)");
  assert.ok(campaignSection.includes("availableUnits"), "must show In pool (availableUnits)");
  assert.ok(campaignSection.includes("awardedTo"), "Awarded cell must render winners (awardedTo)");
});

// ---- CampaignPrizesSection: winnable banner ----

test("Winnable banner keys off campaign status === live", () => {
  assert.ok(
    campaignSection.includes('"live"') || campaignSection.includes("'live'"),
    'Winnable banner must check campaign status against "live"',
  );
  assert.ok(
    campaignSection.includes("Winnable now"),
    'Must show "Winnable now" for live campaigns',
  );
  assert.ok(
    campaignSection.includes("Not winnable yet"),
    'Must show "Not winnable yet" for non-live campaigns',
  );
});

// ---- CampaignPrizesSection: read-only (no assign/remove API) ----

test("CampaignPrizesSection is read-only: no removePrize, handleRemove, assign button, or onAssign", () => {
  assert.ok(
    !campaignSection.includes("removePrize"),
    "CampaignPrizesSection must NOT contain removePrize",
  );
  assert.ok(
    !campaignSection.includes("handleRemove"),
    "CampaignPrizesSection must NOT contain handleRemove",
  );
  assert.ok(
    !campaignSection.includes("Assign to a campaign"),
    "CampaignPrizesSection must NOT contain 'Assign to a campaign'",
  );
  assert.ok(
    !campaignSection.includes("onAssign"),
    "CampaignPrizesSection must NOT contain onAssign",
  );
});

// ---- catalog-api.ts: no campaign assignment APIs ----

test("catalog-api.ts no longer references assignPrize or removePrize", () => {
  assert.ok(
    !catalogApi.includes("assignPrize"),
    "catalog-api.ts must NOT contain assignPrize",
  );
  assert.ok(
    !catalogApi.includes("removePrize"),
    "catalog-api.ts must NOT contain removePrize",
  );
});

test("catalog-api.ts contains no admin/prizes string", () => {
  assert.ok(
    !catalogApi.includes("admin/prizes"),
    "catalog-api.ts must NOT contain admin/prizes",
  );
});

// ---- PrizeCatalogScreen: no AssignCampaignModal ----

test("PrizeCatalogScreen does NOT contain AssignCampaignModal, assignCampaign, assignPrize, or removePrize", () => {
  assert.ok(
    !screen.includes("AssignCampaignModal"),
    "PrizeCatalogScreen must NOT contain AssignCampaignModal",
  );
  assert.ok(
    !screen.includes("assignCampaign"),
    "PrizeCatalogScreen must NOT contain assignCampaign",
  );
  assert.ok(
    !screen.includes("assignPrize"),
    "PrizeCatalogScreen must NOT contain assignPrize",
  );
  assert.ok(
    !screen.includes("removePrize"),
    "PrizeCatalogScreen must NOT contain removePrize",
  );
});

test("PrizeCatalogScreen accepts campaigns prop", () => {
  assert.ok(
    screen.includes("campaigns: YnotCampaign[]"),
    "PrizeCatalogScreen must accept campaigns: YnotCampaign[] prop",
  );
});

// ---- LedgerRow: no onAssign ----

test("LedgerRow does NOT contain onAssign", () => {
  assert.ok(
    !ledgerRow.includes("onAssign"),
    "LedgerRow must NOT contain onAssign",
  );
});

test("LedgerRow imports and renders CampaignPrizesSection", () => {
  assert.ok(
    ledgerRow.includes("CampaignPrizesSection"),
    "LedgerRow must import CampaignPrizesSection",
  );
  assert.ok(
    ledgerRow.includes("campaigns"),
    "LedgerRow must accept campaigns prop",
  );
});

// ---- AssignCampaignModal.tsx deleted ----

test("AssignCampaignModal.tsx does not exist", () => {
  const modalPath = resolve(
    base,
    "../src/features/ynot/admin/prize-catalog/AssignCampaignModal.tsx",
  );
  assert.ok(
    !existsSync(modalPath),
    "AssignCampaignModal.tsx must be deleted",
  );
});

// ---- Integration: page.tsx loads campaigns ----

test("page.tsx loads campaigns via getCampaigns({ includePrivate: true })", () => {
  assert.ok(
    page.includes("getCampaigns"),
    "page.tsx must import getCampaigns",
  );
  assert.ok(
    page.includes("includePrivate: true"),
    "page.tsx must call getCampaigns with includePrivate: true",
  );
  assert.ok(
    page.includes("campaigns={campaigns}"),
    "page.tsx must pass campaigns prop to PrizeCatalogScreen",
  );
});
