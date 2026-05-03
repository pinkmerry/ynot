import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { CardCatalogItem, ChaseCard, DrawConfig, FeaturedCard, LuckyDrawState, Order, OrderStatus } from "./types";

type Supabase = ReturnType<typeof createServiceSupabaseClient>;
type DrawRow = Database["public"]["Tables"]["draw_rounds"]["Row"];
type CardRow = Database["public"]["Tables"]["cards"]["Row"];
type DrawRoundPrizeRow = Database["public"]["Tables"]["draw_round_prizes"]["Row"];
type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

type OrderParts = {
  order: OrderRow;
  lineName?: string | null;
  slipName?: string | null;
  slipProvider?: Order["slipProvider"] | null;
  slipFilePath?: string | null;
  slots?: number[];
};

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function normalizeOrderCodePrefix(value: string | null | undefined) {
  const prefix = (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
  return prefix || "LD";
}

export function toDrawConfig(row: DrawRow): DrawConfig {
  return {
    titleTh: row.title_th,
    titleEn: row.title_en,
    series: row.series === "pokemon" ? "Pokemon" : "One Piece",
    price: row.price_thb,
    totalSlots: row.total_slots,
    orderCodePrefix: normalizeOrderCodePrefix(row.order_code_prefix),
    facebookUrl: row.facebook_live_url ?? "",
    youtubeUrl: row.youtube_embed_url ?? "",
    promptPay: row.promptpay_id ?? "",
    qrImageUrl: row.promptpay_qr_image_url ?? "",
    bankName: row.bank_name ?? "",
    accountName: row.bank_account_name ?? "",
    accountNumber: row.bank_account_number ?? "",
  };
}

export function fromDrawConfig(draw: DrawConfig): Database["public"]["Tables"]["draw_rounds"]["Update"] {
  return {
    title_th: draw.titleTh,
    title_en: draw.titleEn,
    series: draw.series === "Pokemon" ? "pokemon" : "one_piece",
    price_thb: draw.price,
    total_slots: draw.totalSlots,
    order_code_prefix: normalizeOrderCodePrefix(draw.orderCodePrefix),
    facebook_live_url: draw.facebookUrl || null,
    youtube_embed_url: draw.youtubeUrl || null,
    promptpay_id: draw.promptPay || null,
    promptpay_qr_image_url: draw.qrImageUrl || null,
    bank_name: draw.bankName || null,
    bank_account_name: draw.accountName || null,
    bank_account_number: draw.accountNumber || null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toFeaturedCards(value: unknown): FeaturedCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.grade !== "string") return [];
    return [{
      id: typeof item.id === "string" ? item.id : undefined,
      catalogCardId: typeof item.catalogCardId === "string" ? item.catalogCardId : undefined,
      code: typeof item.code === "string" ? item.code : undefined,
      name: item.name,
      grade: item.grade,
      series: item.series === "Pokemon" ? "Pokemon" : "One Piece",
      tone: item.tone === "red" || item.tone === "gold" || item.tone === "blue" || item.tone === "green" || item.tone === "rose" || item.tone === "violet"
        ? item.tone
        : "gold",
      photoUrl: typeof item.photoUrl === "string" ? item.photoUrl : undefined,
      photoStoragePath: typeof item.photoStoragePath === "string" ? item.photoStoragePath : undefined,
    }];
  });
}

function toChaseCards(value: unknown): ChaseCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.grade !== "string") return [];
    const rank = Number(item.rank);
    return [{
      id: typeof item.id === "string" ? item.id : undefined,
      catalogCardId: typeof item.catalogCardId === "string" ? item.catalogCardId : undefined,
      code: typeof item.code === "string" ? item.code : undefined,
      rank: Number.isInteger(rank) && rank > 0 ? rank : 1,
      name: item.name,
      grade: item.grade,
      series: item.series === "Pokemon" ? "Pokemon" : "One Piece",
      tone: item.tone === "red" || item.tone === "gold" || item.tone === "blue" || item.tone === "green" || item.tone === "rose" || item.tone === "violet"
        ? item.tone
        : "gold",
      value: Number.isFinite(Number(item.value)) ? Number(item.value) : 0,
      photoUrl: typeof item.photoUrl === "string" ? item.photoUrl : undefined,
      photoStoragePath: typeof item.photoStoragePath === "string" ? item.photoStoragePath : undefined,
    }];
  });
}

