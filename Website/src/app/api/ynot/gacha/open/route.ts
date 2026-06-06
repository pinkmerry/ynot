import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import {
  publicSubSkuImageUrl,
  stockImageUrlByPrizeUnitId,
  type PublicPrizeUnitImageRow,
  type PublicStockUnitImageRow,
} from "@/features/ynot/public-subsku-images";
import { publicBundleQuantity } from "@/features/ynot/bundle-quantity";

export const dynamic = "force-dynamic";

const gachaOpenRateLimit = {
  // Customers can chain "open again" quickly after reveal animations. Keep
  // the limit high enough for real play, while still blocking scripted bursts.
  limit: 120,
  windowMs: 60_000,
};

type RawOpenItem = {
  cardId?: string;
  name?: string | null;
  imageUrl?: string | null;
  tier?: string | null;
  displayTier?: string | null;
  valueThb?: number | null;
  position?: number;
  prizeUnitId?: string | null;
  isLastPrize?: boolean;
  imageResolvedFromStockUnit?: boolean;
  bundleQuantity?: number;
  [key: string]: unknown;
};

type RawOpenResult = {
  status?: unknown;
  openId?: unknown;
  publicCode?: unknown;
  costCoins?: unknown;
  items?: unknown;
  replayed?: unknown;
  [key: string]: unknown;
};

type PublicDisplayTier = "rainbow" | "gold" | "silver" | "bronze" | "last_prize";

type PublicOpenItem = {
  name: string;
  imageUrl: string | null;
  displayTier: PublicDisplayTier;
  valueThb: number | null;
  position: number;
  isLastPrize?: boolean;
  bundleQuantity?: number;
};

type PublicOpenResult = {
  status: string;
  openId: string;
  publicCode: string;
  costCoins?: number;
  items: PublicOpenItem[];
  replayed?: boolean;
};

function deriveDisplayTier(tier: string | null | undefined, rank: number) {
  if (tier === "high" && rank <= 3) return "rainbow";
  if (tier === "high") return "gold";
  return "bronze";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value ? value : fallback;
}

function readNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readPositiveInteger(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizeDisplayTier(
  value: unknown,
  tier: string | null | undefined,
): PublicDisplayTier {
  if (
    value === "rainbow" ||
    value === "gold" ||
    value === "silver" ||
    value === "bronze" ||
    value === "last_prize"
  ) {
    return value;
  }
  return deriveDisplayTier(tier, 99);
}

function normalizeIdempotencyKey(value: unknown) {
  if (value === undefined || value === null) return crypto.randomUUID();
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(trimmed)) return null;
  return trimmed;
}

async function resolveOpenCampaignId(campaignId: string, profileId: string) {
  const slug = campaignId.trim();
  if (!slug || isUuid(slug)) return null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("draw_rounds")
    .select("id,is_test")
    .eq("slug", slug)
    .eq("status", "live")
    .eq("visibility", "public")
    .eq("approval_status", "approved")
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return null;
  if (!data.is_test) return data.id;

  const { data: allowed, error: allowedError } = await supabase.rpc(
    "profile_can_open_test_draw_round",
    { p_draw_round_id: data.id, p_profile_id: profileId },
  );
  if (allowedError) throw allowedError;
  return allowed === true ? data.id : null;
}

function toPublicOpenItem(item: RawOpenItem, index: number): PublicOpenItem {
  // Derive the customer-facing rarity from the raw tier internally, but never
  // ship the raw "high"/"normal" prize tier to customers.
  const tier = readString(item.tier, "normal");
  const publicItem: PublicOpenItem = {
    name: readString(item.name, "Mystery card"),
    imageUrl: typeof item.imageUrl === "string" && item.imageUrl ? item.imageUrl : null,
    displayTier: normalizeDisplayTier(item.displayTier, tier),
    valueThb: readNumber(item.valueThb),
    position: readPositiveInteger(item.position, index + 1),
    bundleQuantity: publicBundleQuantity(item.bundleQuantity),
  };
  if (item.isLastPrize === true) publicItem.isLastPrize = true;
  return publicItem;
}

function toPublicOpenResult(raw: RawOpenResult, items: RawOpenItem[]): PublicOpenResult {
  const publicCode = readString(raw.publicCode);
  const result: PublicOpenResult = {
    status: readString(raw.status, "completed"),
    openId: publicCode,
    publicCode,
    items: items.map(toPublicOpenItem),
  };
  const costCoins = readNumber(raw.costCoins);
  if (costCoins !== null) result.costCoins = costCoins;
  if (raw.replayed === true) result.replayed = true;
  return result;
}

