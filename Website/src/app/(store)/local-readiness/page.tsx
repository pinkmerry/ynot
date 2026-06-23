import Link from "next/link";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotViewer } from "@/features/ynot/data";
import { i18n, type LocalizedCopy } from "@/features/ynot/i18n";
import { isLocalStockSubSkuHost } from "@/features/ynot/local-stock-subsku-access";
import { adminContentStudioLocalSummary, phaseReadinessItems, type PhaseReadinessState } from "@/features/ynot/phase-readiness";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

const statusLabel: Record<PhaseReadinessState, ReactNode> = {
  "local-ready": i18n("Localhost testable", "ทดสอบบน localhost ได้"),
  "external-gated": i18n("External gate", "ต้องผ่าน gate ภายนอก"),
  "pilot-gated": i18n("Pilot gate", "ต้องผ่าน pilot gate"),
};

const statusTone: Record<PhaseReadinessState, string> = {
  "local-ready": "ready",
  "external-gated": "gated",
  "pilot-gated": "pilot",
};

function text(copy: LocalizedCopy<string>) {
  return i18n(copy.en, copy.th);
}

export default async function LocalReadinessPage() {
  const viewer = await getYnotViewer();
  const host = (await headers()).get("host");
  const showLocalStockTest =
    isLocalStockSubSkuHost(host) || viewer.isAdmin || isDevAuthAllowed();
  return (
    <YnotShell viewer={viewer}>
      <PageHeader
        eyebrow={i18n("Local readiness", "ความพร้อมบน local")}
        title={i18n("Phase 1-7 localhost test console", "คอนโซลทดสอบ Phase 1-7 บน localhost")}
        description={i18n(
          "Safe local view of every remaining production phase. It shows what you can test now on localhost and what still requires Supabase/Vercel/provider production gates.",
          "หน้ารวมสถานะ local ที่ปลอดภัยสำหรับทุก phase ที่เหลือ แสดงว่าสิ่งใดทดสอบบน localhost ได้แล้ว และสิ่งใดยังต้องผ่าน Supabase/Vercel/provider gate",
        )}
        action={<Link className="secondary-action compact" href="/">{i18n("Back to packs", "กลับไปหน้าแพ็ก")}</Link>}
      />

      <section className="readiness-hero soft-card">
        <div>
          <p className="section-label">{i18n("Ralph execution boundary", "ขอบเขตการรัน Ralph")}</p>
          <h3>{i18n("Local implementation is ready for review; external phases stay gated.", "งาน local พร้อมให้ตรวจแล้ว ส่วน phase ภายนอกยังถูก gate ไว้")}</h3>
          <p>
            {i18n(
              "This page does not apply migrations, change provider dashboards, approve payments, or deploy production. It makes the phase plan testable from localhost while preserving the backup/staging/go-no-go rules.",
              "หน้านี้ไม่รัน migration ไม่เปลี่ยน provider dashboards ไม่อนุมัติการชำระเงิน และไม่ deploy โปรดักชัน แต่ทำให้แผนแต่ละ phase ทดสอบจาก localhost ได้โดยยังรักษากฎ backup/staging/go-no-go",
            )}
          </p>
        </div>
        <div className="readiness-facts">
          <span>{i18n("Supabase ref: szjoarkijeaspazbrchc", "Supabase ref: szjoarkijeaspazbrchc")}</span>
          <span>{i18n("LIFF + Website: same DB", "LIFF + Website: ใช้ DB เดียวกัน")}</span>
          <span>{i18n("Production writes: gated", "การเขียนโปรดักชัน: ถูก gate")}</span>
          {showLocalStockTest ? (
            <Link href="/local-stock-subsku-test">{i18n("Stock Sub SKU test", "ทดสอบ Stock Sub SKU")}</Link>
          ) : null}
        </div>
      </section>

      <section className="phase-readiness-grid" aria-label="Phase readiness cards / การ์ดความพร้อมแต่ละ phase">
        {phaseReadinessItems.map((item) => (
          <article key={item.phase} className="phase-card soft-card">
            <div className="phase-card-topline">
              <span className="phase-number">{i18n(`Phase ${item.phase}`, `Phase ${item.phase}`)}</span>
              <span className={`phase-status ${statusTone[item.localhostStatus]}`}>{statusLabel[item.localhostStatus]}</span>
            </div>
            <h3>{text(item.title)}</h3>
            <p>{text(item.shortGoal)}</p>

            <div className="phase-card-section">
              <h4>{i18n("You can test on localhost", "สิ่งที่ทดสอบบน localhost ได้")}</h4>
              <ul>
                {item.ownerCanTest.map((step) => <li key={step.en}>{text(step)}</li>)}
              </ul>
            </div>

            <div className="phase-link-row">
              {item.localhostLinks.map((link) => <Link key={`${item.phase}-${link.href}-${link.label.en}`} href={link.href}>{text(link.label)}</Link>)}
            </div>

            <div className="phase-card-section">
              <h4>{i18n("Real evidence still needed", "หลักฐานจริงที่ยังต้องมี")}</h4>
              <ul>
                {item.evidenceNeeded.map((evidence) => <li key={evidence.en}>{text(evidence)}</li>)}
              </ul>
            </div>
            <p className="phase-gate"><strong>{i18n("Gate:", "Gate:")}</strong> {text(item.externalGate)}</p>
            <code>{item.docPath}</code>
          </article>
        ))}
      </section>

      <section className="soft-card content-studio-status">
        <div>
          <p className="section-label">{i18n("Admin future-proofing", "รองรับงานแอดมินในอนาคต")}</p>
          <h3>{i18n("Admin Content Studio status", "สถานะ Admin Content Studio")}</h3>
          <p>{i18n(
            "Current admin operations are implemented, but dynamic category/media CMS must still be staged before production if you want admins to create any future category or image-led pack without developer work.",
            "งานแอดมินปัจจุบันทำแล้ว แต่ dynamic category/media CMS ยังต้อง staging ก่อนขึ้นโปรดักชัน ถ้าต้องการให้แอดมินสร้างหมวดหรือแพ็กที่นำด้วยรูปได้เองโดยไม่ต้องให้นักพัฒนาช่วย",
          )}</p>
        </div>
        <div className="content-studio-columns">
          <div>
            <h4>{i18n("Current", "ปัจจุบัน")}</h4>
            <ul>{adminContentStudioLocalSummary.current.map((item) => <li key={item.en}>{text(item)}</li>)}</ul>
          </div>
          <div>
            <h4>{i18n("Future staged implementation", "งาน future ที่ต้อง staging")}</h4>
            <ul>{adminContentStudioLocalSummary.future.map((item) => <li key={item.en}>{text(item)}</li>)}</ul>
          </div>
        </div>
        <code>{adminContentStudioLocalSummary.docPath}</code>
      </section>
    </YnotShell>
  );
}
