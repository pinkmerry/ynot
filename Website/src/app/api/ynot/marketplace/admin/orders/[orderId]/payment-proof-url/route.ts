import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { getMarketplaceOrderProofPath } from "@/lib/marketplace/orders";
import {
  marketplaceErrorResponse,
  ownerOnlyMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  createMarketplaceSupabaseClient,
  MarketplaceServiceError,
} from "@/lib/marketplace/supabase-adapter";

export const dynamic = "force-dynamic";

const PROOF_URL_TTL_SECONDS = 120;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> },
) {
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
    "ynot:marketplace:admin:order:proof-url",
    { limit: 30, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const { orderId } = await ctx.params;
    const proof = await getMarketplaceOrderProofPath(orderId);
    if (!proof) {
      return Response.json(
        { error: "No payment proof on file.", code: "marketplace_proof_missing" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    const supabase = createMarketplaceSupabaseClient();
    const { data, error } = await supabase.storage
      .from(proof.bucket)
      .createSignedUrl(proof.path, PROOF_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      return marketplaceErrorResponse(
        new MarketplaceServiceError(
          "marketplace_proof_url_failed",
          "Could not create proof link.",
          500,
        ),
        requestId,
      );
    }

    return Response.json(
      {
        ok: true,
        request_id: requestId,
        url: data.signedUrl,
        expiresInSeconds: PROOF_URL_TTL_SECONDS,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
