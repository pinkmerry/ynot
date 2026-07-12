import Link from "next/link";
import type {
  MarketplaceListingReportReasonCode,
  MarketplaceListingReportRow,
  MarketplaceListingReportState,
} from "@/lib/marketplace/listing-reports";
import { MpBadge, MpEmpty, type MpBadgeKind } from "../shared/MpPrimitives";
import { ModerationActions } from "./ModerationActions";

/**
 * Marketplace admin Moderation (reported listings) screen -- filter chips
 * by report state, a report table, and per-row resolve actions. Recreated
 * (data-driven, not 1:1 markup) from marketplace-admin-1.jsx's
 * AdminModeration (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-1.jsx:
 * 200-253).
 *
 * The prototype invents a title/seller/price per report row and opens a
 * CompareModal (seller photos vs a reference image) to decide. The real
 * marketplace_listing_reports row (Database/marketplace-supabase/
 * migrations/20260704121000_marketplace_listing_reports.sql:4-18) carries
 * only listing_id/reporter_account_id/reason_code/reason_note/
 * report_state/resolution_note -- no title, seller, price, or photos --
 * so this screen shows the real report fields plus a link into the real
 * listing detail page instead of a fabricated comparison view.
 *
 * Pure presentational server component: the page (page.tsx) loads
 * `reports` up front via listMarketplaceListingReports({ state, limit: 100 })
 * and passes it down as a prop -- this file only renders it, same split
 * as OrdersScreen.tsx/page.tsx.
 */

const REPORT_STATE_FILTERS: { value: MarketplaceListingReportState; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "dismissed", label: "Dismissed" },
  { value: "unlisted", label: "Unlisted" },
];

const REASON_LABELS: Record<MarketplaceListingReportReasonCode, string> = {
  fake_or_cert_mismatch: "Fake / cert mismatch",
  stolen_photos: "Stolen photos",
  wrong_item: "Wrong item",
  pricing_abuse: "Pricing abuse",
  other: "Other",
};

function reportStateBadge(state: MarketplaceListingReportState): { kind: MpBadgeKind; label: string } {
  switch (state) {
    case "open":
      return { kind: "graded", label: "Open" };
    case "dismissed":
      return { kind: "raw", label: "Dismissed" };
    case "unlisted":
      return { kind: "sold", label: "Unlisted" };
    default:
      return { kind: "raw", label: state };
  }
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function filterHref(state: MarketplaceListingReportState) {
  return `/admin/marketplace/moderation?state=${state}`;
}

export interface ModerationScreenProps {
  reports: MarketplaceListingReportRow[];
  activeState: MarketplaceListingReportState;
}

export function ModerationScreen({ reports, activeState }: ModerationScreenProps) {
  const emptyTitle = activeState === "open" ? "Queue clear" : `No ${activeState} reports`;
  const emptyHint =
    activeState === "open" ? "No open reports right now." : "Try a different report state.";

  return (
    <>
      <div className="mp-row" style={{ alignItems: "flex-end", marginBottom: 22 }}>
        <div className="mp-stack" style={{ gap: 5 }}>
          <span className="mp-eyebrow">Moderation</span>
          <h1 className="mp-h1" style={{ fontSize: 26 }}>
            Reported listings
          </h1>
          <p className="mp-lead" style={{ fontSize: 13 }}>
            Listings go live automatically -- you only step in when buyers report a
            problem.
          </p>
        </div>
      </div>

      <div className="mp-row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {REPORT_STATE_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filterHref(filter.value)}
            prefetch={false}
            className={`mp-chip${activeState === filter.value ? " active" : ""}`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <MpEmpty glyph="filter" title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="mpa-table-wrap">
          <table className="mpa-table">
            <thead>
              <tr>
                <th>Listing</th>
                <th>Report</th>
                <th>Reporter</th>
                <th>Reported</th>
                <th>State</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const badge = reportStateBadge(report.report_state);
                return (
                  <tr key={report.id}>
                    <td>
                      <Link
                        href={`/admin/marketplace/listings/${report.listing_id}`}
                        prefetch={false}
                        className="mp-mono"
                        style={{ fontWeight: 700 }}
                      >
                        {shortId(report.listing_id)}
                      </Link>
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      <div className="mp-stack" style={{ gap: 2 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {REASON_LABELS[report.reason_code]}
                        </span>
                        {report.reason_note ? (
                          <span className="mp-small mp-mute">{report.reason_note}</span>
                        ) : null}
                        {report.report_state !== "open" && report.resolution_note ? (
                          <span className="mp-small mp-mute">Resolution: {report.resolution_note}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="mp-mono mp-small">{shortId(report.reporter_account_id)}</td>
                    <td className="mp-small mp-mute mp-mono">
                      {new Date(report.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <MpBadge kind={badge.kind}>{badge.label}</MpBadge>
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      <ModerationActions
                        report={{
                          id: report.id,
                          listing_id: report.listing_id,
                          report_state: report.report_state,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
