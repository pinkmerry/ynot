import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import {
  listMarketplaceListingPage,
  marketplaceListingQueryFromUrl,
} from "@/lib/marketplace/listings";
import {
  marketplaceErrorResponse,
  marketplaceActionDeniedResponse,
  publicMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = marketplaceRequestId(request);
  const profile = await resolveCurrentProfile();

  const access = await publicMarketplaceAccess(profile);
  if (!access.allowed) return access.response;
  const actionDenied = marketplaceActionDeniedResponse("browse", requestId);
  if (actionDenied) return actionDenied;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:listings:browse",
    { limit: 90, windowMs: 60_000 },
    profile?.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const page = await listMarketplaceListingPage(
      marketplaceListingQueryFromUrl(request.url),
    );
    return Response.json({ ok: true, request_id: requestId, ...page });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