function toAppSeries(value: CardRow["series"]): FeaturedCard["series"] {
  return value === "pokemon" ? "Pokemon" : "One Piece";
}

function fromAppSeries(value: FeaturedCard["series"]): CardRow["series"] {
  return value === "Pokemon" ? "pokemon" : "one_piece";
}

function toCardTone(value: string | null | undefined): FeaturedCard["tone"] {
  if (value === "red" || value === "gold" || value === "blue" || value === "green" || value === "rose" || value === "violet") {
    return value;
  }
  return "gold";
}

function toCatalogItem(row: CardRow): CardCatalogItem {
  return {
    id: row.id,
    catalogCardId: row.id,
    code: row.card_code ?? undefined,
    name: row.name,
    grade: row.grade,
    series: toAppSeries(row.series),
    tone: toCardTone(row.tone),
    photoUrl: row.image_url ?? undefined,
    photoStoragePath: row.image_storage_path ?? undefined,
  };
}

function prizeToFeaturedCard(prize: DrawRoundPrizeRow, card: CardRow): FeaturedCard {
  return {
    id: prize.id,
    catalogCardId: card.id,
    code: card.card_code ?? undefined,
    name: card.name,
    grade: card.grade,
    series: toAppSeries(card.series),
    tone: toCardTone(prize.tone ?? card.tone),
    photoUrl: card.image_url ?? undefined,
    photoStoragePath: card.image_storage_path ?? undefined,
  };
}

function prizeToChaseCard(prize: DrawRoundPrizeRow, card: CardRow): ChaseCard {
  return {
    ...prizeToFeaturedCard(prize, card),
    rank: prize.rank,
    value: prize.value_thb ?? 0,
  };
}

async function getRoundPrizeCards(supabase: Supabase, drawRoundId: string): Promise<{
  featuredCards: FeaturedCard[];
  chaseCards: ChaseCard[];
}> {
  const { data: prizes, error } = await supabase
    .from("draw_round_prizes")
    .select("*")
    .eq("draw_round_id", drawRoundId)
    .order("tier", { ascending: true })
    .order("rank", { ascending: true });

  if (error) throw error;
  if (!prizes?.length) return { featuredCards: [], chaseCards: [] };

  const cardIds = [...new Set(prizes.map((prize) => prize.card_id))];
  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("*")
    .in("id", cardIds);

  if (cardsError) throw cardsError;

  const cardById = new Map((cards ?? []).map((card) => [card.id, card]));
  const featuredCards: FeaturedCard[] = [];
  const chaseCards: ChaseCard[] = [];

  for (const prize of prizes) {
    const card = cardById.get(prize.card_id);
    if (!card) continue;
    if (prize.tier === "high") {
      chaseCards.push(prizeToChaseCard(prize, card));
    } else {
      featuredCards.push(prizeToFeaturedCard(prize, card));
    }
  }

  return { featuredCards, chaseCards };
}

export async function getCardCatalog(supabase: Supabase): Promise<CardCatalogItem[]> {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) throw error;
  return (data ?? []).map(toCatalogItem);
}

function normalizeCardSearchName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, " ").replace(/\s+/g, " ").slice(0, 160) || "card";
}

