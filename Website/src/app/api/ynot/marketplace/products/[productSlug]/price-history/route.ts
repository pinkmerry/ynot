import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { listMarketplaceProductPriceHistory } from "@/lib/marketplace/product-market";
import { marketplaceQueryPlanFromUrl } from "@/lib/marketplace/query-plan";
import {
  marketplaceActionDeniedResponse,
  marketplaceErrorResponse,
  publicMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ productSlug: string }> },
) {
  const requestId = marketplaceRequestId(request);
  const profile = await resolveCurrentProfile();
  const access = await publicMarketplaceAccess(profile);
  if (!access.allowed) return access.response;
  const actionDenied = marketplaceActionDeniedResponse("browse", requestId);
  if (actionDenied) return actionDenied;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:products:price-history",
    { limit: 90, windowMs: 60_000 },
    profile?.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const { productSlug } = await ctx.params;
    const priceHistory = await listMarketplaceProductPriceHistory(
      productSlug,
      marketplaceQueryPlanFromUrl(request.url),
    );
    return Response.json(
      { ok: true, request_id: requestId, priceHistory },
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
