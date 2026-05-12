import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import { getCardCatalog, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/schema-compat";
import type { Database } from "@/lib/supabase/types";
import type {
  YnotCampaign,
  YnotCollectionItem,
  YnotDashboardData,
  YnotDataIssue,
  YnotAddress,
  YnotApprovalStatus,
  YnotCategory,
  YnotExchangeOrder,
  YnotGachaOpenHistory,
  YnotOwnerApprovalRequest,
  YnotPaymentMethod,
  YnotPlatformHealth,
  YnotPrizePoolItem,
  YnotPrizePreview,
  YnotRandomLogicMode,
  YnotRankingRow,
  YnotShippingRequest,
  YnotTopUp,
  YnotViewer,
  YnotWallet,
} from "./types";
import { featuredCampaigns } from "./storefront-content";
import { allowDemoStorefront } from "./runtime-flags";
import {
  getCampaignPrizeReadiness,
  type CampaignPrizeReadiness,
} from "./prize-readiness";

const dataIssueStorage = new AsyncLocalStorage<YnotDataIssue[]>();

const defaultViewer: YnotViewer = {
  authenticated: false,
  displayName: "Guest",
  isAdmin: false,
  adminRole: null,
};

function safeCostCoins(
  row: Database["public"]["Tables"]["draw_rounds"]["Row"],
) {
  return row.cost_coins ?? Math.max(1, Math.ceil(row.price_thb / 100));
}

function defaultCampaignTags(series: "one_piece" | "pokemon") {
  return series === "pokemon" ? ["PSA10"] : ["Manga"];
}

function safeDisplayTags(
  row: Database["public"]["Tables"]["draw_rounds"]["Row"],
) {
  const tags = row.display_tags;
  if (!Array.isArray(tags)) return defaultCampaignTags(row.series);
  const cleaned = tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4);
  return cleaned.length ? cleaned : defaultCampaignTags(row.series);
}

type InventorySummary = {
  drawRoundId: string;
  totalSlots?: number;
  remainingSlots?: number;
  totalUnits?: number;
  availableUnits?: number;
  awardedUnits?: number;
  voidUnits?: number;
};

type DrawRoundRow = Database["public"]["Tables"]["draw_rounds"]["Row"];
const approvalStatuses: readonly YnotApprovalStatus[] = [
  "not_submitted",
  "pending_review",
  "approved",
  "rejected",
  "changes_requested",
];
const randomLogicModes: readonly YnotRandomLogicMode[] = [
  "pure_random",
  "weighted_templates",
  "inventory_gated",
];

function inferredApprovalStatus(status: YnotCampaign["status"]) {
  return status === "live" || status === "closed" || status === "archived"
    ? "approved"
    : "not_submitted";
}

function normalizeApprovalStatus(
  value: unknown,
  fallback: YnotApprovalStatus,
): YnotApprovalStatus {
  return approvalStatuses.includes(value as YnotApprovalStatus)
    ? (value as YnotApprovalStatus)
    : fallback;
}

function normalizeRandomLogicMode(value: unknown): YnotRandomLogicMode {
  if (randomLogicModes.includes(value as YnotRandomLogicMode)) {
    return value as YnotRandomLogicMode;
  }
  if (isRecord(value)) {
    const mode = value.mode ?? value.logicMode;
    if (randomLogicModes.includes(mode as YnotRandomLogicMode)) {
      return mode as YnotRandomLogicMode;
    }
  }
  return "pure_random";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function inventorySummariesFromJson(value: unknown): InventorySummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.drawRoundId !== "string") return [];
    return [
      {
        drawRoundId: item.drawRoundId,
        totalSlots: Number(item.totalSlots) || undefined,
        remainingSlots: Number(item.remainingSlots) || undefined,
        totalUnits: Number(item.totalUnits) || 0,
        availableUnits: Number(item.availableUnits) || 0,
        awardedUnits: Number(item.awardedUnits) || 0,
        voidUnits: Number(item.voidUnits) || 0,
      },
    ];
  });
}

function soldPctForCampaign(row: DrawRoundRow, inventory?: InventorySummary) {
  const remainingSlots =
    inventory?.remainingSlots ?? row.total_slots;
  const soldSlots = Math.max(0, row.total_slots - remainingSlots);
  if (row.total_slots <= 0) return 100;
  return Math.min(100, (soldSlots / row.total_slots) * 100);
}

function isAdminHidden(metadata: unknown) {
  return isRecord(metadata) && metadata.adminHidden === true;
}

function isOwnerRemoved(metadata: unknown) {
  return isRecord(metadata) && typeof metadata.ownerRemovedAt === "string";
}

