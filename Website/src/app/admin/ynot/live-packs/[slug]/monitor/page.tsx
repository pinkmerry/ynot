import Link from "next/link";
import { connection } from "next/server";

import { AdminGate } from "@/features/ynot/components";
import { getAdminPackMonitor, getYnotViewer } from "@/features/ynot/data";
import {
  AdminBar,
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
  AdminKPI,
  AdminStatusPill,
  AdminTierPill,
  fmtTHB,
} from "@/features/ynot/admin";
import type { YnotPackMonitor } from "@/features/ynot/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function MonitorPrizeImage({
  prize,
}: {
  prize: YnotPackMonitor["prizes"][number];
}) {
  return (
    <span className="admin-monitor-prize-image">
      {prize.cardImageUrl ? (
        // Card art URLs may be Supabase/public imports and match existing YNOTT
        // reward thumbnails, so keep the same plain image rendering path here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={prize.cardImageUrl} alt={prize.cardName} loading="lazy" />
      ) : (
        <AdminIcon name="image" size={18} />
      )}
    </span>
  );
}

function PrizeRow({ prize }: { prize: YnotPackMonitor["prizes"][number] }) {
  const outPct =
    prize.totalUnits > 0
      ? Math.round(Math.min(100, (prize.outUnits / prize.totalUnits) * 100))
      : 0;

  return (
    <article className="admin-monitor-prize-row">
      <div className="admin-monitor-prize-main">
        <MonitorPrizeImage prize={prize} />
        <div>
          <div className="admin-monitor-prize-title">
            <strong>{prize.cardName}</strong>
            {prize.displayTier ? (
              <AdminTierPill tier={prize.displayTier} />
            ) : (
              <AdminStatusPill status={prize.tier} />
            )}
          </div>
          <p>
            {[prize.cardCode, prize.cardGrade].filter(Boolean).join(" · ") ||
              "No catalog code"}
          </p>
        </div>
      </div>

      <div className="admin-monitor-prize-counts">
        <div>
          <span>Left</span>
          <strong>{prize.remainingUnits.toLocaleString()}</strong>
        </div>
        <div>
          <span>Out</span>
          <strong>{prize.outUnits.toLocaleString()}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{prize.totalUnits.toLocaleString()}</strong>
        </div>
      </div>

      <div className="admin-monitor-prize-progress">
        <AdminBar value={outPct} max={100} tone={outPct >= 80 ? "sky" : "mint"} />
        <span>{outPct}% out</span>
      </div>

      <div className="admin-monitor-winners">
        <span className="admin-monitor-section-label">
          Winner history · latest {prize.winners.length.toLocaleString()} of{" "}
          {prize.outUnits.toLocaleString()}
        </span>
        {prize.winners.length ? (
          prize.winners.map((winner, index) => (
            <div
              className="admin-monitor-winner-row"
              key={`${winner.publicOpenCode ?? "winner"}-${index}`}
            >
              <div>
                <strong>{winner.ownerLabel ?? "YNot customer"}</strong>
                <span>
                  {[winner.ownerEmail, winner.ownerLineUserId]
                    .filter(Boolean)
                    .join(" · ") || "No contact label"}
                </span>
              </div>
              <div>
                <span className="mono">{winner.publicOpenCode ?? "-"}</span>
                <em>{fmtDateTime(winner.openedAt)}</em>
              </div>
            </div>
          ))
        ) : (
          <p className="admin-monitor-empty">No winner yet.</p>
        )}
      </div>
    </article>
  );
}

export default async function AdminLivePackMonitorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();

  const viewer = await getYnotViewer();
  const { slug } = await params;
  const monitor = await getAdminPackMonitor(slug);

  if (!monitor) {
    return (
      <AdminGate viewer={viewer}>
        <AdminFrame
          viewer={viewer}
          active="/admin"
          trail={["Admin", "Live packs", "Monitor"]}
          eyebrow="Live pack monitor"
          title="Pack not found"
          desc="This pack could not be loaded for live monitoring."
          actions={
            <Link href="/admin" className="btn" prefetch={false}>
              <AdminIcon name="chev-r" /> Back to dashboard
            </Link>
          }
        >
          <AdminCard>
            <div className="card-pad text-mute">
              Check that the pack is still visible to admins and try again.
            </div>
          </AdminCard>
        </AdminFrame>
      </AdminGate>
    );
  }

  const { summary, totals } = monitor;

  return (
    <AdminGate viewer={viewer}>
      <AdminFrame
        viewer={viewer}
        active="/admin"
        trail={["Admin", "Live packs", summary.slug, "Monitor"]}
        eyebrow="Live pack monitor"
        title={summary.title}
        desc="Current prize situation, remaining stock, and winners for this pack."
        actions={
          <>
            <Link
              href={`/admin/campaigns/${summary.campaignId}/edit`}
              className="btn"
              prefetch={false}
            >
              <AdminIcon name="edit" /> Edit live pack
            </Link>
            <Link href="/admin" className="btn btn-primary" prefetch={false}>
              <AdminIcon name="grid" /> Dashboard
            </Link>
          </>
        }
      >
        <div className="admin-pack-monitor">
          <div className="kpi-grid">
            <AdminKPI
              label="Pack status"
              value={summary.status}
              delta={summary.isSoldOut ? "sold-out" : "live situation"}
              deltaDir={summary.isSoldOut ? "down" : "up"}
              color="var(--a-mint)"
            />
            <AdminKPI
              label="Slots opened"
              value={`${summary.openedSlots.toLocaleString()} / ${summary.totalSlots.toLocaleString()}`}
              delta={`${summary.progressPct}% progress`}
              color="var(--a-sky)"
            />
            <AdminKPI
              label="Prize units left"
              value={totals.remainingPrizeUnits.toLocaleString()}
              delta={`${totals.outPrizeUnits.toLocaleString()} out`}
              color="var(--a-gold)"
            />
            <AdminKPI
              label="Pack price"
              value={fmtTHB(summary.priceThb)}
              delta={`${totals.winnerRows.toLocaleString()} winners`}
              color="var(--a-rose)"
            />
          </div>

          <AdminCard>
            <AdminCardHead
              label="Live situation"
              title={`${totals.prizeRows.toLocaleString()} prize rows`}
              actions={<AdminStatusPill status={summary.status} />}
            />
            <div className="card-pad admin-monitor-summary">
              <div>
                <span>Opened</span>
                <strong>{summary.soldCount.toLocaleString()}</strong>
              </div>
              <div>
                <span>Remaining</span>
                <strong>{summary.remainingSlots.toLocaleString()}</strong>
              </div>
              <div>
                <span>Prize left</span>
                <strong>{totals.remainingPrizeUnits.toLocaleString()}</strong>
              </div>
              <div>
                <span>Prize out</span>
                <strong>{totals.outPrizeUnits.toLocaleString()}</strong>
              </div>
              <div>
                <span>Updated</span>
                <strong>{fmtDateTime(summary.updatedAt)}</strong>
              </div>
            </div>
            <div className="card-pad">
              <AdminBar value={summary.progressPct} max={100} tone="sky" />
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHead
              label="Prize monitor"
              title="What is left and what is already out"
            />
            <div className="card-pad admin-monitor-prize-list">
              {monitor.prizes.length ? (
                monitor.prizes.map((prize) => (
                  <PrizeRow key={prize.id} prize={prize} />
                ))
              ) : (
                <p className="admin-monitor-empty">
                  No prize rows are materialized for this pack yet.
                </p>
              )}
            </div>
          </AdminCard>
        </div>
      </AdminFrame>
    </AdminGate>
  );
}
