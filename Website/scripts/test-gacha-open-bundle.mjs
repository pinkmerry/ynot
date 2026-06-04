import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const openPageSource = readFileSync(
  new URL("../src/app/(store)/gacha/[campaignId]/open/page.tsx", import.meta.url),
  "utf8",
);

test("open page no longer statically imports the panel from the client barrel", () => {
  assert.ok(
    !/import\s*\{[^}]*\bGachaOpenPanel\b[^}]*\}\s*from\s*["']@\/features\/ynot\/client["']/.test(
      openPageSource,
    ),
    "open page must not statically import GachaOpenPanel from the client barrel",
  );
  assert.match(openPageSource, /GachaOpenPanelLazy/);
});

test("lazy wrapper code-splits the panel via next/dynamic", () => {
  const lazySource = readFileSync(
    new URL("../src/features/ynot/cr/GachaOpenPanelLazy.tsx", import.meta.url),
    "utf8",
  );
  assert.match(lazySource, /^"use client";/);
  assert.match(lazySource, /from\s+["']next\/dynamic["']/);
  assert.match(lazySource, /import\(["']\.\.\/client["']\)/);
});