function metadataString(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return undefined;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function soldPctForYnotCampaign(campaign: YnotCampaign) {
  const remainingSlots = campaign.remainingSlots ?? campaign.totalSlots;
  if (campaign.totalSlots <= 0) return 100;
  return Math.round(
    Math.min(
      100,
      (Math.max(0, campaign.totalSlots - remainingSlots) /
        campaign.totalSlots) *
        100,
    ),
  );
}

async function getPublicPrizeLineup(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  row: DrawRoundRow,
  inventory?: InventorySummary,
  options: { includeLocked?: boolean } = {},
): Promise<YnotPrizePreview[]> {
  const soldPct = soldPctForCampaign(row, inventory);
  const { data: prizes, error } = await supabase
    .from("draw_round_prizes")
    .select("*")
    .eq("draw_round_id", row.id)
    .order("tier", { ascending: true })
    .order("rank", { ascending: true });
  if (error) throw error;

  const visiblePrizes = (prizes ?? []).filter(
    (prize) =>
      !isAdminHidden(prize.metadata) &&
      (options.includeLocked ||
        (Number(prize.weight ?? 1) > 0 &&
          Number(prize.unlock_at_sold_pct ?? 0) <= soldPct)),
  );
  if (!visiblePrizes.length) return [];

  const cardIds = [...new Set(visiblePrizes.map((prize) => prize.card_id))];
  const prizeIds = visiblePrizes.map((prize) => prize.id);
  const [{ data: cards, error: cardsError }, { data: units, error: unitsError }] =
    await Promise.all([
      supabase.from("cards").select("id,name").in("id", cardIds),
      supabase
        .from("draw_round_prize_units")
        .select("draw_round_prize_id,status")
        .in("draw_round_prize_id", prizeIds)
        .limit(10000),
    ]);
  if (cardsError) throw cardsError;
  if (unitsError) throw unitsError;

  const cardById = new Map((cards ?? []).map((card) => [card.id, card]));
  const countsByPrize = new Map<string, { total: number; available: number }>();
  for (const unit of units ?? []) {
    const counts = countsByPrize.get(unit.draw_round_prize_id) ?? {
      total: 0,
      available: 0,
    };
    counts.total += 1;
    if (unit.status === "available") counts.available += 1;
    countsByPrize.set(unit.draw_round_prize_id, counts);
  }

  return visiblePrizes
    .map((prize) => {
      const counts = countsByPrize.get(prize.id);
      return {
        id: prize.id,
        cardId: prize.card_id,
        cardName: cardById.get(prize.card_id)?.name ?? "Mystery reward",
        tier: prize.tier,
        rank: prize.rank,
        valueThb: prize.value_thb,
        availableUnits: counts?.available,
        totalUnits: counts?.total,
        weight: Number(prize.weight ?? 1),
        unlockAtSoldPct: Number(prize.unlock_at_sold_pct ?? 0),
        prizeCategory: metadataString(prize.metadata, "prizeCategory"),
        prizeCategoryLabel: metadataString(prize.metadata, "prizeCategoryLabel"),
        sourceType: metadataString(prize.metadata, "sourceType"),
        displayGroup: metadataString(prize.metadata, "displayGroup"),
      };
    })
    .sort((left, right) => {
      if (left.tier !== right.tier) return left.tier === "high" ? -1 : 1;
      return left.rank - right.rank;
    });
}

function toYnotCampaign(
  row: DrawRoundRow,
  linkedCategories: YnotCategory[] = [],
  inventory?: InventorySummary,
  prizeLineup?: YnotPrizePreview[],
  readiness?: CampaignPrizeReadiness | null,
): YnotCampaign {
  const approvalStatus = normalizeApprovalStatus(
    row.approval_status,
    inferredApprovalStatus(row.status),
  );
  const remainingSlots = readiness?.remainingSlots ?? inventory?.remainingSlots;
  const availablePrizeUnits =
    readiness?.availablePrizeUnits ?? inventory?.availableUnits;
  const soldOut =
    readiness?.soldOut ??
    Boolean(
      (remainingSlots !== undefined && remainingSlots <= 0) ||
        (availablePrizeUnits !== undefined && availablePrizeUnits <= 0),
    );
  const adminRemoved = isOwnerRemoved(row.test_metadata);
  const openable =
    row.status === "live" &&
    row.visibility === "public" &&
    approvalStatus === "approved" &&
    !adminRemoved &&
    !soldOut &&
    (readiness?.eligiblePrizeUnits ?? 0) > 0 &&
    readiness?.ready !== false;
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    approvalStatus,
    titleTh: row.title_th,
    titleEn: row.title_en,
    series: row.series,
    priceThb: row.price_thb,
    costCoins: safeCostCoins(row),
    mode: row.mode,
    visibility: row.visibility,
    totalSlots: row.total_slots,
    remainingSlots,
    totalPrizeUnits: readiness?.totalPrizeUnits ?? inventory?.totalUnits,
    availablePrizeUnits,
    eligiblePrizeUnits: readiness?.eligiblePrizeUnits,
    initialEligiblePrizeUnits: readiness?.initialEligiblePrizeUnits,
    awardedPrizeUnits: inventory?.awardedUnits,
    voidPrizeUnits: inventory?.voidUnits,
    readinessBlockers: readiness?.blockers,
    openable,
    soldOut,
    adminRemoved,
    sortOrder: row.sort_order,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    approvalRequestedAt: row.approval_requested_at,
    approvedAt: row.approved_at,
    approvalNotes: row.approval_notes,
    logicMode: normalizeRandomLogicMode(row.logic_snapshot),
    isTest: row.is_test,
    categoryIds: linkedCategories.map((category) => category.id),
    categorySlugs: linkedCategories.map((category) => category.slug),
    categoryLabel:
      linkedCategories.map((category) => category.nameEn).join(", ") ||
      (row.series === "pokemon" ? "Pokemon" : "One Piece"),
    displayTags: safeDisplayTags(row),
    prizeLineup,
  };
}

