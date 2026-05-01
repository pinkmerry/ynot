import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { ChaseCard, DrawConfig, FeaturedCard, LuckyDrawState, Order, OrderStatus } from "./types";

type Supabase = ReturnType<typeof createServiceSupabaseClient>;
type DrawRow = Database["public"]["Tables"]["draw_rounds"]["Row"];
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

export function toDrawConfig(row: DrawRow): DrawConfig {
  return {
    titleTh: row.title_th,
    titleEn: row.title_en,
    series: row.series === "pokemon" ? "Pokemon" : "One Piece",
    price: row.price_thb,
    totalSlots: row.total_slots,
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
      name: item.name,
      grade: item.grade,
      series: item.series === "Pokemon" ? "Pokemon" : "One Piece",
      tone: item.tone === "red" || item.tone === "gold" || item.tone === "blue" || item.tone === "green" || item.tone === "rose" || item.tone === "violet"
        ? item.tone
        : "gold",
      photoUrl: typeof item.photoUrl === "string" ? item.photoUrl : undefined,
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
      rank: rank === 1 || rank === 2 || rank === 3 ? rank : 1,
      name: item.name,
      subtitle: typeof item.subtitle === "string" ? item.subtitle : "",
      grade: item.grade,
      series: item.series === "Pokemon" ? "Pokemon" : "One Piece",
      tone: item.tone === "red" || item.tone === "gold" || item.tone === "blue" || item.tone === "green" || item.tone === "rose" || item.tone === "violet"
        ? item.tone
        : "gold",
      value: Number.isFinite(Number(item.value)) ? Number(item.value) : 0,
      photoUrl: typeof item.photoUrl === "string" ? item.photoUrl : undefined,
    }];
  });
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

  return {
    draw: toDrawConfig(activeDraw),
    featuredCards: toFeaturedCards(activeDraw.featured_cards),
    chaseCards: toChaseCards(activeDraw.chase_cards),
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
