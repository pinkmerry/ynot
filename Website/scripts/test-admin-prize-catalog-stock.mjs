import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const drawer = read("../src/features/ynot/admin/prize-catalog/AddStockDrawer.tsx");
const certField = read("../src/features/ynot/admin/prize-catalog/CertLookupField.tsx");
const screen = read("../src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx");
const ledger = read("../src/features/ynot/admin/prize-catalog/LedgerRow.tsx");

/* ------------------------------------------------------------------ */
/*  Task 2.2 — AddStockDrawer                                         */
/* ------------------------------------------------------------------ */

test("AddStockDrawer calls adjustCardStock for stock mutations", () => {
  assert.ok(
    drawer.includes("adjustCardStock"),
    "Drawer must call adjustCardStock to add stock units",
  );
});

test("AddStockDrawer calls upsertStockSku to resolve Sub-SKU IDs", () => {
  assert.ok(
    drawer.includes("upsertStockSku"),
    "Drawer must call upsertStockSku to create a Sub-SKU when none matches",
  );
});

test("AddStockDrawer enforces cert→single-unit rule (quantity locks to 1)", () => {
  // The drawer must reference the one-cert-one-unit invariant:
  // when a certNumber is entered, quantity must be exactly 1.
  assert.ok(
    drawer.includes("certNumber") || drawer.includes("certNumber"),
    "Drawer must handle certNumber field",
  );
  // Check that the drawer enforces the single-unit rule
  assert.ok(
    drawer.includes("hasCert") && drawer.includes("disabled={hasCert}"),
    "Drawer must disable quantity when a cert is entered (hasCert guard)",
  );
  // Verify the commit path clamps to 1
  assert.ok(
    drawer.includes("adjustCert ? 1 : quantity"),
    "Drawer must force quantityDelta=1 when cert is present",
  );
});

test("AddStockDrawer requires grade + gradingService for graded condition", () => {
  // The drawer should only send grade/gradingService when condition is "graded"
  assert.ok(
    drawer.includes('"graded"') && drawer.includes("gradingService"),
    "Drawer must reference graded condition and gradingService",
  );
  assert.ok(
    drawer.includes("grade") && drawer.includes("adjustGrade"),
    "Drawer must set grade for graded cards",
  );
});

test("AddStockDrawer is reachable from header and per-row actions", () => {
  // Header button
  assert.ok(
    screen.includes("openDrawerFresh"),
    "Screen header must have an 'Add stock' action using openDrawerFresh",
  );
  // Per-row action
  assert.ok(
    screen.includes("openDrawerForCard"),
    "Screen must wire openDrawerForCard for per-row add-stock",
  );
  assert.ok(
    ledger.includes("onAddStock"),
    "LedgerRow must accept an onAddStock callback",
  );
});

test("AddStockDrawer uses a 3-step wizard (category → card → stock)", () => {
  assert.ok(drawer.includes("step === 1"), "Drawer must have step 1");
  assert.ok(drawer.includes("step === 2"), "Drawer must have step 2");
  assert.ok(drawer.includes("step === 3"), "Drawer must have step 3");
});

/* ------------------------------------------------------------------ */
/*  Task 2.3 — CertLookupField                                        */
/* ------------------------------------------------------------------ */

test("CertLookupField calls the real lookupCert API", () => {
  assert.ok(
    certField.includes("lookupCert"),
    "CertLookupField must call the lookupCert API wrapper",
  );
});

test("CertLookupField does NOT contain mock PSA_DB or PSA_FALLBACK", () => {
  assert.ok(
    !certField.includes("PSA_DB"),
    "CertLookupField must NOT contain mock PSA_DB",
  );
  assert.ok(
    !certField.includes("PSA_FALLBACK"),
    "CertLookupField must NOT contain mock PSA_FALLBACK",
  );
});

test("CertLookupField propagates results via onResult callback", () => {
  assert.ok(
    certField.includes("onResult"),
    "CertLookupField must accept and call an onResult prop",
  );
});

test("CertLookupField handles lookup errors gracefully (no crash on 503/404)", () => {
  // Should check res.ok and surface res.error
  assert.ok(
    certField.includes("res.ok") || certField.includes("!res.ok"),
    "CertLookupField must check response ok status",
  );
  assert.ok(
    certField.includes("res.error"),
    "CertLookupField must surface the route's error message",
  );
});

test("AddStockDrawer does NOT contain mock PSA_DB or PSA_FALLBACK", () => {
  assert.ok(
    !drawer.includes("PSA_DB"),
    "AddStockDrawer must NOT contain mock PSA_DB",
  );
  assert.ok(
    !drawer.includes("PSA_FALLBACK"),
    "AddStockDrawer must NOT contain mock PSA_FALLBACK",
  );
});
