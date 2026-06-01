import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/schema-compat";
import type { Database } from "@/lib/supabase/types";
import type { CardCatalogItem, ChaseCard, DrawConfig, DrawStatus, FeaturedCard, LuckyDrawState, Order, OrderStatus, SlipVerificationStatus } from "./types";

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
  slipVerificationStatus?: SlipVerificationStatus | null;
  slipProviderCode?: string | null;
  slipProviderMessage?: string | null;
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
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
  return prefix || "LD";
}

function normalizePaymentDigits(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D+/g, "");
  return digits && !/^0+$/.test(digits) ? digits : "";
}

function normalizePromptPayId(value: string | null | undefined) {
  const digits = normalizePaymentDigits(value);
  if (digits.length === 11 && digits.startsWith("66")) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 13 || digits.length === 15) return digits;
  return "";
}

export function toDrawConfig(row: DrawRow): DrawConfig {
  return {
    slug: row.slug,
    status: row.status,
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
    promptpay_id: normalizePromptPayId(draw.promptPay) || null,
    promptpay_qr_image_url: draw.qrImageUrl || null,
    bank_name: draw.bankName || null,
    bank_account_name: draw.accountName || null,
    bank_account_number: normalizePaymentDigits(draw.accountNumber) || null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRandomLogicMode(value: unknown) {
  if (!isRecord(value)) return "pure_random";
  const mode = value.mode ?? value.logicMode;
  return mode === "weighted_templates" || mode === "inventory_gated"
    ? mode
    : "pure_random";
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
      value: Number.isFinite(Number(item.value)) ? Number(item.value) : 0,
      photoUrl: typeof item.photoUrl === "string" ? item.photoUrl : undefined,
      photoStoragePath: typeof item.photoStoragePath === "string" ? item.photoStoragePath : undefined,
    }];
  });
}

function toAppSeries(value: CardRow["series"]): FeaturedCard["series"] {
  if (value === "pokemon") return "Pokemon";
  if (value === "one_piece") return "One Piece";
  return value;
}

function fromAppSeries(value: FeaturedCard["series"]): CardRow["series"] {
  if (value === "Pokemon") return "pokemon";
  if (value === "One Piece") return "one_piece";
  return value;
}

function toCatalogItem(row: CardRow): CardCatalogItem {
  return {
    id: row.id,
    catalogCardId: row.id,
    code: row.card_code ?? undefined,
    modelCode: row.card_code ?? undefined,
    cardNumber: row.card_number,
    name: row.name,
    searchName: row.search_name,
    searchCode: row.search_code,
    grade: row.grade,
    series: toAppSeries(row.series),
    prizeCategory: row.prize_category ?? "psa10_card",
    language: row.language,
    releaseYear: row.release_year,
    cardSet: row.card_set,
    variant: row.variant,
    catalogCategory: row.catalog_category,
    condition: row.condition,
    gradingService: row.grading_service,
    certNumber: row.cert_number,
    gemrateId: row.gemrate_id,
    photoUrl: row.image_url ?? undefined,
    photoStoragePath: row.image_storage_path ?? undefined,
    isTest: row.is_test,
    seedRunId: row.seed_run_id,
    assetSource: row.asset_source,
    assetLicense: row.asset_license,
    assetManifestKey: row.asset_manifest_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

function isHiddenPrize(prize: DrawRoundPrizeRow) {
  const metadata = prize.metadata;
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).adminHidden === true
  );
}

async function getDrawRoundSoldPct(supabase: Supabase, drawRoundId: string, totalSlots: number) {
  if (totalSlots <= 0) return 100;
  const { data, error } = await supabase
    .from("draw_slots")
    .select("status")
    .eq("draw_round_id", drawRoundId)
    .in("status", ["picked", "opened"])
    .limit(10000);
  if (error) throw error;
  return Math.min(100, ((data?.length ?? 0) / totalSlots) * 100);
}

async function getRoundPrizeCards(supabase: Supabase, drawRoundId: string, soldPct: number, logicSnapshot: unknown): Promise<{
  featuredCards: FeaturedCard[];
  chaseCards: ChaseCard[];
  hasConfiguredPrizes: boolean;
}> {
  const { data: prizes, error } = await supabase
    .from("draw_round_prizes")
    .select("*")
    .eq("draw_round_id", drawRoundId)
    .order("tier", { ascending: true })
    .order("rank", { ascending: true });

  if (error) throw error;
  if (!prizes?.length) {
    return { featuredCards: [], chaseCards: [], hasConfiguredPrizes: false };
  }

  const logicMode = normalizeRandomLogicMode(logicSnapshot);
  const visiblePrizes = prizes.filter(
    (prize) =>
      !isHiddenPrize(prize) &&
      (logicMode !== "inventory_gated" ||
        Number(prize.unlock_at_sold_pct ?? 0) <= soldPct) &&
      (logicMode === "pure_random" || Number(prize.weight ?? 1) > 0),
  );
  if (!visiblePrizes.length) {
    return { featuredCards: [], chaseCards: [], hasConfiguredPrizes: true };
  }

  const cardIds = [...new Set(visiblePrizes.map((prize) => prize.card_id))];
  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("*")
    .in("id", cardIds);

  if (cardsError) throw cardsError;

  const cardById = new Map((cards ?? []).map((card) => [card.id, card]));
  const featuredCards: FeaturedCard[] = [];
  const chaseCards: ChaseCard[] = [];

  for (const prize of visiblePrizes) {
    const card = cardById.get(prize.card_id);
    if (!card) continue;
    if (prize.tier === "high") {
      chaseCards.push(prizeToChaseCard(prize, card));
    } else {
      featuredCards.push(prizeToFeaturedCard(prize, card));
    }
  }

  return { featuredCards, chaseCards, hasConfiguredPrizes: true };
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
    prize_category: card.prizeCategory ?? "psa10_card",
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
    .order("updated_at", { ascending: false })
    .limit(1);
  const { data: existingRows, error: existingError } = await existingQuery;

  if (existingError) throw existingError;

  const existing = existingRows?.[0];
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
    slipVerificationStatus: parts.slipVerificationStatus ?? "unverified",
    slipProviderCode: parts.slipProviderCode ?? null,
    slipProviderMessage: parts.slipProviderMessage ?? null,
    slots: (parts.slots ?? []).sort((a, b) => a - b),
    createdAt: parts.order.created_at,
  };
}

