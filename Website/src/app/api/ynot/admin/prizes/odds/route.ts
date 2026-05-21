import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  isMissingColumnError,
  randomPackSchemaMissingResponse,
} from "@/lib/supabase/schema-compat";
import {
  adminErrorResponse,
  mappedAdminErrorResponse,
} from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

function text(value: unknown, max = 100) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function numeric(value: unknown, min: number, max: number) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

async function bodyJson(request: Request) {
  return request.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return adminErrorResponse(
      "SUPABASE_NOT_CONFIGURED",
      "Supabase is not configured.",
      503,
    );
  }

  const admin = await resolveAdminSession();
  if (!admin) {
    return adminErrorResponse("ADMIN_REQUIRED", "Admin access is required.", 403);
  }
  if (admin.adminRole !== "owner") {
    return adminErrorResponse(
      "OWNER_ROLE_REQUIRED",
      "Only an owner can set review odds.",
      403,
    );
  }

  const limited = await enforceRateLimit(
    request,
    "ynot:admin:prize-odds",
    { limit: 80, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const body = await bodyJson(request);
  if (!body) {
    return adminErrorResponse("INVALID_JSON", "Invalid JSON body.", 400);
  }

  const campaignId = text(body.campaignId);
  const prizeId = text(body.prizeId);
  const weight = numeric(body.weight, 0, 100000);
  const unlockAtSoldPct = numeric(body.unlockAtSoldPct, 0, 100);
  if (!campaignId || !prizeId) {
    return adminErrorResponse(
      "PRIZE_ODDS_INVALID_INPUT",
      "campaignId and prizeId are required.",
      400,
    );
  }
  if (weight === null || unlockAtSoldPct === null) {
    return adminErrorResponse(
      "PRIZE_ODDS_INVALID_VALUES",
      "Weight must be a number from 0 to 100000 and unlock percent must be 0 to 100.",
      400,
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data: campaign, error: campaignError } = await supabase
    .from("draw_rounds")
    .select("id,status,visibility,approval_status")
    .eq("id", campaignId)
    .single();
  if (campaignError) {
    if (isMissingColumnError(campaignError)) return randomPackSchemaMissingResponse();
    return mappedAdminErrorResponse(campaignError, {}, {
      code: "CAMPAIGN_LOAD_FAILED",
      error: "Random pack could not be loaded.",
      status: 409,
    });
  }
  if (campaign.status !== "draft" || campaign.approval_status === "approved") {
    return adminErrorResponse(
      "PRIZE_ODDS_LOCKED",
      "Owner odds can only be saved while the random pack is a draft waiting on review.",
      409,
    );
  }

  const { data: existingPrize, error: existingPrizeError } = await supabase
    .from("draw_round_prizes")
    .select("id,draw_round_id,weight,unlock_at_sold_pct")
    .eq("id", prizeId)
    .eq("draw_round_id", campaignId)
    .single();
  if (existingPrizeError) {
    if (isMissingColumnError(existingPrizeError)) {
      return randomPackSchemaMissingResponse();
    }
    return mappedAdminErrorResponse(existingPrizeError, {}, {
      code: "PRIZE_LOAD_FAILED",
      error: "Prize row could not be loaded.",
      status: 409,
    });
  }

  const { data: prize, error: updateError } = await supabase
    .from("draw_round_prizes")
    .update({
      weight,
      unlock_at_sold_pct: Math.round(unlockAtSoldPct),
    })
    .eq("id", prizeId)
    .eq("draw_round_id", campaignId)
    .select("id,weight,unlock_at_sold_pct")
    .single();
  if (updateError) {
    if (isMissingColumnError(updateError)) return randomPackSchemaMissingResponse();
    return mappedAdminErrorResponse(updateError, {}, {
      code: "PRIZE_ODDS_SAVE_FAILED",
      error: "Owner prize odds could not be saved.",
      status: 409,
    });
  }

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "campaign_owner_prize_odds_saved",
    draw_round_id: campaignId,
    metadata: {
      prizeId,
      previousWeight: existingPrize.weight,
      previousUnlockAtSoldPct: existingPrize.unlock_at_sold_pct,
      weight: prize.weight,
      unlockAtSoldPct: prize.unlock_at_sold_pct,
      approvalStatus: campaign.approval_status,
    },
  });
  revalidateTag("campaigns", "max");

  return Response.json({
    ok: true,
    campaignId,
    prizeId,
    prize,
    approvalStatus: campaign.approval_status,
    status: campaign.status,
    visibility: campaign.visibility,
    message: "Owner prize odds saved. The pack stays in owner review.",
  });
}
