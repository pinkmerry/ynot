import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../.env.local");
const totalSlots = 100;

function loadEnvFile(path) {
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    const value = rawValue
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .replace(/^'(.*)'$/, "$1");
    process.env[key] = value;
  }
}

function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

loadEnvFile(envPath);

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabase = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function assertNoError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

async function getSingle(context, query) {
  const { data, error } = await query.single();
  if (error) throw new Error(`${context}: ${error.message}`);
  return data;
}

async function getMaybeSingle(context, query) {
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`${context}: ${error.message}`);
  return data;
}

function searchName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pct(value) {
  const numeric = Number(value);
  const decimals = numeric > 0 && numeric < 0.01 ? 4 : 2;
  return `${numeric.toFixed(decimals)}%`;
}

function countPct(count, total) {
  return `${count}/${total} (${pct((count / Math.max(total, 1)) * 100)})`;
}

function moneyWeight(value) {
  return Number(value).toFixed(value < 1 ? 2 : 0).replace(/\.00$/, "");
}

function sortByRank(left, right) {
  if (left.group === right.group) return left.rank - right.rank;
  const order = { top: 0, high: 1, normal: 2 };
  return order[left.group] - order[right.group];
}

const prizeBlueprints = [
  {
    key: "top1",
    group: "top",
    label: "Prize 1",
    code: "PROB-TOP-1",
    cardName: "YNOTT Prize 1 Gold SAR PSA10",
    tier: "high",
    rank: 1,
    quantity: 1,
    weight: 0.03,
    unlockAtSoldPct: 50,
  },
  {
    key: "top2",
    group: "top",
    label: "Prize 2",
    code: "PROB-TOP-2",
    cardName: "YNOTT Prize 2 Master Ball PSA10",
    tier: "high",
    rank: 2,
    quantity: 1,
    weight: 0.05,
    unlockAtSoldPct: 30,
  },
  {
    key: "top3",
    group: "top",
    label: "Prize 3",
    code: "PROB-TOP-3",
    cardName: "YNOTT Prize 3 Manga PSA10",
    tier: "high",
    rank: 3,
    quantity: 1,
    weight: 0.08,
    unlockAtSoldPct: 20,
  },
  {
    key: "high1",
    group: "high",
    label: "High tier 1",
    code: "PROB-HIGH-1",
    cardName: "YNOTT High Tier 1 PSA10",
    tier: "high",
    rank: 4,
    quantity: 2,
    weight: 0.5,
    unlockAtSoldPct: 10,
  },
  {
    key: "high2",
    group: "high",
    label: "High tier 2",
    code: "PROB-HIGH-2",
    cardName: "YNOTT High Tier 2 PSA10",
    tier: "high",
    rank: 5,
    quantity: 2,
    weight: 0.6,
    unlockAtSoldPct: 10,
  },
  {
    key: "high3",
    group: "high",
    label: "High tier 3",
    code: "PROB-HIGH-3",
    cardName: "YNOTT High Tier 3 PSA10",
    tier: "high",
    rank: 6,
    quantity: 2,
    weight: 0.7,
    unlockAtSoldPct: 20,
  },
  {
    key: "high4",
    group: "high",
    label: "High tier 4",
    code: "PROB-HIGH-4",
    cardName: "YNOTT High Tier 4 PSA10",
    tier: "high",
    rank: 7,
    quantity: 2,
    weight: 0.8,
    unlockAtSoldPct: 30,
  },
  {
    key: "high5",
    group: "high",
    label: "High tier 5",
    code: "PROB-HIGH-5",
    cardName: "YNOTT High Tier 5 PSA10",
    tier: "high",
    rank: 8,
    quantity: 2,
    weight: 0.9,
    unlockAtSoldPct: 50,
  },
  {
    key: "high6",
    group: "high",
    label: "High tier 6",
    code: "PROB-HIGH-6",
    cardName: "YNOTT High Tier 6 PSA10",
    tier: "high",
    rank: 9,
    quantity: 2,
    weight: 1,
    unlockAtSoldPct: 50,
  },
  {
    key: "normal1",
    group: "normal",
    label: "Normal PSA10 1",
    code: "PROB-NORMAL-1",
    cardName: "YNOTT Normal PSA10 1",
    tier: "normal",
    rank: 1,
    quantity: 20,
    weight: 30,
    unlockAtSoldPct: 0,
  },
  {
    key: "normal2",
    group: "normal",
    label: "Normal PSA10 2",
    code: "PROB-NORMAL-2",
    cardName: "YNOTT Normal PSA10 2",
    tier: "normal",
    rank: 2,
    quantity: 20,
    weight: 45,
    unlockAtSoldPct: 0,
  },
  {
    key: "normal3",
    group: "normal",
    label: "Normal PSA10 3",
    code: "PROB-NORMAL-3",
    cardName: "YNOTT Normal PSA10 3",
    tier: "normal",
    rank: 3,
    quantity: 15,
    weight: 60,
    unlockAtSoldPct: 0,
  },
  {
    key: "normal4",
    group: "normal",
    label: "Normal PSA10 4",
    code: "PROB-NORMAL-4",
    cardName: "YNOTT Normal PSA10 4",
    tier: "normal",
    rank: 4,
    quantity: 15,
    weight: 80,
    unlockAtSoldPct: 0,
  },
  {
    key: "normal5",
    group: "normal",
    label: "Normal PSA10 5",
    code: "PROB-NORMAL-5",
    cardName: "YNOTT Normal PSA10 5",
    tier: "normal",
    rank: 5,
    quantity: 15,
    weight: 100,
    unlockAtSoldPct: 0,
  },
];

