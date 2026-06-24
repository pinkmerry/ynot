import Link from "next/link";
import { EmptyState, PageHeader, YnotShell } from "@/features/ynot/components";
import { I18nText, i18n } from "@/features/ynot/i18n";
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
    <YnotShell viewer={viewer} showHeaderCoin={false}>
      <PageHeader
        eyebrow={i18n("Account", "บัญชี")}
        title={i18n("Notifications", "การแจ้งเตือน")}
        description={i18n(
          "Account updates and important YNOT messages will appear here when they are available.",
          "อัปเดตบัญชีและข้อความสำคัญจาก YNOT จะแสดงที่นี่เมื่อมีข้อมูล",
        )}
      />

      <section
        className="profile-dashboard profile-rewards-page"
        aria-label="Notifications / การแจ้งเตือน"
      >
        <EmptyState
          title={i18n("No notifications yet", "ยังไม่มีการแจ้งเตือน")}
          body={i18n(
            "There are no account updates to show right now. Keep opening packs or check your profile for collection and reward history.",
            "ตอนนี้ยังไม่มีอัปเดตบัญชี เปิดแพ็กต่อหรือดูโปรไฟล์เพื่อเช็กคอลเลกชันและประวัติรางวัล",
          )}
        />
        <div className="product-actions">
          <Link className="primary-action" href="/packs">
            <I18nText en="Browse Y-Packs" th="ดู Y-Packs" />
          </Link>
          <Link className="secondary-action" href="/profile">
            <I18nText en="Back to profile" th="กลับโปรไฟล์" />
          </Link>
        </div>
      </section>
    </YnotShell>
  );
}
