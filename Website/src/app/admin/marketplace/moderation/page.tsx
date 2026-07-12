import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { AdminShell } from "@/features/marketplace-ui/admin/AdminShell";
import { ModerationScreen } from "@/features/marketplace-ui/admin/ModerationScreen";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import {
  listMarketplaceListingReports,
  type MarketplaceListingReportRow,
  type MarketplaceListingReportState,
} from "@/lib/marketplace/listing-reports";
import { buildMarketplaceOpsSnapshot } from "@/lib/marketplace/ops-snapshot";

export const dynamic = "force-dynamic";

const REPORTS_LIST_LIMIT = 100;

const VALID_REPORT_STATES: ReadonlySet<MarketplaceListingReportState> = new Set([
  "open",
  "dismissed",
  "unlisted",
]);

/**
 * listMarketplaceListingReports has no in-lib admin-role assert of its
 * own (same shape as listAdminMarketplaceOrders) -- it is only ever
 * called here, gated on the snapshot's canReadMarketplaceQueues flag,
 * same pattern as orders/page.tsx's loadOrders. "open" matches both the
 * RPC's own default and what OverviewScreen's openListingReportsCount
 * badge (countOpenListingReports) counts, so the default filter chip and
 * the overview badge always mean the same thing.
 */
async function loadReports(
  canRead: boolean,
  state: MarketplaceListingReportState,
): Promise<MarketplaceListingReportRow[]> {
  if (!canRead) return [];
  return listMarketplaceListingReports({ state, limit: REPORTS_LIST_LIMIT });
}

export default async function AdminMarketplaceModerationPage({
  searchParams,
}: {
  searchParams?: Promise<{ state?: string }>;
}) {
  const data = await getYnotDashboardSlice({});
  const admin = await resolveAdminSession();
  const snapshot = await buildMarketplaceOpsSnapshot(admin);
  const { config, canReadMarketplaceQueues } = snapshot;
  const { state: stateParam } = await (searchParams ??
    Promise.resolve({} as { state?: string }));
  const activeState: MarketplaceListingReportState =
    stateParam && VALID_REPORT_STATES.has(stateParam as MarketplaceListingReportState)
      ? (stateParam as MarketplaceListingReportState)
      : "open";

  if (config.ownerOnly && admin?.adminRole !== "owner") {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminShell active="moderation">
          <div className="mp-panel">
            <span className="mp-eyebrow">Launch gate</span>
            <h1 className="mp-h2" style={{ marginTop: 6 }}>
              Owner account required
            </h1>
            <p className="mp-mute" style={{ marginTop: 8 }}>
              Marketplace listing reports are locked to owner accounts during MVP
              testing.
            </p>
          </div>
        </AdminShell>
      </AdminGate>
    );
  }

  const reports = await loadReports(canReadMarketplaceQueues, activeState);

  return (
    <AdminGate viewer={data.viewer}>
      <AdminShell active="moderation">
        <ModerationScreen reports={reports} activeState={activeState} />
      </AdminShell>
    </AdminGate>
  );
}
