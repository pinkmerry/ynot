import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const base = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(base, rel), "utf8");

const assignModal = read(
  "../src/features/ynot/admin/prize-catalog/AssignCampaignModal.tsx",
);
const campaignSection = read(
  "../src/features/ynot/admin/prize-catalog/CampaignPrizesSection.tsx",
);
const ledgerRow = read(
  "../src/features/ynot/admin/prize-catalog/LedgerRow.tsx",
);
const screen = read(
  "../src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx",
);
const page = read("../src/app/admin/prizes/page.tsx");

// ---- AssignCampaignModal: owner-only value gate (SECURITY) ----

test("AssignCampaignModal gates the Value (THB) input behind isOwner", () => {
  // The value input must be wrapped in an `isOwner &&` conditional
  const valueInputIndex = assignModal.indexOf('id="assign-value"');
  assert.ok(valueInputIndex !== -1, "Value input must exist in AssignCampaignModal");

  // Find the nearest `isOwner` guard before the value input
  const before = assignModal.slice(0, valueInputIndex);
  const lastIsOwner = before.lastIndexOf("isOwner");
  assert.ok(lastIsOwner !== -1, "isOwner must appear before the value input");

  // The guard must be a conditional render: `isOwner &&`
  const guardContext = before.slice(lastIsOwner);
  assert.ok(
    guardContext.includes("isOwner &&"),
    "Value input must be gated with `isOwner &&` conditional render",
  );
});

test("AssignCampaignModal does NOT unconditionally send valueThb", () => {
  // valueThb must only be sent when isOwner is true
  assert.ok(
    assignModal.includes("isOwner ?") || assignModal.includes("isOwner?"),
    "valueThb must be conditionally sent based on isOwner",
  );

  // Must NOT have weight or unlock fields
  assert.ok(
    !assignModal.includes("weight:") || assignModal.includes("// weight"),
    "AssignCampaignModal must NOT send weight",
  );
  assert.ok(
    !assignModal.includes("unlockAtSoldPct") &&
      !assignModal.includes("unlock_at_sold_pct"),
    "AssignCampaignModal must NOT send unlockAtSoldPct",
  );
});

test("AssignCampaignModal never renders weight or unlock inputs", () => {
  assert.ok(
    !assignModal.includes('id="assign-weight"'),
    "No weight input in AssignCampaignModal",
  );
  assert.ok(
    !assignModal.includes('id="assign-unlock"'),
    "No unlock input in AssignCampaignModal",
  );
});

// ---- AssignCampaignModal: metadata wiring ----

test("AssignCampaignModal references assignPrize with metadata including intendedStockSku", () => {
  assert.ok(
    assignModal.includes("assignPrize"),
    "AssignCampaignModal must call assignPrize from catalog-api",
  );
  assert.ok(
    assignModal.includes("intendedStockSku"),
    "metadata must include intendedStockSku",
  );
  assert.ok(
    assignModal.includes("intendedStockUnitKey"),
    "metadata must include intendedStockUnitKey",
  );
  assert.ok(
    assignModal.includes("intendedStockLabel"),
    "metadata must include intendedStockLabel",
  );
  assert.ok(
    assignModal.includes("catalogCategory"),
    "metadata must include catalogCategory",
  );
});

test("AssignCampaignModal carries metadata.tierRank", () => {
  assert.ok(
    assignModal.includes("tierRank"),
    "metadata must include tierRank",
  );
});

// ---- CampaignPrizesSection: owner-only value column ----

test("CampaignPrizesSection shows value column only when isOwner", () => {
  // The value column header must be gated
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
  // The value cell (valueThb rendering) must be inside an isOwner guard
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

// ---- CampaignPrizesSection: remove prize ----

test("CampaignPrizesSection calls removePrize", () => {
  assert.ok(
    campaignSection.includes("removePrize"),
    "CampaignPrizesSection must import and call removePrize",
  );
});

test("CampaignPrizesSection shows owner review notice after remove", () => {
  assert.ok(
    campaignSection.includes("owner review required before publish"),
    'Remove toast must include "owner review required before publish"',
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

// ---- AssignCampaignModal: owner review notice after assign ----

test("AssignCampaignModal shows owner review notice after successful assign", () => {
  assert.ok(
    assignModal.includes("owner review required before publish"),
    'Assign success toast must include "owner review required before publish"',
  );
});

// ---- Integration: LedgerRow renders CampaignPrizesSection ----

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

// ---- Integration: PrizeCatalogScreen wires up AssignCampaignModal ----

test("PrizeCatalogScreen imports and renders AssignCampaignModal", () => {
  assert.ok(
    screen.includes("AssignCampaignModal"),
    "PrizeCatalogScreen must import AssignCampaignModal",
  );
  assert.ok(
    screen.includes("assignCampaign"),
    "PrizeCatalogScreen must have assignCampaign modal state",
  );
});

test("PrizeCatalogScreen accepts campaigns prop", () => {
  assert.ok(
    screen.includes("campaigns: YnotCampaign[]"),
    "PrizeCatalogScreen must accept campaigns: YnotCampaign[] prop",
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

// ---- AssignCampaignModal: a11y ----

test("AssignCampaignModal has proper a11y attributes", () => {
  assert.ok(
    assignModal.includes('role="dialog"'),
    "AssignCampaignModal must have role=dialog",
  );
  assert.ok(
    assignModal.includes("aria-modal"),
    "AssignCampaignModal must have aria-modal",
  );
  assert.ok(
    assignModal.includes("Escape"),
    "AssignCampaignModal must handle Escape key",
  );
});

// ---- AssignCampaignModal: dedupe check ----

test("AssignCampaignModal blocks duplicate campaign+variant assignment", () => {
  assert.ok(
    assignModal.includes("isDuplicate"),
    "AssignCampaignModal must check for duplicate assignments",
  );
});
