import { AdminMergeActions, AdminUserRoleForm } from "@/features/ynot/client";
import {
  AdminSectionShell,
  PageHeader,
  StatusBadge,
} from "@/features/ynot/components";
import {
  getAdminMergeRequests,
  getAdminUsers,
  getYnotDashboardSlice,
} from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [data, users, mergeRequests] = await Promise.all([
    getYnotDashboardSlice(),
    getAdminUsers(),
    getAdminMergeRequests(),
  ]);

  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/users">
      <PageHeader
        eyebrow="Admin users"
        title="Users, identities, and roles"
        description="Manage canonical profiles and admin roles from admin_users. Owner role changes are protected server-side."
      />
      <section className="admin-panel admin-table-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <p className="section-label">Accounts</p>
            <h3 className="title-m">User role controls</h3>
          </div>
          <span className="status-pill">{users.length} users</span>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Status</th>
                <th>Admin role</th>
                <th>Role action</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <p className="font-black">{user.displayName}</p>
                    <p className="admin-id-line">{user.id}</p>
                  </td>
                  <td>{user.email ?? "-"}</td>
                  <td>
                    <StatusBadge status={user.status} />
                  </td>
                  <td>
                    {user.adminRole ? (
                      <StatusBadge
                        status={`${user.adminRole}${user.adminActive ? "" : " inactive"}`}
                      />
                    ) : (
                      "Customer"
                    )}
                  </td>
                  <td>
                    <AdminUserRoleForm
                      profileId={user.id}
                      currentRole={user.adminRole}
                      currentActive={user.adminActive}
                    />
                  </td>
                  <td>{new Date(user.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!users.length && (
          <p className="admin-empty-note">
            No users loaded. Apply migrations and seed/admin data first.
          </p>
        )}
      </section>

      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <p className="section-label">Identity safety</p>
            <h3 className="title-m">Account merge review</h3>
            <p className="txt-s">
              LINE/email conflicts create merge requests. Approval moves identities,
              wallet balance, collection, orders, exchange, shipping, and address
              ownership to the target profile through a service-role RPC.
            </p>
          </div>
          <span className="status-pill warn">
            {mergeRequests.filter((request) => request.status === "pending").length} pending
          </span>
        </div>
        <div className="admin-list-stack">
          {mergeRequests.map((request) => (
            <article key={request.id} className="admin-list-card">
              <div className="admin-row-head">
                <div>
                  <p className="admin-id-line">{request.id}</p>
                  <p className="mt-1 font-black">
                    <StatusBadge status={request.status} />
                  </p>
                </div>
                {request.status === "pending" ? (
                  <AdminMergeActions mergeRequestId={request.id} />
                ) : null}
              </div>
              <p className="admin-muted-line">
                Source {request.source_profile_id} → Target {request.target_profile_id}
              </p>
              {request.reason && <p className="admin-muted-line">{request.reason}</p>}
            </article>
          ))}
          {!mergeRequests.length && (
            <p className="admin-empty-note">No merge requests are waiting for review.</p>
          )}
        </div>
      </section>
    </AdminSectionShell>
  );
}
