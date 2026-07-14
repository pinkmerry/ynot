import { verifyMarketplaceAuthBridgeRequest } from "@/lib/auth/marketplace-auth-bridge";
import { getCoreMarketplaceReceiver } from "@/lib/marketplace/payment-instructions";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store",
} as const;

function notFound() {
  return Response.json(
    { error: "Not found." },
    { status: 404, headers: noStoreHeaders },
  );
}

export async function GET(request: Request) {
  if (!verifyMarketplaceAuthBridgeRequest(request)) return notFound();

  try {
    const receiver = await getCoreMarketplaceReceiver();
    return Response.json({ ok: true, receiver }, { headers: noStoreHeaders });
  } catch {
    console.warn("marketplace_payment_receiver_bridge_lookup_failed");
    return Response.json(
      { ok: false, error: "Payment receiver is temporarily unavailable." },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
