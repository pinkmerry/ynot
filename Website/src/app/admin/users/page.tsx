import { AdminMergeActions, AdminUserRoleForm } from "@/features/ynot/client";
import { AdminGate, PageHeader, StatusBadge, YnotShell } from "@/features/ynot/components";
import { getAdminMergeRequests, getAdminUsers, getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [data, users, mergeRequests] = await Promise.all([getYnotDashboardData(), getAdminUsers(), getAdminMergeRequests()]);

  return (
    <AdminGate viewer={data.viewer}>
      <YnotShell viewer={data.viewer}>
        <PageHeader
          eyebrow="Admin users"
          title="Users, identities, and roles"
          description="Manage canonical profiles and admin roles from admin_users. Owner role changes are protected server-side."
        />
        <section className="soft-card rounded-[28px] p-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                <tr>
                  <th className="py-2">User</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Admin role</th>
                  <th>Role action</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-white/10 align-top">
                    <td className="py-3">
                      <p className="font-black">{user.displayName}</p>
                      <p className="font-mono text-xs text-[var(--muted)]">{user.id}</p>
                    </td>
                    <td>{user.email ?? "-"}</td>
                    <td><StatusBadge status={user.status} /></td>
                    <td>{user.adminRole ? <StatusBadge status={`${user.adminRole}${user.adminActive ? "" : " inactive"}`} /> : "Customer"}</td>
                    <td><AdminUserRoleForm profileId={user.id} currentRole={user.adminRole} currentActive={user.adminActive} /></td>
                    <td>{new Date(user.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!users.length && <p className="mt-4 text-sm text-[var(--muted)]">No users loaded. Apply migrations and seed/admin data first.</p>}
        </section>
        <section className="soft-card rounded-[28px] p-5">
          <h3 className="text-lg font-black">Account merge review</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">LINE/email conflicts create merge requests. Approval moves identities, wallet balance, collection, orders, exchange, shipping, and address ownership to the target profile through a service-role RPC.</p>
          <div className="mt-4 grid gap-3">
            {mergeRequests.map((request) => (
              <article key={request.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-mono text-xs text-[var(--muted)]">{request.id}</p>
                    <p className="mt-1 font-black"><StatusBadge status={request.status} /></p>
                    <p className="mt-2 text-xs text-[var(--muted)]">Source {request.source_profile_id} → Target {request.target_profile_id}</p>
                    {request.reason && <p className="mt-2 text-sm text-[var(--muted)]">{request.reason}</p>}
                  </div>
                  {request.status === "pending" ? <AdminMergeActions mergeRequestId={request.id} /> : null}
                </div>
              </article>
            ))}
            {!mergeRequests.length && <p className="text-sm text-[var(--muted)]">No merge requests are waiting for review.</p>}
          </div>
        </section>
      </YnotShell>
    </AdminGate>
  );
}