const scenarios = [
  {
    key: "normal-random",
    title: "Normal random",
    mode: "pure_random",
    description: "RPC ignores configured weight and unlock values; every remaining unit is equal.",
  },
  {
    key: "weight",
    title: "Weight only",
    mode: "weighted_templates",
    description: "Top prizes use weights below 0.1, high tier uses 0.5-1, normal PSA10 uses 30-100.",
  },
  {
    key: "unlock",
    title: "Unlock only",
    mode: "inventory_gated",
    unlockOnly: true,
    description: "All weights are 1; prizes become eligible at 10%, 20%, 30%, or 50% sold.",
  },
  {
    key: "weight-unlock",
    title: "Weight + unlock",
    mode: "inventory_gated",
    description: "Uses both low/high/normal weights and 10%, 20%, 30%, 50% unlock gates.",
  },
];

const weightLadderScenarios = [
  {
    key: "ladder-01",
    title: "Weight ladder 1 - requested baseline",
    mode: "weighted_templates",
    description: "Weighted only. Prize 1/2/3 = 0.25/0.45/0.55, high tier = 5, normal PSA10 = 50.",
    topWeights: [0.25, 0.45, 0.55],
    highWeight: 5,
    normalWeight: 50,
  },
  {
    key: "ladder-02",
    title: "Weight ladder 2 - 2x top/high",
    mode: "weighted_templates",
    description: "Weighted only. Top 3 and high tier are doubled from the baseline; normal PSA10 stays 50.",
    topWeights: [0.5, 0.9, 1.1],
    highWeight: 10,
    normalWeight: 50,
  },
  {
    key: "ladder-03",
    title: "Weight ladder 3 - 4x top/high",
    mode: "weighted_templates",
    description: "Weighted only. Top 3 and high tier are 4x baseline; normal PSA10 stays 50.",
    topWeights: [1, 1.8, 2.2],
    highWeight: 20,
    normalWeight: 50,
  },
  {
    key: "ladder-04",
    title: "Weight ladder 4 - 8x top/high",
    mode: "weighted_templates",
    description: "Weighted only. Top 3 and high tier are 8x baseline; normal PSA10 stays 50.",
    topWeights: [2, 3.6, 4.4],
    highWeight: 40,
    normalWeight: 50,
  },
  {
    key: "ladder-05",
    title: "Weight ladder 5 - 16x top/high",
    mode: "weighted_templates",
    description: "Weighted only. Top 3 and high tier are 16x baseline; normal PSA10 stays 50.",
    topWeights: [4, 7.2, 8.8],
    highWeight: 80,
    normalWeight: 50,
  },
];

