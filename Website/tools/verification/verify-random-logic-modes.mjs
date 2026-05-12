import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../.env.local");

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

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

function assertNoError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

function searchName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function groupForPrize(prize) {
  const metadata = prize.metadata && typeof prize.metadata === "object"
    ? prize.metadata
    : {};
  if (typeof metadata.displayGroup === "string") return metadata.displayGroup;
  if (prize.tier === "high" && prize.rank <= 3) return "top";
  return prize.tier === "high" ? "high" : "normal";
}

function effectiveWeight(prize, mode) {
  if (mode === "pure_random") return 1;
  return Math.max(0, Number(prize.weight ?? 1) || 0);
}

function effectiveUnlock(prize, mode) {
  if (mode !== "inventory_gated") return 0;
  return Math.min(100, Math.max(0, Number(prize.unlockAtSoldPct ?? prize.unlock_at_sold_pct ?? 0) || 0));
}

function expectedProbabilities(prizes, mode, soldPct) {
  const weightedRows = prizes.map((prize) => {
    const units = Math.max(0, Number(prize.quantity ?? prize.totalUnits ?? 0) || 0);
    const weight = effectiveWeight(prize, mode);
    const unlocked = effectiveUnlock(prize, mode) <= soldPct;
    const poolWeight = unlocked && weight > 0 ? units * weight : 0;
    return { prize, group: groupForPrize(prize), poolWeight };
  });
  const totalWeight = weightedRows.reduce((sum, row) => sum + row.poolWeight, 0);
  const byGroup = {};
  const byPrize = {};
  for (const row of weightedRows) {
    const pct = totalWeight > 0 ? (row.poolWeight / totalWeight) * 100 : 0;
    byGroup[row.group] = (byGroup[row.group] ?? 0) + pct;
    byPrize[`${row.prize.rank}:${row.prize.cardName}`] = Number(pct.toFixed(2));
  }
  return {
    byGroup: Object.fromEntries(Object.entries(byGroup).map(([key, value]) => [key, Number(value.toFixed(2))])),
    byPrize,
  };
}

function summarizeObserved(prizesById, cardsById, unitRows, totalOpens) {
  const byGroup = {};
  const byPrize = {};
  for (const unit of unitRows) {
    const prize = prizesById.get(unit.draw_round_prize_id);
    if (!prize) continue;
    const card = cardsById.get(prize.card_id);
    const group = groupForPrize(prize);
    const prizeKey = `${group} #${prize.rank} ${card?.name ?? prize.card_id}`;
    byGroup[group] = (byGroup[group] ?? 0) + 1;
    byPrize[prizeKey] = (byPrize[prizeKey] ?? 0) + 1;
  }
  const toPctMap = (source) =>
    Object.fromEntries(
      Object.entries(source)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, count]) => [
          key,
          {
            count,
            pct: Number(((count / Math.max(totalOpens, 1)) * 100).toFixed(2)),
          },
        ]),
    );
  return {
    byGroup: toPctMap(byGroup),
    byPrize: toPctMap(byPrize),
  };
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

async function ensureProfile() {
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
    "find ralph test profile",
    supabase
      .from("profiles")
      .select("id,display_name,line_display_name")
      .eq("line_user_id", "ralph-random-tester"),
  );
  const tester = profile ?? await getSingle(
    "create ralph test profile",
    supabase
      .from("profiles")
      .insert({
        line_user_id: "ralph-random-tester",
        line_display_name: "Ralph Random Tester",
        display_name: "Ralph Random Tester",
        preferred_language: "en",
      })
      .select("id,display_name,line_display_name"),
  );
  const admin = await getSingle(
    "create ralph owner admin",
    supabase
      .from("admin_users")
      .insert({ profile_id: tester.id, role: "owner", is_active: true })
      .select("id,profile_id,role"),
  );
  return {
    adminId: admin.id,
    profileId: tester.id,
    label: tester.display_name ?? tester.line_display_name ?? "Ralph Random Tester",
  };
}

async function namedCoinTargets() {
  const profiles = assertNoError(
    await supabase
      .from("profiles")
      .select("id,display_name,line_display_name,email")
      .limit(5000),
    "load profiles for coin grant",
  );
  return profiles.filter((profile) => {
    const haystack = [
      profile.display_name,
      profile.line_display_name,
      profile.email,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes("boo boo") || haystack.includes("yuya");
  });
}

async function walletBalance(profileId) {
  const wallet = await getMaybeSingle(
    "load wallet",
    supabase
      .from("wallet_accounts")
      .select("profile_id,balance_coins,version")
      .eq("profile_id", profileId),
  );
  return wallet?.balance_coins ?? 0;
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
    "ensure wallet",
  );
  const before = await walletState(profileId);
  assertNoError(
    await supabase
      .from("wallet_accounts")
      .update({ balance_coins: before.balance + amount, version: before.version + 1 })
      .eq("profile_id", profileId),
    "grant wallet coins",
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
      metadata: { verification: "random_logic_modes" },
    }),
    "insert coin ledger grant",
  );
  return { before: before.balance, after: before.balance + amount, amount };
}

