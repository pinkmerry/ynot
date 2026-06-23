import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LocalStockSubSkuTest } from "@/features/ynot/LocalStockSubSkuTest";
import { PageHeader, YnotShell } from "@/features/ynot/components";
import { Shell } from "@/features/ynot/cr/Shell";
import { getYnotViewer } from "@/features/ynot/data";
import { i18n } from "@/features/ynot/i18n";
import { isLocalStockSubSkuHost } from "@/features/ynot/local-stock-subsku-access";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

export default async function LocalStockSubSkuTestPage() {
  const viewer = await getYnotViewer();
  const host = (await headers()).get("host");
  if (!isLocalStockSubSkuHost(host) && !viewer.isAdmin && !isDevAuthAllowed()) {
    redirect("/packs");
  }

  return (
    <YnotShell viewer={viewer}>
      <Shell>
        <div className="local-production-route-head">
          <PageHeader
            eyebrow={i18n("Local production rehearsal", "ซ้อมขั้นตอนโปรดักชันบน local")}
            title={i18n("Customer and admin Sub SKU flow", "ขั้นตอน Sub SKU สำหรับลูกค้าและแอดมิน")}
            description={i18n(
              "Localhost-only production-style test for box stock, loose pack stock, pack opening animation, reward images, user bag rows, all-pulls history, and admin stock controls.",
              "หน้าทดสอบสไตล์โปรดักชันบน localhost สำหรับสต็อกแบบกล่อง, สต็อกแบบซอง, อนิเมชันเปิดแพ็ก, รูปรางวัล, ถุงการ์ดผู้ใช้, ประวัติการเปิดทั้งหมด และตัวควบคุมสต็อกแอดมิน",
            )}
            action={
              <Link className="secondary-action compact" href="/local-readiness">
                {i18n("Readiness", "ความพร้อม")}
              </Link>
            }
          />
        </div>
        <LocalStockSubSkuTest />
      </Shell>
    </YnotShell>
  );
}
