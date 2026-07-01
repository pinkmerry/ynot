import Link from "next/link";
import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { MarketplaceMoneyPolicyControls } from "@/features/ynot/MarketplaceMoneyPolicyControls";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
  AdminKPI,
  AdminStatusPill,
  fmtTHB,
} from "@/features/ynot/admin";
import { buildMarketplaceOpsSnapshot } from "@/lib/marketplace/ops-snapshot";

export const dynamic = "force-dynamic";

function paymentStatus(status: string) {
  if (status === "paid") return "live";
  if (status === "payment_submitted") return "pending";
  if (status === "failed") return "closed";
  return "draft";
}

function sellerSubmissionStatus(status: string) {
  if (["inspection_passed", "inventory_created", "listed", "sold"].includes(status)) {
    return "live";
  }
  if (
    [
      "submitted",
      "submitted_for_review",
      "intake_instruction_sent",
      "handoff_confirmed",
      "received",
    ].includes(status)
  ) {
    return "pending";
  }
  if (["inspection_failed", "cancelled", "returned"].includes(status)) {
    return "closed";
  }
  return "draft";
}

export default async function AdminMarketplacePage() {
  const data = await getYnotDashboardSlice({});
  const admin = await resolveAdminSession();
  const snapshot = await buildMarketplaceOpsSnapshot(admin);
  const {
    config,
    dashboard,
    sellerPayouts,
    sellerSubmissions,
    moneyPolicy,
    queueSummary,
    reconciliationItems,
    sellerPayoutTotalSatang,
    sellerSubmissionTotalSatang,
    sellerSubmissionReviewCount,
  } = snapshot;

  if (config.ownerOnly && admin?.adminRole !== "owner") {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminFrame
          viewer={data.viewer}
          active="/admin/marketplace"
          trail={["Admin", "Marketplace"]}
          surface="marketplace"
          eyebrow="Marketplace"
          title="Owner-only prelaunch"
          desc="Marketplace money, seller payout, refund, and reconciliation queues are locked to owner accounts during MVP testing."
        >
          <AdminCard>
            <AdminCardHead
              label="Launch gate"
              title="Owner account required"
              actions={<span className="chip">marketplace_owner_required</span>}
            />
            <p className="muted">
              This page stops before Marketplace Supabase reads while the
              owner-only flag is enabled.
            </p>
          </AdminCard>
        </AdminFrame>
      </AdminGate>
    );
  }

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/marketplace"
        trail={["Admin", "Marketplace"]}
        surface="marketplace"
        eyebrow="Marketplace"
        title="Marketplace ops dashboard"
        desc="Today-ready owner console for payment review, fulfilment, seller intake, payout release, refunds, reconciliation, shipping, service fee, and revenue."
        badges={{
          "/admin/marketplace": dashboard.summary.paymentReviewCount || undefined,
        }}
        actions={
          <Link href="/marketplace" className="btn btn-sm" prefetch={false}>
            <AdminIcon name="globe" size={12} />
            Open marketplace
          </Link>
        }
      >
        <div className="kpi-grid">
          <AdminKPI
            label="Paid revenue"
            value={fmtTHB(dashboard.summary.paidRevenueSatang / 100)}
            delta={`${dashboard.summary.paidOrderCount} paid orders`}
            color="var(--a-gold)"
            spark={[6, 9, 8, 12, 18, 16, 22, 26, 30, 34, 38, 42]}
          />
          <AdminKPI
            label="Payment review"
            value={dashboard.summary.paymentReviewCount.toLocaleString()}
            delta="submitted slips"
            color="var(--a-sky)"
            spark={[2, 2, 3, 4, 4, 5, 6, 5, 4, 3, 2, 1]}
          />
          <AdminKPI
            label="Fulfilment open"
            value={dashboard.summary.fulfilmentOpenCount.toLocaleString()}
            delta="paid not completed"
            color="var(--a-mint)"
            spark={[1, 3, 2, 4, 6, 5, 7, 6, 8, 7, 5, 4]}
          />
          <AdminKPI
            label="Refund review"
            value={dashboard.summary.refundReviewCount.toLocaleString()}
            delta="admin handled"
            color="var(--a-rose)"
            spark={[0, 1, 0, 1, 2, 1, 1, 2, 1, 0, 1, 0]}
          />
          <AdminKPI
            label="Seller payouts"
            value={fmtTHB(sellerPayoutTotalSatang / 100)}
            delta={`${sellerPayouts.length} held/released`}
            color="var(--a-violet)"
            spark={[1, 1, 2, 3, 3, 4, 5, 4, 6, 5, 7, 8]}
          />
          <AdminKPI
            label="Seller submissions"
            value={sellerSubmissions.length.toLocaleString()}
            delta={`${sellerSubmissionReviewCount} waiting review · ${fmtTHB(sellerSubmissionTotalSatang / 100)} listed value`}
            color="var(--a-mint)"
            spark={[1, 2, 3, 4, 5, 5, 6, 7, 6, 8, 9, 10]}
          />
          <AdminKPI
            label="Reconciliation"
            value={queueSummary.reconciliationOpenCount.toLocaleString()}
            delta={`${queueSummary.providerEventOpenCount} provider events`}
            color="var(--a-rose)"
            spark={[0, 1, 1, 2, 2, 1, 3, 4, 3, 2, 2, 1]}
          />
        </div>

        <AdminCard id="sell-requests">
          <AdminCardHead
            label="Money policy"
            title="Fees and shipping"
            actions={<span className="chip">Active snapshot</span>}
          />
          <MarketplaceMoneyPolicyControls policy={moneyPolicy} />
        </AdminCard>

        <AdminCard id="orders">
          <AdminCardHead
            label="Ops hardening"
            title="Queue state"
            actions={
              <span className="chip">
                Redacted counts only
              </span>
            }
          />
          <div className="kpi-grid">
            <AdminKPI
              label="Payment review"
              value={queueSummary.paymentReviewCount.toLocaleString()}
              delta="bounded queue read"
              color="var(--a-sky)"
              spark={[1, 2, 2, 3, 2, 3, 4, 3, 2, 2, 1, 1]}
            />
            <AdminKPI
              label="Refund open"
              value={queueSummary.refundOpenCount.toLocaleString()}
              delta="admin workflow"
              color="var(--a-rose)"
              spark={[0, 0, 1, 1, 2, 1, 2, 1, 1, 0, 1, 0]}
            />
            <AdminKPI
              label="Payout blocked"
              value={queueSummary.payoutBlockedCount.toLocaleString()}
              delta="refund/reconciliation guarded"
              color="var(--a-violet)"
              spark={[2, 2, 3, 3, 4, 5, 4, 4, 3, 3, 2, 2]}
            />
          </div>
        </AdminCard>

        <AdminCard id="payouts">
          <AdminCardHead
            label="Seller intake"
            title={`Sell requests · ${sellerSubmissions.length}`}
            actions={<span className="chip">Submission, photos, fee, payout</span>}
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Status</th>
                  <th>Item detail</th>
                  <th>Seller</th>
                  <th>Photos</th>
                  <th>Money</th>
                  <th>Links</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {sellerSubmissions.map((submission) => (
                  <tr key={submission.id}>
                    <td>
                      <Link
                        href={`/admin/marketplace/seller-submissions/${submission.id}`}
                        className="row-title mono"
                        prefetch={false}
                      >
                        {submission.submission_number}
                      </Link>
                      <span className="row-sub mono" style={{ display: "block" }}>
                        {String(submission.id).slice(0, 8)}
                      </span>
                    </td>
                    <td>
                      <AdminStatusPill status={sellerSubmissionStatus(submission.status)} />
                      <span className="row-sub" style={{ display: "block" }}>
                        {submission.status}
                      </span>
                    </td>
                    <td>
                      <span className="row-title">{submission.title_snapshot}</span>
                      <span className="row-sub" style={{ display: "block" }}>
                        {[
                          submission.item_type,
                          submission.condition_code,
                          submission.grade_label,
                          submission.language,
                          submission.cert_number,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {submission.admin_visible_note ? (
                        <span className="row-sub" style={{ display: "block" }}>
                          {submission.admin_visible_note}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className="row-title mono">
                        {String(submission.marketplace_account_id).slice(0, 8)}
                      </span>
                      <span className="row-sub mono" style={{ display: "block" }}>
                        {String(submission.ynot_profile_id).slice(0, 8)}
                      </span>
                    </td>
                    <td className="num tnum">
                      {submission.photo_count.toLocaleString()}
                    </td>
                    <td>
                      <span className="row-title num tnum">
                        {fmtTHB(Number(submission.asking_price_satang ?? 0) / 100)}
                      </span>
                      <span className="row-sub" style={{ display: "block" }}>
                        Fee {fmtTHB(Number(submission.seller_marketplace_fee_satang ?? 0) / 100)}
                      </span>
                      <span className="row-sub" style={{ display: "block" }}>
                        Payout {fmtTHB(Number(submission.payout_preview_satang ?? 0) / 100)}
                      </span>
                    </td>
                    <td>
                      <span className="row-sub mono" style={{ display: "block" }}>
                        inv {submission.approved_inventory_id ? String(submission.approved_inventory_id).slice(0, 8) : "—"}
                      </span>
                      {submission.listing_id ? (
                        <Link
                          href={`/admin/marketplace/listings/${submission.listing_id}`}
                          className="row-sub mono"
                          style={{ display: "block" }}
                          prefetch={false}
                        >
                          list {String(submission.listing_id).slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="row-sub mono" style={{ display: "block" }}>
                          list —
                        </span>
                      )}
                    </td>
                    <td className="muted mono" style={{ fontSize: 11 }}>
                      {submission.updated_at
                        ? new Date(submission.updated_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
                {sellerSubmissions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="muted" style={{ padding: 24 }}>
                      No seller sell requests yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <AdminCard id="reconciliation">
          <AdminCardHead
            label="Official shop"
            title={`Orders · ${dashboard.orders.length}`}
            actions={
              config.unavailableReason ? (
                <span className="chip">{config.unavailableReason}</span>
              ) : null
            }
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Payment</th>
                  <th>Fulfilment</th>
                  <th>Refund</th>
                  <th>Total</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link
                        href={`/admin/marketplace/orders/${order.id}`}
                        className="row-title mono"
                        prefetch={false}
                      >
                        {String(order.id).slice(0, 8)}
                      </Link>
                      <Link
                        href={`/admin/marketplace/listings/${order.listing_id}`}
                        className="row-sub mono"
                        style={{ display: "block" }}
                        prefetch={false}
                      >
                        {String(order.listing_id).slice(0, 8)}
                      </Link>
                    </td>
                    <td>
                      <AdminStatusPill status={paymentStatus(order.payment_state)} />
                      <span className="row-sub" style={{ display: "block" }}>
                        {order.payment_state}
                      </span>
                    </td>
                    <td>{order.fulfilment_state}</td>
                    <td>{order.refund_state}</td>
                    <td className="num tnum">
                      {fmtTHB(Number(order.buyer_total_satang ?? 0) / 100)}
                    </td>
                    <td className="muted mono" style={{ fontSize: 11 }}>
                      {order.updated_at
                        ? new Date(order.updated_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
                {dashboard.orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 24 }}>
                      No marketplace orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Seller consignment"
            title={`Seller payout queue · ${sellerPayouts.length}`}
            actions={
              <span className="chip">
                Shipping and buyer service fee stay with YNOT
              </span>
            }
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>State</th>
                  <th>Item</th>
                  <th>Fee</th>
                  <th>Payout</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {sellerPayouts.map((payout) => (
                  <tr key={payout.id}>
                    <td>
                      <Link
                        href={`/admin/marketplace/orders/${payout.order_id}`}
                        className="row-title mono"
                        prefetch={false}
                      >
                        {String(payout.order_id).slice(0, 8)}
                      </Link>
                      <Link
                        href={`/admin/marketplace/listings/${payout.listing_id}`}
                        className="row-sub mono"
                        style={{ display: "block" }}
                        prefetch={false}
                      >
                        {String(payout.listing_id).slice(0, 8)}
                      </Link>
                    </td>
                    <td>{payout.payout_state}</td>
                    <td className="num tnum">
                      {fmtTHB(Number(payout.item_price_satang ?? 0) / 100)}
                    </td>
                    <td className="num tnum">
                      {fmtTHB(Number(payout.seller_fee_satang ?? 0) / 100)}
                    </td>
                    <td className="num tnum">
                      {fmtTHB(Number(payout.payout_amount_satang ?? 0) / 100)}
                    </td>
                    <td className="muted mono" style={{ fontSize: 11 }}>
                      {payout.updated_at
                        ? new Date(payout.updated_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
                {sellerPayouts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 24 }}>
                      No seller payouts waiting.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Reconciliation"
            title={`Open items · ${reconciliationItems.length}`}
            actions={<span className="chip">No raw provider payloads</span>}
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Reason</th>
                  <th>Priority</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {reconciliationItems.slice(0, 20).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="row-title">{item.target_type}</span>
                      <span className="row-sub mono" style={{ display: "block" }}>
                        {String(item.target_id ?? item.order_id ?? item.id).slice(0, 8)}
                      </span>
                    </td>
                    <td>{item.reason_code}</td>
                    <td>{item.priority}</td>
                    <td className="muted mono" style={{ fontSize: 11 }}>
                      {item.updated_at
                        ? new Date(item.updated_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
                {reconciliationItems.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ padding: 24 }}>
                      No open reconciliation items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
