import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { publishOfficialListing } from "@/lib/marketplace/official-shop";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ inventoryId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    action: "listingActivation",
    rateLimit: {
      key: "ynot:marketplace:admin:official-listing:publish",
      limit: 12,
      windowMs: 60_000,
    },
    allowedFields: ["expectedVersion"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { inventoryId } = await ctx.params;
    const requestHash = await mutation.requestHashForTarget(
      "official_listing.publish",
      inventoryId,
    );
    const listing = await publishOfficialListing({
      inventoryId,
      expectedVersion: body.expectedVersion,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash,
    });

    return Response.json({ ok: true, request_id: requestId, listing });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
