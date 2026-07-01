import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { listMarketplaceProductBrowsePage } from "@/lib/marketplace/product-browse";
import { marketplaceQueryPlanFromUrl } from "@/lib/marketplace/query-plan";
import {
  marketplaceActionDeniedResponse,
  marketplaceErrorResponse,
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
    "ynot:marketplace:products:browse",
    { limit: 120, windowMs: 60_000 },
    profile?.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const page = await listMarketplaceProductBrowsePage(
      marketplaceQueryPlanFromUrl(request.url),
    );
    return Response.json(
      { ok: true, request_id: requestId, ...page },
      {
        headers: {
          "Cache-Control": "public, max-age=15, stale-while-revalidate=45",
        },
      },
    );
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
