import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { listMarketplaceListingReports } from "@/lib/marketplace/listing-reports";
import {
  marketplaceErrorResponse,
  ownerOnlyMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
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
    "ynot:marketplace:admin:reports",
    { limit: 60, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const url = new URL(request.url);
    const stateParam = url.searchParams.get("state");
    const state = stateParam === "all" ? null : (stateParam ?? "open");

    const reports = await listMarketplaceListingReports({
      state: state as "open" | "dismissed" | "unlisted" | null,
    });
    return Response.json({ ok: true, request_id: requestId, reports });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
