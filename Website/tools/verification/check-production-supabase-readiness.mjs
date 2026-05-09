#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();

function loadEnvFile(file) {
  const path = resolve(root, file);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    const value = rawValue
      .trim()
      .replace(/^['"]|['"]$/g, "")
      .replace(/\\n/g, "\n");
    process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const failures = [];
const warnings = [];

function projectRefFromUrl(value) {
  try {
    return new URL(value).hostname.split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`WARN ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

if (!url || !serviceKey) {
  fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

console.log(`Supabase project ref: ${projectRefFromUrl(url)}`);
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function checkTable(table, required = true) {
  const { error } = await supabase.from(table).select("id").limit(1);
  if (!error) {
    pass(`table ${table} is available`);
    return true;
  }
  const message = `table ${table} unavailable: ${error.code ?? "UNKNOWN"} ${error.message}`;
  if (required) fail(message);
  else warn(message);
  return false;
}

async function checkRpc(name, args, required = true) {
  const { error } = await supabase.rpc(name, args);
  if (!error) {
    pass(`rpc ${name} is available`);
    return true;
  }
  const missing = error.code === "PGRST202" || /Could not find the function|schema cache/i.test(error.message);
  const message = `rpc ${name} unavailable: ${error.code ?? "UNKNOWN"} ${error.message}`;
  if (required || missing) fail(message);
  else warn(message);
  return false;
}

async function checkToneColumn(table) {
  const { error } = await supabase.from(table).select("tone").limit(1);
  if (!error) {
    warn(`legacy ${table}.tone column still exists; deploy no-tone app first, then apply 20260509183000_remove_card_tone_fields.sql`);
    return;
  }
  if (error.code === "42703" || /column .*tone.* does not exist/i.test(error.message)) {
    pass(`legacy ${table}.tone column is removed`);
    return;
  }
  warn(`could not determine ${table}.tone status: ${error.code ?? "UNKNOWN"} ${error.message}`);
}

await checkTable("store_categories");
await checkTable("draw_round_categories");
await checkTable("draw_round_prize_units");
await checkTable("seed_runs");
await checkRpc("get_draw_round_inventory_summary", {
  p_draw_round_id: "00000000-0000-0000-0000-000000000000",
  p_profile_id: null,
});
await checkToneColumn("cards");
await checkToneColumn("draw_round_prizes");

if (failures.length) {
  console.error(`\nProduction Supabase readiness failed with ${failures.length} blocker(s).`);
  if (warnings.length) console.error(`${warnings.length} warning(s) also reported.`);
  process.exit(1);
}

console.log("\nProduction Supabase readiness passed.");
if (warnings.length) console.log(`${warnings.length} warning(s) reported.`);
