import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("../src/app/globals.css");

test("prize-catalog stock-state tokens are defined and mapped to admin palette", () => {
  for (const token of [
    "--pcx-available",
    "--pcx-packs",
    "--pcx-bags",
    "--pcx-removed",
  ]) {
    assert.ok(css.includes(token), `missing token ${token}`);
  }
  // available reuses the gold accent; bags reuses violet/amber family — assert reuse, not hardcoded hexes.
  assert.match(css, /--pcx-available:\s*var\(--a-gold/);
});

test("prize-catalog category accents exist", () => {
  for (const token of ["--pcx-cat-card", "--pcx-cat-box", "--pcx-cat-pack"]) {
    assert.ok(css.includes(token), `missing token ${token}`);
  }
});

const api = read("../src/features/ynot/admin/prize-catalog/catalog-api.ts");

test("catalog-api targets the real existing endpoints", () => {
  for (const path of [
    "/api/ynot/admin/cards",
    "/api/ynot/admin/card-stock",
    "/api/ynot/admin/stock-skus",
    "/api/ynot/admin/stock-skus/open-container",
    "/api/ynot/admin/gemrate-cert",
    "/api/ynot/admin/prizes",
  ]) {
    assert.ok(api.includes(path), `catalog-api missing ${path}`);
  }
});

test("catalog-api sends same-origin credentials and JSON", () => {
  assert.match(api, /credentials:\s*["']same-origin["']/);
  assert.match(api, /content-type/i);
});
