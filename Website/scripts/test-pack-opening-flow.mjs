import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const quantityHelpers = ["openQuantityLimit", "isOpenQuantityAvailable"];
const privateLogicTerms = [
  "stockUnitGroupKey",
  "unlock_at_sold_pct",
  "last_prize_metadata",
];

function namedImportsFrom(source, modulePath) {
  return [...source.matchAll(
    /import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']([^"']+)["'];/g,
  )]
    .filter((match) => match[2] === modulePath)
    .map((match) => match[1])
    .join("\n");
}

function sourceWithoutImports(source) {
  return source.replace(
    /import\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+["'][^"']+["'];/g,
    "",
  );
}

function assertImportsQuantityHelpers(label, source, modulePath) {
  const imports = namedImportsFrom(source, modulePath);
  assert.ok(imports, `${label} imports from ${modulePath}`);
  for (const helper of quantityHelpers) {
    assert.match(imports, new RegExp(`\\b${helper}\\b`), `${label} imports ${helper}`);
  }
}

function assertUsesQuantityHelpers(label, source) {
  const body = sourceWithoutImports(source);
  for (const helper of quantityHelpers) {
    assert.match(body, new RegExp(`\\b${helper}\\(`), `${label} uses ${helper}`);
  }
}

function assertNoPrivateLogicTerms(label, source) {
  for (const term of privateLogicTerms) {
    assert.doesNotMatch(source, new RegExp(`\\b${term}\\b`), `${label} does not expose ${term}`);
  }
}

function sectionBetween(source, startPattern, endPattern, label) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `${label} start section exists`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `${label} end section exists`);
  return rest.slice(0, end);
}

