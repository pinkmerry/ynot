import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import {
  getMarketplaceAccountForProfile,
} from "@/lib/marketplace/account-bridge";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  marketplaceErrorResponse,
  ownerOnlyMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import {
  createSellerSubmission,
  listSellerSubmissions,
  SELLER_SUBMISSION_FIELDS,
} from "@/lib/marketplace/seller-consignment";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = marketplaceRequestId(request);
  const profile = await resolveCurrentProfile();
  if (!profile?.profileId) {
    return Response.json(
      { error: "Login is required.", code: "marketplace_login_required" },
      { status: 401 },
    );
  }

  const access = await ownerOnlyMarketplaceAccess(profile);
  if (!access.allowed) return access.response;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:seller:submissions:list",
    { limit: 60, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    const submissions = await listSellerSubmissions(account);
    return Response.json({ ok: true, request_id: requestId, submissions });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    action: "sellerSubmission",
    rateLimit: {
      key: "ynot:marketplace:seller:submissions:create",
      limit: 10,
      windowMs: 60_000,
    },
    allowedFields: SELLER_SUBMISSION_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, profile, requestId } = mutation;

  try {
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    const submission = await createSellerSubmission({
      body,
      profile,
      account,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHash("seller_submission.create"),
    });

    return Response.json({ ok: true, request_id: requestId, submission });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
