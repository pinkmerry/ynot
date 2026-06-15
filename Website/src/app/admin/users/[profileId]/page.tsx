import { notFound } from "next/navigation";
import { AdminGate } from "@/features/ynot/components";
import {
  getAdminUserDetail,
  getYnotDashboardSlice,
  normalizeAdminUser360Query,
} from "@/features/ynot/data";
import { AdminFrame } from "@/features/ynot/admin";
import { AdminUser360 } from "@/features/ynot/admin/AdminUser360";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams?: Promise<{ pageSize?: string }>;
}) {
  const { profileId } = await params;
  const detailQuery = normalizeAdminUser360Query(
    await (searchParams ?? Promise.resolve({})),
  );
  const [data, detail] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    getAdminUserDetail(profileId, detailQuery),
  ]);

  if (!detail) notFound();

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/users"
        trail={["Admin", "People", "User 360"]}
        eyebrow="Admin user"
        title={detail.profile.displayName}
        desc="Review identity, wallet balance, reward history, pack source, shipping status, tracking, and support timeline for one user."
      >
        <AdminUser360 detail={detail} />
      </AdminFrame>
    </AdminGate>
  );
}
