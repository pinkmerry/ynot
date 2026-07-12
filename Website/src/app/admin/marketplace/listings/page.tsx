import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { AdminShell } from "@/features/marketplace-ui/admin/AdminShell";
import {
  OfficialStockScreen,
  type OfficialInventoryRow,
} from "@/features/marketplace-ui/admin/OfficialStockScreen";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { listOfficialInventory } from "@/lib/marketplace/official-shop";
import { buildMarketplaceOpsSnapshot } from "@/lib/marketplace/ops-snapshot";

export const dynamic = "force-dynamic";

/**
 * This is the missing root page for the "listings" nav id -- AdminShell's
 * nav has pointed real traffic at /admin/marketplace/listings since the
 * shell redesign shipped, but until now the segment only had a detail
 * subpage (listings/[listingId]/page.tsx, a pre-AdminShell admin surface
 * that this task does not touch). Do not confuse this file with that one:
 * this is the bare list root, that is a per-listing evidence view built on
 * a completely different lib (seller-trust.ts's
 * getAdminMarketplaceListingDetail) and a different admin chrome
 * (AdminFrame/AdminCard from @/features/ynot/admin, not AdminShell).
 *
 * listOfficialInventory has no in-lib admin-role assert of its own (see
 * src/lib/marketplace/official-shop.ts) and no mock-data branch of its
 * own, so -- same as listSellerPayoutQueue -- it is only ever called here,
 * gated on the snapshot's canReadMarketplaceQueues flag.
 */
async function loadInventory(canRead: boolean): Promise<OfficialInventoryRow[]> {
  if (!canRead) return [];
  return (await listOfficialInventory()) as unknown as OfficialInventoryRow[];
}

export default async function AdminMarketplaceListingsPage() {
  const data = await getYnotDashboardSlice({});
  const admin = await resolveAdminSession();
  const snapshot = await buildMarketplaceOpsSnapshot(admin);
  const { config, canReadMarketplaceQueues } = snapshot;

  if (config.ownerOnly && admin?.adminRole !== "owner") {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminShell active="listings">
          <div className="mp-panel">
            <span className="mp-eyebrow">Launch gate</span>
            <h1 className="mp-h2" style={{ marginTop: 6 }}>
              Owner account required
            </h1>
            <p className="mp-mute" style={{ marginTop: 8 }}>
              Official stock evidence is locked to owner accounts during MVP
              testing.
            </p>
          </div>
        </AdminShell>
      </AdminGate>
    );
  }

  const inventory = await loadInventory(canReadMarketplaceQueues);

  return (
    <AdminGate viewer={data.viewer}>
      <AdminShell active="listings">
        <OfficialStockScreen inventory={inventory} />
      </AdminShell>
    </AdminGate>
  );
}
