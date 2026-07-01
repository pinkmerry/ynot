import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  releaseSellerPayout,
  SELLER_PAYOUT_RELEASE_FIELDS,
} from "@/lib/marketplace/payouts";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ payoutId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    action: "payoutRelease",
    rateLimit: {
      key: "ynot:marketplace:admin:seller-payout:release",
      limit: 8,
      windowMs: 60_000,
    },
    allowedFields: SELLER_PAYOUT_RELEASE_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { payoutId } = await ctx.params;
    const payout = await releaseSellerPayout({
      payoutId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "seller_payout.release",
        payoutId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, payout });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
