import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  activateSellerConsignmentListing,
  SELLER_LISTING_ACTIVATION_FIELDS,
} from "@/lib/marketplace/seller-consignment";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ submissionId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    action: "listingActivation",
    rateLimit: {
      key: "ynot:marketplace:admin:seller-consignment:activate",
      limit: 12,
      windowMs: 60_000,
    },
    allowedFields: SELLER_LISTING_ACTIVATION_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { submissionId } = await ctx.params;
    const listing = await activateSellerConsignmentListing({
      submissionId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "seller_listing.activate",
        submissionId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, listing });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
