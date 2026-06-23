import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const form = read("../src/features/ynot/admin/prize-catalog/MainSkuForm.tsx");

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
  assert.ok(mainSku.includes('category === "Single Cards"'), "cert lookup shown only for Single Cards");
});

test("MainSkuForm captures the card language and submits it", () => {
  assert.ok(mainSku.includes("LANGUAGE_OPTIONS"), "must offer language options");
  assert.ok(
    mainSku.includes("English") && mainSku.includes("Japanese") && mainSku.includes("Chinese"),
    "language options must include English/Japanese/Chinese",
  );
  assert.ok(mainSku.includes('id="pcx-language"'), "must render a Language select");
  assert.ok(
    mainSku.includes("language: resolvedLanguage"),
    "submitted MainSkuInput must include the resolved language",
  );
});