function openErrorMessage(message: string | undefined) {
  switch (message) {
    case "insufficient_balance":
      return "Insufficient coin balance.";
    case "invalid_open_quantity":
    case "invalid_open_quantity_option":
      return "Quantity must be one of the available pull options.";
    case "campaign_not_live":
    case "test_campaign_not_allowed":
    case "not_enough_available_slots":
    case "not_enough_prize_inventory":
    case "not_enough_unlocked_prize_inventory":
      return "This pack is not openable right now.";
    case "profile_required":
      return "Login is required.";
    default:
      return "Could not open this pack. Please try again.";
  }
}

function hasPublicRevealFields(item: RawOpenItem) {
  const hasExactRevealImage =
    item.isLastPrize === true ||
    (item.imageResolvedFromStockUnit === true &&
      typeof item.imageUrl === "string" &&
      item.imageUrl.trim().length > 0);
  return (
    typeof item.name === "string" &&
    item.name.trim().length > 0 &&
    typeof item.displayTier === "string" &&
    item.displayTier.trim().length > 0 &&
    hasExactRevealImage &&
    typeof item.position === "number" &&
    Number.isFinite(item.position) &&
    "valueThb" in item
  );
}

function needsOpenItemHydration(items: RawOpenItem[]) {
  return !items.every(hasPublicRevealFields);
}

