import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");

function appPath(relPath) {
  return path.join(appRoot, relPath);
}

function repoPath(relPath) {
  return path.join(repoRoot, relPath);
}

function readApp(relPath) {
  return readFileSync(appPath(relPath), "utf8");
}

function readRepo(relPath) {
  return readFileSync(repoPath(relPath), "utf8");
}

function blockBetween(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing end marker after ${start}: ${end}`);
  return source.slice(from, to);
}

function latestMigrationMatching(pattern) {
  const migrationDir = repoPath("Database/supabase/migrations");
  const match = readdirSync(migrationDir)
    .filter((name) => pattern.test(name))
    .sort()
    .at(-1);
  assert.ok(match, `missing migration matching ${pattern}`);
  return readRepo(`Database/supabase/migrations/${match}`);
}

test("customer security regression harness can read app, database, and test files", () => {
  assert.ok(existsSync(appPath("src/features/auth/actions.ts")));
  assert.ok(existsSync(appPath("src/app/api/lucky-draw/route.ts")));
  assert.ok(existsSync(repoPath("Database/supabase/migrations/202605010002_fix_slot_claim_rpc.sql")));

  const authActions = readApp("src/features/auth/actions.ts");
  assert.match(authActions, /enforceRateLimit/);
  assert.match(authActions, /normalizeSignupEmail/);

  const luckyDrawRoute = readApp("src/app/api/lucky-draw/route.ts");
  assert.match(luckyDrawRoute, /verifyImageMagicBytes/);
  assert.match(luckyDrawRoute, /resolveCurrentProfile/);

  const slotClaimMigration = latestMigrationMatching(/fix_slot_claim_rpc\.sql$/);
  assert.match(slotClaimMigration, /create or replace function public\.claim_order_slots/);
  assert.match(slotClaimMigration, /security invoker/);

  const productionSecurityHarness = readApp("scripts/test-production-security-regressions.mjs");
  assert.match(
    productionSecurityHarness,
    /public storefront routes do not statically reach admin controls/,
  );
});
