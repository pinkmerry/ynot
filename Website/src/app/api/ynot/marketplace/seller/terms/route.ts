import {
  acceptMarketplaceSellerTerms,
  ensureMarketplaceAccountForProfile,
  safeMarketplaceAccountResponse,
} from "@/lib/marketplace/account-bridge";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { marketplaceErrorResponse } from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    rateLimit: {
      key: "ynot:marketplace:seller:terms",
      limit: 10,
      windowMs: 60_000,
    },
    allowedFields: [],
  });
  if (!mutation.ok) return mutation.response;

  const { access, idempotencyKey, profile, requestId } = mutation;

  try {
    const ensureHash = await mutation.requestHash("seller.account.ensure");
    const account = await ensureMarketplaceAccountForProfile(profile, {
      admin: access.admin,
      actorProfileId: access.admin?.profileId ?? profile.profileId,
      requestId,
      idempotencyKey,
      requestHash: ensureHash,
    });
    const termsHash = await mutation.requestHash("seller_terms.accept");
    const accepted = await acceptMarketplaceSellerTerms(profile, account, {
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: termsHash,
    });

    return Response.json({
      ok: true,
      request_id: requestId,
      marketplace: access.status,
      ...safeMarketplaceAccountResponse(accepted, access.admin),
    });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
