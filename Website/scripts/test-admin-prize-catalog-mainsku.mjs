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
