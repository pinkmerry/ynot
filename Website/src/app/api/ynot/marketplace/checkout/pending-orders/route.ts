import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import {
  ensureMarketplaceAccountForProfile,
  getMarketplaceAccountForProfile,
} from "@/lib/marketplace/account-bridge";
import { assertMarketplaceCheckoutAddress } from "@/lib/marketplace/checkout-address";
import { getMarketplaceListing } from "@/lib/marketplace/listings";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  createOfficialPendingPaymentOrder,
  createUserSellerPendingPaymentOrder,
  listBuyerPendingPaymentOrders,
} from "@/lib/marketplace/orders";
import { assertMarketplacePaymentReceiverConfigured } from "@/lib/marketplace/payment-instructions";
import {
  customerMarketplaceAccess,
  marketplaceErrorResponse,
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

  const access = await customerMarketplaceAccess(profile);
  if (!access.allowed) return access.response;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:checkout:pending-orders:list",
    { limit: 60, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    if (!account) {
      return Response.json({
        ok: true,
        request_id: requestId,
        pendingOrders: [],
      });
    }
    const pendingOrders = await listBuyerPendingPaymentOrders(account);
    return Response.json({ ok: true, request_id: requestId, pendingOrders });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    accessMode: "customer",
    action: "checkout",
    rateLimit: {
      key: "ynot:marketplace:checkout:pending-orders:create",
      limit: 8,
      windowMs: 60_000,
    },
    allowedFields: ["listingId", "shippingAddressId", "addressConfirmed"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, profile, requestId } = mutation;

  try {
    assertMarketplacePaymentReceiverConfigured();
    const listingId = String(body.listingId ?? "");
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
    const listing = await getMarketplaceListing(listingId);
    const common = {
      listingId,
      profile,
      account,
      shippingSnapshot,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHash(
        `pending_order.create.${listing.listing_source}`,
      ),
    };
    const order =
      listing.listing_source === "user_seller"
        ? await createUserSellerPendingPaymentOrder(common)
        : await createOfficialPendingPaymentOrder(common);

    return Response.json({ ok: true, request_id: requestId, order });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
