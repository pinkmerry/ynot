import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const drawer = read("../src/features/ynot/admin/prize-catalog/AddStockDrawer.tsx");
const certField = read("../src/features/ynot/admin/prize-catalog/CertLookupField.tsx");
const screen = read("../src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx");
const ledger = read("../src/features/ynot/admin/prize-catalog/LedgerRow.tsx");
const step3 = read("../src/features/ynot/admin/prize-catalog/add-stock/Step3Stock.tsx");

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
  // The step 3 component must reference the one-cert-one-unit invariant:
  // when a certNumber is entered, quantity must be exactly 1.
  assert.ok(
    step3.includes("certNumber"),
    "Step3Stock must handle certNumber field",
  );
  assert.ok(
    step3.includes("hasCert") && step3.includes("disabled={hasCert}"),
    "Step3Stock must disable quantity when a cert is entered (hasCert guard)",
  );
  // Verify the commit path clamps to 1
  assert.ok(
    drawer.includes("adjustCert ? 1 : quantity"),
    "Drawer must force quantityDelta=1 when cert is present",
  );
});

test("AddStockDrawer requires grade + gradingService for graded condition", () => {
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
  assert.ok(
    screen.includes("openDrawerFresh"),
    "Screen header must have an 'Add stock' action using openDrawerFresh",
  );
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

/* ------------------------------------------------------------------ */
/*  FIX 1 wiring — CertLookupField is controlled via value/onChange    */
/* ------------------------------------------------------------------ */

test("CertLookupField exposes value + onChange props (controlled input)", () => {
  // The type declaration must include both controlled props
  assert.ok(
    certField.includes("value: string"),
    "CertLookupField props must include 'value: string'",
  );
  assert.ok(
    certField.includes("onChange: (cert: string) => void"),
    "CertLookupField props must include 'onChange: (cert: string) => void'",
  );
  // The component must destructure and use them
  assert.ok(
    certField.includes("value={value}"),
    "CertLookupField input must bind value={value} (controlled)",
  );
  assert.ok(
    certField.includes("onChange(e.target.value)"),
    "CertLookupField input onChange must call the parent's onChange",
  );
  // Must NOT have an internal cert state (that was the original bug)
  assert.ok(
    !certField.includes('useState("")'),
    "CertLookupField must NOT keep its own cert string state (controlled component)",
  );
});

test("AddStockDrawer passes certNumber/setCertNumber into CertLookupField", () => {
  // Step3Stock must wire the controlled props from the drawer's state
  assert.ok(
    step3.includes("value={certNumber}"),
    "Step3Stock must pass certNumber as value to CertLookupField",
  );
  assert.ok(
    step3.includes("onChange={onCertNumber}"),
    "Step3Stock must pass onCertNumber as onChange to CertLookupField",
  );
  // The drawer must pass setCertNumber-derived handler to Step3Stock
  assert.ok(
    drawer.includes("setCertNumber(v)") || drawer.includes("setCertNumber"),
    "AddStockDrawer must pass setCertNumber into Step3Stock's onCertNumber",
  );
});

test("AddStockDrawer includes certNumber in the adjustCardStock call", () => {
  // The stockInput must carry certNumber through to the API
  assert.ok(
    drawer.includes("certNumber: adjustCert"),
    "adjustCardStock payload must include certNumber: adjustCert",
  );
  // adjustCert must derive from the drawer's certNumber state
  assert.ok(
    drawer.includes("adjustCert = certNumber.trim()"),
    "adjustCert must be derived from certNumber.trim()",
  );
});

/* ------------------------------------------------------------------ */
/*  FIX 3 — robust Sub-SKU matching + "other" grading service          */
/* ------------------------------------------------------------------ */

test("Sub-SKU matching guards empty units and uses group-level fields", () => {
  // Must check g.sku for exact match before peeking into units
  assert.ok(
    drawer.includes("g.sku?.toUpperCase() === skuCode"),
    "Sub-SKU matching must try exact sku match on group level",
  );
  // Must guard empty units
  assert.ok(
    drawer.includes("g.units.length > 0"),
    "Sub-SKU matching must guard against empty units arrays",
  );
});

test("GradingService type includes 'other' as a 4th option", () => {
  // The add-stock types module must declare "other"
  const typesFile = read("../src/features/ynot/admin/prize-catalog/add-stock/types.ts");
  assert.ok(
    typesFile.includes('"other"'),
    "GradingService type must include 'other'",
  );
  // Step3Stock must render a pill for "other"
  assert.ok(
    step3.includes('"other"'),
    "Step3Stock must include 'other' in the grading service selector",
  );
});

/* ------------------------------------------------------------------ */
/*  FIX 2 — file extraction into add-stock/                            */
/* ------------------------------------------------------------------ */

test("Step components are extracted to add-stock/ subfolder", () => {
  const base = "../src/features/ynot/admin/prize-catalog/add-stock/";
  const files = [
    "StepBar.tsx",
    "Step1Category.tsx",
    "Step2Search.tsx",
    "Step2Create.tsx",
    "Step3Stock.tsx",
    "types.ts",
    "index.ts",
  ];
  for (const f of files) {
    assert.ok(
      existsSync(new URL(base + f, import.meta.url)),
      `add-stock/${f} must exist`,
    );
  }
});
