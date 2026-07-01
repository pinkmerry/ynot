import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  REFUND_TRANSITION_FIELDS,
  recordMarketplaceRefundTransition,
} from "@/lib/marketplace/ops-hardening";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ refundRequestId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    rateLimit: {
      key: "ynot:marketplace:admin:refund:transition",
      limit: 12,
      windowMs: 60_000,
    },
    allowedFields: REFUND_TRANSITION_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { refundRequestId } = await ctx.params;
    const result = await recordMarketplaceRefundTransition({
      refundRequestId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "refund.record_result",
        refundRequestId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, refund: result });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
