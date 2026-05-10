"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignLifecycleStatus } from "../types";

type Role = "owner" | "admin" | "staff";

export type CampaignWorkflowActionsProps = {
  campaignId: string;
  status: CampaignLifecycleStatus;
  role: Role | null;
  isCreatedByMe: boolean;
  rejectionReason?: string | null;
};

type Action =
  | "submit"
  | "approve"
  | "reject"
  | "publish"
  | "cancel"
  | "end";

async function callWorkflow(action: Action, campaignId: string, body?: Record<string, unknown>) {
  const response = await fetch(`/api/ynot/admin/campaigns/${campaignId}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json?.error ?? `${action}_failed`);
  }
}

export function CampaignWorkflowActions({
  campaignId,
  status,
  role,
  isCreatedByMe,
  rejectionReason,
}: CampaignWorkflowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);

  const isOwner = role === "owner";
  const isAdmin = role === "admin" || role === "owner";

  const run = (action: Action, body?: Record<string, unknown>) => {
    setBusy(action);
    setError(null);
    callWorkflow(action, campaignId, body)
      .then(() => {
        startTransition(() => router.refresh());
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => setBusy(null));
  };

  const button = (label: string, action: Action, body?: Record<string, unknown>, variant: "primary" | "danger" | "ghost" = "primary") => (
    <button
      type="button"
      disabled={pending || busy !== null}
      onClick={() => run(action, body)}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
        variant === "primary"
          ? "bg-amber-500 text-black hover:bg-amber-400"
          : variant === "danger"
            ? "bg-red-600 text-white hover:bg-red-500"
            : "border border-zinc-700 text-zinc-200 hover:border-zinc-500"
      }`}
    >
      {busy === action ? "..." : label}
    </button>
  );

  const promptReason = (action: Action) => {
    const reason = window.prompt(
      action === "reject" ? "เหตุผลที่ปฏิเสธ:" : "เหตุผล (ถ้ามี):",
    );
    if (action === "reject" && !reason) return;
    run(action, { reason: reason ?? "" });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (isAdmin && (isCreatedByMe || isOwner))
          ? button("ส่งขออนุมัติ", "submit")
          : null}
        {status === "pending_approval" && isOwner
          ? (
            <>
              {button("✅ Approve", "approve")}
              <button
                type="button"
                disabled={pending || busy !== null}
                onClick={() => promptReason("reject")}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {busy === "reject" ? "..." : "❌ Reject"}
              </button>
            </>
          )
          : null}
        {status === "approved" && isOwner
          ? button("🚀 Publish (lock & go live)", "publish")
          : null}
        {status === "live" && isOwner ? button("End Campaign", "end", undefined, "ghost") : null}
        {(status === "pending_approval" || status === "approved" || status === "live") && isOwner
          ? (
            <button
              type="button"
              disabled={pending || busy !== null}
              onClick={() => promptReason("cancel")}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
            >
              {busy === "cancel" ? "..." : "Cancel"}
            </button>
          )
          : null}
      </div>

      {status === "draft" && rejectionReason ? (
        <div className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          ถูก reject: {rejectionReason}
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          เกิดข้อผิดพลาด: {error}
        </div>
      ) : null}
    </div>
  );
}

export function CampaignStatusBadge({ status }: { status: CampaignLifecycleStatus }) {
  const styles: Record<CampaignLifecycleStatus, string> = {
    draft: "bg-zinc-800 text-zinc-300",
    pending_approval: "bg-amber-500/20 text-amber-300",
    approved: "bg-blue-500/20 text-blue-300",
    rejected: "bg-red-600/20 text-red-300",
    live: "bg-emerald-500/20 text-emerald-300",
    cancelled: "bg-zinc-700 text-zinc-400",
    ended: "bg-zinc-700 text-zinc-400",
    closed: "bg-zinc-700 text-zinc-400",
    archived: "bg-zinc-800 text-zinc-500",
  };
  const labels: Record<CampaignLifecycleStatus, string> = {
    draft: "Draft",
    pending_approval: "รออนุมัติ",
    approved: "Approved",
    rejected: "Rejected",
    live: "Live",
    cancelled: "Cancelled",
    ended: "Ended",
    closed: "Closed",
    archived: "Archived",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status] ?? "bg-zinc-800 text-zinc-300"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
