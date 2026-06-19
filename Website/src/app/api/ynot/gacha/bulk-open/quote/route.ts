import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const bulkOpenQuoteRateLimit = {
  scope: "ynot:gacha:bulk-open:quote",
  limit: 12,
  windowMs: 60_000,
};

type BulkOpenCampaignRow = {
  id: string;
  slug: string | null;
  title_th: string | null;
  title_en: string | null;
  is_test: boolean | null;
  pull_all_enabled: boolean | null;
  pull_all_requested: boolean | null;
  pull_all_allowlisted: boolean | null;
  pull_all_readiness_status: string | null;
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isPullAllReady(campaign: BulkOpenCampaignRow) {
  return (
    campaign.pull_all_enabled === true &&
    campaign.pull_all_requested === true &&
    campaign.pull_all_allowlisted === true &&
    campaign.pull_all_readiness_status === "ready"
  );
}

async function resolveBulkOpenCampaign(campaignId: string, profileId: string) {
  const candidate = campaignId.trim();
  if (!candidate) return null;
  const supabase = createServiceSupabaseClient() as unknown as SupabaseCompatClient;
  let query = supabase
    .from("draw_rounds")
    .select(
      "id,slug,title_th,title_en,is_test,pull_all_enabled,pull_all_requested,pull_all_allowlisted,pull_all_readiness_status",
    )
    .eq("status", "live")
    .eq("visibility", "public")
    .eq("approval_status", "approved");
  query = isUuid(candidate) ? query.eq("id", candidate) : query.eq("slug", candidate);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  const campaign = data as BulkOpenCampaignRow | null;
  if (!campaign?.id) return null;
  if (!campaign.is_test) return campaign;

  const { data: allowed, error: allowedError } = await supabase.rpc(
    "profile_can_open_test_draw_round",
    { p_draw_round_id: campaign.id, p_profile_id: profileId },
  );
  if (allowedError) throw allowedError;
  return allowed === true ? campaign : null;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
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
    bulkOpenQuoteRateLimit.scope,
    { limit: bulkOpenQuoteRateLimit.limit, windowMs: bulkOpenQuoteRateLimit.windowMs },
    session.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { campaignId?: unknown } | null;
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  if (!campaignId) {
    return Response.json({ error: "Campaign is required." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient() as unknown as SupabaseCompatClient;
  const campaign = await resolveBulkOpenCampaign(campaignId, session.profileId);
  if (!campaign?.id || !isPullAllReady(campaign)) {
    return Response.json({ error: "Pull All is not available for this pack yet." }, { status: 409 });
  }

  const { data: quote, error: quoteError } = await supabase.rpc(
    "prepare_bulk_open_quote",
    {
      p_profile_id: session.profileId,
      p_draw_round_id: campaign.id,
    },
  );
  if (quoteError) {
    const message =
      quoteError.message === "bulk_open_sold_threshold_not_met"
        ? "Pull All unlocks after this pack reaches 60% sold."
        : quoteError.message === "bulk_open_settlement_not_ready"
          ? "Pull All is not available for this pack yet."
        : "Could not prepare Pull All. Please try again.";
    return Response.json(
      { error: message },
      { status: 409 },
    );
  }

  const tokenRecord = quote && typeof quote === "object" ? (quote as Record<string, unknown>) : {};
  const startToken =
    typeof tokenRecord.tokenId === "string" ? tokenRecord.tokenId : "";
  const targetRewards = Number(tokenRecord.targetRewards ?? tokenRecord.targetSlots ?? 0);
  const totalCostCoins = Number(tokenRecord.totalCostCoins ?? 0);
  const costPerReward = Number(tokenRecord.costPerReward ?? 0);
  const soldPct = Number(tokenRecord.soldPct ?? 0);
  const quoteExpiresAt =
    typeof tokenRecord.expiresAt === "string" ? tokenRecord.expiresAt : "";
  if (
    !startToken ||
    !Number.isFinite(targetRewards) ||
    targetRewards < 1 ||
    !Number.isFinite(totalCostCoins) ||
    totalCostCoins < 1 ||
    !Number.isFinite(costPerReward) ||
    costPerReward < 1 ||
    !Number.isFinite(soldPct) ||
    soldPct < 60 ||
    !quoteExpiresAt
  ) {
    return Response.json(
      { error: "Could not prepare Pull All. Please try again." },
      { status: 409 },
    );
  }

  return Response.json({
    quote: {
      startToken,
      token: startToken,
      pack: {
        slug: campaign.slug,
        title: campaign.title_th ?? campaign.title_en ?? campaign.slug ?? "Pack",
      },
      targetRewards,
      totalCostCoins,
      costPerReward,
      expiresAt: quoteExpiresAt,
      soldPct,
    },
  });
}
