#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ACK = "I_UNDERSTAND_THIS_CREATES_REPLACEMENT_STOCK";
const RESTORE_SOURCE_TYPE = "production_stock_restore";
const DEFAULT_MAX_UNITS = 200;
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
    campaignIds: [],
    campaignSlugs: [],
    cardTerms: [],
    json: false,
    maxUnits: DEFAULT_MAX_UNITS,
    reason: "production_stock_restore",
    verboseIds: false,
    adminId: process.env.YNOT_STOCK_RESTORE_ADMIN_ID || "",
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
    else if (arg === "--campaign-id") options.campaignIds.push(next());
    else if (arg === "--campaign-slug") options.campaignSlugs.push(next());
    else if (arg === "--card-name" || arg === "--card") options.cardTerms.push(next());
    else if (arg === "--admin-id") options.adminId = next();
    else if (arg === "--reason") options.reason = next();
    else if (arg === "--max-units") options.maxUnits = Number.parseInt(next(), 10);
    else if (arg === "--json") options.json = true;
    else if (arg === "--verbose-ids") options.verboseIds = true;
    else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function usage() {
  return `Usage:
  node tools/ops/restore-pack-stock.mjs --campaign-slug <slug> [--card-name Kaya] [--card-name Boa]
  YNOT_ENV=production ALLOW_PRODUCTION_STOCK_RESTORE=${ACK} \\
    node tools/ops/restore-pack-stock.mjs --campaign-slug <slug> --apply --admin-id <admin_uuid>

Default mode is dry-run. Apply mode creates replacement available card_stock_units
from the awarded stock units in the target pack; it does not update, delete, or
release the original awarded rows.`;
}

