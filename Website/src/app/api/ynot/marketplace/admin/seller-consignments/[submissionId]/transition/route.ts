import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";
import {
  ADMIN_SELLER_INTAKE_TRANSITION_FIELDS,
  transitionSellerConsignmentIntake,
} from "@/lib/marketplace/seller-consignment";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ submissionId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    rateLimit: {
      key: "ynot:marketplace:admin:seller-consignment:transition",
      limit: 20,
      windowMs: 60_000,
    },
    allowedFields: ADMIN_SELLER_INTAKE_TRANSITION_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { submissionId } = await ctx.params;
    const transition = await transitionSellerConsignmentIntake({
      submissionId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "seller_intake.transition",
        submissionId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, transition });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
