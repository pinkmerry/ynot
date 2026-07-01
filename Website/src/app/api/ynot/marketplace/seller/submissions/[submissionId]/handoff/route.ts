import {
  getMarketplaceAccountForProfile,
} from "@/lib/marketplace/account-bridge";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";
import {
  confirmSellerSubmissionHandoff,
  SELLER_HANDOFF_CONFIRMATION_FIELDS,
} from "@/lib/marketplace/seller-consignment";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ submissionId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    action: "sellerSubmission",
    rateLimit: {
      key: "ynot:marketplace:seller:submissions:handoff",
      limit: 12,
      windowMs: 60_000,
    },
    allowedFields: SELLER_HANDOFF_CONFIRMATION_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, profile, requestId } = mutation;

  try {
    const { submissionId } = await ctx.params;
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    const handoff = await confirmSellerSubmissionHandoff({
      submissionId,
      body,
      profile,
      account,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "seller_submission.handoff",
        submissionId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, handoff });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
