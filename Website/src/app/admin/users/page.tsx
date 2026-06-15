import Link from "next/link";
import { AdminMergeActions, AdminUserRoleForm } from "@/features/ynot/client";
import { AdminGate } from "@/features/ynot/components";
import {
  getAdminMergeRequests,
  getAdminUserDirectory,
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

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    role?: string;
    status?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const params = await (searchParams ?? Promise.resolve({}));
  const [data, directory, mergeRequests] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    getAdminUserDirectory(params),
    getAdminMergeRequests(),
  ]);
  const users = directory.users;

  const pageOwners = users.filter((u) => u.adminRole === "owner").length;
  const pageStaff = users.filter(
    (u) => u.adminRole && u.adminRole !== "owner",
  ).length;
  const pageCustomers = users.length - pageOwners - pageStaff;
  const pageInactive = users.filter((u) => u.status !== "active").length;
  const pendingMerges = mergeRequests.filter((r) => r.status === "pending").length;

  function directoryHref(next: Partial<typeof directory.query>) {
    const merged = {
      ...directory.query,
      ...next,
    };
    const url = new URLSearchParams();
    if (merged.q) url.set("q", merged.q);
    if (merged.role !== "all") url.set("role", merged.role);
    if (merged.status !== "all") url.set("status", merged.status);
    if (merged.page > 1) url.set("page", String(merged.page));
    if (merged.pageSize !== 50) url.set("pageSize", String(merged.pageSize));
    const qs = url.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  }

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
          <AdminKPI
            label="Total users"
            value={directory.total}
            color="var(--a-gold)"
          />
          <AdminKPI
            label="Page owners + staff"
            value={pageOwners + pageStaff}
            color="var(--a-mint)"
          />
          <AdminKPI
            label="Page customers"
            value={pageCustomers}
            color="var(--a-sky)"
          />
          <AdminKPI
            label="Page inactive"
            value={pageInactive}
            delta={pageInactive ? "needs review" : "all clear"}
            deltaDir={pageInactive ? "down" : "up"}
            color="var(--a-rose)"
          />
        </div>

        <AdminCard>
          <AdminCardHead
            label="Directory"
            title={`Users · ${directory.total}`}
            actions={
              <form action="/admin/users" className="tabs" style={{ gap: 8 }}>
                <input
                  className="input"
                  name="q"
                  placeholder="Search email, LINE, phone, profile"
                  defaultValue={directory.query.q}
                  style={{ minWidth: 260 }}
                />
                <select
                  className="input"
                  name="role"
                  defaultValue={directory.query.role}
                >
                  <option value="all">All roles</option>
                  <option value="customer">Customers</option>
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                </select>
                <select
                  className="input"
                  name="status"
                  defaultValue={directory.query.status}
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="merged">Merged</option>
                </select>
                <button className="btn btn-primary" type="submit">
                  <AdminIcon name="search" />
                  Search
                </button>
              </form>
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
                  <th>User 360</th>
                  <th>Role action</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ padding: 24 }}>
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
                          <Link
                            className="btn btn-ghost"
                            href={`/admin/users/${user.id}`}
                            prefetch={false}
                          >
                            Open User 360
                          </Link>
                        </td>
                        <td>
                          {data.viewer.adminRole === "owner" ? (
                            <AdminUserRoleForm
                              profileId={user.id}
                              currentRole={user.adminRole}
                              currentActive={user.adminActive}
                            />
                          ) : (
                            <AdminPill kind="default">Owner only</AdminPill>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div
            className="card-pad"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span className="muted">
              Page {directory.page} · showing {users.length} of {directory.total}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Link
                className={`btn ${directory.hasPreviousPage ? "btn-ghost" : "disabled"}`}
                href={
                  directory.hasPreviousPage
                    ? directoryHref({ page: directory.page - 1 })
                    : directoryHref({ page: 1 })
                }
                prefetch={false}
              >
                Previous page
              </Link>
              <Link
                className={`btn ${directory.hasNextPage ? "btn-ghost" : "disabled"}`}
                href={
                  directory.hasNextPage
                    ? directoryHref({ page: directory.page + 1 })
                    : directoryHref({ page: directory.page })
                }
                prefetch={false}
              >
                Next page
              </Link>
            </div>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Identity safety"
            title="Identity link review"
            actions={
              <AdminPill kind={pendingMerges ? "warn" : "live"}>
                {pendingMerges} pending
              </AdminPill>
            }
          />
          <div className="list">
            {mergeRequests.length === 0 ? (
              <div className="list-row text-mute">
                No identity link requests waiting for review.
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