function fail(message) {
  throw new Error(message);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is required`);
  return value;
}

function projectRefFromUrl(value) {
  try {
    return new URL(value).hostname.split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function chunks(values, size = 100) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

async function fetchAll(fetcher) {
  const out = [];
  for (const batch of fetcher.batches) {
    const { data, error } = await fetcher.query(batch);
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

async function fetchCampaigns(supabase, options) {
  const rows = [];
  for (const batch of chunks(options.campaignIds.filter(Boolean), 100)) {
    const { data, error } = await supabase
      .from("draw_rounds")
      .select(
        "id,slug,title_en,title_th,pack_code,status,visibility,approval_status,total_slots,is_test,last_prize_card_id,last_prize_awarded_open_id,last_prize_stock_unit_id,last_prize_collection_item_id,last_prize_awarded_at",
      )
      .in("id", batch);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  for (const batch of chunks(options.campaignSlugs.filter(Boolean), 100)) {
    const { data, error } = await supabase
      .from("draw_rounds")
      .select(
        "id,slug,title_en,title_th,pack_code,status,visibility,approval_status,total_slots,is_test,last_prize_card_id,last_prize_awarded_open_id,last_prize_stock_unit_id,last_prize_collection_item_id,last_prize_awarded_at",
      )
      .in("slug", batch);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

async function fetchCards(supabase, cardIds) {
  if (!cardIds.length) return new Map();
  const rows = await fetchAll({
    batches: chunks(cardIds, 100),
    query: (batch) =>
      supabase
        .from("cards")
        .select("id,name,card_code,card_number,series")
        .in("id", batch),
  });
  return new Map(rows.map((row) => [row.id, row]));
}

async function fetchStockUnits(supabase, stockUnitIds) {
  if (!stockUnitIds.length) return new Map();
  const rows = await fetchAll({
    batches: chunks(stockUnitIds, 100),
    query: (batch) =>
      supabase
        .from("card_stock_units")
        .select(
          "id,card_id,status,source_type,source_id,condition,grade,grading_service,cert_number,gemrate_id,image_url,image_storage_path,quantity,metadata,allocated_draw_round_id,allocated_draw_round_prize_id,created_at",
        )
        .in("id", batch),
  });
  return new Map(rows.map((row) => [row.id, row]));
}

async function fetchExistingRestores(supabase, sourceUnitIds) {
  if (!sourceUnitIds.length) return new Map();
  const rows = await fetchAll({
    batches: chunks(sourceUnitIds, 100),
    query: (batch) =>
      supabase
        .from("card_stock_units")
        .select("id,source_id,status,created_at")
        .eq("source_type", RESTORE_SOURCE_TYPE)
        .in("source_id", batch),
  });
  return new Map(rows.map((row) => [row.source_id, row]));
}

async function fetchAvailableCounts(supabase, cardIds) {
  if (!cardIds.length) return new Map();
  const rows = await fetchAll({
    batches: chunks(cardIds, 100),
    query: (batch) =>
      supabase
        .from("card_stock_units")
        .select("card_id,status")
        .in("card_id", batch)
        .eq("status", "available"),
  });
  const counts = new Map();
  for (const row of rows) {
    counts.set(row.card_id, (counts.get(row.card_id) ?? 0) + 1);
  }
  return counts;
}

async function fetchAwardSources(supabase, campaigns) {
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const normalRows = await fetchAll({
    batches: chunks(campaignIds, 100),
    query: (batch) =>
      supabase
        .from("draw_round_prize_units")
        .select(
          "id,draw_round_id,draw_round_prize_id,card_id,card_stock_unit_id,status,collection_item_id,gacha_open_id,gacha_open_item_id,metadata",
        )
        .in("draw_round_id", batch)
        .eq("status", "awarded")
        .not("card_stock_unit_id", "is", null),
  });
  const sources = normalRows.map((row) => ({
    kind: "normal_prize",
    campaign: campaignById.get(row.draw_round_id),
    sourceUnitId: row.card_stock_unit_id,
    drawRoundPrizeUnitId: row.id,
    drawRoundPrizeId: row.draw_round_prize_id,
    collectionItemId: row.collection_item_id,
    gachaOpenId: row.gacha_open_id,
    gachaOpenItemId: row.gacha_open_item_id,
  }));
  for (const campaign of campaigns) {
    if (!campaign.last_prize_stock_unit_id) continue;
    sources.push({
      kind: "last_prize",
      campaign,
      sourceUnitId: campaign.last_prize_stock_unit_id,
      drawRoundPrizeUnitId: null,
      drawRoundPrizeId: null,
      collectionItemId: campaign.last_prize_collection_item_id,
      gachaOpenId: campaign.last_prize_awarded_open_id,
      gachaOpenItemId: null,
    });
  }
  return [...new Map(sources.map((source) => [source.sourceUnitId, source])).values()];
}

function matchesCardFilter(card, options) {
  if (!options.cardTerms.length) return true;
  const haystack = normalize(
    [card?.name, card?.card_code, card?.card_number].filter(Boolean).join(" "),
  );
  return options.cardTerms.some((term) => haystack.includes(normalize(term)));
}

function summarizePlanItem(item, verboseIds) {
  return {
    action: item.action,
    reason: item.reason,
    campaign: item.source.campaign?.slug ?? "unknown",
    sourceKind: item.source.kind,
    cardName: item.card?.name ?? "Unknown card",
    cardCode: item.card?.card_code ?? item.card?.card_number ?? null,
    condition: item.replacement.condition,
    grade: item.replacement.grade,
    gradingService: item.replacement.grading_service,
    copiesImage: Boolean(item.replacement.image_url),
    uniqueIdentifiersCopied: false,
    sourceRef: verboseIds ? item.source.sourceUnitId : digest(item.source.sourceUnitId),
  };
}

function buildPlan({ sources, stockUnits, cards, existingRestores, availableBefore, options }) {
  const items = [];
  for (const source of sources) {
    const sourceUnit = stockUnits.get(source.sourceUnitId);
    if (!sourceUnit) {
      items.push({
        action: "blocked",
        reason: "source_stock_unit_missing",
        source,
        card: null,
        replacement: {},
      });
      continue;
    }
    const card = cards.get(sourceUnit.card_id);
    if (!matchesCardFilter(card, options)) {
      items.push({
        action: "skipped",
        reason: "card_filter_excluded",
        source,
        sourceUnit,
        card,
        replacement: {},
      });
      continue;
    }
    if (sourceUnit.status === "available") {
      items.push({
        action: "skipped",
        reason: "source_stock_already_available",
        source,
        sourceUnit,
        card,
        replacement: {},
      });
      continue;
    }
    if (existingRestores.has(source.sourceUnitId)) {
      items.push({
        action: "skipped",
        reason: "replacement_already_exists",
        source,
        sourceUnit,
        card,
        replacement: {},
      });
      continue;
    }
    const condition = sourceUnit.condition || "raw";
    const isGraded = condition === "graded";
    items.push({
      action: "restore",
      reason: "create_replacement_available_stock",
      source,
      sourceUnit,
      card,
      replacement: {
        condition,
        grade: isGraded ? sourceUnit.grade || null : null,
        grading_service: isGraded ? sourceUnit.grading_service || null : null,
        cert_number: null,
        gemrate_id: null,
        image_url: sourceUnit.image_url || null,
        image_storage_path: sourceUnit.image_storage_path || null,
        hadUniqueIdentifiers: Boolean(sourceUnit.cert_number || sourceUnit.gemrate_id),
      },
    });
  }

  const restoreItems = items.filter((item) => item.action === "restore");
  const byCard = new Map();
  for (const item of restoreItems) {
    const cardId = item.sourceUnit.card_id;
    const bucket =
      byCard.get(cardId) ??
      {
        cardName: item.card?.name ?? "Unknown card",
        cardCode: item.card?.card_code ?? item.card?.card_number ?? null,
        availableBefore: availableBefore.get(cardId) ?? 0,
        restoreUnits: 0,
      };
    bucket.restoreUnits += 1;
    byCard.set(cardId, bucket);
  }
  return {
    restoreItems,
    items,
    summary: {
      scannedSources: sources.length,
      restoreUnits: restoreItems.length,
      skippedUnits: items.filter((item) => item.action === "skipped").length,
      blockedUnits: items.filter((item) => item.action === "blocked").length,
      cardBreakdown: [...byCard.values()].map((row) => ({
        ...row,
        availableAfterDryRun: row.availableBefore + row.restoreUnits,
      })),
      uniqueIdentifierWarnings: restoreItems.filter(
        (item) => item.replacement.hadUniqueIdentifiers,
      ).length,
    },
  };
}

async function applyPlan(supabase, plan, options) {
  if (!options.adminId) fail("--admin-id or YNOT_STOCK_RESTORE_ADMIN_ID is required for --apply");
  const { data: admin, error: adminError } = await supabase
    .from("admin_users")
    .select("id,is_active")
    .eq("id", options.adminId)
    .maybeSingle();
  if (adminError) throw adminError;
  if (!admin?.is_active) fail("admin id is not active");

  const runId = randomUUID();
  const applyItems = plan.items.filter(
    (item) =>
      item.action === "restore" || item.reason === "replacement_already_exists",
  );
  if (!applyItems.length) {
    return { runId, insertedUnits: 0, replacementUnits: 0, ledgerRowsInserted: 0 };
  }
  const pSources = applyItems.map((item) => ({
    sourceStockUnitId: item.source.sourceUnitId,
    sourceKind: item.source.kind,
    sourceCampaignSlug: item.source.campaign?.slug ?? null,
    sourceDrawRoundId: item.source.campaign?.id ?? null,
    sourceDrawRoundPrizeUnitId: item.source.drawRoundPrizeUnitId,
    sourceDrawRoundPrizeId: item.source.drawRoundPrizeId,
    sourceCollectionItemId: item.source.collectionItemId,
    sourceGachaOpenId: item.source.gachaOpenId,
    sourceGachaOpenItemId: item.source.gachaOpenItemId,
  }));
  const { data, error } = await supabase.rpc("restore_awarded_pack_stock", {
    p_sources: pSources,
    p_admin_id: options.adminId,
    p_reason: options.reason,
    p_run_id: runId,
  });
  if (error) throw error;
  return {
    runId: data?.runId ?? runId,
    insertedUnits: Number(data?.insertedUnits ?? 0),
    replacementUnits: Number(data?.replacementUnits ?? 0),
    ledgerRowsInserted: Number(data?.ledgerRowsInserted ?? 0),
    auditRowsInserted: Number(data?.auditRowsInserted ?? 0),
  };
}

function printReport({ mode, projectRef, campaigns, plan, applied, options }) {
  const report = {
    mode,
    projectRef,
    campaigns: campaigns.map((campaign) => ({
      slug: campaign.slug,
      titleEn: campaign.title_en,
      titleTh: campaign.title_th,
      packCode: campaign.pack_code,
      status: campaign.status,
      approvalStatus: campaign.approval_status,
      lastPrizeAwarded: Boolean(campaign.last_prize_awarded_at),
      ref: options.verboseIds ? campaign.id : digest(campaign.id),
    })),
    summary: plan.summary,
    items: plan.items.map((item) => summarizePlanItem(item, options.verboseIds)),
    applied: applied ?? null,
  };
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Mode: ${mode}`);
  console.log(`Supabase project ref: ${projectRef}`);
  for (const campaign of report.campaigns) {
    console.log(
      `Campaign: ${campaign.slug} (${campaign.status}/${campaign.approvalStatus}) lastPrizeAwarded=${campaign.lastPrizeAwarded}`,
    );
  }
  console.log(`Scanned awarded stock units: ${plan.summary.scannedSources}`);
  console.log(`Replacement units to create: ${plan.summary.restoreUnits}`);
  console.log(`Skipped units: ${plan.summary.skippedUnits}`);
  console.log(`Blocked units: ${plan.summary.blockedUnits}`);
  if (plan.summary.uniqueIdentifierWarnings) {
    console.log(
      `Unique IDs kept metadata-only: ${plan.summary.uniqueIdentifierWarnings} graded replacement(s)`,
    );
  }
  for (const row of plan.summary.cardBreakdown) {
    console.log(
      `- ${row.cardName}${row.cardCode ? ` (${row.cardCode})` : ""}: +${row.restoreUnits} available (${row.availableBefore} -> ${row.availableAfterDryRun})`,
    );
  }
  if (applied) {
    console.log(`Applied restore run: ${options.verboseIds ? applied.runId : digest(applied.runId)}`);
    console.log(`Inserted units: ${applied.insertedUnits}`);
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.campaignIds.length && !options.campaignSlugs.length) {
    fail("Provide at least one --campaign-id or --campaign-slug");
  }
  if (!Number.isFinite(options.maxUnits) || options.maxUnits < 1) {
    fail("--max-units must be a positive integer");
  }
  if (options.apply) {
    if ((process.env.YNOT_ENV ?? process.env.NODE_ENV) !== "production") {
      fail("YNOT_ENV=production or NODE_ENV=production is required for --apply");
    }
    if (process.env.ALLOW_PRODUCTION_STOCK_RESTORE !== ACK) {
      fail(`Set ALLOW_PRODUCTION_STOCK_RESTORE=${ACK} to apply`);
    }
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = projectRefFromUrl(url);
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const campaigns = await fetchCampaigns(supabase, options);
  if (!campaigns.length) fail("No campaigns matched the provided target");

  const sources = await fetchAwardSources(supabase, campaigns);
  const stockUnits = await fetchStockUnits(
    supabase,
    sources.map((source) => source.sourceUnitId).filter(Boolean),
  );
  const cards = await fetchCards(
    supabase,
    [...new Set([...stockUnits.values()].map((unit) => unit.card_id).filter(Boolean))],
  );
  const existingRestores = await fetchExistingRestores(
    supabase,
    sources.map((source) => source.sourceUnitId).filter(Boolean),
  );
  const availableBefore = await fetchAvailableCounts(
    supabase,
    [...new Set([...stockUnits.values()].map((unit) => unit.card_id).filter(Boolean))],
  );
  const plan = buildPlan({
    sources,
    stockUnits,
    cards,
    existingRestores,
    availableBefore,
    options,
  });

  if (plan.summary.blockedUnits) {
    printReport({ mode: "dry-run", projectRef, campaigns, plan, applied: null, options });
    fail("Blocked units found; fix the target data before applying");
  }
  if (plan.summary.restoreUnits > options.maxUnits) {
    printReport({ mode: "dry-run", projectRef, campaigns, plan, applied: null, options });
    fail(`Refusing to restore ${plan.summary.restoreUnits} units above --max-units ${options.maxUnits}`);
  }

  let applied = null;
  const applyableItems = plan.items.filter(
    (item) =>
      item.action === "restore" || item.reason === "replacement_already_exists",
  );
  if (options.apply && applyableItems.length) {
    applied = await applyPlan(supabase, plan, options);
  }
  printReport({
    mode: options.apply ? "apply" : "dry-run",
    projectRef,
    campaigns,
    plan,
    applied,
    options,
  });
}

main().catch((error) => {
  console.error(`restore-pack-stock failed: ${error.message}`);
  process.exit(1);
});
