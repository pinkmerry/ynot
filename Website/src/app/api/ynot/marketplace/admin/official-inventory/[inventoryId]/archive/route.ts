import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  OFFICIAL_INVENTORY_ARCHIVE_FIELDS,
  archiveOfficialInventory,
} from "@/lib/marketplace/official-shop";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ inventoryId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    action: "listingActivation",
    rateLimit: {
      key: "ynot:marketplace:admin:official-inventory:archive",
      limit: 12,
      windowMs: 60_000,
    },
    allowedFields: OFFICIAL_INVENTORY_ARCHIVE_FIELDS,
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, requestId } = mutation;

  try {
    const { inventoryId } = await ctx.params;
    const result = await archiveOfficialInventory({
      inventoryId,
      body,
      admin: access.admin,
      requestId,
      idempotencyKey,
      requestHash: await mutation.requestHashForTarget(
        "official_inventory.archive",
        inventoryId,
      ),
    });

    return Response.json({ ok: true, request_id: requestId, inventory: result });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
