import Link from "next/link";
import { EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import type { YnotViewer } from "@/features/ynot/types";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await requireCurrentProfile("/notifications");
  const viewer: YnotViewer = {
    authenticated: true,
    profileId: session.profileId,
    displayName: session.displayName ?? "YNot Customer",
    authSource: session.authSource,
    isAdmin: Boolean(session.adminRole),
    adminRole: session.adminRole ?? null,
  };

  return (
    <YnotShell viewer={viewer}>
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="Account updates and important YNOT messages will appear here when they are available."
      />

      <section className="profile-dashboard profile-rewards-page" aria-label="Notifications">
        <EmptyState
          title="No notifications yet"
          body="There are no account updates to show right now. Keep opening packs or check your profile for collection and reward history."
        />
        <div className="product-actions">
          <Link className="primary-action" href="/packs">
            Browse Y-Packs
          </Link>
          <Link className="secondary-action" href="/profile">
            Back to profile
          </Link>
        </div>
      </section>
    </YnotShell>
  );
}
