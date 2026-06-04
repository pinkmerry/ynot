"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { YnotShippingRequest } from "@/features/ynot/types";
import { AdminIcon } from "./Icon";
import { AdminPill, AdminStatusPill } from "./primitives";

type AdminShippingActionStatus = Exclude<YnotShippingRequest["status"], "draft">;

const shippingStatusLabels: Record<AdminShippingActionStatus, string> = {
  submitted: "Submitted",
  packing: "Packing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function nextShippingStatuses(
  status: YnotShippingRequest["status"],
): AdminShippingActionStatus[] {
  switch (status) {
    case "draft":
      return ["submitted", "cancelled"];
    case "submitted":
      return ["submitted", "packing", "cancelled"];
    case "packing":
      return ["packing", "shipped", "cancelled"];
    case "shipped":
      return ["shipped", "delivered"];
    case "delivered":
      return ["delivered"];
    case "cancelled":
      return ["cancelled"];
  }
}

function defaultActionStatus(
  status: YnotShippingRequest["status"],
): AdminShippingActionStatus {
  return nextShippingStatuses(status)[0] ?? "submitted";
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

function primaryItemLabel(request: YnotShippingRequest) {
  const item = request.items?.[0];
  if (!item) return "No items linked";
  const suffix =
    (request.items?.length ?? 0) > 1
      ? ` +${(request.items?.length ?? 1) - 1}`
      : "";
  return `${item.cardName}${suffix}`;
}

function statusCounts(requests: YnotShippingRequest[]) {
  return {
    submitted: requests.filter((request) => request.status === "submitted")
      .length,
    packing: requests.filter((request) => request.status === "packing").length,
    shipped: requests.filter((request) => request.status === "shipped").length,
    delivered: requests.filter((request) => request.status === "delivered")
      .length,
  };
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

  function selectRequest(request: YnotShippingRequest) {
    setSelectedId(request.id);
    setStatus(defaultActionStatus(request.status));
    setTrackingProvider(request.trackingProvider ?? "");
    setTrackingNumber(request.trackingNumber ?? "");
    setNote("");
    setMessage("");
  }

  function submit() {
    if (!selected) return;
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
    <div className="grid gap-4">
      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">Submitted</div>
          <div className="value">{counts.submitted}</div>
        </div>
        <div className="kpi">
          <div className="label">Packing</div>
          <div className="value">{counts.packing}</div>
        </div>
        <div className="kpi">
          <div className="label">Shipped</div>
          <div className="value">{counts.shipped}</div>
        </div>
        <div className="kpi">
          <div className="label">Delivered</div>
          <div className="value">{counts.delivered}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="card">
          <div className="card-head">
            <div>
              <p className="section-label">Queue</p>
              <h3>Shipping requests · {requests.length}</h3>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>User</th>
                  <th>Reward</th>
                  <th>Pack</th>
                  <th>Status</th>
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
                    return (
                      <tr
                        key={request.id}
                        onClick={() => selectRequest(request)}
                        style={{ cursor: "pointer" }}
                      >
                        <td className="mono" style={{ fontWeight: 700 }}>
                          {request.publicCode}
                        </td>
                        <td>
                          <div className="row-title">
                            {request.customer?.displayName ?? "Unknown user"}
                          </div>
                          <div className="row-sub mono" style={{ fontSize: 11 }}>
                            {request.customer?.email ??
                              request.customer?.profileId ??
                              "-"}
                          </div>
                        </td>
                        <td>{primaryItemLabel(request)}</td>
                        <td>{primaryItem?.sourceCampaignTitle ?? "-"}</td>
                        <td>
                          <AdminStatusPill status={request.status} />
                        </td>
                        <td className="mono" style={{ fontSize: 11 }}>
                          {request.trackingProvider && request.trackingNumber
                            ? `${request.trackingProvider} | ${request.trackingNumber}`
                            : "-"}
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
        </section>

        <aside className="card">
          {!selected ? (
            <div className="muted">Select a shipping request.</div>
          ) : (
            <div className="grid gap-4">
              <div className="card-head">
                <div>
                  <p className="section-label">Selected request</p>
                  <h3>{selected.publicCode}</h3>
                </div>
                <AdminStatusPill status={selected.status} />
              </div>

              <div className="list">
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
                <div className="list-row">
                  <AdminIcon name="truck" />
                  <div>
                    <strong>Address snapshot</strong>
                    <div className="row-sub">{formatAddress(selected)}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                {(selected.items ?? []).map((item, index) => (
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
                ))}
              </div>

              <div className="grid gap-2">
                <div className="field">
                  <label>Status</label>
                  <select
                    className="select"
                    value={status}
                    onChange={(event) =>
                      setStatus(event.target.value as AdminShippingActionStatus)
                    }
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {shippingStatusLabels[option]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Tracking provider</label>
                  <input
                    className="input"
                    value={trackingProvider}
                    onChange={(event) => setTrackingProvider(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Tracking number</label>
                  <input
                    className="input"
                    value={trackingNumber}
                    onChange={(event) => setTrackingNumber(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Admin note</label>
                  <input
                    className="input"
                    placeholder={selected.adminNote ?? "Add fulfilment note"}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
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
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={isPending}
                  onClick={submit}
                >
                  <AdminIcon name="check" />
                  Update shipping
                </button>
                {message ? <p className="text-mute">{message}</p> : null}
              </div>

              <div className="grid gap-2">
                <p className="section-label">Timeline</p>
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
                            {event.trackingProvider} | {event.trackingNumber}
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
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