function drawTimeValue(value: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function sortDrawsByPriority(rows: DrawRow[], priority: DrawStatus[]) {
  const fallbackPriority = priority.length;
  const priorityByStatus = new Map(priority.map((status, index) => [status, index]));

  return [...rows].sort((a, b) => {
    const aPriority = priorityByStatus.get(a.status) ?? fallbackPriority;
    const bPriority = priorityByStatus.get(b.status) ?? fallbackPriority;
    if (aPriority !== bPriority) return aPriority - bPriority;

    const startsDelta = drawTimeValue(b.starts_at) - drawTimeValue(a.starts_at);
    if (startsDelta !== 0) return startsDelta;

    return drawTimeValue(b.created_at) - drawTimeValue(a.created_at);
  });
}

export async function getActiveDraw(
  supabase: Supabase,
  options: {
    statuses?: DrawStatus[];
    priority?: DrawStatus[];
    requirePublicApproved?: boolean;
  } = {},
) {
  const statuses = options.statuses ?? ["draft", "live", "closed"];
  const priority = options.priority ?? statuses;
  const loadDraws = (requireApproval: boolean) => {
    let query = supabase
      .from("draw_rounds")
      .select("*")
      .in("status", statuses);

    if (options.requirePublicApproved) {
      query = query.eq("visibility", "public");
      if (requireApproval) query = query.eq("approval_status", "approved");
    }

    return query.order("created_at", { ascending: false }).limit(20);
  };

  let { data, error } = await loadDraws(Boolean(options.requirePublicApproved));
  if (
    error &&
    options.requirePublicApproved &&
    isMissingColumnError(error, "approval_status")
  ) {
    ({ data, error } = await loadDraws(false));
  }

  if (error) throw error;
  return sortDrawsByPriority(data ?? [], priority)[0] ?? null;
}

export async function getLuckyDrawState(options: {
  profileId?: string;
  includeAllOrders?: boolean;
} = {}): Promise<LuckyDrawState | null> {
  const supabase = createServiceSupabaseClient();
  const activeDraw = await getActiveDraw(supabase, options.includeAllOrders
    ? { statuses: ["draft", "live", "closed"], priority: ["draft", "live", "closed"] }
    : { statuses: ["live", "closed"], priority: ["live", "closed"], requirePublicApproved: true });
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
    ? await supabase.from("profiles").select("id,line_display_name,full_name").in("id", profileIds)
    : { data: [], error: null };

  if (profilesError) throw profilesError;

  const { data: slips, error: slipsError } = orderIds.length
    ? await supabase
        .from("payment_slips")
        .select("order_id,storage_provider,file_path,original_filename,verification_status,provider_code,provider_message")
        .in("order_id", orderIds)
        .order("uploaded_at", { ascending: false })
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

  const profileNameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? profile.line_display_name]));
  const slipByOrderId = new Map<string, NonNullable<typeof slips>[number]>();
  for (const slip of slips ?? []) {
    if (!slip.order_id) continue;
    if (!slipByOrderId.has(slip.order_id)) slipByOrderId.set(slip.order_id, slip);
  }
  const slotNumberById = new Map((slots ?? []).map((slot) => [slot.id, slot.slot_number]));
  const slotNumbersByOrderId = new Map<string, number[]>();

  for (const pick of picks ?? []) {
    const slotNumber = slotNumberById.get(pick.draw_slot_id);
    if (!slotNumber) continue;
    slotNumbersByOrderId.set(pick.order_id, [...(slotNumbersByOrderId.get(pick.order_id) ?? []), slotNumber]);
  }

  const soldPct = await getDrawRoundSoldPct(
    supabase,
    activeDraw.id,
    activeDraw.total_slots,
  );
  const roundPrizeCards = await getRoundPrizeCards(
    supabase,
    activeDraw.id,
    soldPct,
    activeDraw.logic_snapshot,
  );
  const featuredCards = roundPrizeCards.featuredCards.length
    ? roundPrizeCards.featuredCards
    : roundPrizeCards.hasConfiguredPrizes
      ? []
      : toFeaturedCards(activeDraw.featured_cards);
  const chaseCards = roundPrizeCards.chaseCards.length
    ? roundPrizeCards.chaseCards
    : roundPrizeCards.hasConfiguredPrizes
      ? []
      : toChaseCards(activeDraw.chase_cards);

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
        slipVerificationStatus: slipByOrderId.get(order.id)?.verification_status,
        slipProviderCode: slipByOrderId.get(order.id)?.provider_code,
        slipProviderMessage: slipByOrderId.get(order.id)?.provider_message,
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
