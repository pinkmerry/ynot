import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { marketplaceErrorResponse } from "@/lib/marketplace/route-guards";
import {
  quoteSellerPayoutPreview,
  SELLER_PAYOUT_PREVIEW_FIELDS,
} from "@/lib/marketplace/seller-consignment";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    rateLimit: {
      key: "ynot:marketplace:seller:payout-preview",
      limit: 30,
      windowMs: 60_000,
    },
    allowedFields: SELLER_PAYOUT_PREVIEW_FIELDS,
    requireIdempotency: false,
  });
  if (!mutation.ok) return mutation.response;

  const { body, requestId } = mutation;

  try {
    await mutation.requestHash("seller_payout.preview");
    return Response.json({
      ok: true,
      request_id: requestId,
      preview: await quoteSellerPayoutPreview(body),
    });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
