#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const APPLY_ACK = "I_UNDERSTAND_MARKETPLACE_ACCOUNT_BACKFILL_WRITES";
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteRoot = resolve(__dirname, "../..");

function loadEnvFile(file) {
  const path = resolve(websiteRoot, file);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue
      .trim()
      .replace(/^['"]|['"]$/g, "")
      .replace(/\\n/g, "\n");
  }
}

function parseArgs(argv) {
  const options = {
    apply: false,
    batchSize: DEFAULT_BATCH_SIZE,
    cursor: null,
    json: false,
    limit: null,
    profileIds: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[index];
    };

    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--batch-size") options.batchSize = Number.parseInt(next(), 10);
    else if (arg === "--limit") options.limit = Number.parseInt(next(), 10);
    else if (arg === "--profile-id") options.profileIds.push(next());
    else if (arg === "--start-after") options.cursor = next();
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (
    !Number.isInteger(options.batchSize) ||
    options.batchSize < 1 ||
    options.batchSize > MAX_BATCH_SIZE
  ) {
    throw new Error(`--batch-size must be between 1 and ${MAX_BATCH_SIZE}`);
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }

  return options;
}

function usage() {
  return `Usage:
  node tools/ops/backfill-marketplace-accounts.mjs --dry-run
  node tools/ops/backfill-marketplace-accounts.mjs --profile-id <profile_uuid> --dry-run

Production apply mode requires:
  MARKETPLACE_ACCOUNT_BACKFILL_ACK=${APPLY_ACK} \\
    node tools/ops/backfill-marketplace-accounts.mjs --apply

The tool reads active YNOTT profiles from the core Supabase project and creates
or refreshes matching rows in the separate Marketplace Supabase project through
the idempotent marketplace_get_or_create_account RPC. It never creates auth
users, passwords, or marketplace-only login credentials.`;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function displayNameFor(profile) {
  return profile.display_name || profile.line_display_name || null;
}

function authSourceFor(profile) {
  return profile.line_user_id ? "line" : "supabase";
}

function activeStatusFor(profile) {
  return profile.profile_status === "active" || profile.profile_status === null;
}

function chunks(values, size) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

async function readCoreProfiles(coreSupabase, options) {
  if (options.profileIds.length > 0) {
    const rows = [];
    for (const batch of chunks(options.profileIds, 100)) {
      const { data, error } = await coreSupabase
        .from("profiles")
        .select(
          "id,display_name,line_display_name,line_user_id,auth_user_id,profile_status,updated_at",
        )
        .in("id", batch)
        .order("id", { ascending: true });
      if (error) throw error;
      rows.push(...(data ?? []));
    }
    return rows.filter(activeStatusFor);
  }

  let query = coreSupabase
    .from("profiles")
    .select(
      "id,display_name,line_display_name,line_user_id,auth_user_id,profile_status,updated_at",
    )
    .eq("profile_status", "active")
    .order("id", { ascending: true })
    .limit(options.batchSize);

  if (options.cursor) query = query.gt("id", options.cursor);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function existingMarketplaceAccounts(marketplaceSupabase, profileIds) {
  const existing = new Set();
  for (const batch of chunks(profileIds, 100)) {
    const { data, error } = await marketplaceSupabase
      .from("marketplace_accounts")
      .select("ynot_profile_id")
      .in("ynot_profile_id", batch);
    if (error) throw error;
    for (const row of data ?? []) existing.add(row.ynot_profile_id);
  }
  return existing;
}

async function ensureMarketplaceAccount(marketplaceSupabase, profile, runId) {
  const requestMaterial = JSON.stringify({
    id: profile.id,
    displayName: displayNameFor(profile),
    authSource: authSourceFor(profile),
    profileStatus: profile.profile_status,
    updatedAt: profile.updated_at,
  });
  const result = await marketplaceSupabase.rpc("marketplace_get_or_create_account", {
    p_ynot_profile_id: profile.id,
    p_display_name: displayNameFor(profile),
    p_avatar_url: null,
    p_auth_source: authSourceFor(profile),
    p_profile_status: "active",
    p_request_id: `marketplace-account-backfill:${runId}`,
    p_actor_ynot_profile_id: profile.id,
    p_idempotency_key: `marketplace-account-backfill:${sha256(`${profile.id}:${profile.updated_at ?? ""}`).slice(0, 48)}`,
    p_request_hash: sha256(requestMaterial),
  });

  if (result.error) throw result.error;
  return result.data;
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const marketplaceEnvironment = process.env.MARKETPLACE_ENVIRONMENT?.trim();
  if (
    options.apply &&
    marketplaceEnvironment === "production" &&
    process.env.MARKETPLACE_ACCOUNT_BACKFILL_ACK !== APPLY_ACK
  ) {
    throw new Error(`Production apply mode requires MARKETPLACE_ACCOUNT_BACKFILL_ACK=${APPLY_ACK}`);
  }

  const coreSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const marketplaceSupabase = createClient(
    requireEnv("MARKETPLACE_SUPABASE_URL"),
    requireEnv("MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const runId = randomUUID();
  let cursor = options.cursor;
  let scanned = 0;
  let existing = 0;
  let missing = 0;
  let ensured = 0;
  let failed = 0;
  const failures = [];

  while (true) {
    const profiles = await readCoreProfiles(coreSupabase, {
      ...options,
      cursor,
      batchSize:
        options.limit === null
          ? options.batchSize
          : Math.min(options.batchSize, options.limit - scanned),
    });
    if (profiles.length === 0) break;

    const profileIds = profiles.map((profile) => profile.id);
    const existingAccounts = await existingMarketplaceAccounts(
      marketplaceSupabase,
      profileIds,
    );

    for (const profile of profiles) {
      scanned += 1;
      cursor = profile.id;
      if (existingAccounts.has(profile.id)) existing += 1;
      else missing += 1;

      if (options.apply) {
        try {
          await ensureMarketplaceAccount(marketplaceSupabase, profile, runId);
          ensured += 1;
        } catch (error) {
          failed += 1;
          failures.push({
            profileId: profile.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (options.profileIds.length > 0) break;
    if (options.limit !== null && scanned >= options.limit) break;
    if (profiles.length < options.batchSize) break;
  }

  const summary = {
    mode: options.apply ? "apply" : "dry-run",
    runId,
    scanned,
    existing,
    missing,
    ensured,
    failed,
    nextStartAfter: cursor,
    failures,
  };

  if (options.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`mode=${summary.mode}`);
    console.log(`runId=${summary.runId}`);
    console.log(`scanned=${summary.scanned}`);
    console.log(`existing=${summary.existing}`);
    console.log(`missing=${summary.missing}`);
    console.log(`ensured=${summary.ensured}`);
    console.log(`failed=${summary.failed}`);
    console.log(`nextStartAfter=${summary.nextStartAfter ?? ""}`);
    if (failures.length) console.log(JSON.stringify({ failures }, null, 2));
  }

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
