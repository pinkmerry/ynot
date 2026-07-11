import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { AdminShell } from "@/features/marketplace-ui/admin/AdminShell";
import { FeesSettingsScreen } from "@/features/marketplace-ui/admin/FeesSettingsScreen";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { buildMarketplaceOpsSnapshot } from "@/lib/marketplace/ops-snapshot";

export const dynamic = "force-dynamic";

/**
 * Unlike orders/disputes/payouts, this page has no list to filter (no
 * searchParams) and no separate canReadMarketplaceQueues-gated read --
 * buildMarketplaceOpsSnapshot's `moneyPolicy` field is already gated the
 * correct way for this exact read (marketplaceAdminAllowed ?
 * getActiveMarketplaceMoneyPolicy() : marketplaceMoneyPolicy() --
 * ops-snapshot.ts:126-128), because getActiveMarketplaceMoneyPolicy has its
 * OWN mock-data branch (money.ts:220) unlike listAdminMarketplaceOrders/
 * listSellerPayoutQueue. buildMarketplaceOpsSnapshot is still called here
 * (not skipped) because every admin page needs it for the shared
 * config.ownerOnly gate -- reusing its already-loaded `moneyPolicy` instead
 * of calling getActiveMarketplaceMoneyPolicy() a second time avoids a
 * redundant Supabase round-trip for the exact same value.
 */
export default async function AdminMarketplaceSettingsPage() {
  const data = await getYnotDashboardSlice({});
  const admin = await resolveAdminSession();
  const snapshot = await buildMarketplaceOpsSnapshot(admin);
  const { config, moneyPolicy } = snapshot;

  if (config.ownerOnly && admin?.adminRole !== "owner") {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminShell active="settings">
          <div className="mp-panel">
            <span className="mp-eyebrow">Launch gate</span>
            <h1 className="mp-h2" style={{ marginTop: 6 }}>
              Owner account required
            </h1>
            <p className="mp-mute" style={{ marginTop: 8 }}>
              Marketplace fee and trust-control changes are locked to owner
              accounts during MVP testing.
            </p>
          </div>
        </AdminShell>
      </AdminGate>
    );
  }

  return (
    <AdminGate viewer={data.viewer}>
      <AdminShell active="settings">
        <FeesSettingsScreen policy={moneyPolicy} />
      </AdminShell>
    </AdminGate>
  );
}
