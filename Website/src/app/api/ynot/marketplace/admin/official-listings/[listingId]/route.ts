import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  OFFICIAL_LISTING_UPDATE_FIELDS,
  updateOfficialListing,
} from "@/lib/marketplace/official-shop";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ listingId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "PATCH",
    action: "listingActivation",
    rateLimit: {
      key: "ynot:marketplace:admin:official-listing:update",
      limit: 12,
      windowMs: 60_000,
    },
    allowedFields: OFFICIAL_LISTING_UPDATE_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { listingId } = await ctx.params;
    const listing = await updateOfficialListing({
      listingId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "official_listing.update",
        listingId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, listing });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
