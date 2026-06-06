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

test("auto-open page uses the lightweight reveal-entry loader", () => {
  assert.ok(
    /getOpenCampaignForReveal/.test(openPageSource),
    "open page should use the reveal-entry loader",
  );
  assert.ok(
    /getOpenCampaignForReveal\(campaignId, data\.viewer\)/.test(openPageSource),
    "open page should load reveal entry data for the current viewer",
  );
  assert.ok(
    !/getCampaign\(campaignId/.test(openPageSource),
    "open page should not load full campaign detail",
  );
  assert.ok(
    !/bypassPublicCache/.test(openPageSource),
    "open page should not bypass the full-detail public cache",
  );
});
