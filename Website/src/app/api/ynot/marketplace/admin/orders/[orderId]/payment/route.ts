import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { getMarketplaceOrderSource } from "@/lib/marketplace/orders";
import {
  recordOfficialPaymentResult,
  recordUserSellerPaymentResult,
} from "@/lib/marketplace/official-shop";
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
      key: "ynot:marketplace:admin:order:payment",
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
    const source = await getMarketplaceOrderSource(orderId);

    if (source === "official_shop") {
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
    }

    if (source === "user_seller") {
      const result = await recordUserSellerPaymentResult({
        orderId,
        body,
        admin: access.admin,
        requestId,
        idempotencyKey,
        requestHash: await mutation.requestHashForTarget(
          "user_seller_order.payment_result",
          orderId,
        ),
      });

      return Response.json({ ok: true, request_id: requestId, payment: result });
    }

    return Response.json(
      {
        error: "Marketplace order was not found.",
        code: "marketplace_order_not_found",
        request_id: requestId,
      },
      { status: 404 },
    );
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
