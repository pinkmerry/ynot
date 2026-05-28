import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "../Database/supabase/migrations/20260528020000_identity_review_only_linking.sql",
);
const fixturePath = path.join(root, "tools/fixtures/identity-review-safety.json");

const migration = fs.readFileSync(migrationPath, "utf8");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

function functionBody(name) {
  const startNeedle = `create or replace function ${name}`;
  const start = migration.indexOf(startNeedle);
  assert.notEqual(start, -1, `${name} function is present`);
  const bodyStart = migration.indexOf("as $$", start);
  assert.notEqual(bodyStart, -1, `${name} function has body`);
  const end = migration.indexOf("\n$$;", bodyStart);
  assert.notEqual(end, -1, `${name} function body terminates`);
  return migration.slice(start, end);
}

function assertNoForbiddenTableUpdates(sql, label) {
  for (const table of fixture.forbiddenTables) {
    assert.doesNotMatch(
      sql,
      new RegExp(`\\b(?:update|insert into|delete from)\\s+public\\.${table}\\b`, "i"),
      `${label} must not mutate ${table}`,
    );
  }
}

test("legacy account merge RPCs fail closed before mutating data", () => {
  for (const name of [
    "public.complete_account_merge_request",
    "public.reject_account_merge_request",
    "app_private.link_identity_to_existing_profile",
  ]) {
    const sql = functionBody(name);
    assert.match(sql, new RegExp(fixture.expectedError), `${name} raises disabled error`);
    assertNoForbiddenTableUpdates(sql, name);
    assert.doesNotMatch(sql, /\bupdate\s+public\.user_identities\b/i, `${name} does not move identities`);
  }
});

test("identity review approval mutates only the identity and review/audit records", () => {
  const sql = functionBody("public.approve_identity_review_request");
  assert.match(sql, /\bupdate\s+public\.user_identities\b/i, "approval updates the identity row");
  assert.match(sql, /\bupdate\s+public\.account_merge_requests\b/i, "approval updates review row");
  assert.match(sql, /\binsert into\s+public\.account_merge_events\b/i, "approval writes review event");
  assert.match(sql, /\binsert into\s+public\.audit_events\b/i, "approval writes audit event");
  assertNoForbiddenTableUpdates(sql, "identity review approval");
});

test("identity review rejection does not move identities or account data", () => {
  const sql = functionBody("public.reject_identity_review_request");
  assert.match(sql, /\bupdate\s+public\.account_merge_requests\b/i, "rejection updates review row");
  assert.match(sql, /\binsert into\s+public\.account_merge_events\b/i, "rejection writes review event");
  assert.match(sql, /\binsert into\s+public\.audit_events\b/i, "rejection writes audit event");
  assert.doesNotMatch(sql, /\bupdate\s+public\.user_identities\b/i, "rejection does not move identity rows");
  assertNoForbiddenTableUpdates(sql, "identity review rejection");
});

test("application code no longer uses identity upsert or merge RPC for linking", () => {
  const rels = [
    "src/lib/auth/profile.ts",
    "src/lib/auth/identity-merge.ts",
    "src/lib/line/link-identity.ts",
  ];
  const source = rels
    .map((rel) => fs.readFileSync(path.join(root, rel), "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /from\("user_identities"\)\.upsert/, "provider identities are not reassigned by upsert");
  assert.doesNotMatch(source, /\.rpc\("link_identity_to_existing_profile"/, "email verification does not call merge RPC");
  assert.match(source, /identity_review_only/, "identity review marker is present in app-created requests");
});
