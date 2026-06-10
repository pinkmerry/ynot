import Link from "next/link";
import { headers } from "next/headers";
import { PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotViewer } from "@/features/ynot/data";
import { isLocalStockSubSkuHost } from "@/features/ynot/local-stock-subsku-access";
import { adminContentStudioLocalSummary, phaseReadinessItems, type PhaseReadinessState } from "@/features/ynot/phase-readiness";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

const statusLabel: Record<PhaseReadinessState, string> = {
  "local-ready": "Localhost testable",
  "external-gated": "External gate",
  "pilot-gated": "Pilot gate",
};

const statusTone: Record<PhaseReadinessState, string> = {
  "local-ready": "ready",
  "external-gated": "gated",
  "pilot-gated": "pilot",
};

export default async function LocalReadinessPage() {
  const viewer = await getYnotViewer();
  const host = (await headers()).get("host");
  const showLocalStockTest =
    isLocalStockSubSkuHost(host) || viewer.isAdmin || isDevAuthAllowed();
  return (
    <YnotShell viewer={viewer}>
      <PageHeader
        eyebrow="Local readiness"
        title="Phase 1–7 localhost test console"
        description="Safe local view of every remaining production phase. It shows what you can test now on localhost and what still requires Supabase/Vercel/provider production gates."
        action={<Link className="secondary-action compact" href="/">Back to packs</Link>}
      />

      <section className="readiness-hero soft-card">
        <div>
          <p className="section-label">Ralph execution boundary</p>
          <h3>Local implementation is ready for review; external phases stay gated.</h3>
          <p>
            This page does not apply migrations, change provider dashboards, approve payments, or deploy production.
            It makes the phase plan testable from localhost while preserving the backup/staging/go-no-go rules.
          </p>
        </div>
        <div className="readiness-facts">
          <span>Supabase ref: szjoarkijeaspazbrchc</span>
          <span>LIFF + Website: same DB</span>
          <span>Production writes: gated</span>
          {showLocalStockTest ? (
            <Link href="/local-stock-subsku-test">Stock Sub SKU test</Link>
          ) : null}
        </div>
      </section>

      <section className="phase-readiness-grid" aria-label="Phase readiness cards">
        {phaseReadinessItems.map((item) => (
          <article key={item.phase} className="phase-card soft-card">
            <div className="phase-card-topline">
              <span className="phase-number">Phase {item.phase}</span>
              <span className={`phase-status ${statusTone[item.localhostStatus]}`}>{statusLabel[item.localhostStatus]}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.shortGoal}</p>

            <div className="phase-card-section">
              <h4>You can test on localhost</h4>
              <ul>
                {item.ownerCanTest.map((step) => <li key={step}>{step}</li>)}
              </ul>
            </div>

            <div className="phase-link-row">
              {item.localhostLinks.map((link) => <Link key={`${item.phase}-${link.href}-${link.label}`} href={link.href}>{link.label}</Link>)}
            </div>

            <div className="phase-card-section">
              <h4>Real evidence still needed</h4>
              <ul>
                {item.evidenceNeeded.map((evidence) => <li key={evidence}>{evidence}</li>)}
              </ul>
            </div>
            <p className="phase-gate"><strong>Gate:</strong> {item.externalGate}</p>
            <code>{item.docPath}</code>
          </article>
        ))}
      </section>

      <section className="soft-card content-studio-status">
        <div>
          <p className="section-label">Admin future-proofing</p>
          <h3>Admin Content Studio status</h3>
          <p>Current admin operations are implemented, but dynamic category/media CMS must still be staged before production if you want admins to create any future category or image-led pack without developer work.</p>
        </div>
        <div className="content-studio-columns">
          <div>
            <h4>Current</h4>
            <ul>{adminContentStudioLocalSummary.current.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <h4>Future staged implementation</h4>
            <ul>{adminContentStudioLocalSummary.future.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
        <code>{adminContentStudioLocalSummary.docPath}</code>
      </section>
    </YnotShell>
  );
}
