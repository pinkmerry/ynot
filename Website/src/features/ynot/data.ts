import "server-only";

import { resolveAdminSession, resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { getCardCatalog, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type {
  YnotCampaign,
  YnotCollectionItem,
  YnotDashboardData,
  YnotAddress,
  YnotExchangeOrder,
  YnotPaymentMethod,
  YnotPrizePoolItem,
  YnotRankingRow,
  YnotShippingRequest,
  YnotTopUp,
  YnotViewer,
  YnotWallet,
} from "./types";
import { featuredCampaigns } from "./storefront-content";

const defaultViewer: YnotViewer = {
  authenticated: false,
  displayName: "Guest",
  isAdmin: false,
  adminRole: null,
};

function safeCostCoins(row: Database["public"]["Tables"]["draw_rounds"]["Row"]) {
  return row.cost_coins ?? Math.max(1, Math.ceil(row.price_thb / 100));
}

function defaultCampaignTags(series: "one_piece" | "pokemon") {
  return series === "pokemon" ? ["PSA10"] : ["Manga"];
}

function safeDisplayTags(row: Database["public"]["Tables"]["draw_rounds"]["Row"]) {
  const tags = row.display_tags;
  if (!Array.isArray(tags)) return defaultCampaignTags(row.series);
  const cleaned = tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4);
  return cleaned.length ? cleaned : defaultCampaignTags(row.series);
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

async function readOrEmpty<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (error) {
    console.warn(`ynot_${label}_unavailable`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function getCampaigns(options: { includePrivate?: boolean } = {}): Promise<YnotCampaign[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("campaigns", async () => {
    let query = supabase
      .from("draw_rounds")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(24);

    if (options.includePrivate) {
      query = query.in("status", ["live", "closed", "draft", "archived"]);
    } else {
      query = query.eq("visibility", "public").in("status", ["live", "closed"]);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      status: row.status,
      titleTh: row.title_th,
      titleEn: row.title_en,
      series: row.series,
      priceThb: row.price_thb,
      costCoins: safeCostCoins(row),
      mode: row.mode,
      visibility: row.visibility,
      totalSlots: row.total_slots,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      displayTags: safeDisplayTags(row),
    }));
  });
}

export async function getCampaign(campaignIdOrSlug: string) {
  const campaigns = await getCampaigns();
  return campaigns.find((campaign) => campaign.id === campaignIdOrSlug || campaign.slug === campaignIdOrSlug)
    ?? featuredCampaigns.find((campaign) => campaign.id === campaignIdOrSlug || campaign.slug === campaignIdOrSlug)
    ?? null;
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
  if (!profileId || !isSupabaseConfigured()) return { balanceCoins: 0, version: 0 };
  const supabase = createServiceSupabaseClient();
  const rows = await readOrEmpty("wallet", async () => {
    const { data, error } = await supabase.from("wallet_accounts").select("*").eq("profile_id", profileId).limit(1);
    if (error) throw error;
    return data ?? [];
  });
  const wallet = rows[0];
  return { balanceCoins: wallet?.balance_coins ?? 0, version: wallet?.version ?? 0 };
}

export async function getTopUps(profileId?: string, includeAll = false): Promise<YnotTopUp[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("topups", async () => {
    let query = supabase.from("top_up_requests").select("*").order("created_at", { ascending: false }).limit(80);
    if (!includeAll && profileId) query = query.eq("profile_id", profileId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(toTopUp);
  });
}

export function toTopUp(row: Database["public"]["Tables"]["top_up_requests"]["Row"]): YnotTopUp {
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

export async function getCollection(profileId?: string): Promise<YnotCollectionItem[]> {
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
    getCardCatalog(supabase).catch(() => []),
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

export async function getExchanges(profileId?: string, includeAll = false): Promise<YnotExchangeOrder[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("exchanges", async () => {
    let query = supabase.from("exchange_orders").select("*").order("created_at", { ascending: false }).limit(80);
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

export async function getShipping(profileId?: string, includeAll = false): Promise<YnotShippingRequest[]> {
  if ((!profileId && !includeAll) || !isSupabaseConfigured()) return [];
  const supabase = createServiceSupabaseClient();
  return readOrEmpty("shipping", async () => {
    let query = supabase.from("shipping_requests").select("*").order("created_at", { ascending: false }).limit(80);
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
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        rank: row.rank,
        value: row.value,
        metric: row.metric,
        displayName: profile?.display_name ?? profile?.line_display_name ?? "YNot Player",
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
      .select("id,email,display_name,line_display_name,profile_status,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (profilesError) throw profilesError;
    const profileIds = (profiles ?? []).map((profile) => profile.id);
    const { data: admins, error: adminsError } = profileIds.length
      ? await supabase.from("admin_users").select("id,profile_id,role,is_active,created_at").in("profile_id", profileIds)
      : { data: [], error: null };
    if (adminsError) throw adminsError;
    const adminByProfile = new Map((admins ?? []).map((admin) => [admin.profile_id, admin]));
    return (profiles ?? []).map((profile) => {
      const admin = adminByProfile.get(profile.id);
      return {
        id: profile.id,
        email: profile.email,
        displayName: profile.display_name ?? profile.line_display_name ?? "YNot Customer",
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
  return getCardCatalog(supabase).catch(() => []);
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
    if (!prizes?.length) return [];

    const campaignIds = [...new Set(prizes.map((prize) => prize.draw_round_id))];
    const cardIds = [...new Set(prizes.map((prize) => prize.card_id))];
    const [{ data: campaigns, error: campaignsError }, { data: cards, error: cardsError }] = await Promise.all([
      supabase.from("draw_rounds").select("id,slug,title_th,title_en").in("id", campaignIds),
      supabase.from("cards").select("id,name").in("id", cardIds),
    ]);
    if (campaignsError) throw campaignsError;
    if (cardsError) throw cardsError;

    const campaignById = new Map((campaigns ?? []).map((campaign) => [campaign.id, campaign]));
    const cardById = new Map((cards ?? []).map((card) => [card.id, card]));
    return prizes.map((prize) => {
      const campaign = campaignById.get(prize.draw_round_id);
      const card = cardById.get(prize.card_id);
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
        tone: prize.tone,
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

export async function getYnotDashboardData(): Promise<YnotDashboardData> {
  const viewer = await getYnotViewer();
  const profileId = viewer.profileId;
  const [campaigns, paymentMethods, wallet, topUps, collection, exchanges, shipping, addresses, rankings, adminTopUps] = await Promise.all([
    getCampaigns({ includePrivate: viewer.isAdmin }),
    getPaymentMethods(),
    getWallet(profileId),
    getTopUps(profileId),
    getCollection(profileId),
    getExchanges(profileId),
    getShipping(profileId),
    getAddresses(profileId),
    getRankings(),
    viewer.isAdmin ? getTopUps(undefined, true) : Promise.resolve([]),
  ]);

  return {
    configured: isSupabaseConfigured(),
    viewer,
    campaigns,
    paymentMethods,
    wallet,
    topUps,
    collection,
    exchanges,
    shipping,
    addresses,
    rankings,
    adminTopUps,
  };
}
