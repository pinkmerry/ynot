import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

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