function scenarioPrizes(scenario, cards) {
  return prizeBlueprints.map((prize) => ({
    ...prize,
    cardId: cards[prize.key],
    weight: scenario.unlockOnly ? 1 : scenarioWeight(prize, scenario),
    unlockAtSoldPct: scenario.mode === "weighted_templates" ? 0 : prize.unlockAtSoldPct,
  }));
}

function scenarioWeight(prize, scenario) {
  if (prize.group === "top" && Array.isArray(scenario.topWeights)) {
    return scenario.topWeights[prize.rank - 1] ?? prize.weight;
  }
  if (prize.group === "high" && scenario.highWeight !== undefined) return scenario.highWeight;
  if (prize.group === "normal" && scenario.normalWeight !== undefined) return scenario.normalWeight;
  return prize.weight;
}

function effectiveWeight(prize, scenario) {
  if (scenario.mode === "pure_random") return 1;
  return Math.max(0, Number(prize.weight ?? 1) || 0);
}

function effectiveUnlock(prize, scenario) {
  if (scenario.mode !== "inventory_gated") return 0;
  return Math.min(100, Math.max(0, Number(prize.unlockAtSoldPct ?? 0) || 0));
}

function eligibleDraw(prize, scenario) {
  const unlock = effectiveUnlock(prize, scenario);
  if (unlock <= 0) return 1;
  return Math.max(1, Math.ceil((unlock / 100) * totalSlots));
}

function theoreticalPool(prizes, scenario, soldPct) {
  const rows = prizes.map((prize) => {
    const unlocked = effectiveUnlock(prize, scenario) <= soldPct;
    const weight = effectiveWeight(prize, scenario);
    const poolWeight = unlocked && weight > 0 ? prize.quantity * weight : 0;
    return { prize, poolWeight };
  });
  const totalWeight = rows.reduce((sum, row) => sum + row.poolWeight, 0);
  const byGroup = { top: 0, high: 0, normal: 0 };
  const byPrize = new Map();
  for (const row of rows) {
    const probability = totalWeight > 0 ? (row.poolWeight / totalWeight) * 100 : 0;
    byGroup[row.prize.group] += probability;
    byPrize.set(row.prize.key, probability);
  }
  return { byGroup, byPrize };
}

function countGroups(records) {
  const counts = { top: 0, high: 0, normal: 0 };
  for (const record of records) counts[record.group] += 1;
  return counts;
}

function firstDraws(records) {
  const firstByPrize = new Map();
  const firstByGroup = new Map();
  for (const record of records) {
    if (!firstByPrize.has(record.key)) firstByPrize.set(record.key, record);
    if (!firstByGroup.has(record.group)) firstByGroup.set(record.group, record);
  }
  return { firstByPrize, firstByGroup };
}

