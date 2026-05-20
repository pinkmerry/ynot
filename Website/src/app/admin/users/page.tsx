import { AdminMergeActions, AdminUserRoleForm } from "@/features/ynot/client";
import { AdminGate } from "@/features/ynot/components";
import {
  getAdminMergeRequests,
  getAdminUsers,
  getYnotDashboardSlice,
} from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
  AdminKPI,
  AdminPill,
  AdminStatusPill,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [data, users, mergeRequests] = await Promise.all([
    getYnotDashboardSlice(),
    getAdminUsers(),
    getAdminMergeRequests(),
  ]);

  const owners = users.filter((u) => u.adminRole === "owner").length;
  const staff = users.filter((u) => u.adminRole && u.adminRole !== "owner").length;
  const customers = users.length - owners - staff;
  const flagged = users.filter(
    (u) => u.status !== "active",
  ).length;
  const pendingMerges = mergeRequests.filter((r) => r.status === "pending").length;

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/users"
        trail={["Admin", "People", "Users"]}
        eyebrow="Admin users"
        title="User directory"
        desc="View profiles, wallet balance, opens history, and adjust role / status. Owner can grant or revoke admin / staff."
        actions={
          <span className="btn btn-primary">
            <AdminIcon name="plus" />
            Invite staff
          </span>
        }
      >
        <div className="kpi-grid">
          <AdminKPI label="Total users" value={users.length} color="var(--a-gold)" />
          <AdminKPI label="Owners + staff" value={owners + staff} color="var(--a-mint)" />
          <AdminKPI label="Customers" value={customers} color="var(--a-sky)" />
          <AdminKPI
            label="Flagged"
            value={flagged}
            delta={flagged ? "needs review" : "all clear"}
            deltaDir={flagged ? "down" : "up"}
            color="var(--a-rose)"
          />
        </div>

        <AdminCard>
          <AdminCardHead
            label="Directory"
            title={`All users · ${users.length}`}
            actions={
              <div className="tabs">
                <span className="t active">All</span>
                <span className="t">Owner · {owners}</span>
                <span className="t">Staff · {staff}</span>
                <span className="t">Customers · {customers}</span>
                <span className="t">Flagged · {flagged}</span>
              </div>
            }
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Admin role</th>
                  <th>Created</th>
                  <th>Role action</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 24 }}>
                      No users loaded. Apply migrations and seed/admin data first.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const initials =
                      (user.displayName ?? "U")
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join("")
                        .toUpperCase() || "U";
                    return (
                      <tr key={user.id}>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                            }}
                          >
                            <span
                              className="thumb sq"
                              style={{
                                background:
                                  "linear-gradient(135deg,#4b3da1,#b452c7)",
                                color: "#fff",
                                fontWeight: 600,
                                fontSize: 11,
                              }}
                            >
                              {initials}
                            </span>
                            <div>
                              <div className="row-title">
                                {user.displayName ?? "Anonymous"}
                              </div>
                              <div
                                className="row-sub mono"
                                style={{ fontSize: 11 }}
                              >
                                {user.id.slice(0, 8)}…
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="muted">{user.email ?? "—"}</td>
                        <td>
                          <AdminStatusPill status={user.status} />
                        </td>
                        <td>
                          {user.adminRole ? (
                            <AdminPill
                              kind={
                                user.adminRole === "owner" ? "live" : "closed"
                              }
                            >
                              {user.adminRole}
                              {user.adminActive ? "" : " · inactive"}
                            </AdminPill>
                          ) : (
                            <AdminPill kind="default">customer</AdminPill>
                          )}
                        </td>
                        <td className="mono muted" style={{ fontSize: 11 }}>
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          <AdminUserRoleForm
                            profileId={user.id}
                            currentRole={user.adminRole}
                            currentActive={user.adminActive}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Identity safety"
            title="Account merge review"
            actions={
              <AdminPill kind={pendingMerges ? "warn" : "live"}>
                {pendingMerges} pending
              </AdminPill>
            }
          />
          <div className="list">
            {mergeRequests.length === 0 ? (
              <div className="list-row text-mute">
                No merge requests waiting for review.
              </div>
            ) : (
              mergeRequests.map((request) => (
                <div className="list-row" key={request.id}>
                  <span
                    className="thumb sq"
                    style={{
                      background: "rgba(244,161,66,0.10)",
                      color: "var(--a-amber)",
                    }}
                  >
                    <AdminIcon name="users" size={14} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <span className="mono" style={{ fontWeight: 600 }}>
                        {request.id}
                      </span>
                      <AdminStatusPill status={request.status} />
                    </div>
                    <div className="row-sub mono" style={{ fontSize: 11 }}>
                      {request.source_profile_id} → {request.target_profile_id}
                    </div>
                    {request.reason && (
                      <div
                        className="text-mute"
                        style={{ fontSize: 11, marginTop: 2 }}
                      >
                        {request.reason}
                      </div>
                    )}
                  </div>
                  {request.status === "pending" ? (
                    <AdminMergeActions mergeRequestId={request.id} />
                  ) : null}
                </div>
              ))
            )}
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
