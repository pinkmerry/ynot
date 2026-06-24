import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const form = read("../src/features/ynot/admin/prize-catalog/MainSkuForm.tsx");
const drawer = read("../src/features/ynot/admin/prize-catalog/AddStockDrawer.tsx");
const step2Create = read("../src/features/ynot/admin/prize-catalog/add-stock/Step2Create.tsx");

test("MainSkuForm constrains series to the two built-in brands", () => {
  assert.ok(form.includes("Pokemon"));
  assert.ok(form.includes("One Piece"));
});

test("MainSkuForm uses the typed API client, not raw fetch", () => {
  assert.ok(form.includes("createMainSku") || form.includes("updateMainSku"));
  assert.ok(form.includes("uploadCardImage"));
  assert.ok(!/fetch\(/.test(form), "component should call the API client, not fetch directly");
});

const mainSku = form;

test("MainSkuForm offers PSA cert lookup auto-fill for Single Cards", () => {
  assert.ok(mainSku.includes("CertLookupField"), "must render CertLookupField");
  assert.ok(mainSku.includes("onResult"), "must handle cert onResult to autofill");
  assert.ok(mainSku.includes("setName"), "lookup must fill Name");
  assert.ok(
    mainSku.includes("setSeriesOption") && mainSku.includes("seriesDisplayToOption"),
    "lookup must fill Series via seriesDisplayToOption",
  );
  assert.ok(mainSku.includes("setCardSet"), "lookup must fill Set");
  assert.ok(mainSku.includes("setReleaseYear"), "lookup must fill Year");
  assert.ok(mainSku.includes("setCardNumber"), "lookup must fill Card number");
  assert.ok(mainSku.includes("!isSealedMainSku"), "cert lookup hidden for sealed Main SKUs");
});

test("MainSkuForm keeps card language on variants but allows optional sealed language", () => {
  assert.ok(mainSku.includes("SEALED_LANGUAGE_OPTIONS"), "sealed Main SKUs may store optional language");
  assert.ok(!mainSku.includes('id="pcx-language"'), "cards do not get a Main-SKU language select");
  assert.ok(mainSku.includes('id="pcx-sealed-language"'), "sealed language uses a sealed-only select");
});

test("Add-stock create mode carries the selected sealed category into MainSkuForm", () => {
  assert.ok(
    step2Create.includes("category: StockCategory"),
    "Step2Create must receive the Step 1 category",
  );
  assert.ok(
    drawer.includes("category={category}"),
    "AddStockDrawer must pass the selected category to Step2Create",
  );
  assert.ok(
    step2Create.includes("initialCategory={category}"),
    "Step2Create must default MainSkuForm to the selected category",
  );
  assert.ok(
    step2Create.includes("lockCategory"),
    "Step2Create must lock the Main SKU category during sealed stock creation",
  );
});

test("MainSkuForm uses sealed-product fields for boxes and packs", () => {
  assert.ok(mainSku.includes("function mainSkuCategoryFromStockCategory"));
  assert.ok(mainSku.includes("function mainSkuFormKindForCategory"));
  assert.ok(mainSku.includes("Box name"));
  assert.ok(mainSku.includes("Pack name"));
  assert.ok(mainSku.includes("SEALED_SERIES_OPTIONS"));
  assert.ok(mainSku.includes("SEALED_LANGUAGE_OPTIONS"));
  assert.ok(mainSku.includes("isSealedMainSku"));
  assert.ok(
    mainSku.includes("!isSealedMainSku") && mainSku.includes("CertLookupField"),
    "sealed Main SKUs must not show PSA lookup",
  );
  assert.ok(
    mainSku.includes("!isSealedMainSku") && mainSku.includes("pcx-number"),
    "sealed Main SKUs must not show card number",
  );
  assert.ok(mainSku.includes("categoryLocked"), "sealed category must be locked");
});