async function hydrateItems(
  items: RawOpenItem[],
  openId: string,
  profileId: string,
): Promise<RawOpenItem[]> {
  if (!items.length) return items;
  // Hydrate legacy/unproven RPC payloads through the awarded prize unit so the
  // reveal can prefer the exact sub-SKU image instead of the catalog image.

  const supabase = createServiceSupabaseClient();
  const { data: open, error: openError } = await supabase
    .from("gacha_opens")
    .select("id")
    .eq("id", openId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (openError || !open?.id) return items;

  // Open items hold the canonical link to card_id + draw_round_prize_id for
  // this open, so use them to resolve display tier from prize metadata and
  // card name/image from the catalog.
  const { data: openItems, error: openItemsError } = await supabase
    .from("gacha_open_items")
    .select(
      "card_id,draw_round_prize_id,draw_round_prize_unit_id,result_position,tier,value_thb,bundle_quantity",
    )
    .eq("gacha_open_id", openId);
  if (openItemsError || !openItems?.length) return items;

  const cardIds = Array.from(
    new Set(openItems.map((row) => row.card_id).filter(Boolean)),
  );
  const prizeIds = Array.from(
    new Set(
      openItems
        .map((row) => row.draw_round_prize_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const prizeUnitIds = Array.from(
    new Set(
      openItems
        .map((row) => row.draw_round_prize_unit_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [cardsResult, prizesResult, prizeUnitsResult] = await Promise.all([
    cardIds.length
      ? supabase
          .from("cards")
          .select("id,name,image_url")
          .in("id", cardIds)
      : Promise.resolve({ data: [], error: null }),
    prizeIds.length
      ? supabase
          .from("draw_round_prizes")
          .select("id,tier,rank,metadata")
          .in("id", prizeIds)
      : Promise.resolve({ data: [], error: null }),
    prizeUnitIds.length
      ? supabase
          .from("draw_round_prize_units")
          .select("id,card_stock_unit_id,status")
          .in("id", prizeUnitIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const cardById = new Map<string, { name: string; image_url: string | null }>();
  for (const card of cardsResult.data ?? []) {
    cardById.set(card.id, {
      name: card.name,
      image_url: card.image_url ?? null,
    });
  }
  const stockUnitIds = Array.from(
    new Set(
      (prizeUnitsResult.data ?? [])
        .map((row) => row.card_stock_unit_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const stockUnitsResult = stockUnitIds.length
    ? await supabase
        .from("card_stock_units")
        .select("id,image_url")
        .in("id", stockUnitIds)
    : { data: [] as PublicStockUnitImageRow[], error: null };
  const imageByPrizeUnitId = stockImageUrlByPrizeUnitId(
    (prizeUnitsResult.data ?? []) as PublicPrizeUnitImageRow[],
    (stockUnitsResult.data ?? []) as PublicStockUnitImageRow[],
  );
  const prizeById = new Map<
    string,
    { tier: string | null; rank: number | null; displayTier: string | null }
  >();
  for (const prize of prizesResult.data ?? []) {
    const metadata =
      prize.metadata && typeof prize.metadata === "object"
        ? (prize.metadata as Record<string, unknown>)
        : null;
    const explicit =
      metadata && typeof metadata.displayTier === "string"
        ? (metadata.displayTier as string)
        : null;
    prizeById.set(prize.id, {
      tier: prize.tier ?? null,
      rank: prize.rank ?? null,
      displayTier: explicit,
    });
  }

  const itemsByPosition = new Map(
    openItems.map((row) => [row.result_position, row]),
  );

  return items.map((item) => {
    // Last-prize awards have no draw_round_prize_unit_id, so the prize-unit /
    // stock-unit image hydration below would null their image. Preserve the
    // RPC-provided imageUrl, displayTier='last_prize', and isLastPrize flag.
    if (item.isLastPrize === true) {
      return {
        ...item,
        displayTier: "last_prize",
        isLastPrize: true,
        imageUrl:
          typeof item.imageUrl === "string" && item.imageUrl
            ? item.imageUrl
            : null,
      };
    }
    const openItem =
      typeof item.position === "number"
        ? itemsByPosition.get(item.position)
        : undefined;
    const cardId = item.cardId ?? openItem?.card_id;
    const card = cardId ? cardById.get(cardId) : undefined;
    const prize = openItem?.draw_round_prize_id
      ? prizeById.get(openItem.draw_round_prize_id)
      : undefined;
    const tier = item.tier ?? openItem?.tier ?? prize?.tier ?? "normal";
    const displayTier =
      item.displayTier ??
      prize?.displayTier ??
      deriveDisplayTier(tier, prize?.rank ?? 99);
    const prizeUnitId =
      openItem?.draw_round_prize_unit_id ??
      (typeof item.prizeUnitId === "string" ? item.prizeUnitId : null);
    const stockImageUrl = prizeUnitId ? imageByPrizeUnitId.get(prizeUnitId) : null;
    return {
      ...item,
      cardId,
      name: item.name ?? card?.name ?? "Mystery card",
      imageUrl: publicSubSkuImageUrl(stockImageUrl, item.imageUrl ?? card?.image_url ?? null),
      imageResolvedFromStockUnit: Boolean(stockImageUrl),
      tier,
      displayTier,
      valueThb: item.valueThb ?? openItem?.value_thb ?? null,
      bundleQuantity:
        item.bundleQuantity ??
        (typeof openItem?.bundle_quantity === "number"
          ? openItem.bundle_quantity
          : undefined),
    };
  });
}

// Dev-only mock pull. The preview session created by /api/dev/preview-auth
// has no real profile, wallet, or collection rows in Supabase, so the real
// gacha RPC would always fail with "profile not found" or "insufficient
// balance" — breaking the localhost demo flow. This helper synthesises a
// plausible open result so the reveal animation + summary can render. Never
// reached in production because the gate above checks NODE_ENV and the
// preview-user marker.
const PREVIEW_AUTH_USER_ID = "preview-user";
type MockTier = "bronze" | "silver" | "gold" | "rainbow";
type MockCardSpec = {
  cardId?: string;
  name: string;
  tier: MockTier;
  valueThb: number;
  imageUrl?: string | null;
  rank?: number;
};
const MOCK_POOL: MockCardSpec[] = [
  { name: "Charizard ex SAR", tier: "rainbow", valueThb: 5800 },
  { name: "Pikachu ex Full Art", tier: "gold", valueThb: 1800 },
  { name: "Mew ex SIR", tier: "gold", valueThb: 1900 },
  { name: "Iono Full Art", tier: "silver", valueThb: 700 },
  { name: "Greninja Reverse", tier: "silver", valueThb: 620 },
  { name: "Lucario Mirror", tier: "silver", valueThb: 580 },
  { name: "Squirtle Promo", tier: "bronze", valueThb: 90 },
  { name: "Magikarp Promo", tier: "bronze", valueThb: 60 },
  { name: "Bulbasaur Reverse", tier: "bronze", valueThb: 80 },
  { name: "Luffy P-009 Manga", tier: "rainbow", valueThb: 4400 },
  { name: "Sanji Parallel", tier: "gold", valueThb: 1600 },
  { name: "Zoro Parallel", tier: "silver", valueThb: 720 },
];

function previewDisplayTier(
  tier: string | null | undefined,
  rank: number,
  metadata: unknown,
): MockTier {
  const explicit =
    metadata &&
    typeof metadata === "object" &&
    "displayTier" in metadata &&
    typeof (metadata as Record<string, unknown>).displayTier === "string"
      ? String((metadata as Record<string, unknown>).displayTier).toLowerCase()
      : null;
  if (
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

async function readPreviewPool(campaignId: string): Promise<MockCardSpec[]> {
  const supabase = createServiceSupabaseClient();
  const { data: prizes, error } = await supabase
    .from("draw_round_prizes")
    .select("id,card_id,tier,rank,value_thb,metadata")
    .eq("draw_round_id", campaignId)
    .order("tier", { ascending: true })
    .order("rank", { ascending: true });
  if (error || !prizes?.length) return MOCK_POOL;

  const cardIds = Array.from(
    new Set(prizes.map((prize) => prize.card_id).filter(Boolean)),
  );
  const { data: cards } = cardIds.length
    ? await supabase
        .from("cards")
        .select("id,name,image_url")
        .in("id", cardIds)
    : { data: [] };
  const cardById = new Map(
    (cards ?? []).map((card) => [
      card.id,
      { name: card.name, imageUrl: card.image_url ?? null },
    ]),
  );

  const pool = prizes.map((prize) => {
    const card = cardById.get(prize.card_id);
    const rank = Number(prize.rank ?? 99) || 99;
    return {
      cardId: prize.card_id,
      name: card?.name ?? "Mystery reward",
      tier: previewDisplayTier(prize.tier, rank, prize.metadata),
      valueThb: Number(prize.value_thb ?? 0) || 0,
      imageUrl: card?.imageUrl ?? null,
      rank,
    };
  });
  return pool.length ? pool : MOCK_POOL;
}

function pickMockCard(pool: MockCardSpec[]): MockCardSpec {
  const r = Math.random();
  let tier: MockTier;
  if (r < 0.03) tier = "rainbow";
  else if (r < 0.15) tier = "gold";
  else if (r < 0.5) tier = "silver";
  else tier = "bronze";
  const tierPool = pool.filter((c) => c.tier === tier);
  const source = tierPool.length ? tierPool : pool;
  return source[Math.floor(Math.random() * source.length)] ?? MOCK_POOL[0];
}

async function buildPreviewOpenResult(campaignId: string, quantity: number) {
  const previewPool = await readPreviewPool(campaignId);
  const items = Array.from({ length: quantity }, (_, index) => {
    const card = pickMockCard(previewPool);
    const tierRank: Record<MockTier, number> = {
      rainbow: 1,
      gold: 2,
      silver: 6,
      bronze: 20,
    };
    return {
      cardId: card.cardId ?? `preview-${crypto.randomUUID()}`,
      name: card.name,
      imageUrl: card.imageUrl ?? null,
      tier: card.tier === "rainbow" || card.tier === "gold" ? "high" : "normal",
      displayTier: card.tier,
      valueThb: card.valueThb,
      position: index + 1,
      rank: card.rank ?? tierRank[card.tier],
      prizeUnitId: null,
    };
  });
  const result = {
    status: "completed",
    openId: `preview-${crypto.randomUUID()}`,
    publicCode: `PREVIEW-${Math.floor(Math.random() * 1_000_000)}`,
    costCoins: 0,
    logicMode: "preview_mock",
    items,
    replayed: false,
    remaining: { campaignId },
  };
  return toPublicOpenResult(result, items);
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const session = await resolveCurrentProfile();
  if (!session?.profileId) return Response.json({ error: "Login is required." }, { status: 401 });
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;
  const limited = await enforceRateLimit(request, "ynot:gacha:open", gachaOpenRateLimit, session.profileId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as { campaignId?: unknown; quantity?: unknown; idempotencyKey?: unknown } | null;
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const quantity = Number(body?.quantity ?? 1);
  const idempotencyKey = normalizeIdempotencyKey(body?.idempotencyKey);
  if (!campaignId) return Response.json({ error: "Campaign is required." }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return Response.json({ error: "Quantity must be between 1 and 100." }, { status: 400 });
  if (!idempotencyKey) return Response.json({ error: "Invalid idempotency key." }, { status: 400 });

  const resolvedCampaignId = await resolveOpenCampaignId(campaignId, session.profileId);
  if (!resolvedCampaignId) return Response.json({ error: "Campaign is required." }, { status: 400 });

  // Preview-mode short circuit: synthesise an open result so the localhost
  // demo can show the reveal animation without a real wallet or profile.
  if (
    isDevAuthAllowed() &&
    session.authUserId === PREVIEW_AUTH_USER_ID
  ) {
    return Response.json({
      result: await buildPreviewOpenResult(resolvedCampaignId, quantity),
    });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("open_gacha_campaign", { p_profile_id: session.profileId, p_draw_round_id: resolvedCampaignId, p_quantity: quantity, p_idempotency_key: idempotencyKey });
  if (error) return Response.json({ error: openErrorMessage(error.message) }, { status: 409 });

  // Backfill card name / image / displayTier so the reveal overlay can render
  // even when the RPC has not been updated to project these fields yet.
  const raw = (data ?? {}) as RawOpenResult;
  const openId = typeof raw.openId === "string" ? raw.openId : "";
  const items = Array.isArray(raw.items) ? raw.items : [];
  const shouldHydrate = Boolean(openId && needsOpenItemHydration(items));
  const resultItems = shouldHydrate
    ? await hydrateItems(items, openId, session.profileId)
    : items;
  return Response.json({ result: toPublicOpenResult(raw, resultItems) });
}
