#!/usr/bin/env node
// Static RLS/search_path coverage check over the Database/supabase/migrations
// folder. Runs without a live Supabase connection.
//
// Asserts:
//   1. Every `create table if not exists public.<name>` has a matching
//      `alter table public.<name> enable row level security` somewhere in the
//      migration history. Tables explicitly listed in TABLES_EXEMPT_FROM_RLS
//      are skipped.
//   2. Every `create or replace function` body that includes
//      `security definer` ALSO sets `search_path`. Without it, a malicious
//      schema in the caller's path can shadow built-ins.
//   3. No migration grants `select` / `insert` / `update` / `delete` on
//      public.admin_users to anon or authenticated (closed by design — only
//      service_role may read/write the admin roster).

import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const MIGRATIONS_DIR = resolve(
  process.cwd(),
  "..",
  "Database",
  "supabase",
  "migrations",
);

// Tables that legitimately don't need RLS (e.g. internal app_private schemas,
// or fully service-role-only tables that don't accept authenticated access
// at all). Keep this list short and justified.
const TABLES_EXEMPT_FROM_RLS = new Set([
  // (empty — all current public tables enable RLS)
]);

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f, body: readFileSync(join(MIGRATIONS_DIR, f), "utf8") }));
}

const migrations = listMigrations();
const concatenated = migrations.map((m) => m.body).join("\n\n");

// 1. RLS coverage
const tableCreateRe = /create table if not exists public\.([a-z_][a-z0-9_]*)/gi;
const tables = new Set();
let match;
while ((match = tableCreateRe.exec(concatenated)) !== null) {
  tables.add(match[1]);
}

for (const table of tables) {
  if (TABLES_EXEMPT_FROM_RLS.has(table)) {
    pass(`table public.${table} exempt from RLS check`);
    continue;
  }
  const enableRe = new RegExp(
    `alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
    "i",
  );
  if (enableRe.test(concatenated)) {
    pass(`RLS enabled on public.${table}`);
  } else {
    fail(`RLS NOT enabled on public.${table}`);
  }
}

// 2. SECURITY DEFINER functions must set search_path
const fnBlocks = concatenated.split(/create\s+or\s+replace\s+function\s+/gi).slice(1);
let definerCount = 0;
let definerWithSearchPath = 0;
for (const block of fnBlocks) {
  // Function body up to the `$$;` / `language sql` / `as $$` markers — take a
  // generous chunk so we capture the function header settings.
  const header = block.slice(0, 2000).toLowerCase();
  const isDefiner = /\bsecurity\s+definer\b/.test(header);
  if (!isDefiner) continue;
  definerCount += 1;
  const hasSearchPath = /set\s+search_path\s*=/.test(header);
  // Pull the function signature for the message
  const sig = block.slice(0, block.indexOf("(")).trim().split(/\s+/)[0] ?? "<unknown>";
  if (hasSearchPath) {
    definerWithSearchPath += 1;
    pass(`SECURITY DEFINER ${sig} sets search_path`);
  } else {
    fail(`SECURITY DEFINER ${sig} does NOT set search_path`);
  }
}

console.log(
  `\n${definerWithSearchPath}/${definerCount} SECURITY DEFINER functions set search_path.`,
);

// 3. admin_users must never be granted to anon/authenticated
const adminGrantRe = /grant\s+(select|insert|update|delete|all)[^;]*\bon\s+public\.admin_users\b[^;]*\bto\s+([^;]+);/gi;
while ((match = adminGrantRe.exec(concatenated)) !== null) {
  const targets = match[2].toLowerCase();
  if (targets.includes("anon") || targets.includes("authenticated")) {
    fail(
      `admin_users granted ${match[1]} to anon/authenticated (target: ${targets.trim()}) — table must be service_role only`,
    );
  }
}
if (!failures.some((f) => f.includes("admin_users granted"))) {
  pass("admin_users has no anon/authenticated grants");
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll RLS coverage checks passed.`);
