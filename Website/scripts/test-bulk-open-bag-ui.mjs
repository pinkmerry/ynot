import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const packageJson = JSON.parse(read("package.json"));
const componentPath = "src/features/ynot/cr/BulkOpenBagStatus.tsx";

function requireComponent() {
  assert.equal(
    existsSync(new URL(`../${componentPath}`, import.meta.url)),
    true,
    `${componentPath} must exist`,
  );
  return read(componentPath);
}

function compact(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\s+/g, " ");
}

test("package exposes the scoped bulk open bag UI test script", () => {
  assert.equal(
    packageJson.scripts["test:bulk-open-bag-ui"],
    "node --test scripts/test-bulk-open-bag-ui.mjs",
  );
});

test("bulk open bag status fetches current session and acknowledges highlights", () => {
  const source = requireComponent();

  assert.match(source, /export function BulkOpenBagStatus/);
  assert.match(source, /\/api\/ynot\/gacha\/bulk-open\/current/);
  assert.match(source, /\/api\/ynot\/gacha\/bulk-open\/highlights-seen/);
  assert.match(source, /method:\s*"POST"/);
  assert.match(source, /publicCode/);
});

test("bulk open bag status polls active visible sessions at a low frequency", () => {
  const source = requireComponent();
  const compactSource = compact(source);

  assert.match(source, /BULK_OPEN_BAG_POLL_MS\s*=\s*15_000/);
  assert.match(source, /setInterval/);
  assert.match(source, /clearInterval/);
  assert.match(compactSource, /document\.visibilityState\s*!==\s*"visible"/);
  assert.match(source, /isActiveBulkOpenStatus/);

  for (const status of ["queued", "processing", "retry_required"]) {
    assert.match(source, new RegExp(`"${status}"`));
  }
});

test("bulk open bag status caps public highlights and avoids private terms", () => {
  const source = requireComponent();

  assert.match(source, /BULK_OPEN_BAG_HIGHLIGHT_LIMIT\s*=\s*100/);
  assert.match(source, /\.slice\(0,\s*BULK_OPEN_BAG_HIGHLIGHT_LIMIT\)/);
  assert.match(source, /Array\.isArray\(session\.highlights\)/);
  assert.match(source, /function readHighlight/);

  for (const term of [
    "quote_hash",
    "pack_open_contract_hash",
    "raw_slot",
    "idempotency_key",
    "reward_weights",
    "logic_snapshot",
    "queue_job_id",
    "locked_by",
    "house",
  ]) {
    assert.equal(source.includes(term), false, `${componentPath} exposes ${term}`);
  }
});

test("bulk open bag status is mounted in Bag and All Pulls pages", () => {
  const history = read("src/features/ynot/cr/HistoryExperience.tsx");
  const allPulls = read("src/features/ynot/cr/AllPullsExperience.tsx");

  assert.match(history, /import \{ BulkOpenBagStatus \} from "\.\/BulkOpenBagStatus"/);
  assert.match(allPulls, /import \{ BulkOpenBagStatus \} from "\.\/BulkOpenBagStatus"/);
  assert.match(history, /<PageHead[\s\S]*?\/>\s*<BulkOpenBagStatus \/>/);
  assert.match(allPulls, /<PageHead[\s\S]*?\/>\s*<BulkOpenBagStatus \/>/);
});
