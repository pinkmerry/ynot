import {
  safeMarketplaceAccountResponse,
} from "@/lib/marketplace/account-bridge";
import {
  getMarketplaceActorAccount,
  getMarketplaceActorContext,
} from "@/lib/marketplace/actor-context";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Actor context centralizes login and launch/access checks; account loading
    // stays after the route-level limiter.
    const actor = await getMarketplaceActorContext({
      mode: "customer",
    });
    if (!actor.ok) return actor.response;

    const rateLimited = await enforceRateLimit(
      request,
      "ynot:marketplace:account:me",
      { limit: 60, windowMs: 60_000 },
      actor.profile.profileId,
    );
    if (rateLimited) return rateLimited;

    const account = await getMarketplaceActorAccount(actor);

    return Response.json({
      ok: true,
      marketplace: actor.access.status,
      ...safeMarketplaceAccountResponse(account, actor.admin),
    });
  } catch (error) {
    return marketplaceErrorResponse(error);
  }
}
