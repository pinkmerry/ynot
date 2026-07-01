import {
  getMarketplaceActorAccount,
  getMarketplaceActorContext,
} from "@/lib/marketplace/actor-context";
import { listBuyerOrders } from "@/lib/marketplace/orders";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = marketplaceRequestId(request);
  // Actor context centralizes resolveCurrentProfile and the old
  // ownerOnlyMarketplaceAccess prelaunch read gate in customer mode.
  const actor = await getMarketplaceActorContext({
    mode: "customer",
  });
  if (!actor.ok) return actor.response;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:orders:list",
    { limit: 60, windowMs: 60_000 },
    actor.profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const account = await getMarketplaceActorAccount(actor);
    const orders = account ? await listBuyerOrders(account) : [];
    return Response.json({ ok: true, request_id: requestId, orders });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
