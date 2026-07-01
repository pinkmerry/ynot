import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { listSellerPayoutQueue } from "@/lib/marketplace/payouts";
import {
  marketplaceErrorResponse,
  ownerOnlyMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
  if (!access.admin?.adminRole) {
    return Response.json(
      { error: "Marketplace admin access is required.", code: "marketplace_admin_required" },
      { status: 403 },
    );
  }

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:admin:seller-payouts:list",
    { limit: 60, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const payouts = await listSellerPayoutQueue();
    return Response.json({ ok: true, request_id: requestId, payouts });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