function localOwnerMockApprovalRequests(): YnotOwnerApprovalRequest[] {
  const mockConfigs: Array<{
    id: string;
    title: string;
    logicMode: YnotRandomLogicMode;
    soldPct: number;
    totalSlots: number;
    totalPrizeUnits: number;
    summary: string[];
  }> = [
    {
      id: "mock-owner-pack-pure-random",
      title: "Owner Mock Pure Random",
      logicMode: "pure_random",
      soldPct: 8,
      totalSlots: 80,
      totalPrizeUnits: 80,
      summary: [
        "Every unlocked prize unit has equal odds.",
        "All public-safe rewards are visible immediately.",
        "Approve keeps the pack draft/private until publish.",
      ],
    },
    {
      id: "mock-owner-pack-locked-30",
      title: "Owner Mock 30% Locked Chase",
      logicMode: "inventory_gated",
      soldPct: 18,
      totalSlots: 100,
      totalPrizeUnits: 100,
      summary: [
        "Rank 1-3 chase rewards stay private before 30% sold.",
        "Locked prize units remain in Postgres but cannot drop.",
        "Base rewards remain available for early openings.",
      ],
    },
    {
      id: "mock-owner-pack-unlocked-30",
      title: "Owner Mock 30% Unlocked",
      logicMode: "inventory_gated",
      soldPct: 30,
      totalSlots: 100,
      totalPrizeUnits: 100,
      summary: [
        "Sold checkpoint is reached, so locked rewards can enter odds.",
        "High-tier rewards use their configured weights after unlock.",
        "Customer preview can show only unlocked rewards.",
      ],
    },
    {
      id: "mock-owner-pack-weighted-high",
      title: "Owner Mock Weighted High Tier",
      logicMode: "weighted_templates",
      soldPct: 64,
      totalSlots: 120,
      totalPrizeUnits: 120,
      summary: [
        "High-tier and normal rewards can use different weights.",
        "Weight zero disables a prize from the drop pool.",
        "Weighted random is enforced in the database RPC.",
      ],
    },
  ];

  return mockConfigs.map((config, index) => {
    const soldSlots = Math.round(
      (config.soldPct / 100) * config.totalSlots,
    );
    const availableUnits = Math.max(
      0,
      config.totalPrizeUnits - soldSlots,
    );
    const campaign: YnotCampaign = {
      id: config.id,
      slug: config.id,
      status: "draft",
      approvalStatus: "pending_review",
      titleTh: config.title,
      titleEn: config.title,
      series: "pokemon",
      priceThb: 150 + index * 10,
      costCoins: 150 + index * 10,
      mode: "instant_gacha",
      visibility: "private",
      totalSlots: config.totalSlots,
      sortOrder: index + 1,
      startsAt: "2026-05-11T10:00:00.000Z",
      endsAt: null,
      createdAt: "2026-05-11T10:00:00.000Z",
      approvalRequestedAt: `2026-05-11T10:${String(5 + index).padStart(2, "0")}:00.000Z`,
      approvalNotes: "Local owner approval mock for random logic testing.",
      logicMode: config.logicMode,
      remainingSlots: Math.max(0, config.totalSlots - soldSlots),
      totalPrizeUnits: config.totalPrizeUnits,
      availablePrizeUnits: availableUnits,
      awardedPrizeUnits: soldSlots,
      voidPrizeUnits: 0,
      categoryLabel: "Pokemon",
      isTest: true,
      heroLabel:
        config.logicMode === "inventory_gated"
          ? "Mock locked high-tier rewards / base rewards"
          : "Mock weighted reward setup / base rewards",
      displayTags: ["Owner review", "Local mock"],
      demo: true,
    };

    return {
      id: `mock-owner-approval-${config.id}`,
      campaign,
      approvalStatus: "pending_review",
      logicMode: config.logicMode,
      requestedByLabel: "Local Admin Studio",
      requestedAt: campaign.approvalRequestedAt ?? "2026-05-11T10:05:00.000Z",
      soldPct: config.soldPct,
      notificationLabel: "Owner review needed",
      mock: true,
      summary: config.summary,
    };
  });
}

function ownerApprovalRequestFromCampaign(
  campaign: YnotCampaign,
): YnotOwnerApprovalRequest | null {
  const approvalStatus =
    campaign.approvalStatus ?? inferredApprovalStatus(campaign.status);
  const needsPublish =
    approvalStatus === "approved" &&
    (campaign.status === "draft" || campaign.visibility !== "public");
  if (approvalStatus !== "pending_review" && !needsPublish) return null;
  const readinessLine = campaign.readinessBlockers?.length
    ? `Prize readiness blocked: ${campaign.readinessBlockers[0]}`
    : "Prize inventory is ready for owner review and publish.";
  return {
    id: `owner-approval-${campaign.id}`,
    campaign,
    approvalStatus,
    logicMode: campaign.logicMode ?? "pure_random",
    requestedByLabel: "Admin Studio",
    requestedAt:
      campaign.approvalRequestedAt ??
      campaign.createdAt ??
      new Date(0).toISOString(),
    soldPct: soldPctForYnotCampaign(campaign),
    notificationLabel: needsPublish
      ? "Owner publish needed"
      : "Owner review needed",
    summary: [
      "Campaign is held from public live status until owner approval.",
      "Only public-safe status details are shown outside the owner queue.",
      "Publish must happen through the owner lifecycle route after approval.",
      readinessLine,
    ],
  };
}

function getOwnerApprovalRequests(
  viewer: YnotViewer,
  campaigns: YnotCampaign[],
): YnotOwnerApprovalRequest[] {
  if (viewer.adminRole !== "owner") return [];
  const requests = campaigns.flatMap((campaign) => {
    const request = ownerApprovalRequestFromCampaign(campaign);
    return request ? [request] : [];
  });
  return allowDemoStorefront()
    ? [...localOwnerMockApprovalRequests(), ...requests]
    : requests;
}

export async function getYnotViewer(): Promise<YnotViewer> {
  const session = await resolveCurrentProfile();
  const admin = await resolveAdminSession(session);
  if (!session) return defaultViewer;
  return {
    authenticated: true,
    profileId: session.profileId,
    displayName: session.displayName ?? "YNot Customer",
    authSource: session.authSource,
    isAdmin: Boolean(admin),
    adminRole: admin?.adminRole ?? null,
  };
}

function recordDataIssue(label: string, error: unknown) {
  const issue: YnotDataIssue = {
    label,
    message: error instanceof Error ? error.message : String(error),
    recordedAt: new Date().toISOString(),
  };
  dataIssueStorage.getStore()?.push(issue);
  console.warn("ynot_data_read_unavailable", issue);
}

async function readOrEmpty<T>(
  label: string,
  fn: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await fn();
  } catch (error) {
    recordDataIssue(label, error);
    return [];
  }
}

