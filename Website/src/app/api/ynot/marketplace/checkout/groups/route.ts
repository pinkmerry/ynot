import { ensureMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { assertMarketplaceCheckoutAddress } from "@/lib/marketplace/checkout-address";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { createMultiListingCheckout } from "@/lib/marketplace/orders";
import { assertMarketplacePaymentReceiverConfigured } from "@/lib/marketplace/payment-instructions";
import { marketplaceErrorResponse } from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    accessMode: "customer",
    action: "checkout",
    rateLimit: {
      key: "ynot:marketplace:checkout:groups",
      limit: 6,
      windowMs: 60_000,
    },
    allowedFields: ["listingIds", "shippingAddressId", "addressConfirmed"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, profile, requestId } = mutation;

  try {
    const paymentInstructions =
      await assertMarketplacePaymentReceiverConfigured();
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
    const listingIds = Array.isArray(body.listingIds)
      ? body.listingIds.map((listingId) => String(listingId))
      : [];
    const order = await createMultiListingCheckout({
      listingIds,
      profile,
      account,
      shippingSnapshot,
      paymentInstructions,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHash("checkout_group.create"),
    });

    return Response.json({ ok: true, request_id: requestId, order });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
