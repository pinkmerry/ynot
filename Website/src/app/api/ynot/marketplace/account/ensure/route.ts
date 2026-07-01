import {
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
      key: "ynot:marketplace:account:ensure",
      limit: 12,
      windowMs: 60_000,
    },
    allowedFields: [],
  });
  if (!mutation.ok) return mutation.response;

  const { access, idempotencyKey, profile, requestId } = mutation;

  try {
    const requestHash = await mutation.requestHash("account.ensure");
    const account = await ensureMarketplaceAccountForProfile(profile, {
      admin: access.admin,
      actorProfileId: access.admin?.profileId ?? profile.profileId,
      requestId,
      idempotencyKey,
      requestHash,
    });

    return Response.json({
      ok: true,
      request_id: requestId,
      marketplace: access.status,
      ...safeMarketplaceAccountResponse(account, access.admin),
    });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
