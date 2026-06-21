"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import {
  isActiveYnotShippingStatus,
  isFinalYnotShippingStatus,
  ynotShippingStatusLabels,
  ynotShippingTrackingLabel,
} from "@/features/ynot/shipping-status";
import type { YnotShippingRequest } from "@/features/ynot/types";
import { AdminIcon, type AdminIconName } from "./Icon";
import { AdminPill, AdminStatusPill } from "./primitives";

type AdminShippingActionStatus = Exclude<
  YnotShippingRequest["status"],
  "draft" | "preparing"
>;

function nextShippingStatuses(
  status: YnotShippingRequest["status"],
): AdminShippingActionStatus[] {
  switch (status) {
    case "draft":
      return ["submitted", "cancelled"];
    case "preparing":
      return [];
    case "submitted":
      return ["submitted", "packing", "ready_for_pickup", "shipped", "delivered", "cancelled"];
    case "packing":
      return ["packing", "ready_for_pickup", "shipped", "delivered", "cancelled"];
    case "ready_for_pickup":
      return ["ready_for_pickup", "picked_up", "delivered", "cancelled"];
    case "shipped":
      return ["shipped", "delivered"];
    case "delivered":
      return ["delivered"];
    case "picked_up":
      return ["picked_up"];
    case "cancelled":
      return ["cancelled"];
  }
}

function defaultActionStatus(
  status: YnotShippingRequest["status"],
): AdminShippingActionStatus {
  return nextShippingStatuses(status)[0] ?? "submitted";
}

function isTrackingRequiredForStatus(status: AdminShippingActionStatus) {
  return status === "shipped";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  return date.toLocaleString();
}

