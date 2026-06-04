import Link from "next/link";
import type {
  YnotAdminUserDetail,
  YnotCollectionItem,
  YnotShippingItem,
  YnotShippingRequest,
} from "@/features/ynot/types";
import {
  isActiveYnotShippingStatus,
  isFinalYnotShippingStatus,
  ynotShippingTrackingLabel,
} from "@/features/ynot/shipping-status";
import {
  AdminCard,
  AdminCardHead,
  AdminIcon,
  AdminKPI,
  AdminPill,
  AdminStatusPill,
  fmtCoin,
  fmtTHB,
} from "@/features/ynot/admin";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  return date.toLocaleString();
}

function sourcePack(item?: YnotCollectionItem | YnotShippingItem) {
  return item?.sourceCampaignTitle ?? "No pack source";
}

function shippingReward(request: YnotShippingRequest) {
  const first = request.items?.[0];
  if (!first) return "No reward linked";
  const extra = (request.items?.length ?? 0) > 1 ? ` +${(request.items?.length ?? 1) - 1}` : "";
  return `${first.cardName}${extra}`;
}

export function AdminUser360({ detail }: { detail: YnotAdminUserDetail }) {
  const activeShipments = detail.shipping.filter(
    (request) => isActiveYnotShippingStatus(request.status),
  ).length;
  const shipped = detail.shipping.filter(
    (request) => isFinalYnotShippingStatus(request.status),
  ).length;
  const defaultAddress = detail.addresses.find((address) => address.isDefault) ?? detail.addresses[0];

  return (
    <div className="grid gap-4">
      <div className="kpi-grid">
        <AdminKPI
          label="Wallet balance"
          value={fmtCoin(detail.wallet.balanceCoins)}
          color="var(--a-gold)"
        />
        <AdminKPI
          label="Collection rewards"
          value={detail.collection.length}
          color="var(--a-mint)"
        />
        <AdminKPI
          label="Pack opens"
          value={detail.gachaOpens.length}
          color="var(--a-sky)"
        />
        <AdminKPI
          label="Active shipping"
          value={activeShipments}
          delta={`${shipped} sent`}
          deltaDir={activeShipments ? "down" : "up"}
          color="var(--a-rose)"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <AdminCard>
          <AdminCardHead
            label="User profile"
            title={detail.profile.displayName}
            actions={<AdminStatusPill status={detail.profile.status ?? "active"} />}
          />
          <div className="list">
            <div className="list-row">
              <AdminIcon name="users" />
              <div>
                <strong>{detail.profile.fullName ?? detail.profile.displayName}</strong>
                <div className="row-sub">{detail.profile.email ?? "No email"}</div>
                <div className="row-sub">Phone: {detail.profile.phone ?? "-"}</div>
                <div className="row-sub">
                  LINE: {detail.profile.lineDisplayName ?? detail.profile.lineUserId ?? "not linked"}
                </div>
                <div className="row-sub mono">Profile: {detail.profile.profileId}</div>
              </div>
            </div>
            <div className="list-row">
              <AdminIcon name="clock" />
              <div>
                <strong>Account timeline</strong>
                <div className="row-sub">Created {formatDate(detail.profile.createdAt)}</div>
                <div className="row-sub">Last seen {formatDate(detail.profile.lastSeenAt)}</div>
                <div className="row-sub">
                  Language: {detail.profile.preferredLanguage ?? "-"}
                </div>
              </div>
            </div>
            <div className="list-row">
              <AdminIcon name="globe" />
              <div>
                <strong>{defaultAddress?.label ?? "No saved address"}</strong>
                {defaultAddress ? (
                  <>
                    <div className="row-sub">{defaultAddress.recipientName ?? "-"}</div>
                    <div className="row-sub">{defaultAddress.phone ?? "-"}</div>
                    <div className="row-sub">
                      {[
                        defaultAddress.addressLine1,
                        defaultAddress.addressLine2,
                        defaultAddress.subdistrict,
                        defaultAddress.district,
                        defaultAddress.province,
                        defaultAddress.postalCode,
                        defaultAddress.country,
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    </div>
                  </>
                ) : (
                  <div className="row-sub">Customer must add a complete address before shipping.</div>
                )}
              </div>
            </div>
          </div>
        </AdminCard>

        <div className="grid gap-4">
          <AdminCard>
            <AdminCardHead
              label="Shipping history"
              title={`Orders from this user - ${detail.shipping.length}`}
              actions={
                <Link className="btn btn-ghost" href="/admin/shipping">
                  <AdminIcon name="truck" />
                  Open shipping queue
                </Link>
              }
            />
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Reward</th>
                    <th>Pack</th>
                    <th>Status</th>
                    <th>Tracking</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.shipping.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted" style={{ padding: 24 }}>
                        No shipping requests yet.
                      </td>
                    </tr>
                  ) : (
                    detail.shipping.map((request) => {
                      const first = request.items?.[0];
                      return (
                        <tr key={request.id}>
                          <td className="mono" style={{ fontWeight: 700 }}>
                            {request.publicCode}
                          </td>
                          <td>{shippingReward(request)}</td>
                          <td>{sourcePack(first)}</td>
                          <td>
                            <AdminStatusPill status={request.status} />
                          </td>
                          <td className="mono" style={{ fontSize: 11 }}>
                            {ynotShippingTrackingLabel(request)}
                          </td>
                          <td className="mono muted" style={{ fontSize: 11 }}>
                            {formatDate(request.createdAt)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHead
              label="Reward history"
              title={`Collection - ${detail.collection.length}`}
              actions={<AdminPill kind="default">{detail.gachaOpens.length} pack opens</AdminPill>}
            />
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Reward</th>
                    <th>Pack</th>
                    <th>Status</th>
                    <th>Value</th>
                    <th>Acquired</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.collection.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted" style={{ padding: 24 }}>
                        No collection rewards yet.
                      </td>
                    </tr>
                  ) : (
                    detail.collection.slice(0, 30).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="row-title">{item.cardName}</div>
                          <div className="row-sub mono" style={{ fontSize: 11 }}>
                            {item.cardCode ?? "No code"}
                            {item.serialNo ? ` | Serial ${item.serialNo}` : ""}
                          </div>
                        </td>
                        <td>{sourcePack(item)}</td>
                        <td>
                          <AdminStatusPill status={item.status} />
                        </td>
                        <td>{fmtCoin(item.convertCoinValue ?? 0)}</td>
                        <td className="mono muted" style={{ fontSize: 11 }}>
                          {formatDate(item.acquiredAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </AdminCard>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard>
          <AdminCardHead label="Pack opens" title="Latest pull history" />
          <div className="list">
            {detail.gachaOpens.length === 0 ? (
              <div className="list-row text-mute">No pack opens yet.</div>
            ) : (
              detail.gachaOpens.slice(0, 20).map((open) => (
                <div className="list-row" key={open.id}>
                  <AdminIcon name="sparkles" />
                  <div>
                    <strong>{open.campaignTitle}</strong>
                    <div className="row-sub mono">
                      {open.publicCode} | {open.quantity} item(s) | {fmtCoin(open.costCoins)}
                    </div>
                    <div className="row-sub">
                      {open.rewards
                        .slice(0, 3)
                        .map((reward) => reward.cardName)
                        .join(", ") || "No reward rows"}
                    </div>
                    <div className="row-sub">{formatDate(open.openedAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Wallet and payment"
            title="Ledger and top-up history"
            actions={<AdminPill kind="live">{fmtCoin(detail.wallet.balanceCoins)}</AdminPill>}
          />
          <div className="list">
            {detail.walletLedger.slice(0, 12).map((entry) => (
              <div className="list-row" key={entry.id}>
                <AdminIcon name="coin" />
                <div>
                  <strong>
                    {entry.amountCoins > 0 ? "+" : ""}
                    {fmtCoin(entry.amountCoins)}
                  </strong>
                  <div className="row-sub mono">
                    {fmtCoin(entry.balanceBefore)}
                    {" -> "}
                    {fmtCoin(entry.balanceAfter)}
                  </div>
                  <div className="row-sub">
                    {entry.entryType}
                    {entry.referenceType ? ` | ${entry.referenceType}` : ""} |{" "}
                    {formatDate(entry.createdAt)}
                  </div>
                </div>
              </div>
            ))}
            {detail.walletLedger.length === 0 ? (
              <div className="list-row text-mute">No wallet ledger entries.</div>
            ) : null}
            {detail.topUps.slice(0, 8).map((topUp) => (
              <div className="list-row" key={topUp.id ?? topUp.publicCode}>
                <AdminIcon name="tag" />
                <div>
                  <strong>
                    {topUp.publicCode} | {fmtTHB(topUp.amountThb)}
                  </strong>
                  <div className="row-sub">
                    {fmtCoin(topUp.coinAmount)} | {topUp.status} |{" "}
                    {formatDate(topUp.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHead
            label="Support timeline"
            title={`Audit events - ${detail.auditTimeline.length}`}
          />
          <div className="list">
            {detail.auditTimeline.length === 0 ? (
              <div className="list-row text-mute">No support audit events.</div>
            ) : (
              detail.auditTimeline.slice(0, 20).map((event) => (
                <div className="list-row" key={event.id}>
                  <AdminIcon name="clock" />
                  <div>
                    <strong>{event.label}</strong>
                    <div className="row-sub">{formatDate(event.createdAt)}</div>
                    <div className="row-sub">
                      {event.previousStatus ? `${event.previousStatus} -> ` : ""}
                      {event.status ?? "status unchanged"}
                    </div>
                    {event.trackingNumber ? (
                      <div className="row-sub mono">
                        {event.trackingProvider ?? "tracking"} | {event.trackingNumber}
                      </div>
                    ) : null}
                    {event.note ? <div className="row-sub">{event.note}</div> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
