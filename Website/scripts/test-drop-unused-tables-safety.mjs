import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const DEAD_TABLES = ["site_settings", "email_otps"];

// Recursively collect every .ts/.tsx file under Website/src, excluding the
// generated Supabase types file (which legitimately lists every table until a
// types regen runs against the post-migration schema).
function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name) && !full.endsWith("src/lib/supabase/types.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

test("no application source references the dropped tables", () => {
  const files = collectSourceFiles(here("../src"));
  const offenders = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const table of DEAD_TABLES) {
      if (src.includes(`"${table}"`) || src.includes(`'${table}'`)) {
        offenders.push(`${file} references ${table}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `dropped tables are still referenced:\n${offenders.join("\n")}`);
});

test("a migration drops both unused tables with cascade", () => {
  const migrationsDir = here("../../Database/supabase/migrations");
  const sql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(`${migrationsDir}/${f}`, "utf8"))
    .join("\n");
  for (const table of DEAD_TABLES) {
    assert.match(
      sql,
      new RegExp(`drop table if exists public\\.${table} cascade`, "i"),
      `expected a migration to "drop table if exists public.${table} cascade"`,
    );
  }
});

test("generated types no longer declare site_settings", () => {
  const types = readFileSync(here("../src/lib/supabase/types.ts"), "utf8");
  assert.doesNotMatch(types, /\bsite_settings:\s*\{/, "site_settings must be removed from types.ts");
});
