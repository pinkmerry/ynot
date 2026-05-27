import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { isDevBypassAllowed } from "@/lib/security/dev-bypass";

export const dynamic = "force-dynamic";

type RawOpenItem = {
  cardId?: string;
  name?: string | null;
  imageUrl?: string | null;
  tier?: string | null;
  displayTier?: string | null;
  valueThb?: number | null;
  position?: number;
  prizeUnitId?: string | null;
  [key: string]: unknown;
};

function deriveDisplayTier(tier: string | null | undefined, rank: number) {
  if (tier === "high" && rank <= 3) return "rainbow";
  if (tier === "high") return "gold";
  return "bronze";
}

async function hydrateItems(
  items: RawOpenItem[],
  openId: string,
): Promise<RawOpenItem[]> {
  if (!items.length) return items;
  const needsHydration = items.some(
    (item) => !item.name || !item.imageUrl || !item.displayTier,
  );
  if (!needsHydration) return items;

  const supabase = createServiceSupabaseClient();
  // Open items hold the canonical link to card_id + draw_round_prize_id for
  // this open, so use them to resolve display tier from prize metadata and
  // card name/image from the catalog.
  const { data: openItems, error: openItemsError } = await supabase
    .from("gacha_open_items")
    .select(
      "card_id,draw_round_prize_id,result_position,tier,value_thb",
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

  const [cardsResult, prizesResult] = await Promise.all([
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
  ]);

  const cardById = new Map<string, { name: string; image_url: string | null }>();
  for (const card of cardsResult.data ?? []) {
    cardById.set(card.id, {
      name: card.name,
      image_url: card.image_url ?? null,
    });
  }
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
    return {
      ...item,
      cardId,
      name: item.name ?? card?.name ?? "Mystery card",
      imageUrl: item.imageUrl ?? card?.image_url ?? null,
      tier,
      displayTier,
      valueThb: item.valueThb ?? openItem?.value_thb ?? null,
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
  return {
    status: "completed",
    openId: `preview-${crypto.randomUUID()}`,
    publicCode: `PREVIEW-${Math.floor(Math.random() * 1_000_000)}`,
    costCoins: 0,
    logicMode: "preview_mock",
    items,
    replayed: false,
    remaining: { campaignId },
  };
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const session = await resolveCurrentProfile();
  if (!session?.profileId) return Response.json({ error: "Login is required." }, { status: 401 });
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;
  const limited = await enforceRateLimit(request, "ynot:gacha:open", { limit: 30, windowMs: 60_000 }, session.profileId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as { campaignId?: unknown; quantity?: unknown; idempotencyKey?: unknown } | null;
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId : "";
  const quantity = Number(body?.quantity ?? 1);
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : crypto.randomUUID();
  if (!campaignId) return Response.json({ error: "Campaign is required." }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return Response.json({ error: "Quantity must be between 1 and 100." }, { status: 400 });

  // Preview-mode short circuit: synthesise an open result so the localhost
  // demo can show the reveal animation without a real wallet or profile.
  // Triple-gated: dev bypass allowed (NODE_ENV + YNOTT_ALLOW_DEV_BYPASS)
  // AND the caller is the preview-user marker. See
  // `@/lib/security/dev-bypass`.
  if (
    isDevBypassAllowed() &&
    session.authUserId === PREVIEW_AUTH_USER_ID
  ) {
    return Response.json({
      result: await buildPreviewOpenResult(campaignId, quantity),
    });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("open_gacha_campaign", { p_profile_id: session.profileId, p_draw_round_id: campaignId, p_quantity: quantity, p_idempotency_key: idempotencyKey });
  if (error) return Response.json({ error: error.message }, { status: 409 });

  // Backfill card name / image / displayTier so the reveal overlay can render
  // even when the RPC has not been updated to project these fields yet.
  const raw = (data ?? {}) as { items?: RawOpenItem[]; openId?: string };
  const openId = typeof raw.openId === "string" ? raw.openId : "";
  const items = Array.isArray(raw.items) ? raw.items : [];
  const hydrated = openId ? await hydrateItems(items, openId) : items;
  return Response.json({ result: { ...raw, items: hydrated } });
}
