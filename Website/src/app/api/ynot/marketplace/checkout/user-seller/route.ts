import { ensureMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { assertMarketplaceCheckoutAddress } from "@/lib/marketplace/checkout-address";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { createUserSellerPendingPaymentOrder } from "@/lib/marketplace/orders";
import { marketplaceErrorResponse } from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    accessMode: "customer",
    action: "checkout",
    rateLimit: {
      key: "ynot:marketplace:checkout:user-seller",
      limit: 8,
      windowMs: 60_000,
    },
    allowedFields: ["listingId", "shippingAddressId", "addressConfirmed"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, profile, requestId } = mutation;

  try {
    const shippingSnapshot = await assertMarketplaceCheckoutAddress({
      profileId: profile.profileId,
      shippingAddressId: body.shippingAddressId,
      addressConfirmed: body.addressConfirmed,
    });
    const account = await ensureMarketplaceAccountForProfile(profile, {
      admin: access.admin,
      actorProfileId: profile.profileId,
      requestId,
      idempotencyKey,
      requestHash: await mutation.emptyRequestHash("account.ensure"),
    });
    const order = await createUserSellerPendingPaymentOrder({
      listingId: String(body.listingId ?? ""),
      profile,
      account,
      shippingSnapshot,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHash("pending_order.create.user_seller"),
    });

    return Response.json({ ok: true, request_id: requestId, order });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
