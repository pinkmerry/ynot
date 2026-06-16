"use client";

import { useState, useTransition } from "react";

import { TopUpTable } from "@/features/ynot/components";
import type { YnotTopUp } from "@/features/ynot/types";
import {
  AdminCard,
  AdminCardHead,
  AdminIcon,
  AdminKPI,
  AdminStatusPill,
  fmtTHB,
} from "@/features/ynot/admin";

export type TopUpFilter =
  | "all"
  | "pending"
  | "valid"
  | "mismatch"
  | "duplicate"
  | "provider_error"
  | "rejected"
  | "approved";

export const topUpFilters: { key: TopUpFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "valid", label: "Valid" },
  { key: "mismatch", label: "Mismatch" },
  { key: "duplicate", label: "Duplicate" },
  { key: "provider_error", label: "Provider" },
  { key: "rejected", label: "Rejected" },
  { key: "approved", label: "Approved" },
];

type ReviewedTopUp = {
  id: string;
  status: "approved" | "rejected";
  replayed: boolean;
};

type AdminTopUpConsoleProps = {
  initialTopUps: YnotTopUp[];
  activeFilter: TopUpFilter;
  profileId?: string;
};

export function AdminTopUpConsole({
  initialTopUps,
  activeFilter,
  profileId,
}: AdminTopUpConsoleProps) {
  const [topUps, setTopUps] = useState(initialTopUps);
  const pending = topUps.filter(
    (topUp) =>
      topUp.status === "pending_review" || topUp.status === "pending_slip",
  );
  const awaitingSlip = topUps.filter((topUp) => topUp.status === "pending_slip");
  const approved = topUps.filter((topUp) => topUp.status === "approved");
  const validPrecheck = topUps.filter(
    (topUp) => topUp.slipVerification?.status === "valid",
  );
  const mismatch = topUps.filter((topUp) =>
    ["amount_mismatch", "receiver_mismatch", "date_mismatch"].includes(
      topUp.slipVerification?.status ?? "",
    ),
  );
  const duplicate = topUps.filter(
    (topUp) => topUp.slipVerification?.status === "duplicate",
  );
  const providerError = topUps.filter(
    (topUp) => topUp.slipVerification?.status === "provider_error",
  );
  const volume = approved.reduce((sum, topUp) => sum + topUp.amountThb, 0);
  const filterCounts: Record<TopUpFilter, number> = {
    all: pending.length,
    pending: pending.filter((topUp) => topUp.status === "pending_review").length,
    valid: validPrecheck.length,
    mismatch: mismatch.length,
    duplicate: duplicate.length,
    provider_error: providerError.length,
    rejected: topUps.filter((topUp) => topUp.status === "rejected").length,
    approved: approved.length,
  };
  const visibleTopUps = topUps.filter((topUp) => {
    if (activeFilter === "all") return pending.includes(topUp);
    if (activeFilter === "pending") return topUp.status === "pending_review";
    if (activeFilter === "valid") {
      return topUp.slipVerification?.status === "valid";
    }
    if (activeFilter === "mismatch") {
      return ["amount_mismatch", "receiver_mismatch", "date_mismatch"].includes(
        topUp.slipVerification?.status ?? "",
      );
    }
    if (activeFilter === "duplicate") {
      return topUp.slipVerification?.status === "duplicate";
    }
    if (activeFilter === "provider_error") {
      return topUp.slipVerification?.status === "provider_error";
    }
    return topUp.status === activeFilter;
  });

  function handleReviewed(reviewedTopUp: ReviewedTopUp) {
    setTopUps((current) =>
      current.map((topUp) =>
        topUp.id === reviewedTopUp.id
          ? {
              ...topUp,
              status: reviewedTopUp.status,
              reviewedAt: new Date().toISOString(),
            }
          : topUp,
      ),
    );
  }

  return (
    <>
      <div className="kpi-grid">
        <AdminKPI
          label="Pending review"
          value={
            pending.filter((topUp) => topUp.status === "pending_review").length
          }
          delta={pending.length ? "needs action" : "all clear"}
          deltaDir={pending.length ? "down" : "up"}
          color="var(--a-rose)"
        />
        <AdminKPI
          label="Awaiting slip"
          value={awaitingSlip.length}
          color="var(--a-amber)"
        />
        <AdminKPI
          label="Approved"
          value={approved.length}
          color="var(--a-mint)"
        />
        <AdminKPI
          label="Volume · approved"
          value={fmtTHB(volume)}
          color="var(--a-gold)"
        />
      </div>

      <AdminCard>
        <AdminCardHead
          label="Payment queue"
          title={`${topUpFilters.find((filter) => filter.key === activeFilter)?.label ?? "All"} · ${visibleTopUps.length}`}
          actions={
            <div className="tabs">
              {topUpFilters.map((filter) => (
                <a
                  className={`t ${activeFilter === filter.key ? "active" : ""}`}
                  href={`/admin/top-ups?filter=${filter.key}${profileId ? `&profileId=${encodeURIComponent(profileId)}` : ""}`}
                  key={filter.key}
                >
                  {filter.label} · {filterCounts[filter.key]}
                </a>
              ))}
            </div>
          }
        />
        <div className="list">
          {visibleTopUps.length === 0 ? (
            <div className="list-row text-mute">No top-ups in this filter.</div>
          ) : (
            visibleTopUps.map((topUp) => (
              <div className="list-row" key={topUp.id ?? topUp.publicCode}>
                <span
                  className="thumb sq"
                  style={{
                    background: "rgba(244, 197, 66, 0.10)",
                    color: "var(--a-gold)",
                  }}
                >
                  <AdminIcon name="coin" size={16} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {topUp.publicCode}
                    </span>
                    <AdminStatusPill status={topUp.status} />
                  </div>
                  <div className="row-sub">
                    <span className="tnum">
                      {fmtTHB(topUp.amountThb)} ·{" "}
                      {topUp.coinAmount.toLocaleString()} coins
                    </span>{" "}
                    · profile{" "}
                    <span className="mono">
                      {topUp.profileId?.slice(0, 8) ?? "Unknown"}…
                    </span>{" "}
                    · {new Date(topUp.createdAt).toLocaleString()}
                  </div>
                  <div className="row-sub">
                    Method:{" "}
                    <span className="mono">
                      {topUp.paymentMethod?.displayName ?? "Unknown method"}
                    </span>{" "}
                    · Slip:{" "}
                    <span className="mono">
                      {topUp.slipVerification?.status ?? "not uploaded"}
                    </span>
                    {topUp.slipVerification?.providerCode
                      ? ` · ${topUp.slipVerification.providerCode}`
                      : ""}
                  </div>
                  {topUp.slipVerification?.providerMessage && (
                    <div
                      className="text-mute"
                      style={{ fontSize: 11, marginTop: 3 }}
                    >
                      {topUp.slipVerification.providerMessage}
                    </div>
                  )}
                  {topUp.customerNote && (
                    <div
                      className="text-mute"
                      style={{ fontSize: 11, marginTop: 3 }}
                    >
                      “{topUp.customerNote}”
                    </div>
                  )}
                </div>
                {topUp.id && (
                  <AdminTopUpReviewActions
                    onReviewed={handleReviewed}
                    topUp={topUp}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHead label="All top-ups" title="History" />
        <div className="card-pad">
          <TopUpTable topUps={topUps} admin />
        </div>
      </AdminCard>
    </>
  );
}

function AdminTopUpReviewActions({
  onReviewed,
  topUp,
}: {
  onReviewed: (reviewedTopUp: ReviewedTopUp) => void;
  topUp: YnotTopUp;
}) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(action: "approve" | "reject") {
    startTransition(async () => {
      try {
        const response = await fetch("/api/ynot/admin/top-ups", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topUpId: topUp.id, action, note }),
        });
        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setMessage(errorPayload.error ?? "Could not update top-up.");
          return;
        }
        const payload = await response.json().catch(() => ({})) as {
          result?: { status?: "approved" | "rejected"; replayed?: boolean };
        };
        const result = payload.result;
        onReviewed({
          id: topUp.id ?? "",
          status:
            result?.status ?? (action === "approve" ? "approved" : "rejected"),
          replayed: result?.replayed === true,
        });
        setMessage(
          result?.replayed
            ? `${action} was already recorded.`
            : `${action} complete.`,
        );
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Could not update top-up.",
        );
      }
    });
  }

  return (
    <div className="mt-2 grid gap-2">
      <input
        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs"
        placeholder="Admin note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="gold-button rounded-xl px-3 py-2 text-xs font-black"
          disabled={isPending}
          onClick={() => submit("approve")}
          type="button"
        >
          Approve
        </button>
        <button
          className="danger-button rounded-xl px-3 py-2 text-xs font-black"
          disabled={isPending}
          onClick={() => submit("reject")}
          type="button"
        >
          Reject
        </button>
      </div>
      {message && <p className="text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}
