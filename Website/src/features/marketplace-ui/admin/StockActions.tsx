"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MpBtn } from "../shared/MpPrimitives";
import { MpIcon } from "../shared/MpIcon";
import type { StockModalMode } from "./StockModal";

/**
 * Add/Edit/Restock/Publish/Archive actions for the admin Official stock
 * screen. Recreated (data-driven, not 1:1 markup) from
 * marketplace-admin-2.jsx's AdminStock row actions and "Add stock" header
 * button (prototype: /Users/pinkmerry/Downloads/ynott/project/
 * marketplace-admin-2.jsx:196,211-214).
 *
 * StockModal is loaded via next/dynamic with ssr:false, same reasoning as
 * OrderActions' SlipModal -- purely interaction-gated, never needed on the
 * server-rendered page.
 *
 * Row action visibility is gated on item_state, matching what the real
 * RPCs unconditionally allow or reject (not "occasionally blocked by
 * hidden state" like PayoutActions' release gate -- these are deterministic
 * given item_state alone):
 *  - Edit: item_state is "draft" or "listed" only --
 *    marketplace_update_official_inventory rejects "sold"/"archived"
 *    outright (20260628150000_marketplace_official_admin_controls.sql:254).
 *  - Restock: item_state === "sold" only -- opens StockModal in CREATE
 *    mode (prefilled from this row), not edit; see StockModal.tsx's doc
 *    comment for why a sold-out row can never be edited back to life.
 *  - Publish: item_state === "draft" && quantity_available > 0 (task
 *    spec's "qty > 0 && unpublished" -- "listed"/"sold" are already
 *    published, so no Publish control renders for them).
 *  - Archive: item_state is "draft" or "listed" only --
 *    marketplace_archive_official_inventory rejects "sold"/"archived" the
 *    same way update does (official_admin_controls.sql:665). Requires a
 *    non-empty adminNote (p_admin_note is NOT optional on this RPC,
 *    unlike release's) plus window.confirm, since archiving has no
 *    "unarchive" counterpart in this codebase.
 *  - "archived" rows render no actions at all (fully terminal), same
 *    return-null-for-terminal-state shape as ModerationActions.tsx.
 */

const StockModal = dynamic(
  () => import("./StockModal").then((mod) => ({ default: mod.StockModal })),
  { ssr: false },
);

function nextIdempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:admin:${scope}:${suffix}`;
}

type ActionStatus = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string };

// Narrow local row type -- only the fields these row actions actually need
// -- rather than importing OfficialInventoryRow from the server
// OfficialStockScreen.tsx. Same reasoning as PayoutActionRow/
// OrderActionsOrder/DisputeActionRefund/ModerationActionReport: each
// client Actions file declares its own minimal shape instead of pulling in
// a wider lib/screen row type.
export interface StockActionItem {
  id: string;
  title_snapshot: string;
  item_state: string;
  quantity_available: number;
  version: number;
}

export function AddStockButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <MpBtn variant="primary" onClick={() => setOpen(true)}>
        <MpIcon name="plus" size={13} /> Add stock
      </MpBtn>
      {open ? (
        <StockModal
          mode={{ kind: "create" }}
          onClose={() => setOpen(false)}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

export function StockActions({ item }: { item: StockActionItem }) {
  const router = useRouter();
  const [modalMode, setModalMode] = useState<StockModalMode | null>(null);
  const [archivePanelOpen, setArchivePanelOpen] = useState(false);
  const [archiveNote, setArchiveNote] = useState("");
  const [status, setStatus] = useState<ActionStatus>({ kind: "idle" });

  const canEdit = item.item_state === "draft" || item.item_state === "listed";
  const canRestock = item.item_state === "sold";
  const canPublish = item.item_state === "draft" && item.quantity_available > 0;
  const canArchive = item.item_state === "draft" || item.item_state === "listed";

  if (!canEdit && !canRestock && !canPublish && !canArchive) {
    return status.kind === "error" ? (
      <p className="mp-alert mp-alert-rose mp-small">{status.message}</p>
    ) : null;
  }

  async function publish() {
    if (!window.confirm(`Publish "${item.title_snapshot}" to the live shop?`)) return;
    setStatus({ kind: "busy" });
    try {
      const response = await fetch(
        `/api/marketplace/admin/official-inventory/${item.id}/publish`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": nextIdempotencyKey("stock-publish"),
          },
          body: JSON.stringify({ expectedVersion: item.version }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        if (response.status === 401) {
          setStatus({ kind: "error", message: "Login is required. Refresh and sign back in." });
          return;
        }
        setStatus({ kind: "error", message: payload?.error ?? "That action could not be completed." });
        return;
      }
      setStatus({ kind: "idle" });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error. Try again." });
    }
  }

  async function archive() {
    if (!archiveNote.trim()) {
      setStatus({ kind: "error", message: "Add a note explaining the archive." });
      return;
    }
    if (!window.confirm(`Archive "${item.title_snapshot}"? This removes it from the shop and cannot be undone.`)) {
      return;
    }
    setStatus({ kind: "busy" });
    try {
      const response = await fetch(
        `/api/marketplace/admin/official-inventory/${item.id}/archive`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": nextIdempotencyKey("stock-archive"),
          },
          body: JSON.stringify({ expectedVersion: item.version, adminNote: archiveNote.trim() }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        if (response.status === 401) {
          setStatus({ kind: "error", message: "Login is required. Refresh and sign back in." });
          return;
        }
        setStatus({ kind: "error", message: payload?.error ?? "That action could not be completed." });
        return;
      }
      setArchivePanelOpen(false);
      setArchiveNote("");
      setStatus({ kind: "idle" });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error. Try again." });
    }
  }

  return (
    <div className="mp-stack" style={{ gap: 8, minWidth: 168 }}>
      <div className="mp-row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {canEdit ? (
          <MpBtn
            size="sm"
            onClick={() => setModalMode({ kind: "edit", inventoryId: item.id })}
            disabled={status.kind === "busy"}
          >
            Edit
          </MpBtn>
        ) : null}
        {canRestock ? (
          <MpBtn
            size="sm"
            variant="primary"
            onClick={() => setModalMode({ kind: "create", prefillFromInventoryId: item.id })}
            disabled={status.kind === "busy"}
          >
            Restock
          </MpBtn>
        ) : null}
        {canPublish ? (
          <MpBtn size="sm" variant="green" onClick={publish} disabled={status.kind === "busy"}>
            Publish
          </MpBtn>
        ) : null}
        {canArchive ? (
          <MpBtn
            size="sm"
            onClick={() => {
              setStatus({ kind: "idle" });
              setArchivePanelOpen((current) => !current);
            }}
            disabled={status.kind === "busy"}
          >
            Archive
          </MpBtn>
        ) : null}
      </div>

      {archivePanelOpen ? (
        <div className="mp-stack" style={{ gap: 6 }}>
          <textarea
            className="mp-textarea"
            rows={2}
            placeholder="Note for the record (required)"
            aria-label="Archive note"
            value={archiveNote}
            onChange={(event) => setArchiveNote(event.target.value)}
          />
          <div className="mp-row" style={{ gap: 6 }}>
            <MpBtn size="sm" onClick={archive} disabled={status.kind === "busy"}>
              {status.kind === "busy" ? "Working…" : "Confirm archive"}
            </MpBtn>
            <MpBtn size="sm" onClick={() => setArchivePanelOpen(false)}>
              Cancel
            </MpBtn>
          </div>
        </div>
      ) : null}

      {status.kind === "error" ? (
        <p className="mp-alert mp-alert-rose mp-small">{status.message}</p>
      ) : null}

      {modalMode ? (
        <StockModal
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
