import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { AdminShell } from "@/features/marketplace-ui/admin/AdminShell";
import { DisputesScreen } from "@/features/marketplace-ui/admin/DisputesScreen";
import {
  resolveAdminSession,
  type ResolvedAdminSession,
} from "@/lib/auth/resolve-current-profile";
import {
  listAdminRefundRequests,
  type MarketplaceRefundRequestRow,
  type MarketplaceRefundRequestState,
} from "@/lib/marketplace/disputes";
import { buildMarketplaceOpsSnapshot } from "@/lib/marketplace/ops-snapshot";

export const dynamic = "force-dynamic";

const DISPUTES_LIST_LIMIT = 100;

const VALID_REFUND_STATES: ReadonlySet<MarketplaceRefundRequestState> = new Set([
  "requested",
  "approved",
  "rejected",
  "refunded",
]);

/**
 * listAdminRefundRequests asserts its own admin role internally (unlike
 * listAdminMarketplaceOrders/listMarketplaceListingReports, which have no
 * in-lib guard) -- it is still only ever called here, gated on both the
 * snapshot's canReadMarketplaceQueues flag and a real admin, same
 * "gate on canRead && admin" shape ops-snapshot.ts itself uses for its
 * own listMarketplaceQueueSummary call. `null` state means the default
 * "needs action" view (requested/approved) -- the same two states
 * queueSummary.refundOpenCount counts, so the default filter and the
 * overview's "Refunds open" queue count mean the same thing.
 */
async function loadDisputes(
  canRead: boolean,
  admin: ResolvedAdminSession | null,
  state: MarketplaceRefundRequestState | null,
): Promise<MarketplaceRefundRequestRow[]> {
  if (!canRead || !admin) return [];
  return listAdminRefundRequests({ admin, state, limit: DISPUTES_LIST_LIMIT });
}

export default async function AdminMarketplaceDisputesPage({
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
  const activeState: MarketplaceRefundRequestState | null =
    stateParam && VALID_REFUND_STATES.has(stateParam as MarketplaceRefundRequestState)
      ? (stateParam as MarketplaceRefundRequestState)
      : null;

  if (config.ownerOnly && admin?.adminRole !== "owner") {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminShell active="disputes">
          <div className="mp-panel">
            <span className="mp-eyebrow">Launch gate</span>
            <h1 className="mp-h2" style={{ marginTop: 6 }}>
              Owner account required
            </h1>
            <p className="mp-mute" style={{ marginTop: 8 }}>
              Marketplace dispute evidence is locked to owner accounts during MVP
              testing.
            </p>
          </div>
        </AdminShell>
      </AdminGate>
    );
  }

  const disputes = await loadDisputes(canReadMarketplaceQueues, admin, activeState);

  return (
    <AdminGate viewer={data.viewer}>
      <AdminShell active="disputes">
        <DisputesScreen disputes={disputes} activeState={activeState} />
      </AdminShell>
    </AdminGate>
  );
}
