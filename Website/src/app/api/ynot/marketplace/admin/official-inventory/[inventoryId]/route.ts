import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import {
  OFFICIAL_INVENTORY_UPDATE_FIELDS,
  getOfficialInventoryDetail,
  updateOfficialInventory,
} from "@/lib/marketplace/official-shop";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  marketplaceErrorResponse,
  ownerOnlyMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ inventoryId: string }> },
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
  if (!access.admin?.adminRole) {
    return Response.json(
      {
        error: "Marketplace admin access is required.",
        code: "marketplace_admin_required",
      },
      { status: 403 },
    );
  }

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:admin:official-inventory:detail",
    { limit: 60, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const { inventoryId } = await ctx.params;
    const detail = await getOfficialInventoryDetail(inventoryId);
    return Response.json({ ok: true, request_id: requestId, detail });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ inventoryId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "PATCH",
    action: "listingActivation",
    rateLimit: {
      key: "ynot:marketplace:admin:official-inventory:update",
      limit: 12,
      windowMs: 60_000,
    },
    allowedFields: OFFICIAL_INVENTORY_UPDATE_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { inventoryId } = await ctx.params;
    const inventory = await updateOfficialInventory({
      inventoryId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "official_inventory.update",
        inventoryId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, inventory });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
