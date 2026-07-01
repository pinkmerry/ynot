import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  RECONCILIATION_RESOLVE_FIELDS,
  resolveMarketplaceReconciliationItem,
} from "@/lib/marketplace/ops-hardening";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ itemId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    rateLimit: {
      key: "ynot:marketplace:admin:reconciliation:resolve",
      limit: 20,
      windowMs: 60_000,
    },
    allowedFields: RECONCILIATION_RESOLVE_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { itemId } = await ctx.params;
    const result = await resolveMarketplaceReconciliationItem({
      itemId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "reconciliation.resolve",
        itemId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, result });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
