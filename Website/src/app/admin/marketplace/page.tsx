import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { MarketplaceMoneyPolicyControls } from "@/features/ynot/MarketplaceMoneyPolicyControls";
import { AdminShell } from "@/features/marketplace-ui/admin/AdminShell";
import { OverviewScreen } from "@/features/marketplace-ui/admin/OverviewScreen";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import {
  getAdminDailyGmv,
  listAdminMarketplaceOrders,
  type MarketplaceAdminOrderRow,
  type MarketplaceDailyGmvRow,
} from "@/lib/marketplace/admin-orders";
import { countOpenListingReports } from "@/lib/marketplace/listing-reports";
import { buildMarketplaceOpsSnapshot } from "@/lib/marketplace/ops-snapshot";
import { countActiveProductAlerts } from "@/lib/marketplace/product-alerts";

export const dynamic = "force-dynamic";

const DAILY_GMV_WINDOW_DAYS = 30;
const RECENT_ORDERS_LIMIT = 8;

type AdminOverviewReads = {
  dailyGmv: MarketplaceDailyGmvRow[];
  recentOrders: MarketplaceAdminOrderRow[];
  openListingReportsCount: number;
  activeProductAlertsCount: number;
};

/**
 * getAdminDailyGmv / listAdminMarketplaceOrders / countOpenListingReports /
 * countActiveProductAlerts have no in-lib role assert of their own (unlike
 * buildMarketplaceOpsSnapshot's fields, which each self-guard on
 * canReadMarketplaceQueues internally) -- so they're only ever called here,
 * gated on the same canReadMarketplaceQueues flag the snapshot already
 * computed, same pattern as the /admin/queues route's explicit
 * access-check-before-read. Grouped in one Promise.all so the four reads
 * still run in parallel with each other.
 */
async function loadAdminOverviewReads(canRead: boolean): Promise<AdminOverviewReads> {
  if (!canRead) {
    return { dailyGmv: [], recentOrders: [], openListingReportsCount: 0, activeProductAlertsCount: 0 };
  }
  const [dailyGmv, recentOrders, openListingReportsCount, activeProductAlertsCount] = await Promise.all([
    getAdminDailyGmv({ days: DAILY_GMV_WINDOW_DAYS }),
    listAdminMarketplaceOrders({ limit: RECENT_ORDERS_LIMIT }),
    countOpenListingReports(),
    countActiveProductAlerts(),
  ]);
  return { dailyGmv, recentOrders, openListingReportsCount, activeProductAlertsCount };
}

export default async function AdminMarketplacePage() {
  const data = await getYnotDashboardSlice({});
  const admin = await resolveAdminSession();
  const snapshot = await buildMarketplaceOpsSnapshot(admin);
  const { config, moneyPolicy, queueSummary, sellerSubmissionReviewCount, canReadMarketplaceQueues } = snapshot;

  if (config.ownerOnly && admin?.adminRole !== "owner") {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminShell active="overview">
          <div className="mp-panel">
            <span className="mp-eyebrow">Launch gate</span>
            <h1 className="mp-h2" style={{ marginTop: 6 }}>
              Owner account required
            </h1>
            <p className="mp-mute" style={{ marginTop: 8 }}>
              This page stops before Marketplace Supabase reads while the
              owner-only flag is enabled.
            </p>
          </div>
        </AdminShell>
      </AdminGate>
    );
  }

  const { dailyGmv, recentOrders, openListingReportsCount, activeProductAlertsCount } =
    await loadAdminOverviewReads(canReadMarketplaceQueues);

  return (
    <AdminGate viewer={data.viewer}>
      <AdminShell active="overview">
        <OverviewScreen
          dailyGmv={dailyGmv}
          recentOrders={recentOrders}
          openListingReportsCount={openListingReportsCount}
          activeProductAlertsCount={activeProductAlertsCount}
          queueSummary={queueSummary}
          sellerSubmissionReviewCount={sellerSubmissionReviewCount}
          moneyPolicyPanel={<MarketplaceMoneyPolicyControls policy={moneyPolicy} />}
        />
      </AdminShell>
    </AdminGate>
  );
}
