import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { getBuyerOrder } from "@/lib/marketplace/orders";
import {
  marketplaceErrorResponse,
  ownerOnlyMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> },
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
    "ynot:marketplace:orders:detail",
    { limit: 90, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const { orderId } = await ctx.params;
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    const order = await getBuyerOrder({ orderId, account });
    return Response.json({ ok: true, request_id: requestId, order });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