async function ensureAdmin() {
  const admins = assertNoError(
    await supabase
      .from("admin_users")
      .select("id,profile_id,role,is_active,profiles(id,display_name,line_display_name,email)")
      .eq("is_active", true),
    "load active admins",
  );
  const activeAdmin = [...admins].sort((left, right) => {
    if (left.role === right.role) return 0;
    if (left.role === "owner") return -1;
    if (right.role === "owner") return 1;
    if (left.role === "admin") return -1;
    return 1;
  })[0];
  if (activeAdmin) {
    const profile = Array.isArray(activeAdmin.profiles)
      ? activeAdmin.profiles[0]
      : activeAdmin.profiles;
    return {
      adminId: activeAdmin.id,
      profileId: activeAdmin.profile_id,
      label: profile?.display_name ?? profile?.line_display_name ?? activeAdmin.role,
    };
  }

  const profile = await getMaybeSingle(
    "find probability owner profile",
    supabase
      .from("profiles")
      .select("id,display_name,line_display_name")
      .eq("line_user_id", "random-probability-owner"),
  );
  const owner = profile ?? await getSingle(
    "create probability owner profile",
    supabase
      .from("profiles")
      .insert({
        line_user_id: "random-probability-owner",
        line_display_name: "Random Probability Owner",
        display_name: "Random Probability Owner",
        preferred_language: "en",
      })
      .select("id,display_name,line_display_name"),
  );
  const admin = await getSingle(
    "create probability owner admin",
    supabase
      .from("admin_users")
      .insert({ profile_id: owner.id, role: "owner", is_active: true })
      .select("id,profile_id,role"),
  );
  return {
    adminId: admin.id,
    profileId: owner.id,
    label: owner.display_name ?? owner.line_display_name ?? "Random Probability Owner",
  };
}

async function ensureTester() {
  const existing = await getMaybeSingle(
    "find probability tester profile",
    supabase
      .from("profiles")
      .select("id,display_name,line_display_name")
      .eq("line_user_id", "random-pack-probability-tester"),
  );
  if (existing) return {
    profileId: existing.id,
    label: existing.display_name ?? existing.line_display_name ?? "Random Pack Probability Tester",
  };
  const tester = await getSingle(
    "create probability tester profile",
    supabase
      .from("profiles")
      .insert({
        line_user_id: "random-pack-probability-tester",
        line_display_name: "Random Pack Probability Tester",
        display_name: "Random Pack Probability Tester",
        preferred_language: "en",
      })
      .select("id,display_name,line_display_name"),
  );
  return {
    profileId: tester.id,
    label: tester.display_name ?? tester.line_display_name ?? "Random Pack Probability Tester",
  };
}

async function walletState(profileId) {
  const wallet = await getMaybeSingle(
    "load wallet state",
    supabase
      .from("wallet_accounts")
      .select("balance_coins,version")
      .eq("profile_id", profileId),
  );
  return {
    balance: wallet?.balance_coins ?? 0,
    version: wallet?.version ?? 0,
  };
}

async function grantCoins(profileId, adminId, amount, idempotencyKey) {
  assertNoError(
    await supabase.from("wallet_accounts").upsert({ profile_id: profileId }, { onConflict: "profile_id" }),
    "ensure tester wallet",
  );
  const before = await walletState(profileId);
  assertNoError(
    await supabase
      .from("wallet_accounts")
      .update({ balance_coins: before.balance + amount, version: before.version + 1 })
      .eq("profile_id", profileId),
    "grant tester wallet coins",
  );
  assertNoError(
    await supabase.from("coin_ledger").insert({
      profile_id: profileId,
      wallet_profile_id: profileId,
      entry_type: "admin_adjustment",
      amount_coins: amount,
      balance_before: before.balance,
      balance_after: before.balance + amount,
      idempotency_key: idempotencyKey,
      created_by_admin_id: adminId,
      metadata: { verification: "random_pack_probability_test" },
    }),
    "insert probability test coin ledger grant",
  );
  return { before: before.balance, after: before.balance + amount, amount };
}

async function ensureSeedRun(runKey, adminId) {
  const existing = await getMaybeSingle(
    "find probability seed run",
    supabase.from("seed_runs").select("id").eq("seed_key", runKey),
  );
  if (existing) return existing.id;
  const seedRun = await getSingle(
    "create probability seed run",
    supabase
      .from("seed_runs")
      .insert({
        seed_key: runKey,
        label: "Random pack probability one-by-one test",
        environment: "production",
        status: "applied",
        applied_by_admin_id: adminId,
        metadata: { verification: "random_pack_probability_test" },
      })
      .select("id"),
  );
  return seedRun.id;
}

