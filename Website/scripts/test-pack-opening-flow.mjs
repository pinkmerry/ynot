import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("open confirmation creates a stable intent before auto-start reveal", () => {
  const detail = read("src/features/ynot/cr/PackDetailExperience.tsx");
  const packs = read("src/features/ynot/cr/YPackExperience.tsx");
  for (const source of [detail, packs]) {
    assert.match(source, /createOpenIntentId/);
    assert.match(source, /new URLSearchParams\(\{\s*qty: String\(qty\),\s*auto: "1",\s*intent,/s);
    assert.match(source, /\/open\?\$\{query\.toString\(\)\}/);
  }
});

test("open page validates and passes the intent to the client reveal panel", () => {
  const source = read("src/app/(store)/gacha/[campaignId]/open/page.tsx");
  assert.match(source, /normalizeOpenIntentId/);
  assert.match(source, /const intent = normalizeOpenIntentId\(query\.intent\)/);
  assert.match(source, /<GachaOpenPanelLazy[\s\S]*openIntentId=\{intent\}/);
});

test("auto-start open uses intent-derived idempotency and strips replay URL after success", () => {
  const helper = read("src/features/ynot/open-intent.ts");
  assert.match(helper, /export function createOpenIntentId/);
  assert.match(helper, /export function normalizeOpenIntentId/);
  assert.match(helper, /export function openIntentIdempotencyKey/);
  assert.match(helper, /chunkIndex = 0/);
  assert.match(helper, /part-\$\{safeChunkIndex\}/);
  assert.match(helper, /export function stripOpenAutoStartUrl/);
  assert.match(helper, /url\.searchParams\.delete\("auto"\)/);

  const client = read("src/features/ynot/client.tsx");
  const fireOpen = client.match(/function fireOpen[\s\S]*?function openAgain/)?.[0] ?? "";
  assert.match(client, /const GACHA_OPEN_RPC_CHUNK_SIZE = 20;/);
  assert.match(client, /function openQuantityChunks/);
  assert.match(client, /function mergeOpenResults/);
  assert.match(fireOpen, /for \(const chunk of chunks\)/);
  assert.match(fireOpen, /openIntentIdempotencyKey/);
  assert.match(fireOpen, /openIntentId \?\? createOpenIntentId\(\)/);
  assert.match(fireOpen, /quantity: chunk\.quantity/);
  assert.match(fireOpen, /chunk\.index/);
  assert.match(fireOpen, /stripOpenAutoStartUrl\(\)/);
  assert.doesNotMatch(fireOpen, /crypto\.randomUUID\(\)/);
  assert.match(client, /router\.replace\("\/collection"\)/);
});
