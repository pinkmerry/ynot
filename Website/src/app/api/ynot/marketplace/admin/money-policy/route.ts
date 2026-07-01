import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import {
  getActiveMarketplaceMoneyPolicy,
  updateMarketplaceMoneyPolicy,
} from "@/lib/marketplace/money";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  marketplaceErrorResponse,
  ownerOnlyMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const MONEY_POLICY_FIELDS = [
  "sellerFeeBps",
  "buyerServiceFeeBps",
  "shippingFeeSatang",
  "adminNote",
] as const;

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
  if (!access.admin?.adminRole) {
    return Response.json(
      {
        error: "Marketplace admin access is required.",
        code: "marketplace_admin_required",
      },
      { status: 403 },
    );
  }

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:admin:money-policy:read",
    { limit: 60, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const policy = await getActiveMarketplaceMoneyPolicy();
    return Response.json({ ok: true, request_id: requestId, policy });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    rateLimit: {
      key: "ynot:marketplace:admin:money-policy:update",
      limit: 8,
      windowMs: 60_000,
    },
    allowedFields: MONEY_POLICY_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const policy = await updateMarketplaceMoneyPolicy({
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHash("money_policy.update"),
    });

    return Response.json({ ok: true, request_id: requestId, policy });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