async function ensureCategory(seedRunId, adminId) {
  const existing = await getMaybeSingle(
    "find probability category",
    supabase.from("store_categories").select("id").eq("slug", "random-pack-probability-test"),
  );
  if (existing) return existing.id;
  const category = await getSingle(
    "create probability category",
    supabase
      .from("store_categories")
      .insert({
        slug: "random-pack-probability-test",
        name_th: "Random Pack Probability Test",
        name_en: "Random Pack Probability Test",
        description: "Hidden test category for one-by-one probability verification.",
        icon: "TEST",
        legacy_series: "pokemon",
        sort_order: 999,
        is_active: true,
        is_test: true,
        seed_run_id: seedRunId,
        created_by_admin_id: adminId,
        metadata: { verification: "random_pack_probability_test" },
      })
      .select("id"),
  );
  return category.id;
}

async function ensureCard(card, seedRunId) {
  const existing = await getMaybeSingle(
    `find card ${card.code}`,
    supabase.from("cards").select("id").eq("search_code", card.code.toLowerCase()),
  );
  const patch = {
    card_code: card.code,
    search_code: card.code.toLowerCase(),
    name: card.cardName,
    search_name: searchName(card.cardName),
    series: "pokemon",
    grade: "PSA10",
    image_url: null,
    is_test: true,
    seed_run_id: seedRunId,
    asset_source: "Codex probability verification seed",
    asset_license: "Original test placeholder",
    asset_manifest_key: `verification/random-pack-probability/${card.code}`,
  };
  if (existing) {
    assertNoError(
      await supabase.from("cards").update(patch).eq("id", existing.id),
      `update card ${card.code}`,
    );
    return existing.id;
  }
  const created = await getSingle(
    `create card ${card.code}`,
    supabase.from("cards").insert(patch).select("id"),
  );
  return created.id;
}

async function createCampaign(scenario, context) {
  const slug = `${context.runKey}-${scenario.key}`;
  const campaign = await getSingle(
    `create campaign ${slug}`,
    supabase
      .from("draw_rounds")
      .insert({
        slug,
        title_th: `Probability Test - ${scenario.title}`,
        title_en: `Probability Test - ${scenario.title}`,
        series: "pokemon",
        status: "live",
        visibility: "public",
        approval_status: "approved",
        mode: "instant_gacha",
        price_thb: 100,
        cost_coins: 1,
        total_slots: totalSlots,
        order_code_prefix: "PT",
        display_tags: ["PSA10", "Probability test"],
        sort_order: 999,
        created_by: context.adminId,
        is_test: true,
        seed_run_id: context.seedRunId,
        logic_snapshot: {
          mode: scenario.mode,
          label: scenario.title,
          openQuantityOptions: [1],
          verificationRun: context.runKey,
          testType: "one_by_one_probability",
        },
        test_metadata: {
          verification: "random_pack_probability_test",
          runKey: context.runKey,
          scenario: scenario.key,
        },
      })
      .select("id,slug,total_slots"),
  );

  assertNoError(
    await supabase.from("draw_round_categories").upsert({
      draw_round_id: campaign.id,
      category_id: context.categoryId,
      is_primary: true,
    }),
    `link campaign category ${slug}`,
  );
  assertNoError(
    await supabase.from("draw_round_testers").upsert({
      draw_round_id: campaign.id,
      profile_id: context.testerProfileId,
      added_by_admin_id: context.adminId,
      seed_run_id: context.seedRunId,
    }),
    `whitelist tester ${slug}`,
  );
  assertNoError(
    await supabase.rpc("create_draw_slots", { p_draw_round_id: campaign.id }),
    `create slots ${slug}`,
  );

  const prizeRows = [];
  for (const prize of scenarioPrizes(scenario, context.cards)) {
    const row = await getSingle(
      `create prize ${slug} ${prize.key}`,
      supabase
        .from("draw_round_prizes")
        .insert({
          draw_round_id: campaign.id,
          card_id: prize.cardId,
          tier: prize.tier,
          rank: prize.rank,
          value_thb: null,
          weight: prize.weight,
          unlock_at_sold_pct: prize.unlockAtSoldPct,
          is_test: true,
          seed_run_id: context.seedRunId,
          metadata: {
            displayGroup: prize.group,
            probabilityTestKey: prize.key,
            probabilityTestLabel: prize.label,
            prizeCategory: "psa10_card",
            prizeCategoryLabel: "PSA10 card",
            sourceType: "card",
          },
        })
        .select("id,card_id,tier,rank,weight,unlock_at_sold_pct,metadata"),
    );
    assertNoError(
      await supabase.rpc("ensure_draw_round_prize_units", {
        p_draw_round_prize_id: row.id,
        p_total_units: prize.quantity,
        p_admin_id: context.adminId,
        p_seed_run_id: context.seedRunId,
      }),
      `create prize units ${slug} ${prize.key}`,
    );
    prizeRows.push({
      ...row,
      ...prize,
      weight: Number(row.weight ?? prize.weight),
      unlockAtSoldPct: Number(row.unlock_at_sold_pct ?? prize.unlockAtSoldPct),
    });
  }

  return { ...campaign, prizeRows };
}

