import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { recordOfficialFulfilment } from "@/lib/marketplace/official-shop";
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
    rateLimit: {
      key: "ynot:marketplace:admin:official-order:fulfilment",
      limit: 20,
      windowMs: 60_000,
    },
    allowedFields: ["fulfilmentState", "trackingCode", "adminNote"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { orderId } = await ctx.params;
    const result = await recordOfficialFulfilment({
      orderId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "official_order.fulfilment",
        orderId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, order: result });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