async function ensureSeedRun(runKey, adminId) {
  const existing = await getMaybeSingle(
    "find seed run",
    supabase.from("seed_runs").select("id").eq("seed_key", runKey),
  );
  if (existing) return existing.id;
  const seedRun = await getSingle(
    "create seed run",
    supabase
      .from("seed_runs")
      .insert({
        seed_key: runKey,
        label: "Ralph random logic verification",
        environment: "local",
        status: "applied",
        applied_by_admin_id: adminId,
        metadata: { verification: "random_logic_modes" },
      })
      .select("id"),
  );
  return seedRun.id;
}

async function ensureCategory(seedRunId, adminId) {
  const existing = await getMaybeSingle(
    "find random logic category",
    supabase.from("store_categories").select("id").eq("slug", "ralph-random-logic-test"),
  );
  if (existing) return existing.id;
  const category = await getSingle(
    "create random logic category",
    supabase
      .from("store_categories")
      .insert({
        slug: "ralph-random-logic-test",
        name_th: "RALPH RANDOM TEST",
        name_en: "Ralph Random Test",
        description: "Local verification category for random pack logic modes.",
        icon: "TEST",
        legacy_series: "pokemon",
        sort_order: 999,
        is_active: true,
        is_test: true,
        seed_run_id: seedRunId,
        created_by_admin_id: adminId,
        metadata: { verification: "random_logic_modes" },
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
    name: card.name,
    search_name: searchName(card.name),
    series: "pokemon",
    grade: "PSA10",
    image_url: card.imageUrl ?? null,
    is_test: true,
    seed_run_id: seedRunId,
    asset_source: "Codex local verification seed",
    asset_license: "Original test placeholder",
    asset_manifest_key: `verification/random-logic/${card.code}`,
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

function prizeDefinitions(cards) {
  return [
    { group: "top", cardId: cards.top1, cardName: "Ralph Charizard SAR PSA10", tier: "high", rank: 1, quantity: 1, weight: 40, unlockAtSoldPct: 30 },
    { group: "top", cardId: cards.top2, cardName: "Ralph Pikachu Master Ball PSA10", tier: "high", rank: 2, quantity: 1, weight: 30, unlockAtSoldPct: 30 },
    { group: "top", cardId: cards.top3, cardName: "Ralph Luffy Manga PSA10", tier: "high", rank: 3, quantity: 1, weight: 20, unlockAtSoldPct: 30 },
    { group: "high", cardId: cards.high1, cardName: "Ralph Nami Alt Art PSA10", tier: "high", rank: 4, quantity: 2, weight: 10, unlockAtSoldPct: 30 },
    { group: "high", cardId: cards.high2, cardName: "Ralph Zoro Secret PSA10", tier: "high", rank: 5, quantity: 2, weight: 10, unlockAtSoldPct: 30 },
    { group: "high", cardId: cards.high3, cardName: "Ralph Trainer SAR PSA10", tier: "high", rank: 6, quantity: 2, weight: 10, unlockAtSoldPct: 30 },
    { group: "high", cardId: cards.high4, cardName: "Ralph Mewtwo SAR PSA10", tier: "high", rank: 7, quantity: 2, weight: 10, unlockAtSoldPct: 30 },
    { group: "high", cardId: cards.high5, cardName: "Ralph Ace Parallel PSA10", tier: "high", rank: 8, quantity: 2, weight: 10, unlockAtSoldPct: 30 },
    { group: "normal", cardId: cards.normal, cardName: "Random PSA10 Card", tier: "normal", rank: 1, quantity: 87, weight: 1, unlockAtSoldPct: 0 },
  ];
}

async function createCampaign(config, context) {
  const campaign = await getSingle(
    `create campaign ${config.slug}`,
    supabase
      .from("draw_rounds")
      .insert({
        slug: config.slug,
        title_th: config.title,
        title_en: config.title,
        series: "pokemon",
        status: "live",
        visibility: "public",
        approval_status: "approved",
        mode: "instant_gacha",
        price_thb: 100,
        cost_coins: 1,
        total_slots: 100,
        order_code_prefix: "RT",
        display_tags: ["PSA10", "Ralph test"],
        sort_order: 999,
        created_by: context.adminId,
        is_test: true,
        seed_run_id: context.seedRunId,
        logic_snapshot: {
          mode: config.mode,
          label: config.title,
          openQuantityOptions: [1, 10, 100],
          verificationRun: context.runKey,
        },
        test_metadata: { verification: "random_logic_modes", runKey: context.runKey },
      })
      .select("id,slug,total_slots"),
  );
  assertNoError(
    await supabase.from("draw_round_categories").upsert({
      draw_round_id: campaign.id,
      category_id: context.categoryId,
      is_primary: true,
    }),
    `link campaign category ${config.slug}`,
  );
  assertNoError(
    await supabase.from("draw_round_testers").upsert({
      draw_round_id: campaign.id,
      profile_id: context.profileId,
      added_by_admin_id: context.adminId,
      seed_run_id: context.seedRunId,
    }),
    `whitelist tester ${config.slug}`,
  );
  assertNoError(
    await supabase.rpc("create_draw_slots", { p_draw_round_id: campaign.id }),
    `create slots ${config.slug}`,
  );
  if (config.preOpenSlots > 0) {
    const slots = assertNoError(
      await supabase
        .from("draw_slots")
        .select("id")
        .eq("draw_round_id", campaign.id)
        .order("slot_number", { ascending: true })
        .limit(config.preOpenSlots),
      `load pre-open slots ${config.slug}`,
    );
    assertNoError(
      await supabase
        .from("draw_slots")
        .update({ status: "opened", opened_at: new Date().toISOString() })
        .in("id", slots.map((slot) => slot.id)),
      `pre-open slots ${config.slug}`,
    );
  }

  const prizeRows = [];
  for (const prize of context.prizes) {
    const row = await getSingle(
      `create prize ${config.slug} ${prize.rank}`,
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
      `create prize units ${config.slug} ${prize.rank}`,
    );
    prizeRows.push({ ...row, quantity: prize.quantity, cardName: prize.cardName, group: prize.group });
  }
  return { ...campaign, prizeRows };
}

function buildOpenBatches(totalQuantity) {
  const batches = [];
  let remaining = totalQuantity;
  for (const option of [100, 10, 1]) {
    while (remaining >= option) {
      batches.push(option);
      remaining -= option;
    }
  }
  if (remaining !== 0) throw new Error(`cannot batch open quantity ${totalQuantity}`);
  return batches;
}

async function openCampaign(config, campaign, context) {
  const walletBefore = await walletBalance(context.profileId);
  const batches = buildOpenBatches(config.openQuantity);
  const results = [];
  for (const [index, batchQuantity] of batches.entries()) {
    results.push(assertNoError(
      await supabase.rpc("open_gacha_campaign", {
        p_profile_id: context.profileId,
        p_draw_round_id: campaign.id,
        p_quantity: batchQuantity,
        p_idempotency_key: `${context.runKey}:${config.slug}:open:${index + 1}:${batchQuantity}`,
      }),
      `open campaign ${config.slug} batch ${index + 1}`,
    ));
  }
  const walletAfter = await walletBalance(context.profileId);
  const items = results.flatMap((result) => (
    Array.isArray(result.items) ? result.items : []
  ));
  const unitIds = items.map((item) => item.prizeUnitId).filter(Boolean);
  const unitRows = unitIds.length
    ? assertNoError(
        await supabase
          .from("draw_round_prize_units")
          .select("id,draw_round_prize_id,metadata")
          .in("id", unitIds),
        `load awarded units ${config.slug}`,
      )
    : [];
  const prizeIds = [...new Set(unitRows.map((unit) => unit.draw_round_prize_id))];
  const awardedPrizes = prizeIds.length
    ? assertNoError(
        await supabase
          .from("draw_round_prizes")
          .select("id,card_id,tier,rank,weight,unlock_at_sold_pct,metadata")
          .in("id", prizeIds),
        `load awarded prizes ${config.slug}`,
      )
    : [];
  const cardIds = [...new Set(awardedPrizes.map((prize) => prize.card_id))];
  const cards = cardIds.length
    ? assertNoError(
        await supabase.from("cards").select("id,name,card_code").in("id", cardIds),
        `load awarded cards ${config.slug}`,
      )
    : [];
  const prizesById = new Map(awardedPrizes.map((prize) => [prize.id, prize]));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const observed = summarizeObserved(prizesById, cardsById, unitRows, items.length);
  const topHighBeforeUnlock = unitRows.filter((unit) => {
    const prize = prizesById.get(unit.draw_round_prize_id);
    if (!prize) return false;
    const group = groupForPrize(prize);
    const metadata = unit.metadata && typeof unit.metadata === "object" ? unit.metadata : {};
    const soldPctAtAward = Number(metadata.soldPctAtAward ?? 0);
    return (group === "top" || group === "high") && soldPctAtAward < 30;
  }).length;
  const expected = expectedProbabilities(campaign.prizeRows, config.mode, config.startSoldPct);
  return {
    label: config.title,
    slug: campaign.slug,
    mode: config.mode,
    campaignId: campaign.id,
    startSoldPct: config.startSoldPct,
    openQuantity: config.openQuantity,
    openBatches: batches,
    publicCodes: results.map((result) => result.publicCode).filter(Boolean),
    wallet: {
      before: walletBefore,
      after: walletAfter,
      spent: walletBefore - walletAfter,
      expectedSpend: config.openQuantity,
    },
    expectedPctByGroupAtStart: expected.byGroup,
    observed,
    topHighBeforeUnlock,
    pass: {
      walletDebited: walletBefore - walletAfter === config.openQuantity,
      noTopHighBeforeUnlock:
        config.mode !== "inventory_gated" ||
        config.startSoldPct >= 30 ||
        topHighBeforeUnlock === 0,
      topHighAfterUnlockVisible:
        config.mode !== "inventory_gated" ||
        config.startSoldPct < 30 ||
        ((observed.byGroup.top?.count ?? 0) + (observed.byGroup.high?.count ?? 0)) > 0,
    },
  };
}

async function main() {
  const runKey = `ralph-random-logic-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
  const profile = await ensureProfile();
  const seedRunId = await ensureSeedRun(runKey, profile.adminId);
  const categoryId = await ensureCategory(seedRunId, profile.adminId);
  const cardIds = {
    normal: await ensureCard({ code: "RANDOM-PSA10", name: "Random PSA10 Card" }, seedRunId),
    top1: await ensureCard({ code: "RALPH-TOP-1", name: "Ralph Charizard SAR PSA10" }, seedRunId),
    top2: await ensureCard({ code: "RALPH-TOP-2", name: "Ralph Pikachu Master Ball PSA10" }, seedRunId),
    top3: await ensureCard({ code: "RALPH-TOP-3", name: "Ralph Luffy Manga PSA10" }, seedRunId),
    high1: await ensureCard({ code: "RALPH-HIGH-1", name: "Ralph Nami Alt Art PSA10" }, seedRunId),
    high2: await ensureCard({ code: "RALPH-HIGH-2", name: "Ralph Zoro Secret PSA10" }, seedRunId),
    high3: await ensureCard({ code: "RALPH-HIGH-3", name: "Ralph Trainer SAR PSA10" }, seedRunId),
    high4: await ensureCard({ code: "RALPH-HIGH-4", name: "Ralph Mewtwo SAR PSA10" }, seedRunId),
    high5: await ensureCard({ code: "RALPH-HIGH-5", name: "Ralph Ace Parallel PSA10" }, seedRunId),
  };
  const prizes = prizeDefinitions(cardIds);
  const context = {
    ...profile,
    seedRunId,
    categoryId,
    runKey,
    prizes,
  };

  const grants = [];
  grants.push({
    label: profile.label,
    ...(await grantCoins(profile.profileId, profile.adminId, 20000, `${runKey}:primary-grant`)),
  });
  for (const target of await namedCoinTargets()) {
    if (target.id === profile.profileId) continue;
    grants.push({
      label: target.display_name ?? target.line_display_name ?? target.email ?? target.id,
      ...(await grantCoins(target.id, profile.adminId, 20000, `${runKey}:${target.id}:named-grant`)),
    });
  }

  const configs = [
    {
      title: "Pure random mock pack",
      slug: `${runKey}-pure`,
      mode: "pure_random",
      startSoldPct: 0,
      preOpenSlots: 0,
      openQuantity: 50,
    },
    {
      title: "Weighted mock pack",
      slug: `${runKey}-weighted`,
      mode: "weighted_templates",
      startSoldPct: 0,
      preOpenSlots: 0,
      openQuantity: 50,
    },
    {
      title: "30% unlock mock pack before threshold",
      slug: `${runKey}-locked-pre`,
      mode: "inventory_gated",
      startSoldPct: 0,
      preOpenSlots: 0,
      openQuantity: 20,
    },
    {
      title: "30% unlock mock pack after threshold",
      slug: `${runKey}-locked-post`,
      mode: "inventory_gated",
      startSoldPct: 30,
      preOpenSlots: 30,
      openQuantity: 50,
    },
  ];

  const reports = [];
  for (const config of configs) {
    const campaign = await createCampaign(config, context);
    reports.push(await openCampaign(config, campaign, context));
  }

  const allPass = reports.every((report) => Object.values(report.pass).every(Boolean));
  console.log(JSON.stringify({
    ok: allPass,
    runKey,
    tester: {
      profileId: profile.profileId,
      label: profile.label,
    },
    coinGrants: grants,
    reports,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