async function openCampaignOneByOne(scenario, campaign, context) {
  const walletBefore = await walletState(context.testerProfileId);
  const rawItems = [];
  for (let draw = 1; draw <= totalSlots; draw += 1) {
    const result = assertNoError(
      await supabase.rpc("open_gacha_campaign", {
        p_profile_id: context.testerProfileId,
        p_draw_round_id: campaign.id,
        p_quantity: 1,
        p_idempotency_key: `${context.runKey}:${scenario.key}:draw:${draw}`,
      }),
      `open ${scenario.key} draw ${draw}`,
    );
    const item = Array.isArray(result.items) ? result.items[0] : null;
    if (!item?.prizeUnitId) throw new Error(`open ${scenario.key} draw ${draw}: missing prize unit`);
    rawItems.push({ draw, item });
  }
  const walletAfter = await walletState(context.testerProfileId);
  const unitIds = rawItems.map((entry) => entry.item.prizeUnitId);
  const units = assertNoError(
    await supabase
      .from("draw_round_prize_units")
      .select("id,draw_round_prize_id,metadata")
      .in("id", unitIds),
    `load awarded units ${scenario.key}`,
  );
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const prizesById = new Map(campaign.prizeRows.map((prize) => [prize.id, prize]));
  const records = rawItems.map(({ draw, item }) => {
    const unit = unitsById.get(item.prizeUnitId);
    const prize = prizesById.get(unit?.draw_round_prize_id);
    if (!prize) throw new Error(`draw ${draw}: prize not found for unit ${item.prizeUnitId}`);
    const metadata = unit.metadata && typeof unit.metadata === "object" ? unit.metadata : {};
    const soldPct = Number(metadata.soldPctAtAward ?? item.soldPct ?? draw);
    return {
      draw,
      soldPct,
      unitId: item.prizeUnitId,
      key: prize.key,
      label: prize.label,
      cardName: prize.cardName,
      group: prize.group,
      tier: prize.tier,
      rank: prize.rank,
      configuredWeight: Number(prize.weight ?? 1),
      configuredUnlockAtSoldPct: Number(prize.unlockAtSoldPct ?? 0),
      effectiveWeight: Number(item.effectiveWeight ?? effectiveWeight(prize, scenario)),
      effectiveUnlockAtSoldPct: Number(item.effectiveUnlockAtSoldPct ?? effectiveUnlock(prize, scenario)),
      eligibleDraw: eligibleDraw(prize, scenario),
    };
  });
  return {
    scenario,
    campaign,
    records,
    wallet: {
      before: walletBefore.balance,
      after: walletAfter.balance,
      spent: walletBefore.balance - walletAfter.balance,
    },
  };
}

