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

// ---- CampaignPrizesSection: owner-only value column (SECURITY) ----

test("CampaignPrizesSection shows value column only when isOwner", () => {
  const valueHeaderIndex = campaignSection.indexOf("Value (THB)");
  assert.ok(
    valueHeaderIndex !== -1,
    "Value (THB) column header must exist in CampaignPrizesSection",
  );

  const beforeHeader = campaignSection.slice(0, valueHeaderIndex);
  const lastIsOwner = beforeHeader.lastIndexOf("isOwner");
  assert.ok(
    lastIsOwner !== -1,
    "isOwner must appear before the Value (THB) header",
  );
  const guardContext = beforeHeader.slice(lastIsOwner);
  assert.ok(
    guardContext.includes("isOwner &&"),
    "Value column header must be gated with `isOwner &&`",
  );
});

test("CampaignPrizesSection value cell is gated behind isOwner", () => {
  const valueCellIndex = campaignSection.indexOf("valueThb");
  assert.ok(
    valueCellIndex !== -1,
    "valueThb must be referenced in CampaignPrizesSection",
  );

  const beforeCell = campaignSection.slice(0, valueCellIndex);
  const guardIdx = beforeCell.lastIndexOf("isOwner &&");
  assert.ok(
    guardIdx !== -1,
    "valueThb cell must be inside an isOwner && gate",
  );
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