function normalizeCardCode(code: string | null | undefined) {
  const clean = (code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return clean || null;
}

async function upsertCatalogCard(supabase: Supabase, card: FeaturedCard) {
  const searchName = normalizeCardSearchName(card.name);
  const cardCode = normalizeCardCode(card.code);
  const hasImage = Boolean(card.photoUrl || card.photoStoragePath);
  const cardPatch: Database["public"]["Tables"]["cards"]["Insert"] = {
    card_code: cardCode,
    name: card.name.trim() || "Untitled Card",
    search_name: searchName,
    search_code: cardCode?.toLowerCase() ?? null,
    series: fromAppSeries(card.series),
    grade: card.grade.trim() || "Ungraded",
    tone: toCardTone(card.tone),
    ...(hasImage
      ? {
          image_url: card.photoUrl || null,
          image_storage_path: card.photoStoragePath || null,
        }
      : {}),
  };

  if (card.catalogCardId) {
    const { data, error } = await supabase
      .from("cards")
      .update(cardPatch)
      .eq("id", card.catalogCardId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  const existingQuery = supabase
    .from("cards")
    .select("*")
    .eq(cardCode ? "search_code" : "search_name", cardCode ? cardCode.toLowerCase() : searchName)
    .maybeSingle();
  const { data: existing, error: existingError } = await existingQuery;

  if (existingError) throw existingError;

  if (existing) {
    const { data, error } = await supabase
      .from("cards")
      .update(cardPatch)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("cards")
    .insert(cardPatch)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

function cardCodeIdentity(card: FeaturedCard) {
  const cardCode = normalizeCardCode(card.code);
  return cardCode ? `code:${cardCode.toLowerCase()}` : "";
}

function cardNameIdentity(card: FeaturedCard) {
  return `name:${normalizeCardSearchName(card.name)}`;
}

function cardPrimaryIdentity(card: FeaturedCard, aliases: Map<string, string>) {
  if (card.catalogCardId) return `id:${card.catalogCardId}`;
  const codeIdentity = cardCodeIdentity(card);
  if (codeIdentity) return aliases.get(codeIdentity) ?? codeIdentity;
  const nameIdentity = cardNameIdentity(card);
  return aliases.get(nameIdentity) ?? nameIdentity;
}

function buildCardIdentityAliases(cards: FeaturedCard[]) {
  const aliases = new Map<string, string>();
  for (const card of cards) {
    if (!card.catalogCardId) continue;
    const idIdentity = `id:${card.catalogCardId}`;
    const codeIdentity = cardCodeIdentity(card);
    if (codeIdentity) aliases.set(codeIdentity, idIdentity);
    aliases.set(cardNameIdentity(card), idIdentity);
  }
  return aliases;
}

function uploadedImageIsNewer(card: FeaturedCard, current: FeaturedCard) {
  return Boolean(card.photoStoragePath && card.photoStoragePath !== current.photoStoragePath);
}

function mergeCatalogCardDraft(current: FeaturedCard, next: FeaturedCard): FeaturedCard {
  const preferredImage = uploadedImageIsNewer(next, current) || (!current.photoUrl && next.photoUrl) ? next : current;
  return {
    ...next,
    code: next.code ?? current.code,
    catalogCardId: next.catalogCardId ?? current.catalogCardId,
    photoUrl: preferredImage.photoUrl,
    photoStoragePath: preferredImage.photoStoragePath,
  };
}

async function upsertRoundCatalogCards(supabase: Supabase, cards: FeaturedCard[]) {
  const aliases = buildCardIdentityAliases(cards);
  const mergedCards = new Map<string, FeaturedCard>();

  for (const card of cards) {
    const identity = cardPrimaryIdentity(card, aliases);
    const current = mergedCards.get(identity);
    mergedCards.set(identity, current ? mergeCatalogCardDraft(current, card) : card);
  }

  const catalogByIdentity = new Map<string, CardRow>();
  for (const [identity, card] of mergedCards) {
    const catalogCard = await upsertCatalogCard(supabase, card);
    catalogByIdentity.set(identity, catalogCard);

    const idIdentity = `id:${catalogCard.id}`;
    catalogByIdentity.set(idIdentity, catalogCard);
    const codeIdentity = cardCodeIdentity({ ...card, code: catalogCard.card_code ?? card.code });
    if (codeIdentity) catalogByIdentity.set(codeIdentity, catalogCard);
    catalogByIdentity.set(cardNameIdentity({ ...card, name: catalogCard.name }), catalogCard);
  }

  return {
    getCatalogCard(card: FeaturedCard) {
      const identity = cardPrimaryIdentity(card, aliases);
      const catalogCard = catalogByIdentity.get(identity);
      if (!catalogCard) throw new Error(`Card catalog sync failed for ${card.name}.`);
      return catalogCard;
    },
  };
}

export async function syncRoundPrizeCards(supabase: Supabase, drawRoundId: string, featuredCards: FeaturedCard[], chaseCards: ChaseCard[]) {
  const catalogSync = await upsertRoundCatalogCards(supabase, [...featuredCards, ...chaseCards]);
  const featuredRows = featuredCards.map((card, index) => {
    const catalogCard = catalogSync.getCatalogCard(card);
    return {
      draw_round_id: drawRoundId,
      card_id: catalogCard.id,
      tier: "normal" as const,
      rank: index + 1,
      value_thb: null,
      tone: toCardTone(card.tone),
    };
  });

  const chaseRows = chaseCards.map((card, index) => {
    const catalogCard = catalogSync.getCatalogCard(card);
    return {
      draw_round_id: drawRoundId,
      card_id: catalogCard.id,
      tier: "high" as const,
      rank: Number.isInteger(card.rank) && card.rank > 0 ? card.rank : index + 1,
      value_thb: Number.isFinite(card.value) ? Math.max(card.value, 0) : 0,
      tone: toCardTone(card.tone),
    };
  });

  const rows = [...featuredRows, ...chaseRows];
  if (rows.length) {
    const { error } = await supabase.from("draw_round_prizes").upsert(rows, {
      onConflict: "draw_round_id,tier,rank",
    });
    if (error) throw error;
  }

  await trimRoundPrizeTier(supabase, drawRoundId, "normal", featuredRows.map((row) => row.rank));
  await trimRoundPrizeTier(supabase, drawRoundId, "high", chaseRows.map((row) => row.rank));
}

async function trimRoundPrizeTier(supabase: Supabase, drawRoundId: string, tier: DrawRoundPrizeRow["tier"], keptRanks: number[]) {
  let query = supabase.from("draw_round_prizes").delete().eq("draw_round_id", drawRoundId).eq("tier", tier);
  if (keptRanks.length) {
    query = query.not("rank", "in", `(${keptRanks.join(",")})`);
  }

  const { error } = await query;
  if (error) throw error;
}

export function toOrderStatus(status: OrderRow["status"]): OrderStatus {
  if (status === "approved_for_pick") return "approved";
  if (status === "picked" || status === "opened") return "picked";
  if (status === "payment_rejected" || status === "cancelled") return "rejected";
  return "pending";
}

export function fromOrderStatus(status: OrderStatus): OrderRow["status"] {
  if (status === "approved") return "approved_for_pick";
  if (status === "picked") return "picked";
  if (status === "rejected") return "payment_rejected";
  return "pending_payment_review";
}

export function toOrder(parts: OrderParts): Order {
  return {
    id: parts.order.public_code,
    lineName: parts.lineName ?? "LINE Customer",
    quantity: parts.order.quantity,
    amount: parts.order.amount_thb,
    status: toOrderStatus(parts.order.status),
    slipName: parts.slipName ?? "manual-transfer",
    slipProvider: parts.slipProvider ?? "manual_line",
    hasSlipFile: Boolean(parts.slipFilePath),
    slots: (parts.slots ?? []).sort((a, b) => a - b),
    createdAt: parts.order.created_at,
  };
}

export async function getActiveDraw(supabase: Supabase) {
  const { data, error } = await supabase
    .from("draw_rounds")
    .select("*")
    .in("status", ["live", "draft"])
    .order("starts_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getLuckyDrawState(options: {
  profileId?: string;
  includeAllOrders?: boolean;
} = {}): Promise<LuckyDrawState | null> {
  const supabase = createServiceSupabaseClient();
  const activeDraw = await getActiveDraw(supabase);
  if (!activeDraw) return null;

  let query = supabase
    .from("orders")
    .select("*")
    .eq("draw_round_id", activeDraw.id)
    .order("created_at", { ascending: false });

  if (!options.includeAllOrders && options.profileId) {
    query = query.eq("profile_id", options.profileId);
  }

  if (!options.includeAllOrders && !options.profileId) {
    query = query.limit(0);
  }

  const { data: orders, error } = await query;
  if (error) throw error;

  const orderRows = orders ?? [];
  const profileIds = [...new Set(orderRows.map((order) => order.profile_id))];
  const orderIds = orderRows.map((order) => order.id);

  const { data: profiles, error: profilesError } = profileIds.length
    ? await supabase.from("profiles").select("id,line_display_name").in("id", profileIds)
    : { data: [], error: null };

  if (profilesError) throw profilesError;

  const { data: slips, error: slipsError } = orderIds.length
    ? await supabase.from("payment_slips").select("order_id,storage_provider,file_path,original_filename").in("order_id", orderIds)
    : { data: [], error: null };

  if (slipsError) throw slipsError;

  const { data: picks, error: picksError } = orderIds.length
    ? await supabase.from("order_picks").select("order_id,draw_slot_id").in("order_id", orderIds)
    : { data: [], error: null };

  if (picksError) throw picksError;

  const drawSlotIds = [...new Set((picks ?? []).map((pick) => pick.draw_slot_id))];
  const { data: slots, error: slotsError } = drawSlotIds.length
    ? await supabase.from("draw_slots").select("id,slot_number").in("id", drawSlotIds)
    : { data: [], error: null };

  if (slotsError) throw slotsError;

  const profileNameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.line_display_name]));
  const slipByOrderId = new Map((slips ?? []).map((slip) => [slip.order_id, slip]));
  const slotNumberById = new Map((slots ?? []).map((slot) => [slot.id, slot.slot_number]));
  const slotNumbersByOrderId = new Map<string, number[]>();

  for (const pick of picks ?? []) {
    const slotNumber = slotNumberById.get(pick.draw_slot_id);
    if (!slotNumber) continue;
    slotNumbersByOrderId.set(pick.order_id, [...(slotNumbersByOrderId.get(pick.order_id) ?? []), slotNumber]);
  }

  const roundPrizeCards = await getRoundPrizeCards(supabase, activeDraw.id);
  const featuredCards = roundPrizeCards.featuredCards.length ? roundPrizeCards.featuredCards : toFeaturedCards(activeDraw.featured_cards);
  const chaseCards = roundPrizeCards.chaseCards.length ? roundPrizeCards.chaseCards : toChaseCards(activeDraw.chase_cards);

  return {
    draw: toDrawConfig(activeDraw),
    featuredCards,
    chaseCards,
    cardCatalog: options.includeAllOrders ? await getCardCatalog(supabase) : undefined,
    orders: orderRows.map((order) =>
      toOrder({
        order,
        lineName: profileNameById.get(order.profile_id),
        slipName: slipByOrderId.get(order.id)?.original_filename,
        slipProvider: slipByOrderId.get(order.id)?.storage_provider,
        slipFilePath: slipByOrderId.get(order.id)?.file_path,
        slots: slotNumbersByOrderId.get(order.id),
      }),
    ),
  };
}

export async function findOrderByPublicCode(supabase: Supabase, publicCode: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("public_code", publicCode)
    .maybeSingle();

  if (error) throw error;
  return data;
}