function summarizeReport(result) {
  const { scenario, campaign, records } = result;
  const counts = countGroups(records);
  const first = firstDraws(records);
  const windows = [10, 20, 30, 50, 75, 100].map((size) => ({
    size,
    counts: countGroups(records.slice(0, size)),
  }));
  const violations = records.filter((record) => record.draw < record.eligibleDraw);
  const prizes = [...campaign.prizeRows].sort(sortByRank);
  return {
    scenario,
    title: scenario.title,
    key: scenario.key,
    mode: scenario.mode,
    description: scenario.description,
    slug: campaign.slug,
    counts,
    first,
    windows,
    violations,
    prizes,
    wallet: result.wallet,
  };
}

function formatPool(prizes, scenario, soldPct) {
  const pool = theoreticalPool(prizes, scenario, soldPct);
  return `sold ${soldPct}%: top ${pct(pool.byGroup.top)}, high ${pct(pool.byGroup.high)}, normal ${pct(pool.byGroup.normal)}`;
}

function topFirstDrawSummary(report) {
  const first = report.first.firstByPrize;
  return ["top1", "top2", "top3"].map((key) => first.get(key)?.draw ?? "not awarded").join(" / ");
}

function highFirstDrawSummary(report) {
  const highRecords = [...report.first.firstByPrize.values()].filter((record) => record.group === "high");
  if (!highRecords.length) return "not awarded";
  const draws = highRecords.map((record) => record.draw);
  return `${Math.min(...draws)}-${Math.max(...draws)}`;
}

function printWeightLadderSummary(reports) {
  console.log("");
  console.log("## Weight Ladder Comparison");
  console.log("");
  console.log("| Run | Top weights | High weight | Normal weight | Start pool top/high/normal | First top draws P1/P2/P3 | High first range | First 50 draws |");
  console.log("| --- | --- | ---: | ---: | --- | --- | --- | --- |");
  for (const report of reports) {
    const pool = theoreticalPool(report.prizes, report.scenario, 1);
    const first50 = report.windows.find((window) => window.size === 50)?.counts ?? { top: 0, high: 0, normal: 0 };
    const topWeights = report.scenario.topWeights?.join(" / ") ?? "default";
    console.log(`| ${report.key} | ${topWeights} | ${moneyWeight(report.scenario.highWeight ?? 0)} | ${moneyWeight(report.scenario.normalWeight ?? 0)} | top ${pct(pool.byGroup.top)}, high ${pct(pool.byGroup.high)}, normal ${pct(pool.byGroup.normal)} | ${topFirstDrawSummary(report)} | ${highFirstDrawSummary(report)} | top ${first50.top}, high ${first50.high}, normal ${first50.normal} |`);
  }
}

function formatPrizeLine(prize, firstRecord) {
  const cameOut = firstRecord
    ? `draw ${firstRecord.draw} at sold ${pct(firstRecord.soldPct)}`
    : "not awarded";
  return `- ${prize.label}: ${cameOut}; qty ${prize.quantity}; weight ${moneyWeight(prize.weight)}; unlock ${pct(prize.unlockAtSoldPct)}`;
}

