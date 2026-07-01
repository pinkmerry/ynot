import {
  marketplaceBridgeProfileResponse,
  verifyMarketplaceAuthBridgeRequest,
} from "@/lib/auth/marketplace-auth-bridge";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store",
} as const;

function notFound() {
  return Response.json({ error: "Not found." }, { status: 404 });
}

export async function GET(request: Request) {
  if (!verifyMarketplaceAuthBridgeRequest(request)) return notFound();

  const profile = await resolveCurrentProfile();
  if (!profile?.profileId) {
    return Response.json(
      { ok: false, error: "Login is required." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const admin = await resolveAdminSession(profile);
  return Response.json(marketplaceBridgeProfileResponse(profile, admin), {
    headers: noStoreHeaders,
  });
}
