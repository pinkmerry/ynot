import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminStatusPill,
  fmtTHB,
} from "@/features/ynot/admin";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { marketplaceConfig } from "@/lib/marketplace/config";
import { getAdminSellerSubmissionDetail } from "@/lib/marketplace/seller-trust";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";

export const dynamic = "force-dynamic";

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "-";
}

function detailRows(rows: Array<[string, string | number | null | undefined]>) {
  return (
    <dl className="marketplace-listing-detail-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function AdminSellerSubmissionDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const data = await getYnotDashboardSlice({});
  const admin = await resolveAdminSession();
  const config = marketplaceConfig();
  const { submissionId } = await params;

  if (!admin || (config.ownerOnly && admin.adminRole !== "owner")) {
    return (
      <AdminGate viewer={data.viewer}>
        <AdminFrame
          viewer={data.viewer}
          active="/admin/marketplace"
          trail={["Admin", "Marketplace", "Seller request"]}
          surface="marketplace"
          eyebrow="Marketplace"
          title="Owner-only prelaunch"
          desc="Seller request evidence is locked to owner accounts during MVP testing."
        >
          <AdminCard>
            <AdminCardHead label="Access" title="Owner account required" />
            <p className="muted">This page stops before marketplace service-role reads.</p>
          </AdminCard>
        </AdminFrame>
      </AdminGate>
    );
  }

  let submission: Awaited<ReturnType<typeof getAdminSellerSubmissionDetail>>;
  try {
    submission = await getAdminSellerSubmissionDetail({ admin, submissionId });
  } catch (error) {
    if (
      error instanceof MarketplaceServiceError &&
      error.code === "marketplace_seller_submission_not_found"
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/marketplace"
        trail={["Admin", "Marketplace", "Seller request"]}
        surface="marketplace"
        eyebrow="Seller request"
        title={submission.submission_number}
        desc="Admin-only seller intake detail with uploaded image perspectives, validation evidence, state, and action history."
        actions={
          <Link href="/admin/marketplace" className="btn btn-sm" prefetch={false}>
            Back to marketplace
          </Link>
        }
      >
        <AdminCard>
          <AdminCardHead
            label="Submission state"
            title={submission.title_snapshot}
            actions={<AdminStatusPill status={submission.status} />}
          />
          {detailRows([
            ["Submission ID", submission.id],
            ["Seller account", submission.marketplace_account_id],
            ["YNOT profile", submission.ynot_profile_id],
            ["Request ID", submission.request_id],
            ["Item type", submission.item_type],
            ["Condition", submission.condition_code],
            ["Grade", submission.grade_label],
            ["Language", submission.language],
            ["Certificate", submission.cert_number],
            ["Asking price", fmtTHB(submission.asking_price_satang / 100)],
            ["Seller fee", fmtTHB(submission.seller_marketplace_fee_satang / 100)],
            ["Payout preview", fmtTHB(submission.payout_preview_satang / 100)],
            ["Approved inventory", submission.approved_inventory_id],
            ["Listing", submission.listing_id],
            ["Version", submission.version],
            ["Updated", dateLabel(submission.updated_at)],
          ])}
          {submission.listing_id ? (
            <div className="actions" style={{ marginTop: 16 }}>
              <Link
                href={`/admin/marketplace/listings/${submission.listing_id}`}
                className="btn btn-sm"
                prefetch={false}
              >
                Open listing evidence
              </Link>
              <Link
                href={`/marketplace/listings/${submission.listing_id}`}
                className="btn btn-sm"
                prefetch={false}
              >
                Open public listing
              </Link>
            </div>
          ) : null}
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Uploaded images"
            title={`Photo evidence · ${submission.photos.length}/10`}
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Perspective</th>
                  <th>Status</th>
                  <th>Storage path</th>
                  <th>Validation</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {submission.photos.map((photo) => (
                  <tr key={photo.id}>
                    <td className="num tnum">{photo.display_order}</td>
                    <td>{photo.photo_role}</td>
                    <td><AdminStatusPill status={photo.status} /></td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {photo.storage_bucket}/{photo.storage_path}
                    </td>
                    <td>
                      <span className="row-sub" style={{ display: "block" }}>
                        {photo.content_type ?? "-"} ·{" "}
                        {photo.file_size_bytes
                          ? `${photo.file_size_bytes.toLocaleString()} bytes`
                          : "-"}
                      </span>
                      <span className="row-sub mono" style={{ display: "block" }}>
                        sha {shortId(photo.file_sha256)}
                      </span>
                    </td>
                    <td className="muted mono" style={{ fontSize: 11 }}>
                      {dateLabel(photo.created_at)}
                    </td>
                  </tr>
                ))}
                {submission.photos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 24 }}>
                      No seller images have been uploaded.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Handoff"
            title={`Handoff confirmations · ${submission.handoffConfirmations.length}`}
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Carrier</th>
                  <th>Tracking</th>
                  <th>Seller note</th>
                  <th>Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {submission.handoffConfirmations.map((handoff) => (
                  <tr key={handoff.id}>
                    <td>{handoff.handoff_method}</td>
                    <td>{handoff.carrier ?? "-"}</td>
                    <td className="mono">{handoff.tracking_code ?? "-"}</td>
                    <td>{handoff.seller_note ?? "-"}</td>
                    <td className="muted mono" style={{ fontSize: 11 }}>
                      {dateLabel(handoff.confirmed_at)}
                    </td>
                  </tr>
                ))}
                {submission.handoffConfirmations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: 24 }}>
                      No handoff confirmation yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Action history"
            title={`Events · ${submission.events.length}`}
          />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Status change</th>
                  <th>Actor</th>
                  <th>Payload</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {submission.events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <span className="row-title">{event.event_type}</span>
                      <span className="row-sub mono" style={{ display: "block" }}>
                        req {shortId(event.request_id)}
                      </span>
                    </td>
                    <td>
                      {event.before_status ?? "-"} -&gt; {event.after_status ?? "-"}
                    </td>
                    <td>{event.actor_admin_role ?? "seller"}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {JSON.stringify(event.event_payload)}
                    </td>
                    <td className="muted mono" style={{ fontSize: 11 }}>
                      {dateLabel(event.created_at)}
                    </td>
                  </tr>
                ))}
                {submission.events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: 24 }}>
                      No seller request events yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </AdminFrame>
    </AdminGate>
  );
}