function printMarkdown(context, reports, options = {}) {
  const host = new URL(supabaseUrl).host;
  console.log(`# ${options.title ?? "YNOTT Random Pack Probability Test Report"}`);
  console.log("");
  console.log(`Run key: \`${context.runKey}\``);
  console.log(`Supabase host: \`${host}\``);
  console.log(`Tester: ${context.testerLabel} (\`${context.testerProfileId}\`)`);
  console.log(`Pack size: ${totalSlots} one-by-one opens per scenario, ${reports.length} scenarios, ${totalSlots * reports.length} total RPC opens.`);
  console.log(`Coin grant: ${context.coinGrant.before} -> ${context.coinGrant.after} (+${context.coinGrant.amount}); expected spend ${totalSlots * reports.length}.`);
  console.log("");
  console.log(options.poolNote ?? "Configured prize pool used by the weighted scenarios:");
  for (const prize of [...reports[0].prizes].sort(sortByRank)) {
    console.log(`- ${prize.label}: group ${prize.group}; qty ${prize.quantity}; weight ${moneyWeight(prize.weight)}; unlock ${pct(prize.unlockAtSoldPct)}; ${prize.cardName}`);
  }
  console.log("");
  console.log("Important reading rule: each scenario opens the whole 100-slot test pack, so the final 100-draw count equals inventory composition. Weight affects award order and early-window probability, not the final sellout count.");

  for (const report of reports) {
    console.log("");
    console.log(`## ${report.title}`);
    console.log("");
    console.log(`Mode: \`${report.mode}\`; campaign slug: \`${report.slug}\``);
    console.log(report.description);
    console.log(`Wallet spent: ${report.wallet.spent}; expected ${totalSlots}.`);
    console.log(`Final group count: top ${countPct(report.counts.top, totalSlots)}, high ${countPct(report.counts.high, totalSlots)}, normal ${countPct(report.counts.normal, totalSlots)}.`);
    console.log(`Unlock violations: ${report.violations.length ? report.violations.map((record) => `${record.label} draw ${record.draw} before draw ${record.eligibleDraw}`).join(", ") : "none"}.`);
    console.log("");
    console.log("Theoretical starting/threshold pool share:");
    for (const threshold of [1, 10, 20, 30, 50]) {
      console.log(`- ${formatPool(report.prizes, report.scenario, threshold)}`);
    }
    console.log("");
    console.log("Observed group count by opening window:");
    for (const window of report.windows) {
      console.log(`- first ${String(window.size).padStart(3, " ")} draws: top ${countPct(window.counts.top, window.size)}, high ${countPct(window.counts.high, window.size)}, normal ${countPct(window.counts.normal, window.size)}`);
    }
    console.log("");
    console.log("First appearance by prize:");
    for (const prize of report.prizes) {
      console.log(formatPrizeLine(prize, report.first.firstByPrize.get(prize.key)));
    }
  }
  if (options.weightLadder) printWeightLadderSummary(reports);
}

async function main() {
  const isWeightLadder = process.argv.includes("--weight-ladder");
  const activeScenarios = isWeightLadder ? weightLadderScenarios : scenarios;
  const runKey = `${isWeightLadder ? "weight-ladder" : "prob-test"}-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
  const admin = await ensureAdmin();
  const tester = await ensureTester();
  const seedRunId = await ensureSeedRun(runKey, admin.adminId);
  const categoryId = await ensureCategory(seedRunId, admin.adminId);
  const cards = {};
  for (const prize of prizeBlueprints) {
    cards[prize.key] = await ensureCard(prize, seedRunId);
  }
  const coinGrant = await grantCoins(tester.profileId, admin.adminId, 500, `${runKey}:tester-grant`);
  const context = {
    runKey,
    adminId: admin.adminId,
    seedRunId,
    categoryId,
    cards,
    testerProfileId: tester.profileId,
    testerLabel: tester.label,
    coinGrant,
  };
  const reports = [];
  for (const scenario of activeScenarios) {
    const campaign = await createCampaign(scenario, context);
    const result = await openCampaignOneByOne(scenario, campaign, context);
    reports.push(summarizeReport(result));
  }
  const walletSpentOk = reports.every((report) => report.wallet.spent === totalSlots);
  const unlockOk = reports.every((report) => report.violations.length === 0);
  printMarkdown(context, reports, isWeightLadder ? {
    title: "YNOTT Weight Ladder One-By-One Test Report",
    poolNote: "The first run uses your requested baseline; later runs increase only top/high weights while normal PSA10 stays at 50.",
    weightLadder: true,
  } : {});
  console.log("");
  console.log(`Overall checks: wallet spend ${walletSpentOk ? "PASS" : "FAIL"}; unlock gates ${unlockOk ? "PASS" : "FAIL"}.`);
  if (!walletSpentOk || !unlockOk) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
