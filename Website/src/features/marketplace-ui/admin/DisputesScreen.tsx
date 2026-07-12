import Link from "next/link";
import type {
  MarketplaceRefundRequestRow,
  MarketplaceRefundRequestState,
} from "@/lib/marketplace/disputes";
import { MpBadge, MpEmpty, type MpBadgeKind } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";
import { DisputeActions } from "./DisputeActions";

/**
 * Marketplace admin Disputes & refunds screen -- filter chips by refund
 * state, one panel per dispute, and per-dispute approve/reject/
 * mark-refunded actions. Recreated (data-driven, not 1:1 markup) from
 * marketplace-admin-2.jsx's AdminDisputes (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-2.jsx:
 * 128-182).
 *
 * The prototype invents a card/buyer-handle/seller-handle/evidence-photos
 * shape and opens a CompareModal. The real marketplace_refund_requests
 * row (Database/marketplace-supabase/migrations/20260628100000_
 * marketplace_official_shop.sql:167-180, extended by 20260704123000_
 * marketplace_dispute_open_and_admin_reads.sql:17-40) carries order_id/
 * refund_state/reason_code/admin_note/buyer_reason/refund_amount_satang/
 * opened_by -- no photos -- so each panel below shows the real fields and
 * the running admin_note thread (admin_note is appended to, not
 * replaced, on every transition -- see marketplace_record_refund_
 * transition's concat_ws call) instead of a fabricated photo comparison.
 *
 * Pure presentational server component: the page (page.tsx) loads
 * `disputes` up front via listAdminRefundRequests({ admin, state, limit: 100 })
 * and passes it down as a prop -- this file only renders it, same split
 * as OrdersScreen.tsx/page.tsx.
 */

const DISPUTE_STATE_FILTERS: { value: MarketplaceRefundRequestState | null; label: string }[] = [
  { value: null, label: "Needs action" },
  { value: "requested", label: "Requested" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "refunded", label: "Refunded" },
];

function refundStateBadge(state: MarketplaceRefundRequestState): { kind: MpBadgeKind; label: string } {
  switch (state) {
    case "requested":
      return { kind: "graded", label: "Requested" };
    case "approved":
      return { kind: "official", label: "Approved" };
    case "rejected":
      return { kind: "sold", label: "Rejected" };
    case "refunded":
      return { kind: "community", label: "Refunded" };
    default:
      return { kind: "raw", label: state };
  }
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function filterHref(state: MarketplaceRefundRequestState | null) {
  return state ? `/admin/marketplace/disputes?state=${state}` : "/admin/marketplace/disputes";
}

export interface DisputesScreenProps {
  disputes: MarketplaceRefundRequestRow[];
  activeState: MarketplaceRefundRequestState | null;
}

export function DisputesScreen({ disputes, activeState }: DisputesScreenProps) {
  const emptyTitle = activeState ? `No ${activeState} disputes` : "Nothing needs action";
  const emptyHint = activeState
    ? "Try a different refund state."
    : "No open or approved disputes right now.";

  return (
    <>
      <div className="mp-row" style={{ alignItems: "flex-end", marginBottom: 22 }}>
        <div className="mp-stack" style={{ gap: 5 }}>
          <span className="mp-eyebrow">Trust</span>
          <h1 className="mp-h1" style={{ fontSize: 26 }}>
            Disputes &amp; refunds
          </h1>
          <p className="mp-lead" style={{ fontSize: 13 }}>
            Buyers can dispute within the money policy&apos;s window after delivery.
            Payout stays frozen until you resolve it.
          </p>
        </div>
      </div>

      <div className="mp-row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {DISPUTE_STATE_FILTERS.map((filter) => (
          <Link
            key={filter.label}
            href={filterHref(filter.value)}
            prefetch={false}
            className={`mp-chip${activeState === filter.value ? " active" : ""}`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {disputes.length === 0 ? (
        <MpEmpty glyph="swap" title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="mp-stack" style={{ gap: 12 }}>
          {disputes.map((dispute) => {
            const badge = refundStateBadge(dispute.refund_state);
            return (
              <div
                key={dispute.id}
                className="mp-panel"
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div className="mp-row" style={{ gap: 12, flexWrap: "wrap" }}>
                  <div className="mp-stack" style={{ gap: 2, flex: 1, minWidth: 200 }}>
                    <Link
                      href={`/admin/marketplace/orders/${dispute.order_id}`}
                      prefetch={false}
                      className="mp-mono"
                      style={{ fontWeight: 700, fontSize: 14 }}
                    >
                      Order {shortId(dispute.order_code ?? dispute.order_id)}
                    </Link>
                    <span className="mp-small mp-mute mp-mono">
                      {dispute.opened_by === "buyer" ? "Opened by buyer" : "Opened by admin"} ·{" "}
                      {new Date(dispute.created_at).toLocaleString()}
                    </span>
                  </div>
                  <span className="mp-mono" style={{ fontWeight: 800, fontSize: 16 }}>
                    {formatThb(dispute.refund_amount_satang)}
                  </span>
                  <MpBadge kind={badge.kind}>{badge.label}</MpBadge>
                </div>

                <div className="mp-alert mp-alert-rose" style={{ padding: "10px 13px" }}>
                  <span>
                    <b>{dispute.opened_by === "buyer" ? "Buyer's claim: " : "Reason: "}</b>
                    {dispute.buyer_reason ?? dispute.reason_code.replace(/_/g, " ")}
                  </span>
                </div>

                {dispute.admin_note ? (
                  <div className="mp-stack" style={{ gap: 2 }}>
                    <span className="mp-small mp-mute" style={{ fontWeight: 700 }}>
                      Admin notes
                    </span>
                    <p className="mp-small mp-mute" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                      {dispute.admin_note}
                    </p>
                  </div>
                ) : null}

                <span className="mp-small mp-mute">
                  Order payment: {dispute.order_payment_state?.replace(/_/g, " ") ?? "unknown"} ·
                  fulfilment: {dispute.order_fulfilment_state?.replace(/_/g, " ") ?? "unknown"}
                </span>

                <DisputeActions
                  dispute={{
                    id: dispute.id,
                    order_id: dispute.order_id,
                    refund_state: dispute.refund_state,
                    refund_amount_satang: dispute.refund_amount_satang,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
