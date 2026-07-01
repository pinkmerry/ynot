import {
  getMarketplaceActorAccount,
  getMarketplaceActorContext,
} from "@/lib/marketplace/actor-context";
import {
  getMarketplaceCustomerCartState,
  toMarketplacePublicCartState,
} from "@/lib/marketplace/cart-watchlist";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = marketplaceRequestId(request);
  const actor = await getMarketplaceActorContext({
    // mode: "customer" resolves through customerMarketplaceAccess in actor context.
    mode: "customer",
    loginResponse: () =>
      Response.json(
        { ok: false, error: "login_required", request_id: requestId },
        { status: 401 },
      ),
  });
  if (!actor.ok) return actor.response;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:cart:list",
    { limit: 30, windowMs: 60_000 },
    actor.profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const account = await getMarketplaceActorAccount(actor);
    const state = await getMarketplaceCustomerCartState(
      account,
      actor.profile.profileId,
    );
    const payload = toMarketplacePublicCartState(state);
    return Response.json({
      ok: true,
      request_id: requestId,
      cart: payload.items,
      summary: payload.summary,
    });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
