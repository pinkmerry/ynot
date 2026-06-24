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
  assert.match(helper, /export const maxPublicQuantityBadge = 10;/);
  assert.match(helper, /export function publicPlannedQuantityBadge/);
  assert.match(helper, /plannedQuantityForPrize\(\{ quantity: value \}\)/);
  assert.match(helper, /Math\.min\(planned, maxPublicQuantityBadge\)/);

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

  assert.match(arena, /\.ac-grid \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(220px, 274px\)\)/);
  assert.match(arena, /\.ac-slab-art \{[^}]*aspect-ratio: 3 \/ 4/s);
  assert.match(arena, /\.ac-slab-art img \{[^}]*object-fit: contain/s);
  assert.match(theme, /\.cr-prize-card-art img \{[^}]*object-fit: contain/s);
  assert.match(theme, /\.cr-coll-art-img \{[^}]*object-fit: contain/s);
  assert.match(globals, /\.collection-convert-modal-button\.is-primary:hover:not\(:disabled\)/);
  assert.match(globals, /color: #1d150a;/);
});