test("open confirmation creates a stable intent before auto-start reveal", () => {
  const arena = read("src/features/ynot/cr/PackDetailArena.tsx");
  const detail = read("src/features/ynot/cr/PackDetailExperience.tsx");
  const packs = read("src/features/ynot/cr/YPackExperience.tsx");
  const packDetailPage = read("src/app/(store)/packs/[slug]/page.tsx");
  assert.match(packDetailPage, /PackDetailArena/);
  for (const source of [arena, detail, packs]) {
    assert.match(source, /createOpenIntentId/);
    assert.match(source, /new URLSearchParams\(\{\s*qty: String\(qty\),\s*auto: "1",\s*intent,/s);
    assert.match(source, /\/open\?\$\{query\.toString\(\)\}/);
  }
});

test("pack detail renders fresh stock data and keeps arena imagery contained", () => {
  const packDetailPage = read("src/app/(store)/packs/[slug]/page.tsx");
  const arena = read("src/features/ynot/cr/PackDetailArena.tsx");
  const css = read("src/app/globals.css");

  assert.match(packDetailPage, /searchParams\?: Promise<\{ opened\?: string \}>/);
  assert.match(packDetailPage, /bypassPublicCache:\s*query\?\.opened === "1"/);
  assert.match(arena, /className="ac-stage"/);
  assert.match(css, /Pack detail arena production fallback/);
  assert.match(css, /html\[data-ynot-theme\] \.ac-stage \{[\s\S]*overflow:\s*hidden/);
  assert.match(css, /html\[data-ynot-theme\] \.ac-fan-card img \{[\s\S]*object-fit:\s*contain/);
  assert.match(css, /max-height:\s*min\(62vh,\s*560px\)/);
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

test("browser reload or back cannot double-charge an auto-start, while Continue Pull creates a new paid intent", () => {
  const helper = read("src/features/ynot/open-intent.ts");
  const route = read("src/app/api/ynot/gacha/open/route.ts");
  const client = read("src/features/ynot/client.tsx");
  const fireOpen = client.match(/function fireOpen[\s\S]*?function openAgain/)?.[0] ?? "";
  const openAgain = client.match(/function openAgain[\s\S]*?function openPullAllAgain/)?.[0] ?? "";
  const autoStartEffect = client.match(/const autoStartFiredRef[\s\S]*?const openAgainOptions/)?.[0] ?? "";

  assert.match(helper, /const normalized = normalizeOpenIntentId\(intentId\)/);
  assert.match(helper, /const safeCampaign = campaignId\.trim\(\)\.toLowerCase\(\)/);
  assert.match(helper, /const safeQuantity = Math\.max\(1, Math\.round\(Number\(quantity\) \|\| 1\)\)/);
  assert.match(helper, /return `\$\{openIntentPrefix\}:\$\{safeCampaign\}:\$\{safeQuantity\}:\$\{normalized\}`;/);
  assert.match(helper, /return `\$\{openIntentPrefix\}:\$\{safeCampaign\}:\$\{safeQuantity\}:\$\{createOpenIntentId\(\)\}`;/);

  assert.match(helper, /url\.searchParams\.delete\("auto"\)/);
  assert.match(helper, /window\.history\.replaceState\(window\.history\.state, "", url\.toString\(\)\)/);
  assert.doesNotMatch(helper, /searchParams\.delete\("intent"\)/);
  assert.doesNotMatch(helper, /searchParams\.delete\("qty"\)/);

  assert.match(autoStartEffect, /if \(autoStartFiredRef\.current\) return/);
  assert.match(autoStartEffect, /autoStartFiredRef\.current = true;[\s\S]*fireOpen\(initialOption\)/);
  assert.match(fireOpen, /if \(openRequestInFlightRef\.current\) return/);
  assert.match(
    fireOpen,
    /idempotencyKey: openIntentIdempotencyKey\(\s*intentId \?\? openIntentId \?\? null,\s*campaign\.id,\s*targetQuantity/s,
  );
  assert.match(fireOpen, /stripOpenAutoStartUrl\(\)/);
  assert.match(route, /const idempotencyKey = normalizeIdempotencyKey\(body\?\.idempotencyKey\)/);
  assert.match(route, /p_idempotency_key: idempotencyKey/);

  assert.match(openAgain, /fireOpen\(nextQuantity,\s*createOpenIntentId\(\)\)/);
  assert.doesNotMatch(openAgain, /fireOpen\(nextQuantity,\s*openIntentId/);
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
  assert.match(panel, /const initialAutoStartBlockedMessage =[\s\S]*quantityDisabledForState\(initialOption, initialRemainingState\)/);
  assert.match(autoStartEffect, /if \(initialAutoStartBlockedMessage\) return;/);
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

test("invalid auto-start quantities stop the pending overlay with a visible error", () => {
  const client = read("src/features/ynot/client.tsx");
  const panel = client.match(/export function GachaOpenPanel[\s\S]*?export function AddressForm/)?.[0] ?? "";

  assert.match(panel, /const initialAutoStartBlockedMessage =[\s\S]*quantityDisabledForState\(initialOption, initialRemainingState\)/);
  assert.match(panel, /"This quantity is not openable right now\."/);
  assert.match(panel, /const \[message,\s*setMessage\] = useState\(initialAutoStartBlockedMessage\)/);
  assert.match(panel, /const \[openingOverlayVisible,\s*setOpeningOverlayVisible\] = useState\(\s*autoStart && !initialAutoStartBlockedMessage,\s*\)/);
  assert.match(panel, /if \(initialAutoStartBlockedMessage\) return;/);
});

test("repeat pull options use locally updated remaining stock from open result", () => {
  const client = read("src/features/ynot/client.tsx");
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  const panel = client.match(/export function GachaOpenPanel[\s\S]*?export function AddressForm/)?.[0] ?? "";
  const fireOpen = client.match(/function fireOpen[\s\S]*?function openAgain/)?.[0] ?? "";
  const finish = client.match(/const handleRevealFinish[\s\S]*?\}, \[campaign\.slug, router\]\);/)?.[0] ?? "";

  assert.match(panel, /const \[remainingState,\s*setRemainingState\]\s*=\s*useState/);
  assert.match(panel, /campaign\.remainingSlots/);
  assert.match(panel, /eligibleUnits: campaign\.eligiblePrizeUnits/);
  assert.match(panel, /campaign\.availablePrizeUnits/);
  assert.match(panel, /remainingState\.remainingSlots/);
  assert.match(panel, /const remainingOpenUnits = openQuantityLimit\(\{/);
  assert.match(panel, /eligibleUnits: remainingState\.eligibleUnits/);
  assert.match(panel, /availableWinSlots: remainingState\.availableWinSlots/);
  assert.match(panel, /remainingState\.availablePrizeUnits/);
  assert.match(client, /return !isOpenQuantityAvailable\(option, \{/);
  assert.match(panel, /return quantityDisabledForState\(option, remainingState\)/);
  assert.match(fireOpen, /if \(result\.remaining\) \{/);
  assert.match(fireOpen, /setRemainingState\(\(current\) => \(\{/);
  assert.match(fireOpen, /\.\.\.current/);
  assert.match(fireOpen, /\.\.\.result\.remaining/);
  assert.match(panel, /const visibleRemainingSlots =[\s\S]*remainingState\.remainingSlots \?\? remainingOpenUnits/);
  assert.match(panel, /pullAllQuantity\(\{[\s\S]*remainingSlots: visibleRemainingSlots/);
  assert.match(panel, /totalSlots: campaign\.totalSlots/);
  assert.match(panel, /hasLastPrize: campaign\.hasLastPrize/);
  assert.match(panel, /campaign\.pullAllReady === true/);
  assert.match(panel, /quantity: pullAllRepeatQuantity/);
  assert.match(panel, /remainingSlots=\{visibleRemainingSlots\}/);
  assert.match(overlay, /remainingSlots\?: number/);
  assert.match(overlay, /Number\.isFinite\(remainingSlots\)/);
  assert.match(overlay, /gacha-reveal-repeat-stock-left/);
  assert.match(finish, /setOpeningOverlayVisible\(false\)/);
  assert.match(finish, /setRevealResult\(null\)/);
  assert.doesNotMatch(finish, /setOpeningOverlayVisible\(true\)/);
  assert.match(finish, /const freshDetailHref = `\$\{detailHref\}\?opened=1`/);
  assert.match(finish, /router\.replace\(freshDetailHref,\s*\{\s*scroll:\s*true\s*\}\)/);
  assert.match(finish, /router\.refresh\(\)/);
  assert.match(finish, /window\.scrollTo\(0,\s*0\)/);
});

test("reveal summary action buttons stay clickable above the auto-skip toggle", () => {
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  const css = read("src/app/globals.css");
  const footer = sectionBetween(
    overlay,
    /<footer className="gacha-reveal-summary-footer">/,
    /<\/footer>/,
    "Gacha reveal summary footer",
  );

  assert.match(footer, /className="gacha-reveal-dock"/);
  assert.match(footer, /className="gacha-reveal-repeat-row"/);
  assert.match(footer, /className="gacha-reveal-toggle"/);
  assert.match(footer, /View collection/);
  assert.match(
    css,
    /\.gacha-reveal-summary-footer \{[\s\S]*pointer-events:\s*none;/,
  );
  assert.match(
    css,
    /\.gacha-reveal-summary-footer \.gacha-reveal-dock \{[\s\S]*z-index:\s*2;/,
  );
  assert.match(
    css,
    /\.gacha-reveal-summary-footer \.gacha-reveal-dock \{[\s\S]*pointer-events:\s*auto;/,
  );
  assert.match(
    css,
    /\.gacha-reveal-summary-footer \.gacha-reveal-dock-action \{[\s\S]*pointer-events:\s*auto;/,
  );
  assert.match(
    css,
    /\.gacha-reveal-repeat-stack \{[\s\S]*pointer-events:\s*auto;/,
  );
  assert.match(
    css,
    /\.gacha-reveal-repeat-action \{[\s\S]*pointer-events:\s*auto;/,
  );
  assert.match(
    css,
    /\.gacha-reveal-summary-footer \.gacha-reveal-toggle \{[\s\S]*z-index:\s*1;/,
  );
});

test("customer Pull All uses the real quote/start flow and stays separate from x100", () => {
  const yPack = read("src/features/ynot/cr/YPackExperience.tsx");
  const arena = read("src/features/ynot/cr/PackDetailArena.tsx");
  const detail = read("src/features/ynot/cr/PackDetailExperience.tsx");
  const client = read("src/features/ynot/client.tsx");
  const revealOverlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  const pullAllModal = read("src/features/ynot/cr/PullAllConfirmModal.tsx");
  const openPage = read("src/app/(store)/gacha/[campaignId]/open/page.tsx");
  const packDetailPage = read("src/app/(store)/packs/[slug]/page.tsx");
  const gachaDetailPage = read("src/app/(store)/gacha/[campaignId]/page.tsx");
  const helper = read("src/features/ynot/pull-all-client.ts");
  const yPackModal = sectionBetween(
    yPack,
    /function OpenPackModal\b/,
    /\n}\s*$/,
    "OpenPackModal",
  );
  const detailDockAndModal = sectionBetween(
    arena,
    /sticky open dock/,
    /slab pack checklist/,
    "PackDetailArena dock and confirm modal",
  );
  const legacyDetailDockAndModal = sectionBetween(
    detail,
    /Open this pack/,
    /function HeroFan\b/,
    "PackDetailExperience dock and confirm modal",
  );
  const revealPanel = sectionBetween(
    client,
    /export function GachaOpenPanel\b/,
    /export function AddressForm\b/,
    "GachaOpenPanel",
  );

  assert.match(helper, /export async function preparePullAllQuote/);
  assert.match(helper, /\/api\/ynot\/gacha\/bulk-open\/quote/);
  assert.match(helper, /export async function startPullAllSession/);
  assert.match(helper, /\/api\/ynot\/gacha\/bulk-open\/start/);
  assert.match(helper, /export async function getCurrentPullAllSession/);
  assert.match(helper, /\/api\/ynot\/gacha\/bulk-open\/current/);
  assert.match(helper, /export async function acknowledgePullAllHighlights/);
  assert.match(helper, /\/api\/ynot\/gacha\/bulk-open\/highlights-seen/);

  assert.match(pullAllModal, /onStarted\?: \(session: PullAllStartedSession, quote: PullAllQuote\) => void/);
  assert.match(pullAllModal, /const session = await startPullAllSession\(quote\.startToken\)/);
  assert.match(pullAllModal, /onStarted\?\.\(session, quote\)/);
  assert.doesNotMatch(pullAllModal, /useRouter/);
  assert.doesNotMatch(pullAllModal, /router\.push/);
  assert.doesNotMatch(pullAllModal, /\/profile\/all-pulls/);

  for (const [label, source] of [
    ["Y-Pack list", yPack],
    ["pack detail", arena],
    ["legacy pack detail", detail],
    ["repeat reveal", `${revealPanel}\n${revealOverlay}`],
  ]) {
    assert.match(source, /PullAllConfirmModal/, `${label} renders PullAllConfirmModal`);
    assert.match(source, /pullAllAvailable/, `${label} gates on public Pull All availability`);
    assert.match(source, /cr-pull-all-action/, `${label} has a distinct Pull All action`);
  }

  assert.match(packDetailPage, /<PackDetailArena[\s\S]*campaign=\{campaign\}/);
  assert.match(gachaDetailPage, /redirect\(`\/packs\/\$\{campaign\.slug\}`\)/);
  assert.match(openPage, /balanceCoins=\{data\.wallet\.balanceCoins\}/);
  assert.match(openPage, /pullAll\?: string/);
  assert.match(openPage, /const pullAllReveal = query\.pullAll === "1"/);
  assert.match(openPage, /\|\| pullAllReveal/);
  assert.match(openPage, /pullAllReveal=\{pullAllReveal\}/);
  assert.match(yPackModal, /onPullAll\(campaign\)/);
  assert.match(yPack, /\/gacha\/\$\{pullAllState\.slug\}\/open\?pullAll=1/);
  assert.match(detailDockAndModal, /setPullAllConfirmOpen\(true\)/);
  assert.match(detailDockAndModal, /\/gacha\/\$\{campaign\.slug\}\/open\?pullAll=1/);
  assert.doesNotMatch(detailDockAndModal, /setQty\(pullAll\)/);
  assert.match(legacyDetailDockAndModal, /setPullAllConfirmOpen\(true\)/);
  assert.match(legacyDetailDockAndModal, /\/gacha\/\$\{campaign\.slug\}\/open\?pullAll=1/);
  assert.doesNotMatch(legacyDetailDockAndModal, /setQty\(pullAll\)/);
  assert.doesNotMatch(yPackModal, /onQtyChange\(pullAll\)|setQty\(pullAll\)/);
  assert.match(revealPanel, /onPullAllAgain/);
  assert.match(revealPanel, /kind: "pull_all"/);
  assert.match(client, /const PULL_ALL_REVEAL_ITEM_LIMIT = 100/);
  assert.match(client, /getCurrentPullAllSession/);
  assert.match(client, /acknowledgePullAllHighlights/);
  assert.match(client, /function pullAllRevealResult/);
  assert.match(client, /\.slice\(0, PULL_ALL_REVEAL_ITEM_LIMIT\)/);
  assert.match(revealPanel, /const \[pullAllRevealSession,\s*setPullAllRevealSession\]/);
  assert.match(revealPanel, /pullAllRevealSession\?\.status === "completed"/);
  assert.match(revealPanel, /const pullAllRevealActive =[\s\S]*Boolean\(pullAllRevealSession\)/);
  assert.match(revealPanel, /const revealOverlay = revealResult && !pullAllRevealActive/);
  assert.match(revealPanel, /displayQuantity=\{pullAllRevealSession\.totalPurchasedRewards\}/);
  assert.match(revealPanel, /summaryTitle=\{<I18nText en="Top rewards" th="รางวัลเด่น" \/>\}/);
  assert.match(revealPanel, /summaryNote=\{pullAllRevealSummaryNote\(pullAllRevealSession,\s*language\)\}/);
  assert.match(revealOverlay, /displayQuantity\?: number/);
  assert.match(revealOverlay, /summaryNote\?: ReactNode/);
  assert.match(revealOverlay, /summaryTitle \?\? <I18nText en="Your Reward" th="รางวัลของคุณ" \/>/);
  assert.match(revealOverlay, /const displayedPullCount = Math\.max/);
  assert.match(revealOverlay, /gacha-reveal-summary-note/);
  assert.doesNotMatch(revealPanel, /onOpenAgain\(pullAll|openAgain\(pullAll/);
});

test("Pull All does not replace configured normal open quantity buttons", () => {
  const yPack = read("src/features/ynot/cr/YPackExperience.tsx");
  const arena = read("src/features/ynot/cr/PackDetailArena.tsx");
  const detail = read("src/features/ynot/cr/PackDetailExperience.tsx");
  const reveal = read("src/features/ynot/client.tsx");
  const quantityHelper = read("src/features/ynot/open-quantity.ts");
  const yPackModal = sectionBetween(
    yPack,
    /function OpenPackModal\b/,
    /\n}\s*$/,
    "OpenPackModal",
  );
  const arenaDockAndModal = sectionBetween(
    arena,
    /sticky open dock/,
    /slab pack checklist/,
    "PackDetailArena dock and confirm modal",
  );
  const legacyDetailDockAndModal = sectionBetween(
    detail,
    /Open this pack/,
    /function HeroFan\b/,
    "PackDetailExperience dock and confirm modal",
  );
  const revealPanel = sectionBetween(
    reveal,
    /export function GachaOpenPanel\b/,
    /export function AddressForm\b/,
    "GachaOpenPanel",
  );

  assert.match(quantityHelper, /allowedOpenQuantityOptions = \[1, 10, 100\]/);
  assert.match(yPackModal, /const openQty = normalizeOpenQuantityOptions\(campaign\.openQuantityOptions\)/);
  assert.match(arena, /const openQty = normalizeOpenQuantityOptions\(campaign\.openQuantityOptions\)/);
  assert.match(detail, /const openQty = normalizeOpenQuantityOptions\(campaign\.openQuantityOptions\)/);
  for (const [label, source] of [
    ["Y-Pack open modal", yPackModal],
    ["active pack detail", arenaDockAndModal],
    ["legacy pack detail", legacyDetailDockAndModal],
  ]) {
    assert.match(
      source,
      /openQty\.map\(\(q\) => \{[\s\S]*<button[\s\S]*×\{q\}/,
      `${label} renders each configured normal quantity button`,
    );
    assert.match(
      source,
      /openQty\.map\(\(q\) => \{[\s\S]*\}\)\}[\s\S]*pullAllAvailable[\s\S]*Pull All/,
      `${label} appends Pull All after normal quantities`,
    );
  }
  assert.match(
    revealPanel,
    /const openAgainOptions = openQuantityOptions\.map\(\(option\) => \(\{/,
  );
  assert.match(
    revealPanel,
    /pullAllRepeatOption \? \[\.\.\.openAgainOptions, pullAllRepeatOption\] : openAgainOptions/,
  );
});

test("active pack detail prize images stay in fixed-size card tracks", () => {
  const arena = read("src/features/ynot/cr/PackDetailArena.tsx");
  const globals = read("src/app/globals.css");

  assert.match(
    arena,
    /className=(?:"ac-tier ac-tier-last"|\{"ac-tier ac-tier-last"\})/,
    "last prize section should render the ac-tier-last class used by the desktop grid contract",
  );
  assert.match(
    arena,
    /\.ac-tier-rainbow \.ac-grid,[\s\S]*\.ac-tier-last \.ac-grid \{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/,
    "grand and last prize rows should use 4 larger cards on desktop",
  );
  assert.match(
    arena,
    /\.ac-tier-gold \.ac-grid,[\s\S]*\.ac-tier-silver \.ac-grid,[\s\S]*\.ac-tier-bronze \.ac-grid \{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\);/,
    "first, second, and third prize rows should use 6 cards on desktop",
  );
  assert.match(
    arena,
    /@media \(min-width:\s*921px\) and \(max-width:\s*1180px\) \{[\s\S]*\.ac-tier-rainbow \.ac-grid,[\s\S]*\.ac-tier-last \.ac-grid \{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[\s\S]*\.ac-tier-gold \.ac-grid,[\s\S]*\.ac-tier-silver \.ac-grid,[\s\S]*\.ac-tier-bronze \.ac-grid \{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/,
    "tablet widths should reduce prize grids before the mobile breakpoint",
  );
  assert.match(
    arena,
    /@media \(max-width:\s*\d+px\) \{[\s\S]*\.ac-grid,[\s\S]*\.ac-tier-rainbow \.ac-grid,[\s\S]*\.ac-tier-last \.ac-grid,[\s\S]*\.ac-tier-gold \.ac-grid,[\s\S]*\.ac-tier-silver \.ac-grid,[\s\S]*\.ac-tier-bronze \.ac-grid \{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
    "mobile should keep a two-card grid for all prize tiers",
  );
  assert.match(
    arena,
    /\.ac-slab-art img \{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*object-fit:\s*contain;/,
    "prize images should fit inside the fixed card frame without cropping",
  );
  assert.match(
    arena,
    /\.ac-lightbox-backdrop \{[\s\S]*padding:\s*24px;[\s\S]*box-sizing:\s*border-box;/,
    "lightbox backdrop should keep viewport padding in the box model",
  );
  assert.match(
    arena,
    /\.ac-lightbox-main \{[\s\S]*max-width:\s*min\(100%,\s*560px\);[\s\S]*max-height:\s*min\(68vh,\s*620px\);[\s\S]*object-fit:\s*contain;/,
    "lightbox main image should be contained within a bounded viewport stage",
  );
  assert.match(
    globals,
    /html\[data-ynot-theme\] \.ac-tier-rainbow \.ac-grid,[\s\S]*html\[data-ynot-theme\] \.ac-tier-last \.ac-grid \{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/,
    "global YNOT theme override should not replace grand/last grids with auto-fit",
  );
  assert.match(
    globals,
    /html\[data-ynot-theme\] \.ac-tier-gold \.ac-grid,[\s\S]*html\[data-ynot-theme\] \.ac-tier-silver \.ac-grid,[\s\S]*html\[data-ynot-theme\] \.ac-tier-bronze \.ac-grid \{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\);/,
    "global YNOT theme override should preserve six-column lower prize grids",
  );
  assert.match(
    globals,
    /html\[data-ynot-theme\] \.ac-lightbox-main \{[\s\S]*max-width:\s*min\(100%,\s*560px\);[\s\S]*max-height:\s*min\(68vh,\s*620px\);[\s\S]*object-fit:\s*contain;/,
    "global YNOT theme override should keep the lightbox image bounded",
  );
  assert.match(
    globals,
    /@keyframes ac-card-turn \{[\s\S]*rotateY\(15deg\)[\s\S]*rotateY\(-15deg\)/,
    "global YNOT theme animation should include the card-turn keyframes it references",
  );
});

test("active pack detail fan cards open the spinning lightbox", () => {
  const arena = read("src/features/ynot/cr/PackDetailArena.tsx");
  const fanButton =
    arena.match(
      /<button(?:(?!<\/button>)[\s\S])*className=\{`ac-fan-card\$\{o === 0 \? " is-center" : ""\}`\}(?:(?!<\/button>)[\s\S])*<\/button>/,
    )?.[0] ?? "";

  assert.match(
    arena,
    /const\s+openPrizeLightbox\s*=\s*\(\s*slab:\s*Slab\s*\)\s*=>\s*(?:\{\s*)?setLightbox\(slab\);?(?:\s*\})?/,
    "pack detail should expose one shared prize-lightbox opener",
  );
  assert.match(
    arena,
    /const\s+isVisible\s*=\s*abs\s*<=\s*visHalf;/,
    "fan-card rendering should distinguish visible cards from hidden animation buffers",
  );
  assert.match(fanButton, /type="button"/, "top fan cards should be rendered as buttons");
  assert.match(
    fanButton,
    /tabIndex=\{isVisible \? 0 : -1\}/,
    "hidden fan-card buffer buttons should be removed from tab order",
  );
  assert.match(
    fanButton,
    /aria-hidden=\{!isVisible\}/,
    "hidden fan-card buffer buttons should be hidden from assistive tech",
  );
  assert.match(
    fanButton,
    /onClick=\{isVisible \? \(\) => openPrizeLightbox\(s\) : undefined\}/,
    "only visible fan cards should be clickable buttons that open the lightbox",
  );
  assert.match(
    arena,
    /pointerEvents:\s*isVisible \? undefined : "none"/,
    "hidden fan-card buffers should not receive pointer events",
  );
  assert.match(
    fanButton,
    /aria-label=\{isVisible \? \(language === "th" \? `ดูภาพรางวัล \$\{s\.name\}` : `View prize image \$\{s\.name\}`\) : undefined\}/,
    "visible fan-card buttons should have localized accessible labels",
  );
  assert.doesNotMatch(
    fanButton,
    /onClick=\{\(\) => openPrizeLightbox\(s\)\}/,
    "fan-card buttons should not keep hidden buffer cards clickable",
  );
  assert.doesNotMatch(
    arena,
    /<div className=\{`ac-fan-card\$\{o === 0 \? " is-center" : ""\}`\}/,
    "top fan cards should not remain non-interactive divs",
  );
  assert.match(
    arena,
    /\.ac-fan-card \{[\s\S]*border:\s*0;[\s\S]*padding:\s*0;[\s\S]*cursor:\s*pointer;/,
    "fan-card button reset should keep the existing visual treatment",
  );
  assert.match(
    arena,
    /\.ac-fan-card:focus-visible \{[\s\S]*outline:\s*2px solid #000;/,
    "fan-card buttons should have a visible keyboard focus state",
  );
});

test("public open quantity surfaces share final-slot helpers without exposing private logic terms", () => {
  const helper = read("src/features/ynot/open-quantity.ts");
  const client = read("src/features/ynot/client.tsx");
  const arena = read("src/features/ynot/cr/PackDetailArena.tsx");
  const detail = read("src/features/ynot/cr/PackDetailExperience.tsx");
  const yPack = read("src/features/ynot/cr/YPackExperience.tsx");
  const revealPanel = sectionBetween(
    client,
    /export function GachaOpenPanel\b/,
    /export function AddressForm\b/,
    "GachaOpenPanel",
  );
  const yPackModal = sectionBetween(
    yPack,
    /function OpenPackModal\b/,
    /\n}\s*$/,
    "OpenPackModal",
  );

  assertImportsQuantityHelpers("reveal page", client, "./open-quantity");
  assertImportsQuantityHelpers("active pack detail", arena, "../open-quantity");
  assertImportsQuantityHelpers("pack detail", detail, "../open-quantity");
  assertImportsQuantityHelpers("Y-Pack modal", yPack, "../open-quantity");
  assertUsesQuantityHelpers("reveal page", client);
  assertUsesQuantityHelpers("active pack detail", arena);
  assertUsesQuantityHelpers("pack detail", detail);
  assertUsesQuantityHelpers("Y-Pack modal", yPackModal);

  for (const exportName of quantityHelpers) {
    assert.match(
      helper,
      new RegExp(`export\\s+(?:function|const)\\s+${exportName}\\b`),
      `open-quantity exports ${exportName}`,
    );
  }

  assertNoPrivateLogicTerms("reveal page", revealPanel);
  assertNoPrivateLogicTerms("pack detail", detail);
  assertNoPrivateLogicTerms("Y-Pack modal", yPackModal);
});

test("localhost preview opens land public rewards in the preview bag", () => {
  const previewStore = read("src/features/ynot/local-preview-rewards.ts");
  const openRoute = read("src/app/api/ynot/gacha/open/route.ts");
  const data = read("src/features/ynot/data.ts");
  const previewAuth = read("src/app/api/dev/preview-auth/route.ts");

  assert.match(previewAuth, /ynot-preview-auth/);
  assert.match(previewAuth, /LOCAL_PREVIEW_SOLD_STATE_COOKIE/);
  assert.match(previewAuth, /clearPreviewRewardsForProfile/);
  assert.match(previewAuth, /url\.searchParams\.get\("reset"\)/);
  assert.match(previewAuth, /url\.searchParams\.get\("sold"\)/);
  assert.match(previewAuth, /soldState === "after60"/);
  assert.match(previewStore, /export const LOCAL_PREVIEW_PROFILE_ID/);
  assert.match(previewStore, /export const LOCAL_PREVIEW_SOLD_STATE_COOKIE/);
  assert.match(previewStore, /export async function recordPreviewOpenResult/);
  assert.match(previewStore, /openedSlotsByProfileCampaign/);
  assert.match(previewStore, /export function nextPreviewOpenRemaining/);
  assert.match(previewStore, /previewAfter60RemainingSlots/);
  assert.match(previewStore, /store\.openedSlotsByProfileCampaign\.set/);
  assert.match(previewStore, /export function previewCollectionForProfile/);
  assert.match(previewStore, /export function previewOpenHistoryForProfile/);
  assert.match(previewStore, /collectionItemActionToken/);
  assert.match(previewStore, /previewAddressesForProfile/);
  assert.match(previewStore, /addressActionToken/);
  assert.match(previewStore, /YnotCollectionItem/);
  assert.match(previewStore, /YnotGachaOpenHistory/);
  assert.match(previewStore, /Partial<PreviewRewardStore>/);
  assert.match(previewStore, /store\.collectionByProfile \?\?= new Map\(\)/);
  assert.match(previewStore, /store\.walletBonusCoinsByProfile \?\?= new Map\(\)/);
  assert.doesNotMatch(previewStore, /draw_round_prize_units|card_stock_unit_id|stockUnitGroupKey/);

  assert.match(openRoute, /recordPreviewOpenResult/);
  assert.match(openRoute, /nextPreviewOpenRemaining/);
  assert.match(openRoute, /const previewResult = await buildPreviewOpenResult/);
  assert.match(openRoute, /remaining: previewRemaining \? \{ campaignId, \.\.\.previewRemaining \} : \{ campaignId \}/);
  assert.match(openRoute, /await recordPreviewOpenResult\(\{[\s\S]*profileId: session\.profileId/);
  assert.match(openRoute, /return Response\.json\(\{[\s\S]*result: previewResult,[\s\S]*\}\)/);

  assert.match(data, /LOCAL_PREVIEW_PROFILE_ID/);
  assert.match(data, /applyLocalPreviewAfter60SoldState/);
  assert.match(data, /const previewSoldState =[\s\S]*localPreviewSoldStateForViewer\(viewer\)/);
  assert.match(data, /const projectedCampaigns = previewSoldState[\s\S]*applyLocalPreviewAfter60SoldState\(campaign, previewSoldState\)/);
  assert.match(data, /campaigns: projectedCampaigns/);
  assert.match(data, /localPreviewAfter60RemainingSlots/);
  assert.match(data, /pullAllAvailable: true/);
  assert.match(data, /pullAllReady: true/);
  assert.match(data, /pullAllReadinessStatus: "ready"/);
  assert.match(data, /previewCollectionForProfile/);
  assert.match(data, /previewOpenHistoryForProfile/);
  assert.match(data, /previewAddressesForProfile/);
  assert.match(data, /profileId === LOCAL_PREVIEW_PROFILE_ID/);
});
