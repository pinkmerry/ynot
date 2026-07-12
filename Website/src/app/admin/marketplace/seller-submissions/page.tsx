import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { AdminShell } from "@/features/marketplace-ui/admin/AdminShell";
import { VerifyQueueScreen } from "@/features/marketplace-ui/admin/VerifyQueueScreen";
import {
  resolveAdminSession,
  type ResolvedAdminSession,
} from "@/lib/auth/resolve-current-profile";
import { buildMarketplaceOpsSnapshot } from "@/lib/marketplace/ops-snapshot";
import {
  listAdminSellerSubmissionQueue,
  type AdminSellerSubmissionQueueRow,
} from "@/lib/marketplace/seller-consignment";

export const dynamic = "force-dynamic";

/**
 * listAdminSellerSubmissionQueue asserts admin itself (throws
 * marketplace_admin_required when admin is null -- see assertAdmin in
 * src/lib/marketplace/seller-consignment.ts) and has its own mock-data
 * branch, so this is gated on marketplaceAdminAllowed AND a non-null admin
 * -- the exact double guard buildMarketplaceOpsSnapshot uses for this same
 * call (src/lib/marketplace/ops-snapshot.ts:123-125). NOT the stricter
 * canReadMarketplaceQueues, which also excludes mock mode and would blank
 * this queue while the overview badge still counts it.
 */
async function loadSubmissions(
  allowed: boolean,
  admin: ResolvedAdminSession | null,
): Promise<AdminSellerSubmissionQueueRow[]> {
  if (!allowed || !admin) return [];
  return listAdminSellerSubmissionQueue(admin);
}

export default async function AdminMarketplaceSellerSubmissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const data = await getYnotDashboardSlice({});
  const admin = await resolveAdminSession();
  const snapshot = await buildMarketplaceOpsSnapshot(admin);
  const { config, marketplaceAdminAllowed } = snapshot;
  const { filter: filterParam } = await (searchParams ??
    Promise.resolve({} as { filter?: string }));
  const filter = filterParam === "all" ? "all" : "needs_action";

  if (config.ownerOnly && admin?.adminRole !== "owner") {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminShell active="verify">
          <div className="mp-panel">
            <span className="mp-eyebrow">Launch gate</span>
            <h1 className="mp-h2" style={{ marginTop: 6 }}>
              Owner account required
            </h1>
            <p className="mp-mute" style={{ marginTop: 8 }}>
              Seller intake evidence is locked to owner accounts during MVP
              testing.
            </p>
          </div>
        </AdminShell>
      </AdminGate>
    );
  }

  const submissions = await loadSubmissions(marketplaceAdminAllowed, admin);

  return (
    <AdminGate viewer={data.viewer}>
      <AdminShell active="verify">
        <VerifyQueueScreen submissions={submissions} filter={filter} />
      </AdminShell>
    </AdminGate>
  );
}
