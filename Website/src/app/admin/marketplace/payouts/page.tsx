import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { AdminShell } from "@/features/marketplace-ui/admin/AdminShell";
import { PayoutsScreen } from "@/features/marketplace-ui/admin/PayoutsScreen";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import {
  listSellerPayoutQueue,
  type SellerPayoutQueueRow,
} from "@/lib/marketplace/payouts";
import { buildMarketplaceOpsSnapshot } from "@/lib/marketplace/ops-snapshot";

export const dynamic = "force-dynamic";

/**
 * marketplace_seller_payouts.payout_state's real CHECK constraint
 * (Database/marketplace-supabase/migrations/20260628120000_marketplace_
 * user_seller_purchase.sql:37) is the 5-value enum 'held' | 'eligible' |
 * 'released' | 'paid' | 'cancelled'. listSellerPayoutQueue()
 * (src/lib/marketplace/payouts.ts) only ever returns the first three -- its
 * query is a hardcoded `.in("payout_state", ["held", "eligible",
 * "released"])` with no filter parameter of its own -- so 'paid' and
 * 'cancelled' rows drop out of this read entirely (a payout stops needing
 * admin attention once it's paid or the order behind it was cancelled).
 * VALID_PAYOUT_STATES is scoped to the three states this function can
 * actually return; there is deliberately no chip for 'paid'/'cancelled'
 * since one would always render an empty table.
 */
const VALID_PAYOUT_STATES: ReadonlySet<string> = new Set(["held", "eligible", "released"]);

// Matches listMarketplaceQueueSummary's payoutBlockedCount definition
// exactly (ops-hardening.ts: .in("payout_state", ["held", "eligible"])), so
// this screen's default "needs action" view means the same thing as the
// overview's "Payouts blocked" queue count.
const NEEDS_ACTION_PAYOUT_STATES: ReadonlySet<string> = new Set(["held", "eligible"]);

/**
 * listSellerPayoutQueue has no in-lib admin-role assert of its own (see
 * src/lib/marketplace/payouts.ts) and no mock-data branch of its own
 * (unlike getActiveMarketplaceMoneyPolicy) -- same as
 * listAdminMarketplaceOrders, it is only ever called here, gated on the
 * snapshot's canReadMarketplaceQueues flag.
 *
 * Unlike listAdminMarketplaceOrders/listAdminRefundRequests, this lib
 * function takes no state argument to push a filter down into, so the state
 * filter is applied in-memory on the one bounded (limit 100) result set
 * instead of as a second query.
 */
async function loadPayouts(
  canRead: boolean,
  state: string | null,
): Promise<SellerPayoutQueueRow[]> {
  if (!canRead) return [];
  const payouts = await listSellerPayoutQueue();
  return state
    ? payouts.filter((payout) => payout.payout_state === state)
    : payouts.filter((payout) => NEEDS_ACTION_PAYOUT_STATES.has(payout.payout_state));
}

export default async function AdminMarketplacePayoutsPage({
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
  const activeState = stateParam && VALID_PAYOUT_STATES.has(stateParam) ? stateParam : null;

  if (config.ownerOnly && admin?.adminRole !== "owner") {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminShell active="payouts">
          <div className="mp-panel">
            <span className="mp-eyebrow">Launch gate</span>
            <h1 className="mp-h2" style={{ marginTop: 6 }}>
              Owner account required
            </h1>
            <p className="mp-mute" style={{ marginTop: 8 }}>
              Marketplace payout evidence is locked to owner accounts during MVP
              testing.
            </p>
          </div>
        </AdminShell>
      </AdminGate>
    );
  }

  const payouts = await loadPayouts(canReadMarketplaceQueues, activeState);

  return (
    <AdminGate viewer={data.viewer}>
      <AdminShell active="payouts">
        <PayoutsScreen payouts={payouts} activeState={activeState} />
      </AdminShell>
    </AdminGate>
  );
}
