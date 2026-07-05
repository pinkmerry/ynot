import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { listAdminMarketplaceOrders } from "@/lib/marketplace/admin-orders";
import {
  marketplaceErrorResponse,
  ownerOnlyMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

function parseOptionalLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

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
    "ynot:marketplace:admin:orders",
    { limit: 60, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const limit = parseOptionalLimit(url.searchParams.get("limit"));

    const orders = await listAdminMarketplaceOrders({ state, limit });
    return Response.json({ ok: true, request_id: requestId, orders });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
