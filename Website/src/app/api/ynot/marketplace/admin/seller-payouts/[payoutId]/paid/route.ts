import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  markSellerPayoutPaid,
  SELLER_PAYOUT_PAID_FIELDS,
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
      key: "ynot:marketplace:admin:seller-payout:paid",
      limit: 8,
      windowMs: 60_000,
    },
    allowedFields: SELLER_PAYOUT_PAID_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { payoutId } = await ctx.params;
    const payout = await markSellerPayoutPaid({
      payoutId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "seller_payout.paid",
        payoutId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, payout });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
