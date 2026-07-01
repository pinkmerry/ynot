import { ensureMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import {
  addMarketplaceCartItem,
  assertMarketplaceCartUuid,
  toMarketplacePublicCartMutation,
} from "@/lib/marketplace/cart-watchlist";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { marketplaceErrorResponse } from "@/lib/marketplace/route-guards";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";

export const dynamic = "force-dynamic";

function parseCartAddBody(input: Record<string, unknown>) {
  const listingIdInput = input.listingId;
  if (typeof listingIdInput !== "string") {
    throw new MarketplaceServiceError(
      "marketplace_listing_id_invalid",
      "Marketplace request is invalid.",
      400,
    );
  }
  const listingId = assertMarketplaceCartUuid(listingIdInput, "listing_id");
  const quantity = input.quantity == null ? 1 : Number(input.quantity);
  if (quantity !== 1) {
    throw new MarketplaceServiceError(
      "marketplace_quantity_invalid",
      "Marketplace request is invalid.",
      400,
    );
  }
  return { listingId, quantity };
}

export async function POST(request: Request) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    accessMode: "customer",
    action: "checkout",
    rateLimit: {
      key: "ynot:marketplace:cart:add",
      limit: 20,
      windowMs: 60_000,
    },
    allowedFields: ["listingId", "quantity"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, idempotencyKey, profile, requestId } = mutation;

  try {
    const input = parseCartAddBody(mutation.body);
    const account = await ensureMarketplaceAccountForProfile(profile, {
      admin: access.admin,
      actorProfileId: profile.profileId,
      requestId,
      idempotencyKey,
      requestHash: await mutation.emptyRequestHash("account.ensure"),
    });
    const requestHash = await mutation.requestHashForTargetBody(
      "cart.item.add",
      input.listingId,
      mutation.canonicalBody,
    );
    const result = await addMarketplaceCartItem({
      account,
      listingId: input.listingId,
      quantity: input.quantity,
      actorProfileId: profile.profileId,
      requestId,
      idempotencyKey,
      requestHash,
    });
    const payload = toMarketplacePublicCartMutation(result);

    return Response.json({
      ok: true,
      request_id: requestId,
      cart: payload,
      summary: payload.summary,
    });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
