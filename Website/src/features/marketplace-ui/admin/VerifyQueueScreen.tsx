import Link from "next/link";
import type { AdminSellerSubmissionQueueRow } from "@/lib/marketplace/seller-consignment";
import { MpBadge, MpEmpty, type MpBadgeKind } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";
import { VerifyActions } from "./VerifyActions";

/**
 * Marketplace admin Verification queue -- seller consignment intake cards
 * with approve/reject-style transition actions. Ported (data-driven, not
 * 1:1 markup) from marketplace-admin-1.jsx's AdminVerify (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-1.jsx:256-310),
 * reshaped from a table into cards (closer to that same prototype's
 * AdminDisputes/AdminModeration rows, lines 128-253) because the real
 * per-submission data (condition, grade, language, cert, price, payout,
 * photo count, admin note) is richer than a table row comfortably holds.
 *
 * Pure presentational server component: the page (page.tsx) loads
 * `submissions` up front via listAdminSellerSubmissionQueue(admin) and
 * passes it down as a prop, same split as OverviewScreen.tsx/page.tsx.
 *
 * listAdminSellerSubmissionQueue has no status filter of its own -- it
 * returns every submission (draft through sold/cancelled/returned), so the
 * "Needs action" filter here narrows to the statuses that still have an
 * admin transition available (see VerifyActions.tsx's actionsFor), while
 * "All submissions" shows the full queue including terminal ones.
 */

const NEEDS_ACTION_STATUSES: ReadonlySet<string> = new Set([
  "submitted",
  "submitted_for_review",
  "handoff_confirmed",
  "intake_instruction_sent",
  "received",
  "inspection_passed",
]);

function statusBadge(status: string): { kind: MpBadgeKind; label: string } {
  switch (status) {
    case "listed":
      return { kind: "official", label: "Live on market" };
    case "sold":
      return { kind: "official", label: "Sold" };
    case "inspection_passed":
      return { kind: "graded", label: "Ready to activate" };
    case "inspection_failed":
    case "cancelled":
    case "returned":
      return { kind: "sold", label: status.replace(/_/g, " ") };
    case "draft":
      return { kind: "raw", label: "Draft" };
    default:
      return { kind: "graded", label: status.replace(/_/g, " ") };
  }
}

export interface VerifyQueueScreenProps {
  submissions: AdminSellerSubmissionQueueRow[];
  filter: "needs_action" | "all";
}

export function VerifyQueueScreen({ submissions, filter }: VerifyQueueScreenProps) {
  const visible =
    filter === "needs_action"
      ? submissions.filter((submission) => NEEDS_ACTION_STATUSES.has(submission.status))
      : submissions;

  const emptyHint =
    filter === "needs_action"
      ? "Nothing needs your attention right now. Switch to All submissions to see the full queue."
      : "No seller submissions have come in yet.";

  return (
    <>
      <div className="mp-row" style={{ alignItems: "flex-end", marginBottom: 22 }}>
        <div className="mp-stack" style={{ gap: 5 }}>
          <span className="mp-eyebrow">Vault</span>
          <h1 className="mp-h1" style={{ fontSize: 26 }}>
            Verification queue
          </h1>
          <p className="mp-lead" style={{ fontSize: 13 }}>
            Seller consignment intake -- move items through intake, inspection, and
            onto the market.
          </p>
        </div>
      </div>

      <div className="mp-row" style={{ gap: 8, marginBottom: 14 }}>
        <Link
          href="/admin/marketplace/seller-submissions"
          prefetch={false}
          className={`mp-chip${filter === "needs_action" ? " active" : ""}`}
        >
          Needs action
        </Link>
        <Link
          href="/admin/marketplace/seller-submissions?filter=all"
          prefetch={false}
          className={`mp-chip${filter === "all" ? " active" : ""}`}
        >
          All submissions
        </Link>
      </div>

      {visible.length === 0 ? (
        <MpEmpty glyph="shield" title="Queue clear" hint={emptyHint} />
      ) : (
        <div className="mp-stack" style={{ gap: 12 }}>
          {visible.map((submission) => {
            const badge = statusBadge(submission.status);
            return (
              <article key={submission.id} className="mp-panel">
                <div className="mp-row" style={{ gap: 12, marginBottom: 12 }}>
                  <span className="mpa-thumb" style={{ width: 44, height: 56 }} aria-hidden />
                  <div className="mp-stack" style={{ gap: 2, flex: 1 }}>
                    <h3 className="mp-h3">{submission.title_snapshot}</h3>
                    <span className="mp-small mp-mute mp-mono">
                      #{submission.submission_number} · {submission.item_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <MpBadge kind={badge.kind}>{badge.label}</MpBadge>
                </div>

                <div
                  className="mp-spec"
                  style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 12 }}
                >
                  <div>
                    <div className="k">Condition</div>
                    <div className="v">{submission.condition_code}</div>
                  </div>
                  <div>
                    <div className="k">Grade</div>
                    <div className="v">{submission.grade_label ?? "Raw"}</div>
                  </div>
                  <div>
                    <div className="k">Language</div>
                    <div className="v">{submission.language ?? "—"}</div>
                  </div>
                  <div>
                    <div className="k">Cert</div>
                    <div className="v">{submission.cert_number ?? "—"}</div>
                  </div>
                  <div>
                    <div className="k">Asking price</div>
                    <div className="v">{formatThb(submission.asking_price_satang)}</div>
                  </div>
                  <div>
                    <div className="k">Seller payout</div>
                    <div className="v">{formatThb(submission.payout_preview_satang)}</div>
                  </div>
                  <div>
                    <div className="k">Photos</div>
                    <div className="v">{submission.photo_count}/10</div>
                  </div>
                  <div>
                    <div className="k">Listing</div>
                    <div className="v">
                      {submission.listing_id ? (
                        <Link href={`/admin/marketplace/listings/${submission.listing_id}`} prefetch={false}>
                          Open
                        </Link>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                </div>

                {submission.admin_visible_note ? (
                  <p className="mp-alert mp-alert-gold mp-small" style={{ marginBottom: 12 }}>
                    {submission.admin_visible_note}
                  </p>
                ) : null}

                <VerifyActions
                  submission={{
                    id: submission.id,
                    status: submission.status,
                    version: submission.version,
                    title_snapshot: submission.title_snapshot,
                    asking_price_satang: submission.asking_price_satang,
                  }}
                />
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
