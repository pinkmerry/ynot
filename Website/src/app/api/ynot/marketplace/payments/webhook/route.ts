import { applyMarketplacePaymentWebhook } from "@/lib/marketplace/ops-hardening";
import { marketplaceErrorResponse } from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = marketplaceRequestId(request);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.toLowerCase();
  if (
    process.env.NODE_ENV === "production" &&
    forwardedProto &&
    forwardedProto !== "https"
  ) {
    return Response.json(
      { error: "HTTPS is required.", code: "marketplace_https_required" },
      { status: 400 },
    );
  }

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:payments:webhook",
    { limit: 120, windowMs: 60_000 },
  );
  if (rateLimited) return rateLimited;

  try {
    const result = await applyMarketplacePaymentWebhook({ request, requestId });
    return Response.json({ ok: true, request_id: requestId, result });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
