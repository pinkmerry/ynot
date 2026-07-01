import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { listMarketplaceAuditTimeline } from "@/lib/marketplace/ops-hardening";
import {
  marketplaceErrorResponse,
  ownerOnlyMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ targetType: string; targetId: string }> },
) {
  const requestId = marketplaceRequestId(request);
  const profile = await resolveCurrentProfile();
  if (!profile?.profileId) {
    return Response.json(
      { error: "Login is required.", code: "marketplace_login_required" },
      { status: 401 },
    );
  }

  const access = await ownerOnlyMarketplaceAccess(profile);
  if (!access.allowed) return access.response;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:admin:audit",
    { limit: 60, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const { targetType, targetId } = await ctx.params;
    const timeline = await listMarketplaceAuditTimeline({
      admin: access.admin,
      targetType,
      targetId,
    });
    return Response.json({ ok: true, request_id: requestId, timeline });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
