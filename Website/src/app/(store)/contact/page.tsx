import Link from "next/link";
import { PageHeader, YnotShell } from "@/features/ynot/components";
import type { YnotViewer } from "@/features/ynot/types";

const guestViewer: YnotViewer = {
  authenticated: false,
  displayName: "Guest",
  isAdmin: false,
};

export default function ContactPage() {
  return (
    <YnotShell viewer={guestViewer} viewerMode="literal">
      <PageHeader
        eyebrow="Support"
        title="Contact YNOT"
        description="Need help with packs, wallet top ups, collection, exchange, or shipping? Start with the channel below and include your account name plus the pack or order reference if you have one."
      />

      <section className="profile-dashboard personal-info-page" aria-label="Contact support">
        <div className="profile-panel">
          <div className="profile-section-head">
            <span>Support channel</span>
            <strong>Instagram direct message</strong>
            <p>
              Message the YNOT team on Instagram for account and order help.
              Keep payment slips, order references, and pack names ready so the
              team can check your case faster.
            </p>
          </div>
          <div className="product-actions">
            <a
              className="primary-action"
              href="https://instagram.com/ynot"
              rel="noreferrer"
              target="_blank"
            >
              Open Instagram
            </a>
            <Link className="secondary-action" href="/packs">
              Browse Y-Packs
            </Link>
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <p className="section-label">Wallet help</p>
            <p className="txt-s mt-2">
              Include the top-up amount and time when asking about coin balance.
            </p>
          </div>
          <div className="metric-card">
            <p className="section-label">Pack help</p>
            <p className="txt-s mt-2">
              Include the Y-Pack name and open reference when asking about a pull.
            </p>
          </div>
          <div className="metric-card">
            <p className="section-label">Shipping help</p>
            <p className="txt-s mt-2">
              Include your shipping request reference when asking about delivery.
            </p>
          </div>
        </div>
      </section>
    </YnotShell>
  );
}
