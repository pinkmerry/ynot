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
  assert.match(helper, /export function stripOpenAutoStartUrl/);
  assert.match(helper, /url\.searchParams\.delete\("auto"\)/);

  const client = read("src/features/ynot/client.tsx");
  const fireOpen = client.match(/function fireOpen[\s\S]*?function openAgain/)?.[0] ?? "";
  const openAgain = client.match(/function openAgain[\s\S]*?function handleRevealClose/)?.[0] ?? "";
  assert.match(client, /createOpenIntentId/);
  assert.match(fireOpen, /openIntentIdempotencyKey/);
  assert.match(fireOpen, /intentId \?\? openIntentId \?\? null/);
  assert.match(fireOpen, /quantity: targetQuantity/);
  assert.doesNotMatch(fireOpen, /for \(const chunk of chunks\)/);
  assert.match(fireOpen, /stripOpenAutoStartUrl\(\)/);
  assert.doesNotMatch(fireOpen, /crypto\.randomUUID\(\)/);
  assert.match(openAgain, /if \(openRequestInFlightRef\.current\) return/);
  assert.match(openAgain, /fireOpen\(nextQuantity,\s*createOpenIntentId\(\)\)/);
  assert.match(client, /router\.replace\("\/collection"\)/);
});

test("first auto-start pull preserves 1, 10, and 100 quantities as one open call", () => {
  const openPage = read("src/app/(store)/gacha/[campaignId]/open/page.tsx");
  const client = read("src/features/ynot/client.tsx");
  const route = read("src/app/api/ynot/gacha/open/route.ts");
  const latestOpenRpc = read("../Database/supabase/migrations/20260605210000_last_prize_final_slot.sql");
  const panel = client.match(/export function GachaOpenPanel[\s\S]*?export function AddressForm/)?.[0] ?? "";
  const autoStartEffect = client.match(/const autoStartFiredRef[\s\S]*?const openAgainOptions/)?.[0] ?? "";
  const fireOpen = client.match(/function fireOpen[\s\S]*?function openAgain/)?.[0] ?? "";

  assert.match(openPage, /Math\.max\(1,\s*Math\.min\(100,\s*Math\.round\(Number\(query\.qty\) \|\| 1\)\)\)/);
  assert.match(openPage, /initialQuantity=\{initialQuantity\}/);
  assert.match(panel, /const initialOption = openQuantityOptions\.includes\(initialQuantity\)[\s\S]*\? initialQuantity[\s\S]*: openQuantityOptions\[0\]/);
  assert.match(autoStartEffect, /if \(quantityDisabled\(initialOption\)\) return/);
  assert.match(autoStartEffect, /autoStartFiredRef\.current = true;[\s\S]*fireOpen\(initialOption\)/);
  assert.match(fireOpen, /postJson\("\/api\/ynot\/gacha\/open"/);
  assert.match(fireOpen, /quantity: targetQuantity/);
  assert.doesNotMatch(fireOpen, /for \(const chunk of chunks\)/);
  assert.match(route, /Number\.isInteger\(quantity\) \|\| quantity < 1 \|\| quantity > 100/);
  assert.match(route, /p_quantity: quantity/);
  assert.match(latestOpenRpc, /open_quantity_options integer\[\] := array\[1, 10, 100\]/);
  assert.match(latestOpenRpc, /if not p_quantity = any\(open_quantity_options\) then[\s\S]*invalid_open_quantity_option/);
  for (const quantity of [1, 10, 100]) {
    assert.ok([1, 10, 100].includes(quantity), `first pull quantity ${quantity} is allowed`);
  }
});

test("repeat pull options use locally updated remaining stock from open result", () => {
  const client = read("src/features/ynot/client.tsx");
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  const panel = client.match(/export function GachaOpenPanel[\s\S]*?export function AddressForm/)?.[0] ?? "";
  const fireOpen = client.match(/function fireOpen[\s\S]*?function openAgain/)?.[0] ?? "";

  assert.match(panel, /const \[remainingState,\s*setRemainingState\] = useState/);
  assert.match(panel, /campaign\.remainingSlots/);
  assert.match(panel, /eligibleUnits: campaign\.eligiblePrizeUnits/);
  assert.match(panel, /campaign\.availablePrizeUnits/);
  assert.match(panel, /remainingState\.remainingSlots/);
  assert.match(
    panel,
    /remainingState\.eligibleUnits \?\?[\s\S]*remainingState\.availableWinSlots \?\?[\s\S]*remainingState\.availablePrizeUnits \?\?/,
  );
  assert.match(panel, /remainingState\.availablePrizeUnits/);
  assert.match(fireOpen, /if \(result\.remaining\) \{/);
  assert.match(fireOpen, /setRemainingState\(\(current\) => \(\{/);
  assert.match(fireOpen, /\.\.\.current/);
  assert.match(fireOpen, /\.\.\.result\.remaining/);
  assert.match(panel, /const visibleRemainingSlots =[\s\S]*remainingState\.remainingSlots \?\? remainingOpenUnits/);
  assert.match(panel, /remainingSlots=\{visibleRemainingSlots\}/);
  assert.match(overlay, /remainingSlots\?: number/);
  assert.match(overlay, /Number\.isFinite\(remainingSlots\)/);
  assert.match(overlay, /gacha-reveal-repeat-stock-left/);
});
