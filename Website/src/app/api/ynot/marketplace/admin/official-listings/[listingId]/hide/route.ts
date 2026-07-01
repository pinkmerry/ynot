import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  OFFICIAL_LISTING_HIDE_FIELDS,
  hideOfficialListing,
} from "@/lib/marketplace/official-shop";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ listingId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    action: "listingActivation",
    rateLimit: {
      key: "ynot:marketplace:admin:official-listing:hide",
      limit: 12,
      windowMs: 60_000,
    },
    allowedFields: OFFICIAL_LISTING_HIDE_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { listingId } = await ctx.params;
    const result = await hideOfficialListing({
      listingId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "official_listing.hide",
        listingId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, listing: result });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
