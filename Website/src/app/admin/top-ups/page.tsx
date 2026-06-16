import {
  AdminTopUpConsole,
  type TopUpFilter,
} from "@/features/ynot/admin/AdminTopUpConsole";
import { AdminGate } from "@/features/ynot/components";
import { getTopUps, getYnotDashboardSlice } from "@/features/ynot/data";
import { AdminFrame, AdminIcon } from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

const topUpFilterKeys: TopUpFilter[] = [
  "all",
  "pending",
  "valid",
  "mismatch",
  "duplicate",
  "provider_error",
];

function normalizeTopUpFilter(value: string | undefined): TopUpFilter {
  return topUpFilterKeys.some((filter) => filter === value)
    ? (value as TopUpFilter)
    : "all";
}

export default async function AdminTopUpsPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string; profileId?: string }>;
}) {
  const params = await (searchParams ??
    Promise.resolve({} as { filter?: string; profileId?: string }));
  const activeFilter = normalizeTopUpFilter(params.filter);
  const profileId =
    typeof params.profileId === "string" && params.profileId.trim()
      ? params.profileId.trim()
      : undefined;
  const [data, adminTopUps] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    profileId
      ? getTopUps(profileId, true, {
          includeSensitiveSlipDetails: true,
          limit: 500,
        })
      : getTopUps(undefined, true, {
          includeSensitiveSlipDetails: true,
          limit: 500,
        }),
  ]);
  const pendingCount = adminTopUps.filter(
    (topUp) =>
      topUp.status === "pending_review" || topUp.status === "pending_slip",
  ).length;

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/top-ups"
        trail={["Admin", "Operations", "Top-ups"]}
        eyebrow="Admin top-ups"
        title={profileId ? "Manual payment confirmation for user" : "Manual payment confirmation"}
        desc="Review bank/QR slip uploads, approve or reject manually, and credit wallet coins exactly once through the database RPC."
        badges={{ "/admin/top-ups": pendingCount || undefined }}
        actions={
          <span className="btn">
            <AdminIcon name="filter" />
            Filters
          </span>
        }
      >
        <AdminTopUpConsole
          activeFilter={activeFilter}
          initialTopUps={adminTopUps}
          key={profileId ?? "all"}
          profileId={profileId}
        />
      </AdminFrame>
    </AdminGate>
  );
}