export async function getCampaigns(
  options: { includePrivate?: boolean } = {},
): Promise<YnotCampaign[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("campaigns", async () => {
    const loadRows = (requireApproval: boolean) => {
      let query = supabase
        .from("draw_rounds")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(24);

      if (options.includePrivate) {
        return query.in("status", ["live", "closed", "draft", "archived"]);
      }
      query = query.eq("visibility", "public").eq("status", "live");
      return requireApproval
        ? query.eq("approval_status", "approved")
        : query;
    };

    let { data, error } = await loadRows(true);
    if (
      error &&
      !options.includePrivate &&
      isMissingColumnError(error, "approval_status")
    ) {
      ({ data, error } = await loadRows(false));
    }
    if (error) throw error;
    const rows = (data ?? []).filter(
      (row) => options.includePrivate || row.is_test !== true,
    );
    const campaignIds = rows.map((row) => row.id);
    const [categories, categoryLinks, inventoryRows] = await Promise.all([
      getStoreCategories({ includeTest: Boolean(options.includePrivate) }),
      readOrEmpty("campaign_categories", async () => {
        if (!campaignIds.length) return [];
        const { data: links, error: linksError } = await supabase
          .from("draw_round_categories")
          .select("*")
          .in("draw_round_id", campaignIds);
        if (linksError) throw linksError;
        return links ?? [];
      }),
      readOrEmpty("campaign_inventory_summary", async () => {
        const { data: inventory, error: inventoryError } = await supabase.rpc(
          "get_draw_round_inventory_summary",
          {
            p_draw_round_id: null,
            p_profile_id: null,
          },
        );
        if (inventoryError) throw inventoryError;
        return inventorySummariesFromJson(inventory);
      }),
    ]);
    const categoriesById = new Map(
      categories.map((category) => [category.id, category]),
    );
    const categoryLinksByCampaign = new Map<string, typeof categoryLinks>();
    for (const link of categoryLinks) {
      const existing = categoryLinksByCampaign.get(link.draw_round_id) ?? [];
      existing.push(link);
      categoryLinksByCampaign.set(link.draw_round_id, existing);
    }
    const inventoryByCampaign = new Map(
      inventoryRows.map((summary) => [summary.drawRoundId, summary]),
    );
    const readinessRows = await Promise.all(
      campaignIds.map(async (campaignId) => {
        try {
          return await getCampaignPrizeReadiness(supabase, campaignId);
        } catch (error) {
          recordDataIssue("campaign_prize_readiness", error);
          return null;
        }
      }),
    );
    const readinessByCampaign = new Map(
      readinessRows
        .filter(
          (readiness): readiness is CampaignPrizeReadiness =>
            readiness !== null,
        )
        .map((readiness) => [readiness.campaignId, readiness]),
    );

    const prizeLineupsByCampaign = new Map<string, YnotPrizePreview[]>();
    if (options.includePrivate) {
      const prizeLineupRows = await Promise.all(
        rows.map(async (row) => {
          try {
            return [
              row.id,
              await getPublicPrizeLineup(
                supabase,
                row,
                inventoryByCampaign.get(row.id),
                { includeLocked: true },
              ),
            ] as const;
          } catch (error) {
            recordDataIssue("campaign_owner_prize_lineup", error);
            return [row.id, [] as YnotPrizePreview[]] as const;
          }
        }),
      );
      for (const [campaignId, prizeLineup] of prizeLineupRows) {
        prizeLineupsByCampaign.set(campaignId, prizeLineup);
      }
    }

    const campaigns = rows.map((row) => {
      const links = categoryLinksByCampaign.get(row.id) ?? [];
      const linkedCategories = links
        .map((link) => categoriesById.get(link.category_id))
        .filter((category): category is YnotCategory => Boolean(category));
      const inventory = inventoryByCampaign.get(row.id);
      return toYnotCampaign(
        row,
        linkedCategories,
        inventory,
        prizeLineupsByCampaign.get(row.id),
        readinessByCampaign.get(row.id),
      );
    });
    return options.includePrivate
      ? campaigns
      : campaigns.filter((campaign) => campaign.openable);
  });
}

