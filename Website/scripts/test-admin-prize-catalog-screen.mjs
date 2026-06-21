import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("../src/app/admin/prizes/page.tsx");
const screen = read("../src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx");

test("page mounts the new PrizeCatalogScreen and keeps server data loaders", () => {
  assert.ok(page.includes("PrizeCatalogScreen"));
  assert.ok(page.includes("getAdminCards"));
  assert.ok(page.includes("getAdminPrizePool"));
});

test("screen is a client component reusing the existing row builder", () => {
  assert.match(screen, /^"use client";/m);
  assert.ok(screen.includes("buildAdminCardCatalogRows"));
});
