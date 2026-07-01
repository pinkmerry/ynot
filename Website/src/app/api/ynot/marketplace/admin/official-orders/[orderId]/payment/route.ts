import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { recordOfficialPaymentResult } from "@/lib/marketplace/official-shop";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    action: "paymentProof",
    rateLimit: {
      key: "ynot:marketplace:admin:official-order:payment",
      limit: 20,
      windowMs: 60_000,
    },
    allowedFields: [
      "paymentState",
      "providerReference",
      "providerAmountSatang",
      "providerCurrency",
      "adminNote",
    ],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { orderId } = await ctx.params;
    const result = await recordOfficialPaymentResult({
      orderId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "official_order.payment_result",
        orderId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, payment: result });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