export async function getStoreCategories(
  options: { includeTest?: boolean } = {},
): Promise<YnotCategory[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("store_categories", async () => {
    let query = supabase
      .from("store_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (!options.includeTest)
      query = query.eq("is_active", true).eq("is_test", false);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      nameTh: row.name_th,
      nameEn: row.name_en,
      description: row.description,
      imageUrl: row.image_url,
      icon: row.icon,
      legacySeries: row.legacy_series,
      sortOrder: row.sort_order,
      isActive: row.is_active,
      isTest: row.is_test,
    }));
  });
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function canReadTestCampaign(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  campaignId: string,
  viewer?: YnotViewer,
) {
  if (viewer?.isAdmin) return true;
  if (!viewer?.profileId) return false;
  const { data, error } = await supabase
    .from("draw_round_testers")
    .select("profile_id")
    .eq("draw_round_id", campaignId)
    .eq("profile_id", viewer.profileId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function getCampaign(
  campaignIdOrSlug: string,
  options: { allowTestForCurrentViewer?: boolean; viewer?: YnotViewer } = {},
) {
  if (!options.allowTestForCurrentViewer) {
    const campaigns = await getCampaigns();
    return (
      campaigns.find(
        (campaign) =>
          campaign.id === campaignIdOrSlug ||
          campaign.slug === campaignIdOrSlug,
      ) ??
      (allowDemoStorefront()
        ? featuredCampaigns.find(
            (campaign) =>
              campaign.id === campaignIdOrSlug ||
              campaign.slug === campaignIdOrSlug,
          )
        : undefined) ??
      null
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      (allowDemoStorefront()
        ? featuredCampaigns.find(
            (campaign) =>
              campaign.id === campaignIdOrSlug ||
              campaign.slug === campaignIdOrSlug,
          )
        : undefined) ?? null
    );
  }

  const supabase = createServiceSupabaseClient();
  return readOrEmpty("campaign_detail", async () => {
    const loadRow = (requireApproval: boolean) => {
      let query = supabase
        .from("draw_rounds")
        .select("*")
        .in("status", ["live", "closed"])
        .eq("visibility", "public")
        .limit(1);
      if (requireApproval) query = query.eq("approval_status", "approved");
      return looksLikeUuid(campaignIdOrSlug)
        ? query.eq("id", campaignIdOrSlug)
        : query.eq("slug", campaignIdOrSlug);
    };
    let { data, error } = await loadRow(true);
    if (error && isMissingColumnError(error, "approval_status")) {
      ({ data, error } = await loadRow(false));
    }
    if (error) throw error;
    const row = data?.[0];
    if (!row) return [];

    const viewer = options.viewer ?? (await getYnotViewer());
    if (row.is_test && !(await canReadTestCampaign(supabase, row.id, viewer)))
      return [];

    const [categories, categoryLinks, inventoryRows] = await Promise.all([
      getStoreCategories({
        includeTest: Boolean(row.is_test || viewer.isAdmin),
      }),
      readOrEmpty("campaign_detail_categories", async () => {
        const { data: links, error: linksError } = await supabase
          .from("draw_round_categories")
          .select("*")
          .eq("draw_round_id", row.id);
        if (linksError) throw linksError;
        return links ?? [];
      }),
      readOrEmpty("campaign_detail_inventory", async () => {
        const { data: inventory, error: inventoryError } = await supabase.rpc(
          "get_draw_round_inventory_summary",
          {
            p_draw_round_id: row.id,
            p_profile_id: viewer.profileId ?? null,
          },
        );
        if (inventoryError) throw inventoryError;
        return inventorySummariesFromJson(inventory);
      }),
    ]);
    const categoriesById = new Map(
      categories.map((category) => [category.id, category]),
    );
    const linkedCategories = categoryLinks
      .map((link) => categoriesById.get(link.category_id))
      .filter((category): category is YnotCategory => Boolean(category));
    const inventory = inventoryRows[0];
    const prizeLineup = await getPublicPrizeLineup(supabase, row, inventory);
    let readiness: CampaignPrizeReadiness | null = null;
    try {
      readiness = await getCampaignPrizeReadiness(supabase, row.id);
    } catch (error) {
      recordDataIssue("campaign_detail_prize_readiness", error);
    }
    const campaign = toYnotCampaign(
      row,
      linkedCategories,
      inventory,
      prizeLineup,
      readiness,
    );
    if (!viewer.isAdmin && !campaign.openable) return [];
    return [campaign];
  }).then(
    (campaigns) =>
      campaigns[0] ??
      (allowDemoStorefront()
        ? featuredCampaigns.find(
            (campaign) =>
              campaign.id === campaignIdOrSlug ||
              campaign.slug === campaignIdOrSlug,
          )
        : undefined) ??
      null,
  );
}

export async function getPaymentMethods(): Promise<YnotPaymentMethod[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("payment_methods", async () => {
    const { data, error } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      type: row.type,
      displayName: row.display_name,
      bankName: row.bank_name,
      accountName: row.account_name,
      accountNumber: row.account_number,
      promptpayId: row.promptpay_id,
      qrImagePath: row.qr_image_path,
      instructions: row.instructions,
    }));
  });
}

export async function getWallet(profileId?: string): Promise<YnotWallet> {
  if (!profileId || !isSupabaseConfigured())
    return { balanceCoins: 0, version: 0 };
  const supabase = createServiceSupabaseClient();
  const rows = await readOrEmpty("wallet", async () => {
    const { data, error } = await supabase
      .from("wallet_accounts")
      .select("*")
      .eq("profile_id", profileId)
      .limit(1);
    if (error) throw error;
    return data ?? [];
  });
  const wallet = rows[0];
  return {
    balanceCoins: wallet?.balance_coins ?? 0,
    version: wallet?.version ?? 0,
  };
}

