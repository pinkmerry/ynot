import Link from "next/link";
import type { SellerPayoutQueueRow } from "@/lib/marketplace/payouts";
import { MpBadge, MpEmpty, type MpBadgeKind } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";
import { PayoutActions } from "./PayoutActions";

/**
 * Marketplace admin Seller payouts screen -- filter chips by payout state,
 * a dense payout table, and per-row release/mark-transferred actions.
 * Recreated (data-driven, not 1:1 markup) from marketplace-admin-2.jsx's
 * AdminPayouts (prototype: /Users/pinkmerry/Downloads/ynott/project/
 * marketplace-admin-2.jsx:85-125).
 *
 * The prototype invents a seller handle, bank account label, and "Orders"
 * summary column. The real marketplace_seller_payouts row
 * (src/lib/marketplace/payouts.ts's SellerPayoutQueueRow) carries none of
 * that -- no seller identity, no bank details, exactly one order per payout
 * row -- so this table shows what's actually there instead: links into the
 * real order/listing detail pages plus the gross/fee/net satang fields and
 * the real payout_state/release_eligible_at/released_at condition.
 *
 * Pure presentational server component: the page (page.tsx) loads
 * `payouts` up front via listSellerPayoutQueue() (filtered in-memory by
 * state -- see page.tsx's doc comment for why that filter can't be pushed
 * into the query) and passes it down as a prop -- this file only renders
 * it, same split as OrdersScreen.tsx/page.tsx and DisputesScreen.tsx/
 * page.tsx.
 */

const PAYOUT_STATE_FILTERS: { value: string | null; label: string }[] = [
  { value: null, label: "Needs action" },
  { value: "held", label: "Held" },
  { value: "eligible", label: "Eligible" },
  { value: "released", label: "Released" },
];

function payoutStateBadge(state: string): { kind: MpBadgeKind; label: string } {
  switch (state) {
    case "held":
      return { kind: "graded", label: "Held" };
    case "eligible":
      return { kind: "official", label: "Eligible" };
    case "released":
      return { kind: "community", label: "Released" };
    default:
      return { kind: "raw", label: state.replace(/_/g, " ") };
  }
}

/** Real-field release condition, derived from payout_state plus whichever
 * of release_eligible_at/released_at applies -- no synthetic "10-day hold
 * ends today" copy invented beyond what those two timestamps say. */
function releaseConditionLabel(payout: SellerPayoutQueueRow): string {
  if (payout.payout_state === "released") {
    return payout.released_at
      ? `Released ${new Date(payout.released_at).toLocaleDateString()} · awaiting transfer`
      : "Released · awaiting transfer";
  }
  if (payout.payout_state === "eligible") {
    return "Eligible for release";
  }
  if (!payout.release_eligible_at) return "Hold period not started";
  const eligibleAt = new Date(payout.release_eligible_at);
  return eligibleAt.getTime() <= Date.now()
    ? "Hold ended · pending sweep"
    : `Holds until ${eligibleAt.toLocaleDateString()}`;
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function filterHref(state: string | null) {
  return state ? `/admin/marketplace/payouts?state=${state}` : "/admin/marketplace/payouts";
}

export interface PayoutsScreenProps {
  payouts: SellerPayoutQueueRow[];
  activeState: string | null;
}

export function PayoutsScreen({ payouts, activeState }: PayoutsScreenProps) {
  const emptyTitle = activeState ? `No ${activeState} payouts` : "Nothing needs action";
  const emptyHint = activeState
    ? "Try a different payout state."
    : "No held or eligible payouts right now.";

  const eligibleSatang = payouts
    .filter((payout) => payout.payout_state === "eligible")
    .reduce((total, payout) => total + Number(payout.payout_amount_satang ?? 0), 0);

  return (
    <>
      <div className="mp-row" style={{ alignItems: "flex-end", marginBottom: 22 }}>
        <div className="mp-stack" style={{ gap: 5 }}>
          <span className="mp-eyebrow">Money</span>
          <h1 className="mp-h1" style={{ fontSize: 26 }}>
            Seller payouts
          </h1>
          <p className="mp-lead" style={{ fontSize: 13 }}>
            Money releases to the seller once the hold clears and no dispute is
            blocking it, then waits here until you confirm the bank transfer.
          </p>
        </div>
        {eligibleSatang > 0 ? (
          <span className="mp-coin-pill" style={{ fontSize: 13 }}>
            {formatThb(eligibleSatang)} eligible
          </span>
        ) : null}
      </div>

      <div className="mp-row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {PAYOUT_STATE_FILTERS.map((filter) => (
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

      {payouts.length === 0 ? (
        <MpEmpty glyph="swap" title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="mpa-table-wrap">
          <table className="mpa-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Listing</th>
                <th style={{ textAlign: "right" }}>Gross</th>
                <th style={{ textAlign: "right" }}>Fee</th>
                <th style={{ textAlign: "right" }}>Net payout</th>
                <th>Status</th>
                <th>Release condition</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => {
                const badge = payoutStateBadge(payout.payout_state);
                return (
                  <tr key={payout.id}>
                    <td>
                      <Link
                        href={`/admin/marketplace/orders/${payout.order_id}`}
                        prefetch={false}
                        className="mp-mono"
                        style={{ fontWeight: 700 }}
                      >
                        {shortId(payout.order_id)}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/admin/marketplace/listings/${payout.listing_id}`}
                        prefetch={false}
                        className="mp-mono mp-small mp-mute"
                      >
                        {shortId(payout.listing_id)}
                      </Link>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatThb(payout.item_price_satang)}
                    </td>
                    <td className="num" style={{ textAlign: "right", color: "var(--mp-rose)" }}>
                      −{formatThb(payout.seller_fee_satang)}
                    </td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 800 }}>
                      {formatThb(payout.payout_amount_satang)}
                    </td>
                    <td>
                      <MpBadge kind={badge.kind}>{badge.label}</MpBadge>
                    </td>
                    <td className="mp-small mp-mute">{releaseConditionLabel(payout)}</td>
                    <td style={{ verticalAlign: "top" }}>
                      <PayoutActions
                        payout={{
                          id: payout.id,
                          order_id: payout.order_id,
                          payout_state: payout.payout_state,
                          payout_amount_satang: payout.payout_amount_satang,
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
