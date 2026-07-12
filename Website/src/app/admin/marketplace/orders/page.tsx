import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { AdminShell } from "@/features/marketplace-ui/admin/AdminShell";
import { OrdersScreen } from "@/features/marketplace-ui/admin/OrdersScreen";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import {
  listAdminMarketplaceOrders,
  type MarketplaceAdminOrderRow,
} from "@/lib/marketplace/admin-orders";
import { buildMarketplaceOpsSnapshot } from "@/lib/marketplace/ops-snapshot";

export const dynamic = "force-dynamic";

const ORDERS_LIST_LIMIT = 100;

const VALID_ORDER_STATES: ReadonlySet<string> = new Set([
  "pending_payment",
  "payment_submitted",
  "paid",
  "failed",
  "refunded",
]);

/**
 * listAdminMarketplaceOrders has no in-lib admin-role assert of its own
 * (see src/lib/marketplace/admin-orders.ts) -- same as the overview page's
 * loadAdminOverviewReads, it is only ever called here, gated on the
 * snapshot's canReadMarketplaceQueues flag.
 */
async function loadOrders(
  canRead: boolean,
  state: string | null,
): Promise<MarketplaceAdminOrderRow[]> {
  if (!canRead) return [];
  return listAdminMarketplaceOrders({ state, limit: ORDERS_LIST_LIMIT });
}

export default async function AdminMarketplaceOrdersPage({
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
  const activeState = stateParam && VALID_ORDER_STATES.has(stateParam) ? stateParam : null;

  if (config.ownerOnly && admin?.adminRole !== "owner") {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminShell active="orders">
          <div className="mp-panel">
            <span className="mp-eyebrow">Launch gate</span>
            <h1 className="mp-h2" style={{ marginTop: 6 }}>
              Owner account required
            </h1>
            <p className="mp-mute" style={{ marginTop: 8 }}>
              Marketplace order evidence is locked to owner accounts during MVP
              testing.
            </p>
          </div>
        </AdminShell>
      </AdminGate>
    );
  }

  const orders = await loadOrders(canReadMarketplaceQueues, activeState);

  return (
    <AdminGate viewer={data.viewer}>
      <AdminShell active="orders">
        <OrdersScreen orders={orders} activeState={activeState} />
      </AdminShell>
    </AdminGate>
  );
}
