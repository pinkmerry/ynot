import {
  ensureMarketplaceAccountForProfile,
  getMarketplaceAccountForProfile,
} from "@/lib/marketplace/account-bridge";
import {
  assertMarketplaceCartUuid,
  removeMarketplaceWatchlistItem,
  toMarketplacePublicWatchlistMutation,
  watchMarketplaceWatchlistItem,
} from "@/lib/marketplace/cart-watchlist";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { marketplaceErrorResponse } from "@/lib/marketplace/route-guards";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ listingId: string }>;
};

function parseWatchlistTarget(value: string) {
  return assertMarketplaceCartUuid(value, "listing_id");
}

export async function POST(request: Request, { params }: RouteParams) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    accessMode: "customer",
    action: "checkout",
    rateLimit: {
      key: "ynot:marketplace:watchlist:watch",
      limit: 30,
      windowMs: 60_000,
    },
    allowedFields: [],
  });
  if (!mutation.ok) return mutation.response;

  const { access, idempotencyKey, profile, requestId } = mutation;

  try {
    const routeParams = await params;
    const safeListingId = parseWatchlistTarget(routeParams.listingId);
    const account = await ensureMarketplaceAccountForProfile(profile, {
      admin: access.admin,
      actorProfileId: profile.profileId,
      requestId,
      idempotencyKey,
      requestHash: await mutation.emptyRequestHash("account.ensure"),
    });
    const requestHash = await mutation.requestHashForTarget(
      "watchlist.item.watch",
      safeListingId,
    );
    const result = await watchMarketplaceWatchlistItem({
      account,
      listingId: safeListingId,
      actorProfileId: profile.profileId,
      requestId,
      idempotencyKey,
      requestHash,
    });
    const payload = toMarketplacePublicWatchlistMutation(result);

    return Response.json({
      ok: true,
      request_id: requestId,
      watchlist: payload,
      summary: payload.summary,
    });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "DELETE",
    accessMode: "customer",
    action: "checkout",
    rateLimit: {
      key: "ynot:marketplace:watchlist:remove",
      limit: 30,
      windowMs: 60_000,
    },
    allowedFields: [],
  });
  if (!mutation.ok) return mutation.response;

  const { access, idempotencyKey, profile, requestId } = mutation;

  try {
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    if (!account) {
      throw new MarketplaceServiceError(
        "marketplace_account_required",
        "Marketplace account is required.",
        400,
      );
    }
    const routeParams = await params;
    const safeListingId = parseWatchlistTarget(routeParams.listingId);
    const requestHash = await mutation.requestHashForTarget(
      "watchlist.item.unwatch",
      safeListingId,
    );
    const result = await removeMarketplaceWatchlistItem({
      account,
      listingId: safeListingId,
      actorProfileId: profile.profileId,
      requestId,
      idempotencyKey,
      requestHash,
    });
    const payload = toMarketplacePublicWatchlistMutation(result);

    return Response.json({
      ok: true,
      request_id: requestId,
      watchlist: payload,
      summary: payload.summary,
    });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
