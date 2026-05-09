#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(rootDir, "tools/seed/assets/asset-manifest.json");
const ACK = "I_UNDERSTAND_THIS_IS_PRODUCTION";
// Supported modes: --dry-run (default), --apply, --hide, --cleanup
const args = new Set(process.argv.slice(2));
const mode = args.has("--apply") ? "apply" : args.has("--cleanup") ? "cleanup" : args.has("--hide") ? "hide" : "dry-run";
const seedKey = process.env.SEED_RUN_KEY || `ynot-admin-production-test-${new Date().toISOString().slice(0, 10)}`;
const seedEnv = process.env.SEED_ENV || process.env.VERCEL_ENV || "local";
const testerProfileIds = (process.env.YNOT_TEST_PROFILE_IDS || process.env.YNOT_TEST_PROFILE_ID || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function requireProductionAck() {
  if ((seedEnv === "production" || process.env.NODE_ENV === "production") && process.env.ALLOW_PRODUCTION_TEST_SEED !== ACK) {
    throw new Error(`Production seed ${mode} requires ALLOW_PRODUCTION_TEST_SEED=${ACK}`);
  }
}

async function loadManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  for (const asset of assets) {
    const fields = [asset.key, asset.file, asset.source, asset.license, asset.createdBy].join(" ").toLowerCase();
    if (!asset.allowedForProductionTest) throw new Error(`Asset ${asset.key} is not approved for production testing.`);
    if (fields.includes("japan-toreca")) throw new Error(`Asset ${asset.key} references blocked Japan Toreca source.`);
    if (typeof asset.file !== "string" || !asset.file.startsWith("/test-assets/")) {
      throw new Error(`Asset ${asset.key} must live under /test-assets/ or approved storage before production testing.`);
    }
  }
  return manifest;
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for apply/hide/cleanup.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function upsertSingle(supabase, table, payload, onConflict, select = "*") {
  const { data, error } = await supabase.from(table).upsert(payload, { onConflict }).select(select).single();
  if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  return data;
}

async function insertRegistry(supabase, seedRunId, tableName, rowId, rowKey, action, metadata = {}) {
  const { error } = await supabase.from("seed_run_items").insert({ seed_run_id: seedRunId, table_name: tableName, row_id: rowId, row_key: rowKey, action, metadata });
  if (error) throw new Error(`seed_run_items insert failed: ${error.message}`);
}

async function ensureSeedRun(supabase, status, metadata) {
  return upsertSingle(supabase, "seed_runs", {
    seed_key: seedKey,
    label: "YNot production admin workflow test data",
    environment: seedEnv,
    status,
    metadata,
  }, "seed_key", "id,seed_key,status");
}

function plan(manifest) {
  return {
    seedKey,
    seedEnv,
    mode,
    testerProfileIds,
    assets: manifest.assets.map((asset) => ({ key: asset.key, file: asset.file, license: asset.license })),
    operations: [
      "upsert seed_runs registry row",
      "upsert test-only category production-test-pokemon",
      "upsert two [TEST] cards using generated placeholder assets",
      "upsert one test-only live/public campaign hidden from normal users by is_test + RLS/app filters",
      "attach category and create draw slots",
      "upsert two prize ranks and set prize-unit quantities",
      "optionally whitelist YNOT_TEST_PROFILE_IDS for opening",
    ],
  };
}

async function applySeed(manifest) {
  requireProductionAck();
  const supabase = client();
  const seedRun = await ensureSeedRun(supabase, "applied", { manifestVersion: manifest.schemaVersion, mode });
  const assetsByKey = new Map(manifest.assets.map((asset) => [asset.key, asset]));

  const category = await upsertSingle(supabase, "store_categories", {
    slug: "production-test-pokemon",
    name_th: "[TEST] POKEMON",
    name_en: "[TEST] Pokemon",
    description: "Test-only category for owner/admin production workflow validation.",
    icon: "🧪",
    legacy_series: "pokemon",
    sort_order: 990,
    is_active: true,
    is_test: true,
    seed_run_id: seedRun.id,
    metadata: { seedKey },
  }, "slug", "id,slug");
  await insertRegistry(supabase, seedRun.id, "store_categories", category.id, category.slug, "upserted");

  const gold = assetsByKey.get("ynot-test-card-gold");
  const blue = assetsByKey.get("ynot-test-card-blue");
  const cards = [];
  for (const [code, name, asset] of [
    ["YNTEST-GOLD", "[TEST] Gold Prize Card", gold],
    ["YNTEST-BLUE", "[TEST] Blue Prize Card", blue],
  ]) {
    const card = await upsertSingle(supabase, "cards", {
      card_code: code,
      search_code: code.toLowerCase(),
      name,
      search_name: name.toLowerCase(),
      series: "pokemon",
      grade: "Test Placeholder",
      image_url: asset.file,
      is_test: true,
      seed_run_id: seedRun.id,
      asset_source: asset.source,
      asset_license: asset.license,
      asset_manifest_key: asset.key,
    }, "search_code", "id,name,card_code");
    cards.push(card);
    await insertRegistry(supabase, seedRun.id, "cards", card.id, card.card_code, "upserted");
  }

  const campaign = await upsertSingle(supabase, "draw_rounds", {
    slug: "ynot-production-test-pack",
    title_th: "[TEST] แพ็กทดสอบระบบ",
    title_en: "[TEST] Production Admin Test Pack",
    series: "pokemon",
    status: "live",
    visibility: "public",
    mode: "instant_gacha",
    price_thb: 150,
    cost_coins: 1,
    total_slots: 20,
    display_tags: ["PSA10", "New Exclusive", "TEST"],
    sort_order: 999,
    order_code_prefix: "YT",
    is_test: true,
    seed_run_id: seedRun.id,
    test_metadata: { seedKey, allowedTesterCount: testerProfileIds.length },
  }, "slug", "id,slug");
  await insertRegistry(supabase, seedRun.id, "draw_rounds", campaign.id, campaign.slug, "upserted");

  await supabase.from("draw_round_categories").delete().eq("draw_round_id", campaign.id);
  const { error: categoryError } = await supabase.from("draw_round_categories").insert({ draw_round_id: campaign.id, category_id: category.id, is_primary: true });
  if (categoryError) throw new Error(`draw_round_categories insert failed: ${categoryError.message}`);
  const { error: slotsError } = await supabase.rpc("create_draw_slots", { p_draw_round_id: campaign.id });
  if (slotsError) throw new Error(`create_draw_slots failed: ${slotsError.message}`);

  const prizeSpecs = [
    { card: cards[0], tier: "high", rank: 1, value_thb: 2500, quantity: 2 },
    { card: cards[1], tier: "normal", rank: 2, value_thb: 250, quantity: 18 },
  ];
  for (const spec of prizeSpecs) {
    const prize = await upsertSingle(supabase, "draw_round_prizes", {
      draw_round_id: campaign.id,
      card_id: spec.card.id,
      tier: spec.tier,
      rank: spec.rank,
      value_thb: spec.value_thb,
      is_test: true,
      seed_run_id: seedRun.id,
      metadata: { seedKey },
    }, "draw_round_id,tier,rank", "id,draw_round_id,card_id,tier,rank");
    await insertRegistry(supabase, seedRun.id, "draw_round_prizes", prize.id, `${campaign.slug}:${spec.tier}:${spec.rank}`, "upserted");
    const { error: inventoryError } = await supabase.rpc("ensure_draw_round_prize_units", {
      p_draw_round_prize_id: prize.id,
      p_total_units: spec.quantity,
      p_admin_id: null,
      p_seed_run_id: seedRun.id,
    });
    if (inventoryError) throw new Error(`ensure_draw_round_prize_units failed: ${inventoryError.message}`);
  }

  for (const profileId of testerProfileIds) {
    const { error } = await supabase.from("draw_round_testers").upsert({ draw_round_id: campaign.id, profile_id: profileId, seed_run_id: seedRun.id }, { onConflict: "draw_round_id,profile_id" });
    if (error) throw new Error(`draw_round_testers upsert failed: ${error.message}`);
  }

  return { seedRun, category, campaign, cards, testerProfileIds };
}

async function hideOrCleanup(targetMode) {
  requireProductionAck();
  const supabase = client();
  const seedRun = await ensureSeedRun(supabase, targetMode === "cleanup" ? "cleanup_started" : "hidden", { mode: targetMode });
  const { data: campaigns, error: campaignError } = await supabase.from("draw_rounds").select("id,slug,is_test,seed_run_id").eq("seed_run_id", seedRun.id).eq("is_test", true);
  if (campaignError) throw new Error(campaignError.message);
  const campaignIds = (campaigns || []).map((campaign) => campaign.id);
  if (campaignIds.length) {
    await supabase.from("draw_rounds").update({ status: "archived", visibility: "private" }).in("id", campaignIds);
    await supabase.from("draw_round_prize_units").update({ status: "void", voided_at: new Date().toISOString(), metadata: { reason: targetMode } }).in("draw_round_id", campaignIds).eq("status", "available");
    await supabase.from("store_categories").update({ is_active: false }).eq("seed_run_id", seedRun.id).eq("is_test", true);
  }
  if (targetMode === "cleanup") await supabase.from("seed_runs").update({ status: "cleaned" }).eq("id", seedRun.id);
  return { seedRun, hiddenCampaigns: campaignIds.length };
}

const manifest = await loadManifest();
if (mode === "dry-run") {
  console.log(JSON.stringify(plan(manifest), null, 2));
} else if (mode === "apply") {
  console.log(JSON.stringify(await applySeed(manifest), null, 2));
} else {
  console.log(JSON.stringify(await hideOrCleanup(mode), null, 2));
}
