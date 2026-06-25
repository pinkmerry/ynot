import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function sectionBetween(source, startPattern, endPattern, label) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `${label} start section exists`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `${label} end section exists`);
  return rest.slice(0, end);
}

test("planned quantity provides the public xN pack-detail badge", () => {
  const helper = read("src/features/ynot/bundle-quantity.ts");
  assert.match(helper, /export function publicPlannedQuantityBadge/);
  assert.match(helper, /plannedQuantityForPrize\(\{ quantity: value \}\)/);
  assert.match(helper, /return planned;/);
  assert.doesNotMatch(helper, /maxPublicQuantityBadge/);
  assert.doesNotMatch(helper, /Math\.min\(planned/);

  const types = read("src/features/ynot/types.ts");
  assert.match(types, /quantityBadge\?: number;/);

  const data = read("src/features/ynot/data.ts");
  assert.match(data, /publicPlannedQuantityBadge/);
  assert.match(data, /quantityBadge: publicPlannedQuantityBadge\(counts\.total\)/);
  assert.match(data, /quantityBadge: prize\.quantityBadge/);
});

test("pack detail renders quantity badge from Qty instead of Per win", () => {
  const detail = read("src/features/ynot/cr/PackDetailExperience.tsx");
  assert.match(detail, /<QuantityBadge quantity=\{prize\.quantityBadge\} \/>/);
  assert.doesNotMatch(detail, /<QuantityBadge quantity=\{prize\.bundleQuantity\} \/>/);
});

test("normal admin pack creation keeps one reward per win", () => {
  const client = read("src/features/ynot/client.tsx");
  assert.match(client, /normalRewardBundleQuantity/);
  assert.match(client, /bundleQuantity: normalRewardBundleQuantity\(\)/);
  assert.doesNotMatch(client, /<span>Per win<\/span>/);
  assert.doesNotMatch(client, /maxBundleQuantity/);

  const detailBadgeField = sectionBetween(
    client,
    /className="admin-field admin-prize-bundle-field"/,
    /className="admin-field admin-prize-convert-field"/,
    "admin detail badge field",
  );
  assert.match(detailBadgeField, /Detail badge/);
  assert.match(detailBadgeField, /wins, 1 reward each/);
  assert.doesNotMatch(detailBadgeField, /<input/);
  assert.doesNotMatch(detailBadgeField, /stock/);
});

test("customer collection and reward surfaces do not render xN bundle badges", () => {
  const client = read("src/features/ynot/client.tsx");
  const history = read("src/features/ynot/cr/HistoryExperience.tsx");
  const pulls = read("src/features/ynot/cr/AllPullsExperience.tsx");

  const convertRow = sectionBetween(
    client,
    /className=\{`collection-convert-row/,
    /<div className="collection-convert-row-body">/,
    "collection convert row thumbnail",
  );
  assert.doesNotMatch(convertRow, /QuantityBadge/);

  const collectionArt = sectionBetween(
    history,
    /className=\{`cr-coll-art/,
    /className=\{`cr-coll-status/,
    "collection card art",
  );
  assert.doesNotMatch(collectionArt, /QuantityBadge/);

  const pullThumb = sectionBetween(
    pulls,
    /className="cr-pulls-row"/,
    /<div\s+className="cr-stack"/,
    "all pulls reward thumbnail",
  );
  assert.doesNotMatch(pullThumb, /QuantityBadge/);
});

test("pack detail prize art uses stable contain frames and convert modal hover stays readable", () => {
  const arena = read("src/features/ynot/cr/PackDetailArena.tsx");
  const theme = read("src/features/ynot/cr/theme.css");
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
    /@keyframes ac-card-turn \{[\s\S]*rotateY\(15deg\)[\s\S]*rotateY\(-15deg\)/,
    "global YNOT theme animation should include the card-turn keyframes it references",
  );
  assert.match(arena, /\.ac-slab-art \{[^}]*aspect-ratio: 3 \/ 4/s);
  assert.match(arena, /\.ac-slab-art img \{[^}]*object-fit: contain/s);
  assert.match(theme, /\.cr-prize-card-art img \{[^}]*object-fit: contain/s);
  assert.match(theme, /\.cr-coll-art-img \{[^}]*object-fit: contain/s);
  assert.match(globals, /\.collection-convert-modal-button\.is-primary:hover:not\(:disabled\)/);
  assert.match(globals, /color: #1d150a;/);
});