export async function getTopUps(
  profileId?: string,
  includeAll = false,
): Promise<YnotTopUp[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("topups", async () => {
    let query = supabase
      .from("top_up_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);
    if (!includeAll && profileId) query = query.eq("profile_id", profileId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(toTopUp);
  });
}

export function toTopUp(
  row: Database["public"]["Tables"]["top_up_requests"]["Row"],
): YnotTopUp {
  return {
    id: row.id,
    publicCode: row.public_code,
    profileId: row.profile_id,
    amountThb: row.amount_thb,
    coinAmount: row.coin_amount,
    status: row.status,
    adminNote: row.admin_note,
    customerNote: row.customer_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export async function getCollection(
  profileId?: string,
): Promise<YnotCollectionItem[]> {
  if (!profileId || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  const [items, cards] = await Promise.all([
    readOrEmpty("collection", async () => {
      const { data, error } = await supabase
        .from("collection_items")
        .select("*")
        .eq("profile_id", profileId)
        .order("acquired_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    }),
    readOrEmpty("collection_card_catalog", async () =>
      getCardCatalog(supabase),
    ),
  ]);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return items.map((item) => {
    const card = cardsById.get(item.card_id);
    return {
      id: item.id,
      cardId: item.card_id,
      cardName: card?.name ?? "Mystery card",
      cardCode: card?.code,
      imageUrl: card?.photoUrl,
      status: item.status,
      serialNo: item.serial_no,
      acquiredAt: item.acquired_at,
    };
  });
}

export async function getGachaOpenHistory(
  profileId?: string,
): Promise<YnotGachaOpenHistory[]> {
  if (!profileId || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  const opens = await readOrEmpty("gacha_opens", async () => {
    const { data, error } = await supabase
      .from("gacha_opens")
      .select("*")
      .eq("profile_id", profileId)
      .order("opened_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

  if (!opens.length) return [];

  const openIds = opens.map((open) => open.id);
  const campaignIds = Array.from(
    new Set(opens.map((open) => open.draw_round_id)),
  );
  const [items, cards, campaigns] = await Promise.all([
    readOrEmpty("gacha_open_items", async () => {
      const { data, error } = await supabase
        .from("gacha_open_items")
        .select("*")
        .in("gacha_open_id", openIds)
        .order("result_position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    }),
    readOrEmpty("gacha_history_card_catalog", async () =>
      getCardCatalog(supabase),
    ),
    readOrEmpty("gacha_history_campaigns", async () => {
      const { data, error } = await supabase
        .from("draw_rounds")
        .select("id,slug,title_th,title_en")
        .in("id", campaignIds);
      if (error) throw error;
      return data ?? [];
    }),
  ]);

  const cardsById = new Map(cards.map((card) => [card.catalogCardId, card]));
  const campaignsById = new Map(
    campaigns.map((campaign) => [campaign.id, campaign]),
  );
  const itemsByOpenId = new Map<string, typeof items>();
  for (const item of items) {
    const group = itemsByOpenId.get(item.gacha_open_id) ?? [];
    group.push(item);
    itemsByOpenId.set(item.gacha_open_id, group);
  }

  return opens.map((open) => {
    const campaign = campaignsById.get(open.draw_round_id);
    const rewards = (itemsByOpenId.get(open.id) ?? []).map((item) => {
      const card = cardsById.get(item.card_id);
      return {
        id: item.id,
        cardName: card?.name ?? "Mystery reward",
        cardCode: card?.code,
        tier: item.tier,
        valueThb: item.value_thb,
        resultPosition: item.result_position,
      };
    });

    return {
      id: open.id,
      publicCode: open.public_code,
      campaignId: open.draw_round_id,
      campaignSlug: campaign?.slug,
      campaignTitle: campaign?.title_en ?? campaign?.title_th ?? "Mystery pack",
      costCoins: open.cost_coins,
      quantity: open.quantity,
      status: open.status,
      openedAt: open.opened_at,
      createdAt: open.created_at,
      rewards,
    };
  });
}

export async function getExchanges(
  profileId?: string,
  includeAll = false,
): Promise<YnotExchangeOrder[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("exchanges", async () => {
    let query = supabase
      .from("exchange_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);
    if (!includeAll && profileId) query = query.eq("profile_id", profileId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      publicCode: row.public_code,
      status: row.status,
      requestedCoinValue: row.requested_coin_value,
      approvedCoinValue: row.approved_coin_value,
      createdAt: row.created_at,
      adminNote: row.admin_note,
    }));
  });
}

export async function getShipping(
  profileId?: string,
  includeAll = false,
): Promise<YnotShippingRequest[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("shipping", async () => {
    let query = supabase
      .from("shipping_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);
    if (!includeAll && profileId) query = query.eq("profile_id", profileId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      publicCode: row.public_code,
      status: row.status,
      trackingProvider: row.tracking_provider,
      trackingNumber: row.tracking_number,
      createdAt: row.created_at,
      adminNote: row.admin_note,
    }));
  });
}

export async function getAddresses(profileId?: string): Promise<YnotAddress[]> {
  if (!profileId || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("addresses", async () => {
    const { data, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("profile_id", profileId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      recipientName: row.recipient_name,
      phone: row.phone,
      addressLine1: row.address_line1,
      district: row.district,
      province: row.province,
      postalCode: row.postal_code,
      isDefault: row.is_default,
    }));
  });
}

export async function getRankings(): Promise<YnotRankingRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("rankings", async () => {
    const { data, error } = await supabase
      .from("ranking_snapshots")
      .select("rank,value,metric,profiles(display_name,line_display_name)")
      .order("rank", { ascending: true })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const profile = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      return {
        rank: row.rank,
        value: row.value,
        metric: row.metric,
        displayName:
          profile?.display_name ?? profile?.line_display_name ?? "YNot Player",
      };
    });
  });
}

export async function getAdminUsers() {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("admin_users", async () => {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select(
        "id,email,display_name,line_display_name,profile_status,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (profilesError) throw profilesError;
    const profileIds = (profiles ?? []).map((profile) => profile.id);
    const { data: admins, error: adminsError } = profileIds.length
      ? await supabase
          .from("admin_users")
          .select("id,profile_id,role,is_active,created_at")
          .in("profile_id", profileIds)
      : { data: [], error: null };
    if (adminsError) throw adminsError;
    const adminByProfile = new Map(
      (admins ?? []).map((admin) => [admin.profile_id, admin]),
    );
    return (profiles ?? []).map((profile) => {
      const admin = adminByProfile.get(profile.id);
      return {
        id: profile.id,
        email: profile.email,
        displayName:
          profile.display_name ?? profile.line_display_name ?? "YNot Customer",
        status: profile.profile_status,
        adminRole: admin?.role ?? null,
        adminActive: Boolean(admin?.is_active),
        createdAt: profile.created_at,
      };
    });
  });
}

export async function getAdminAuditEvents() {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("audit_events", async () => {
    const { data, error } = await supabase
      .from("audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) throw error;
    return data ?? [];
  });
}

export async function getAdminCards() {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("admin_cards", async () => getCardCatalog(supabase));
}

export async function getAdminPrizePool(): Promise<YnotPrizePoolItem[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("prize_pool", async () => {
    const { data: prizes, error } = await supabase
      .from("draw_round_prizes")
      .select("*")
      .order("draw_round_id", { ascending: true })
      .order("tier", { ascending: true })
      .order("rank", { ascending: true })
      .limit(240);
    if (error) throw error;
    const visiblePrizes = (prizes ?? []).filter(
      (prize) => !isAdminHidden(prize.metadata),
    );
    if (!visiblePrizes.length) return [];

    const campaignIds = [
      ...new Set(visiblePrizes.map((prize) => prize.draw_round_id)),
    ];
    const cardIds = [...new Set(visiblePrizes.map((prize) => prize.card_id))];
    const [
      { data: campaigns, error: campaignsError },
      { data: cards, error: cardsError },
    ] = await Promise.all([
      supabase
        .from("draw_rounds")
        .select("id,slug,title_th,title_en")
        .in("id", campaignIds),
      supabase.from("cards").select("id,name").in("id", cardIds),
    ]);
    if (campaignsError) throw campaignsError;
    if (cardsError) throw cardsError;

    const prizeIds = visiblePrizes.map((prize) => prize.id);
    const unitRows = await readOrEmpty("prize_unit_counts", async () => {
      if (!prizeIds.length) return [];
      const { data: units, error: unitsError } = await supabase
        .from("draw_round_prize_units")
        .select("draw_round_prize_id,status")
        .in("draw_round_prize_id", prizeIds)
        .limit(10000);
      if (unitsError) throw unitsError;
      return units ?? [];
    });
    const unitCountsByPrize = new Map<
      string,
      { total: number; available: number; awarded: number; void: number }
    >();
    for (const unit of unitRows) {
      const counts = unitCountsByPrize.get(unit.draw_round_prize_id) ?? {
        total: 0,
        available: 0,
        awarded: 0,
        void: 0,
      };
      counts.total += 1;
      if (unit.status === "available") counts.available += 1;
      if (unit.status === "awarded") counts.awarded += 1;
      if (unit.status === "void") counts.void += 1;
      unitCountsByPrize.set(unit.draw_round_prize_id, counts);
    }

    const campaignById = new Map(
      (campaigns ?? []).map((campaign) => [campaign.id, campaign]),
    );
    const cardById = new Map((cards ?? []).map((card) => [card.id, card]));
    return visiblePrizes.map((prize) => {
      const campaign = campaignById.get(prize.draw_round_id);
      const card = cardById.get(prize.card_id);
      const counts = unitCountsByPrize.get(prize.id) ?? {
        total: 0,
        available: 0,
        awarded: 0,
        void: 0,
      };
      return {
        id: prize.id,
        campaignId: prize.draw_round_id,
        campaignSlug: campaign?.slug ?? prize.draw_round_id,
        campaignTitle: campaign?.title_th ?? campaign?.title_en ?? "Campaign",
        cardId: prize.card_id,
        cardName: card?.name ?? "Card",
        tier: prize.tier,
        rank: prize.rank,
        valueThb: prize.value_thb,
        weight: Number(prize.weight ?? 1),
        unlockAtSoldPct: Number(prize.unlock_at_sold_pct ?? 0),
        prizeCategory: metadataString(prize.metadata, "prizeCategory"),
        prizeCategoryLabel: metadataString(prize.metadata, "prizeCategoryLabel"),
        sourceType: metadataString(prize.metadata, "sourceType"),
        displayGroup: metadataString(prize.metadata, "displayGroup"),
        totalUnits: counts.total,
        availableUnits: counts.available,
        awardedUnits: counts.awarded,
        voidUnits: counts.void,
      };
    });
  });
}

export async function getAdminMergeRequests() {
  if (!isSupabaseConfigured()) return [];
  const admin = await resolveAdminSession();
  if (!admin) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("merge_requests", async () => {
    const { data, error } = await supabase
      .from("account_merge_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw error;
    return data ?? [];
  });
}

type HealthStatus = YnotPlatformHealth["checks"][number]["status"];

function envCheck(
  key: string,
  label: string,
  requiredInProduction = true,
): YnotPlatformHealth["checks"][number] {
  const configured = Boolean(process.env[key]?.trim());
  const production = process.env.NODE_ENV === "production";
  const required = requiredInProduction && production;
  const status: HealthStatus = configured ? "pass" : required ? "fail" : "warn";
  return {
    key: `env:${key}`,
    label,
    status,
    detail: configured
      ? `${key} is configured.`
      : `${key} is missing${required ? " and required in production" : " for full live verification"}.`,
  };
}

async function tableHealthCheck(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  table: keyof Database["public"]["Tables"],
  label: string,
): Promise<YnotPlatformHealth["checks"][number]> {
  const { error } = await supabase.from(table).select("*").limit(1);
  return {
    key: `table:${String(table)}`,
    label,
    status: error ? "fail" : "pass",
    detail: error
      ? `${String(table)} unavailable: ${error.message}`
      : `${String(table)} table is reachable.`,
  };
}

function withDataIssueHealth(
  health: YnotPlatformHealth | undefined,
  dataIssues: YnotDataIssue[],
): YnotPlatformHealth | undefined {
  if (!health) return undefined;
  const dataReadCheck: YnotPlatformHealth["checks"][number] = dataIssues.length
    ? {
        key: "data-read-issues",
        label: "Dashboard data reads",
        status: "warn",
        detail: `${dataIssues.length} read path(s) degraded to an empty state: ${dataIssues.map((issue) => issue.label).join(", ")}. Check server logs before production launch.`,
      }
    : {
        key: "data-read-issues",
        label: "Dashboard data reads",
        status: "pass",
        detail:
          "Dashboard reads completed without degraded empty-state fallbacks in this request.",
      };
  return { ...health, checks: [...health.checks, dataReadCheck] };
}

export async function getPlatformHealth(
  isAdmin: boolean,
): Promise<YnotPlatformHealth | undefined> {
  if (!isAdmin) return undefined;
  const checks: YnotPlatformHealth["checks"] = [
    envCheck("NEXT_PUBLIC_SUPABASE_URL", "Supabase URL"),
    envCheck(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "Supabase publishable key",
    ),
    envCheck("SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key"),
    envCheck("NEXT_PUBLIC_SITE_URL", "Public site URL"),
    envCheck("LINE_SESSION_SECRET", "LINE session signing secret"),
    envCheck("LINE_LOGIN_CHANNEL_ID", "LINE login channel ID", false),
    envCheck("LINE_LOGIN_CHANNEL_SECRET", "LINE login channel secret", false),
    envCheck("SLIP2GO_API_KEY", "Slip2Go API key", false),
    {
      key: "demo-storefront",
      label: "Demo storefront fallback",
      status: allowDemoStorefront() ? "warn" : "pass",
      detail: allowDemoStorefront()
        ? "Demo packs are enabled for local/explicit preview. Disable NEXT_PUBLIC_ENABLE_DEMO_STOREFRONT in production."
        : "Demo packs are disabled; public storefront requires real published campaigns.",
    },
    {
      key: "rate-limit-backend",
      label: "Production rate-limit backend",
      status:
        process.env.RATE_LIMIT_BACKEND === "supabase"
          ? "pass"
          : process.env.NODE_ENV === "production"
            ? "fail"
            : "warn",
      detail:
        process.env.RATE_LIMIT_BACKEND === "supabase"
          ? "Durable Supabase-backed API rate limiting is configured."
          : "Set RATE_LIMIT_BACKEND=supabase after applying the api_rate_limits migration before enabling production wallet/gacha/admin mutations.",
    },
  ];

  if (!isSupabaseConfigured()) {
    checks.push({
      key: "schema:skipped",
      label: "Schema checks",
      status: "fail",
      detail:
        "Supabase is not configured, so table readiness cannot be checked.",
    });
    return { generatedAt: new Date().toISOString(), checks };
  }

  const supabase = createServiceSupabaseClient();
  const tableChecks = await Promise.all([
    tableHealthCheck(supabase, "profiles", "Profile table"),
    tableHealthCheck(supabase, "user_identities", "Identity bridge table"),
    tableHealthCheck(supabase, "user_addresses", "Address table"),
    tableHealthCheck(supabase, "admin_users", "Admin role table"),
    tableHealthCheck(supabase, "draw_rounds", "Campaign table"),
    tableHealthCheck(supabase, "store_categories", "Store category table"),
    tableHealthCheck(
      supabase,
      "draw_round_categories",
      "Campaign/category join table",
    ),
    tableHealthCheck(
      supabase,
      "draw_round_testers",
      "Test-pack whitelist table",
    ),
    tableHealthCheck(supabase, "draw_round_prizes", "Prize pool table"),
    tableHealthCheck(
      supabase,
      "draw_round_prize_units",
      "Prize inventory units table",
    ),
    tableHealthCheck(supabase, "cards", "Card catalog table"),
    tableHealthCheck(supabase, "payment_methods", "Payment method table"),
    tableHealthCheck(supabase, "payment_slips", "Payment slip table"),
    tableHealthCheck(supabase, "top_up_requests", "Top-up request table"),
    tableHealthCheck(supabase, "wallet_accounts", "Wallet table"),
    tableHealthCheck(supabase, "coin_ledger", "Coin ledger table"),
    tableHealthCheck(supabase, "idempotency_keys", "Idempotency table"),
    tableHealthCheck(supabase, "gacha_opens", "Gacha opens table"),
    tableHealthCheck(supabase, "gacha_open_items", "Gacha open items table"),
    tableHealthCheck(supabase, "collection_items", "Collection table"),
    tableHealthCheck(supabase, "exchange_orders", "Exchange table"),
    tableHealthCheck(supabase, "exchange_order_items", "Exchange items table"),
    tableHealthCheck(supabase, "shipping_requests", "Shipping table"),
    tableHealthCheck(
      supabase,
      "shipping_request_items",
      "Shipping items table",
    ),
    tableHealthCheck(supabase, "ranking_snapshots", "Ranking table"),
    tableHealthCheck(supabase, "audit_events", "Audit events table"),
    tableHealthCheck(supabase, "app_realtime_events", "Private realtime table"),
    tableHealthCheck(supabase, "api_rate_limits", "API rate limit table"),
    tableHealthCheck(supabase, "seed_runs", "Seed run registry table"),
    tableHealthCheck(
      supabase,
      "seed_run_items",
      "Seed run item registry table",
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    checks: [...checks, ...tableChecks],
  };
}

export async function getYnotDashboardData(): Promise<YnotDashboardData> {
  const dataIssues: YnotDataIssue[] = [];
  return dataIssueStorage.run(dataIssues, async () => {
    const viewer = await getYnotViewer();
    const profileId = viewer.profileId;
    const [
      campaigns,
      categories,
      paymentMethods,
      wallet,
      topUps,
      gachaOpens,
      collection,
      exchanges,
      shipping,
      addresses,
      rankings,
      adminTopUps,
      platformHealth,
    ] = await Promise.all([
      getCampaigns({ includePrivate: viewer.isAdmin }),
      getStoreCategories({ includeTest: viewer.isAdmin }),
      getPaymentMethods(),
      getWallet(profileId),
      getTopUps(profileId),
      getGachaOpenHistory(profileId),
      getCollection(profileId),
      getExchanges(profileId),
      getShipping(profileId),
      getAddresses(profileId),
      getRankings(),
      viewer.isAdmin ? getTopUps(undefined, true) : Promise.resolve([]),
      getPlatformHealth(viewer.isAdmin),
    ]);
    const ownerApprovalRequests = getOwnerApprovalRequests(viewer, campaigns);

    return {
      configured: isSupabaseConfigured(),
      viewer,
      campaigns,
      categories,
      paymentMethods,
      wallet,
      topUps,
      gachaOpens,
      collection,
      exchanges,
      shipping,
      addresses,
      rankings,
      adminTopUps,
      ownerApprovalRequests,
      platformHealth: withDataIssueHealth(platformHealth, dataIssues),
      dataIssues,
    };
  });
}
