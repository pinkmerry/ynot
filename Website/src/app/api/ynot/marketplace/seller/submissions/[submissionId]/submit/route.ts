import {
  getMarketplaceAccountForProfile,
} from "@/lib/marketplace/account-bridge";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";
import {
  SELLER_SUBMISSION_STATE_FIELDS,
  submitSellerSubmission,
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
      key: "ynot:marketplace:seller:submissions:submit",
      limit: 12,
      windowMs: 60_000,
    },
    allowedFields: SELLER_SUBMISSION_STATE_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, profile, requestId } = mutation;

  try {
    const { submissionId } = await ctx.params;
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    const submission = await submitSellerSubmission({
      submissionId,
      body,
      profile,
      account,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "seller_submission.submit",
        submissionId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, submission });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
