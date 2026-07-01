import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { getMarketplaceCustomerCartSummary } from "@/lib/marketplace/cart-watchlist";
import {
  customerMarketplaceAccess,
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = marketplaceRequestId(request);
  const profile = await resolveCurrentProfile();
  if (!profile?.profileId) {
    return Response.json(
      { ok: false, error: "login_required", request_id: requestId },
      { status: 401 },
    );
  }

  const access = await customerMarketplaceAccess(profile);
  if (!access.allowed) return access.response;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:cart:summary",
    { limit: 60, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    const summary = await getMarketplaceCustomerCartSummary(
      account,
      profile.profileId,
    );
    return Response.json({ ok: true, request_id: requestId, summary });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
