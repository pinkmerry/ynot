import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { releaseMarketplacePendingPaymentOrder } from "@/lib/marketplace/orders";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ pendingOrderId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    accessMode: "customer",
    rateLimit: {
      key: "ynot:marketplace:checkout:release",
      limit: 10,
      windowMs: 60_000,
    },
    allowedFields: ["releaseReason"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, profile, requestId } = mutation;

  try {
    const { pendingOrderId } = await ctx.params;
    const releaseReason =
      body.releaseReason === "expired" ? "expired" : "buyer_cancelled";
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    const result = await releaseMarketplacePendingPaymentOrder({
      pendingOrderId,
      profile,
      account,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "pending_order.release.marketplace",
        pendingOrderId,
      ),
      releaseReason,
    });

    return Response.json({ ok: true, request_id: requestId, order: result });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
