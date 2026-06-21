import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { toPublicBulkOpenSessionSummary } from "@/features/ynot/bulk-open";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import {
  previewPullAllQuoteForToken,
  startPreviewPullAllSession,
  type PreviewPullAllQuote,
} from "@/features/ynot/local-preview-rewards";
import { publicRewardImageUrl } from "@/features/ynot/public-reward-projection";
import type {
  YnotGachaOpenResult,
  YnotPublicPrizeDisplayTier,
} from "@/features/ynot/types";

export const dynamic = "force-dynamic";

const bulkOpenStartRateLimit = {
  scope: "ynot:gacha:bulk-open:start",
  limit: 6,
  windowMs: 60_000,
};

type BulkOpenStartTokenRow = {
  id: string;
  profile_id: string;
  draw_round_id: string;
  target_slots: number;
  total_cost_coins: number;
  quote_hash: string;
  pack_open_contract_hash: string;
};

type SupabaseCompatError = { message: string };
type SupabaseCompatResult<T = unknown> = {
  data: T;
  error: SupabaseCompatError | null;
};
type SupabaseCompatQuery<T = unknown> = {
  eq(column: string, value: unknown): SupabaseCompatQuery<T>;
  maybeSingle(): Promise<SupabaseCompatResult<T | null>>;
  select(columns: string): SupabaseCompatQuery<T>;
};
type SupabaseCompatClient = {
  from(table: string): SupabaseCompatQuery<unknown>;
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<SupabaseCompatResult<unknown>>;
};
type BulkOpenQueueBinding = {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<unknown>;
};
type PreviewBulkCampaignRow = {
  id: string;
  slug: string | null;
  title_th: string | null;
  title_en: string | null;
};
type PreviewBulkPrizeRow = {
  id: string;
  card_id: string | null;
  tier: string | null;
  rank: number | null;
  value_thb: number | null;
  metadata: unknown;
};
type PreviewAllocatedImageRow = {
  allocated_draw_round_prize_id: string | null;
  image_url: string | null;
};
type PreviewBulkCardRow = {
  id: string;
  name: string | null;
  image_url: string | null;
};
type PreviewCardRepresentativeImageRow = {
  card_id: string | null;
  image_url: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function startErrorMessage(message: string | undefined) {
  switch (message) {
    case "start_token_expired":
    case "bulk_open_quote_stale":
    case "bulk_open_sold_threshold_not_met":
      return "This Pull All quote expired. Please refresh and try again.";
    case "active_bulk_open_session_exists":
      return "Your Pull All is already running.";
    case "insufficient_balance":
      return "Insufficient coin balance.";
    case "bulk_open_not_available":
    case "bulk_open_settlement_not_ready":
    case "not_enough_available_slots":
      return "Pull All is not available for this pack right now.";
    default:
      return "Could not start Pull All. Please try again.";
  }
}

async function enqueueBulkOpenSession(sessionId: unknown) {
  if (typeof sessionId !== "string" || !isUuid(sessionId)) return;
  try {
    const cloudflare = await getCloudflareContext({ async: true });
    const queue = (cloudflare.env as { BULK_OPEN_QUEUE?: BulkOpenQueueBinding })
      .BULK_OPEN_QUEUE;
    if (!queue) return;
    await queue.send(
      {
        type: "bulk_open_process",
        sessionId,
        attempt: 0,
      },
      { delaySeconds: 0 },
    );
  } catch (error) {
    console.warn("bulk_open_enqueue_failed", {
      reason: error instanceof Error ? error.message.split(":").slice(0, 2).join(":") : "unknown",
    });
  }
}

function summarySourceFromStarted(startedRecord: Record<string, unknown>) {
  return {
    public_code: startedRecord.publicCode,
    status: startedRecord.status,
    target_slots: startedRecord.targetSlots,
    processed_slots: startedRecord.processedSlots,
    open_items_awarded: startedRecord.openItemsAwarded,
    collection_items_created: startedRecord.collectionItemsCreated,
    total_cost_coins: startedRecord.totalCostCoins,
    highlight_rewards_public: Array.isArray(startedRecord.highlightRewardsPublic)
      ? startedRecord.highlightRewardsPublic
      : [],
  };
}

function previewDisplayTier(
  tier: string | null | undefined,
  rank: number,
  metadata: unknown,
): YnotPublicPrizeDisplayTier {
  const explicit =
    metadata &&
    typeof metadata === "object" &&
    "displayTier" in metadata &&
    typeof (metadata as Record<string, unknown>).displayTier === "string"
      ? String((metadata as Record<string, unknown>).displayTier).toLowerCase()
      : "";
  if (
    explicit === "last_prize" ||
    explicit === "rainbow" ||
    explicit === "gold" ||
    explicit === "silver" ||
    explicit === "bronze"
  ) {
    return explicit;
  }
  if (tier === "high" && rank <= 3) return "rainbow";
  if (tier === "high") return "gold";
  if (tier === "normal" && rank <= 6) return "silver";
  return "bronze";
}

function previewCode() {
  return `BO-${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0")}`;
}

async function previewAllocatedImageByPrizeId(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  drawRoundId: string | null | undefined,
  prizeIds: string[],
) {
  if (!drawRoundId || !prizeIds.length) return new Map<string, string>();

  const { data, error } = await supabase
    .from("card_stock_units")
    .select("allocated_draw_round_prize_id,image_url")
    .eq("allocated_draw_round_id", drawRoundId)
    .in("allocated_draw_round_prize_id", prizeIds)
    .not("image_url", "is", null);
  if (error || !data?.length) return new Map<string, string>();

  const out = new Map<string, string>();
  for (const row of data as PreviewAllocatedImageRow[]) {
    const prizeId = row.allocated_draw_round_prize_id;
    const imageUrl = row.image_url?.trim();
    if (prizeId && imageUrl && !out.has(prizeId)) out.set(prizeId, imageUrl);
  }
  return out;
}

async function previewRepresentativeImageByCardId(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  cardIds: string[],
) {
  const uniq = Array.from(new Set(cardIds.filter(Boolean)));
  if (!uniq.length) return new Map<string, string>();
  const { data, error } = await supabase
    .from("card_stock_units")
    .select("card_id,image_url")
    .in("card_id", uniq)
    .in("status", ["available", "allocated", "reserved"])
    .not("image_url", "is", null);
  if (error || !data?.length) return new Map<string, string>();

  const out = new Map<string, string>();
  for (const row of data as PreviewCardRepresentativeImageRow[]) {
    const cardId = row.card_id;
    const imageUrl = row.image_url?.trim();
    if (cardId && imageUrl && !out.has(cardId)) out.set(cardId, imageUrl);
  }
  return out;
}

function previewRewardImageUrl({
  cardId,
  cardImageUrl,
  prizeId,
  prizeImageById,
  representativeImageByCardId,
}: {
  cardId: string | null;
  cardImageUrl: string | null | undefined;
  prizeId: string;
  prizeImageById: Map<string, string>;
  representativeImageByCardId: Map<string, string>;
}) {
  return publicRewardImageUrl(
    prizeImageById.get(prizeId),
    cardImageUrl ?? (cardId ? representativeImageByCardId.get(cardId) : null),
  );
}

async function buildPreviewBulkOpenResult(quote: PreviewPullAllQuote): Promise<{
  campaignTitle: string;
  result: YnotGachaOpenResult;
}> {
  const fallbackTitle = quote.packTitle || "Local preview Pull All";
  const supabase = createServiceSupabaseClient();
  const { data: campaignData } = await supabase
    .from("draw_rounds")
    .select("id,slug,title_th,title_en")
    .eq("slug", quote.campaignSlug)
    .limit(1)
    .maybeSingle();
  const campaign = campaignData as PreviewBulkCampaignRow | null;
  const campaignTitle = campaign?.title_en ?? campaign?.title_th ?? fallbackTitle;

  const { data: prizeData } = campaign?.id
    ? await supabase
        .from("draw_round_prizes")
        .select("id,card_id,tier,rank,value_thb,metadata")
        .eq("draw_round_id", campaign.id)
        .order("rank", { ascending: true })
    : { data: [] };
  const prizes = (prizeData ?? []) as PreviewBulkPrizeRow[];
  const cardIds = Array.from(
    new Set(prizes.map((prize) => prize.card_id).filter(Boolean)),
  ) as string[];
  const { data: cardData } = cardIds.length
    ? await supabase
        .from("cards")
        .select("id,name,image_url")
        .in("id", cardIds)
    : { data: [] };
  const cardById = new Map(
    ((cardData ?? []) as PreviewBulkCardRow[]).map((card) => [card.id, card]),
  );
  const prizeImageById = await previewAllocatedImageByPrizeId(
    supabase,
    campaign?.id,
    prizes.map((prize) => prize.id).filter(Boolean),
  );
  const representativeImageByCardId = await previewRepresentativeImageByCardId(
    supabase,
    cardIds,
  );
  const pool = prizes
    .map((prize) => {
      const rank = Number(prize.rank ?? 99) || 99;
      const card = prize.card_id ? cardById.get(prize.card_id) : undefined;
      return {
        name: card?.name ?? "Mystery reward",
        imageUrl: previewRewardImageUrl({
          cardId: prize.card_id,
          cardImageUrl: card?.image_url,
          prizeId: prize.id,
          prizeImageById,
          representativeImageByCardId,
        }),
        displayTier: previewDisplayTier(prize.tier, rank, prize.metadata),
        valueThb: Number(prize.value_thb ?? 0) || null,
      };
    })
    .filter((item) => item.name || item.imageUrl);

  const fallbackPool = [
    { name: "Preview rainbow reward", imageUrl: null, displayTier: "rainbow" as const, valueThb: 500 },
    { name: "Preview gold reward", imageUrl: null, displayTier: "gold" as const, valueThb: 250 },
    { name: "Preview silver reward", imageUrl: null, displayTier: "silver" as const, valueThb: 100 },
    { name: "Preview bronze reward", imageUrl: null, displayTier: "bronze" as const, valueThb: 25 },
  ];
  const source = pool.length ? pool : fallbackPool;
  const items = Array.from({ length: quote.targetRewards }, (_, index) => {
    const item = source[index % source.length] ?? fallbackPool[0];
    return {
      ...item,
      position: index + 1,
    };
  });
  const publicCode = previewCode();
  return {
    campaignTitle,
    result: {
      status: "completed",
      openId: publicCode,
      publicCode,
      costCoins: quote.totalCostCoins,
      items,
      replayed: false,
    },
  };
}

export async function POST(request: Request) {
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const session = await resolveCurrentProfile();
  if (!session?.profileId) {
    return Response.json({ error: "Login is required." }, { status: 401 });
  }
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;
  const limited = await enforceRateLimit(
    request,
    bulkOpenStartRateLimit.scope,
    { limit: bulkOpenStartRateLimit.limit, windowMs: bulkOpenStartRateLimit.windowMs },
    session.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { startToken?: unknown } | null;
  const startToken = typeof body?.startToken === "string" ? body.startToken.trim() : "";
  if (!isUuid(startToken)) {
    return Response.json({ error: "Valid Pull All token is required." }, { status: 400 });
  }

  if (isDevAuthAllowed() && session.authUserId === "preview-user") {
    const previewQuote = previewPullAllQuoteForToken({
      profileId: session.profileId,
      startToken,
    });
    const previewResult = previewQuote
      ? await buildPreviewBulkOpenResult(previewQuote).catch(() => null)
      : null;
    const started = await startPreviewPullAllSession({
      campaignTitle: previewResult?.campaignTitle,
      profileId: session.profileId,
      result: previewResult?.result,
      startToken,
    });
    if (started) {
      const summary = toPublicBulkOpenSessionSummary(started);
      if (summary) {
        return Response.json({
          session: {
            ...summary,
            replayed: false,
          },
        });
      }
    }
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = createServiceSupabaseClient() as unknown as SupabaseCompatClient;
  const { data: tokenRow, error: tokenError } = await supabase
    .from("gacha_bulk_open_start_tokens")
    .select("id,profile_id,draw_round_id,target_slots,total_cost_coins,quote_hash,pack_open_contract_hash")
    .eq("id", startToken)
    .eq("profile_id", session.profileId)
    .maybeSingle();
  if (tokenError) {
    return Response.json(
      { error: "Could not start Pull All. Please try again." },
      { status: 409 },
    );
  }
  const token = tokenRow as BulkOpenStartTokenRow | null;
  if (!token?.id) {
    return Response.json({ error: "This Pull All quote expired. Please refresh and try again." }, { status: 404 });
  }

  const { data: started, error: startError } = await supabase.rpc(
    "start_bulk_open_session",
    {
      p_start_token_id: startToken,
      p_profile_id: session.profileId,
      p_draw_round_id: token.draw_round_id,
      p_target_slots: token.target_slots,
      p_total_cost_coins: token.total_cost_coins,
      p_quote_hash: token.quote_hash,
      p_pack_open_contract_hash: token.pack_open_contract_hash,
    },
  );
  if (startError) {
    return Response.json(
      { error: startErrorMessage(startError.message) },
      { status: 409 },
    );
  }

  const startedRecord =
    started && typeof started === "object" ? (started as Record<string, unknown>) : {};
  await enqueueBulkOpenSession(startedRecord.sessionId);

  const summary = toPublicBulkOpenSessionSummary(
    summarySourceFromStarted(startedRecord),
  );
  if (!summary) {
    return Response.json(
      { error: "Pull All started, but its status could not be loaded." },
      { status: 202 },
    );
  }

  return Response.json({
    session: {
      ...summary,
      replayed: startedRecord.replayed === true,
    },
  });
}