function formatAddress(request: YnotShippingRequest) {
  const address = request.addressSnapshot;
  if (!address) return "No address snapshot";
  return [
    address.recipientName,
    address.phone,
    address.addressLine1,
    address.addressLine2,
    address.subdistrict,
    address.district,
    address.province,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(" | ");
}

function expectedRewardCount(request: YnotShippingRequest) {
  return Math.max(request.itemCount ?? 0, request.items?.length ?? 0);
}

function preparedRewardCount(request: YnotShippingRequest) {
  return request.preparedCount ?? request.items?.length ?? 0;
}

function loadedRewardPreviewCount(request: YnotShippingRequest) {
  return request.items?.length ?? 0;
}

function rewardCountLabel(request: YnotShippingRequest) {
  const expected = expectedRewardCount(request);
  if (!expected) return "No linked rewards";
  const prepared = preparedRewardCount(request);
  if (request.status === "preparing" && prepared < expected) {
    return `${prepared.toLocaleString()} / ${expected.toLocaleString()} rewards prepared`;
  }
  return `${expected.toLocaleString()} reward${expected === 1 ? "" : "s"}`;
}

function primaryItemLabel(request: YnotShippingRequest) {
  const item = request.items?.[0];
  const expected = expectedRewardCount(request);
  if (!item) return rewardCountLabel(request);
  const suffix = expected > 1 ? ` +${expected - 1}` : "";
  return `${item.cardName}${suffix}`;
}

function secondaryItemLabel(request: YnotShippingRequest) {
  const item = request.items?.[0];
  if (!item) return rewardCountLabel(request);
  const source = item.sourceCampaignTitle ?? "Pack source pending";
  return `${source}${item.sourceOpenCode ? ` | ${item.sourceOpenCode}` : ""}`;
}

function statusCounts(requests: YnotShippingRequest[]) {
  return {
    submitted: requests.filter((request) => request.status === "submitted").length,
    preparing: requests.filter((request) => request.status === "preparing").length,
    packing: requests.filter((request) => request.status === "packing").length,
    readyForPickup: requests.filter((request) => request.status === "ready_for_pickup").length,
    shipped: requests.filter((request) => request.status === "shipped").length,
    final: requests.filter((request) => isFinalYnotShippingStatus(request.status)).length,
    active: requests.filter((request) => isActiveYnotShippingStatus(request.status)).length,
  };
}

function ShippingDetailSection({
  title,
  summary,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary: ReactNode;
  icon: AdminIconName;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="admin-shipping-detail-section" open={defaultOpen}>
      <summary>
        <span className="admin-shipping-detail-title">
          <AdminIcon name={icon} />
          <strong>{title}</strong>
        </span>
        <span className="admin-shipping-detail-summary">{summary}</span>
        <AdminIcon name="chev-d" />
      </summary>
      <div className="admin-shipping-detail-body">{children}</div>
    </details>
  );
}

export function AdminShippingConsole({
  requests,
}: {
  requests: YnotShippingRequest[];
}) {
  const router = useRouter();
  const counts = useMemo(() => statusCounts(requests), [requests]);
  const [selectedId, setSelectedId] = useState(requests[0]?.id ?? "");
  const selected =
    requests.find((request) => request.id === selectedId) ?? requests[0];
  const [status, setStatus] = useState<AdminShippingActionStatus>(
    selected ? defaultActionStatus(selected.status) : "submitted",
  );
  const statusOptions = useMemo(
    () => (selected ? nextShippingStatuses(selected.status) : []),
    [selected],
  );
  const [trackingProvider, setTrackingProvider] = useState(
    selected?.trackingProvider ?? "",
  );
  const [trackingNumber, setTrackingNumber] = useState(
    selected?.trackingNumber ?? "",
  );
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const trackingRequired = isTrackingRequiredForStatus(status);
  const preparingSelected = selected?.status === "preparing";

  function selectRequest(request: YnotShippingRequest) {
    setSelectedId(request.id);
    setStatus(defaultActionStatus(request.status));
    setTrackingProvider(request.trackingProvider ?? "");
    setTrackingNumber(request.trackingNumber ?? "");
    setNote("");
    setMessage("");
  }

  function submit() {
    if (!selected || preparingSelected) return;
    startTransition(async () => {
      try {
        setMessage("");
        const response = await fetch("/api/ynot/admin/shipping", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            shippingRequestId: selected.id,
            status,
            trackingProvider,
            trackingNumber,
            note,
          }),
        });
        if (!response.ok) {
          throw new Error(
            (await response.json().catch(() => null))?.error ??
              "Shipping update failed.",
          );
        }
        setMessage("Shipping updated.");
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Shipping update failed.",
        );
      }
    });
  }

  return (
    <div className="grid gap-4 admin-shipping-console">
      <div className="kpi-grid admin-shipping-kpis">
        <div className="kpi">
          <div className="label">Preparing</div>
          <div className="value">{counts.preparing}</div>
        </div>
        <div className="kpi">
          <div className="label">Submitted</div>
          <div className="value">{counts.submitted}</div>
        </div>
        <div className="kpi">
          <div className="label">Packing</div>
          <div className="value">{counts.packing}</div>
        </div>
        <div className="kpi">
          <div className="label">Ready pickup</div>
          <div className="value">{counts.readyForPickup}</div>
        </div>
        <div className="kpi">
          <div className="label">Shipped</div>
          <div className="value">{counts.shipped}</div>
        </div>
        <div className="kpi">
          <div className="label">Final</div>
          <div className="value">{counts.final}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,520px)]">
        <section className="card">
          <div className="card-head">
            <div>
              <p className="section-label">Queue</p>
              <h3>Shipping requests · {requests.length}</h3>
            </div>
            <AdminPill kind={counts.active ? "warn" : "default"}>
              {counts.active} active
            </AdminPill>
          </div>
          <div className="tbl-wrap admin-shipping-queue">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Order</th>
                  <th>User</th>
                  <th>Reward</th>
                  <th>Pack</th>
                  <th>Tracking</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ padding: 24 }}>
                      No shipping requests.
                    </td>
                  </tr>
                ) : (
                  requests.map((request) => {
                    const primaryItem = request.items?.[0];
                    const isSelected = selected?.id === request.id;
                    return (
                      <tr
                        key={request.id}
                        className={`admin-shipping-row${isSelected ? " selected" : ""}`}
                        onClick={() => selectRequest(request)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectRequest(request);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select shipping request ${request.publicCode}`}
                      >
                        <td className="admin-shipping-queue-status-cell">
                          <AdminStatusPill status={request.status} />
                        </td>
                        <td className="mono admin-shipping-code">
                          {request.publicCode}
                        </td>
                        <td>
                          <div className="row-title">
                            {request.customer?.displayName ?? "Unknown user"}
                          </div>
                          <div className="row-sub mono">
                            {request.customer?.email ??
                              request.customer?.profileId ??
                              "-"}
                          </div>
                        </td>
                        <td>{primaryItemLabel(request)}</td>
                        <td>{primaryItem?.sourceCampaignTitle ?? "-"}</td>
                        <td className="mono admin-shipping-tracking-cell">
                          {ynotShippingTrackingLabel(request)}
                        </td>
                        <td className="mono muted admin-shipping-date-cell">
                          {formatDate(request.createdAt)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="card admin-shipping-selected-card">
          {!selected ? (
            <div className="muted">Select a shipping request.</div>
          ) : (
            <div className="grid gap-3">
              <div className="admin-shipping-action-bar">
                <div className="admin-shipping-action-main">
                  <p className="section-label">Selected request</p>
                  <div className="admin-shipping-selected-title">
                    <h3>{selected.publicCode}</h3>
                    <AdminStatusPill status={selected.status} />
                  </div>
                  <p className="row-sub">
                    {primaryItemLabel(selected)} ·{" "}
                    {selected.customer?.displayName ?? "Unknown user"}
                  </p>
                  {selected.totalCoinValue ? (
                    <p className="row-sub">
                      Total coin value: {selected.totalCoinValue.toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <div className="admin-shipping-action-controls">
                  <label className="field">
                    <span>Status</span>
                    <select
                      className="select admin-shipping-status-select"
                      value={status}
                      disabled={preparingSelected}
                      onChange={(event) =>
                        setStatus(event.target.value as AdminShippingActionStatus)
                      }
                    >
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>
                          {ynotShippingStatusLabels[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={isPending || preparingSelected || statusOptions.length === 0}
                    onClick={submit}
                  >
                    <AdminIcon name="check" />
                    Update shipping
                  </button>
                  {trackingRequired ? (
                    <AdminPill kind="warn">Tracking required</AdminPill>
                  ) : null}
                  {preparingSelected ? (
                    <AdminPill kind="default">Preparing is not admin-actionable</AdminPill>
                  ) : null}
                </div>
                {message ? <p className="text-mute">{message}</p> : null}
              </div>

              <ShippingDetailSection
                title="Reward and pack source"
                summary={secondaryItemLabel(selected)}
                icon="gift"
                defaultOpen
              >
                <div className="grid gap-2">
                  {loadedRewardPreviewCount(selected) > 0 &&
                  loadedRewardPreviewCount(selected) < expectedRewardCount(selected) ? (
                    <AdminPill kind="default">
                      Showing {loadedRewardPreviewCount(selected).toLocaleString()} of{" "}
                      {expectedRewardCount(selected).toLocaleString()} rewards
                    </AdminPill>
                  ) : null}
                  {(selected.items ?? []).length === 0 ? (
                    <AdminPill kind="default">
                      {rewardCountLabel(selected)}
                    </AdminPill>
                  ) : (
                    selected.items?.map((item, index) => (
                      <div className="list-row" key={`${item.cardName}-${index}`}>
                        <AdminIcon name="gift" />
                        <div>
                          <strong>{item.cardName}</strong>
                          <div className="row-sub">
                            {item.cardCode ?? "No code"} |{" "}
                            {item.sourceCampaignTitle ?? "No pack"}
                          </div>
                          <div className="row-sub">
                            {item.sourceOpenCode
                              ? `Open ${item.sourceOpenCode}`
                              : "No open code"}
                            {item.sourceOpenPosition
                              ? ` | Position ${item.sourceOpenPosition}`
                              : ""}
                            {item.sourcePrizeTierLabel
                              ? ` | ${item.sourcePrizeTierLabel}`
                              : ""}
                          </div>
                          <div className="row-sub">
                            Status: {item.status ?? "unknown"}
                            {item.serialNo ? ` | Serial ${item.serialNo}` : ""}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ShippingDetailSection>

              <ShippingDetailSection
                title="Customer"
                summary={selected.customer?.displayName ?? "Unknown user"}
                icon="users"
              >
                <div className="list-row">
                  <AdminIcon name="users" />
                  <div>
                    <strong>
                      {selected.customer?.displayName ?? "Unknown user"}
                    </strong>
                    <div className="row-sub">{selected.customer?.email ?? "-"}</div>
                    <div className="row-sub">
                      Phone: {selected.customer?.phone ?? "-"}
                    </div>
                    <div className="row-sub">
                      LINE:{" "}
                      {selected.customer?.lineDisplayName ??
                        selected.customer?.lineUserId ??
                        "not linked"}
                    </div>
                    <div className="row-sub mono">
                      Profile: {selected.customer?.profileId ?? "-"}
                    </div>
                    {selected.customer?.profileId ? (
                      <Link href={`/admin/users/${selected.customer.profileId}`}>
                        Open User 360
                      </Link>
                    ) : null}
                  </div>
                </div>
              </ShippingDetailSection>

              <ShippingDetailSection
                title="Address"
                summary={selected.addressSnapshot?.province ?? "Address snapshot"}
                icon="truck"
              >
                <div className="list-row">
                  <AdminIcon name="truck" />
                  <div>
                    <strong>Address snapshot</strong>
                    <div className="row-sub">{formatAddress(selected)}</div>
                    {selected.addressSnapshot?.deliveryNote ? (
                      <div className="row-sub">
                        Note: {selected.addressSnapshot.deliveryNote}
                      </div>
                    ) : null}
                  </div>
                </div>
              </ShippingDetailSection>

              <ShippingDetailSection
                title="Tracking"
                summary={ynotShippingTrackingLabel(selected)}
                icon="truck"
                defaultOpen={trackingRequired}
              >
                <div className="grid gap-2">
                  <label className="field">
                    <span>Tracking provider</span>
                    <input
                      className="input"
                      value={trackingProvider}
                      onChange={(event) => setTrackingProvider(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Tracking number</span>
                    <input
                      className="input"
                      value={trackingNumber}
                      onChange={(event) => setTrackingNumber(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Admin note</span>
                    <input
                      className="input"
                      placeholder={selected.adminNote ?? "Add fulfilment note"}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                  {selected.customerNote ? (
                    <div className="text-mute" style={{ fontSize: 12 }}>
                      Customer note: {selected.customerNote}
                    </div>
                  ) : null}
                  {selected.adminNote ? (
                    <div className="text-mute" style={{ fontSize: 12 }}>
                      Current admin note: {selected.adminNote}
                    </div>
                  ) : null}
                </div>
              </ShippingDetailSection>

              <ShippingDetailSection
                title="Timeline"
                summary={`${selected.timeline?.length ?? 0} events`}
                icon="clock"
              >
                <div className="grid gap-2">
                  {(selected.timeline ?? []).length === 0 ? (
                    <AdminPill kind="default">No audit events</AdminPill>
                  ) : (
                    selected.timeline?.map((event) => (
                      <div className="list-row" key={event.id}>
                        <AdminIcon name="clock" />
                        <div>
                          <strong>{event.label}</strong>
                          <div className="row-sub">{formatDate(event.createdAt)}</div>
                          {event.trackingNumber ? (
                            <div className="row-sub mono">
                              {event.trackingProvider ?? "tracking"} | {event.trackingNumber}
                            </div>
                          ) : null}
                          {event.note ? (
                            <div className="row-sub">{event.note}</div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ShippingDetailSection>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
