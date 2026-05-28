"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type {
  YnotApprovalStatus,
  YnotOwnerApprovalRequest,
  YnotRandomLogicMode,
} from "./types";
import { AdminIcon } from "./admin";

function approvalStatusLabel(status: YnotApprovalStatus) {
  const labels: Record<YnotApprovalStatus, string> = {
    not_submitted: "Not submitted",
    pending_review: "Pending owner review",
    approved: "Approved",
    rejected: "Rejected",
    changes_requested: "Changes requested",
  };
  return labels[status];
}

function formatApprovalDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const randomLogicChoices: Array<{
  value: YnotRandomLogicMode;
  label: string;
}> = [
  { value: "pure_random", label: "Pure random" },
  { value: "weighted_templates", label: "Weighted high tier" },
  { value: "inventory_gated", label: "30% sold unlock" },
];

export function AdminCategoryRowActions({
  categoryId,
  categorySlug,
  categoryName,
  packCount,
  isLegacySeries,
}: {
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  packCount: number;
  isLegacySeries?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  if (isLegacySeries) {
    return (
      <span
        className="admin-category-row-legacy"
        title="Built-in series, managed via draw_rounds"
      >
        Built-in
      </span>
    );
  }

  const canDelete = packCount === 0;
  void categorySlug;

  function emitEdit() {
    window.dispatchEvent(
      new CustomEvent("admin-category-edit", { detail: { categoryId } }),
    );
  }

  async function runDelete() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/ynot/admin/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(payload?.message || payload?.error || "Delete failed");
      }
      setShowModal(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-category-row-actions">
      <button
        type="button"
        className="secondary-action compact"
        onClick={emitEdit}
      >
        Edit
      </button>
      <button
        type="button"
        className="secondary-action compact admin-category-delete-btn"
        onClick={() => {
          setError(null);
          setShowModal(true);
        }}
        disabled={!canDelete || pending}
        title={
          canDelete
            ? `Delete "${categoryName}" permanently`
            : `Cannot delete - ${packCount} pack${packCount === 1 ? "" : "s"} still use this category`
        }
      >
        Delete
      </button>
      {error && (
        <p className="admin-category-row-error" role="alert">
          {error}
        </p>
      )}
      {showModal && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-category-title-${categoryId}`}
          onClick={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setShowModal(false);
            }
          }}
        >
          <div className="admin-modal admin-modal-danger" role="document">
            <header className="admin-modal-head">
              <h2
                id={`delete-category-title-${categoryId}`}
                className="admin-modal-title"
              >
                Delete category &quot;{categoryName}&quot; permanently?
              </h2>
              <p className="admin-modal-subtitle">
                This removes the category row from the catalog. Packs are
                unaffected because no packs are currently linked. The action is
                logged to the audit trail.
              </p>
            </header>
            {error && (
              <p className="admin-category-row-error" role="alert">
                {error}
              </p>
            )}
            <footer className="admin-modal-foot">
              <button
                type="button"
                className="admin-modal-secondary"
                onClick={() => {
                  setShowModal(false);
                  setError(null);
                }}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-modal-primary admin-modal-primary-danger"
                onClick={runDelete}
                disabled={pending}
                autoFocus
              >
                {pending ? "Deleting..." : "Delete category"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

export function OwnerApprovalQueue({
  requests,
  viewerRole,
}: {
  requests: YnotOwnerApprovalRequest[];
  viewerRole?: "owner" | "admin" | "staff" | null;
}) {
  if (!requests.length) {
    return (
      <section className="owner-approval-queue soft-card">
        <div className="admin-form-head">
          <span>Owner review queue</span>
          <h3>No random drops need owner review</h3>
          <p>
            New packs remain draft/private until an owner approves and
            publishes them.
          </p>
        </div>
      </section>
    );
  }

  const isOwner = viewerRole === "owner";

  return (
    <section className="owner-approval-queue soft-card">
      <div className="admin-panel-head">
        <div>
          <p className="section-label">Owner review queue</p>
          <h3 className="title-m">Random drop requests</h3>
          <p className="txt-s">
            {requests.length} request{requests.length === 1 ? "" : "s"}{" "}
            waiting. Click <strong>Review</strong> to inspect and approve.
          </p>
        </div>
        <span className="status-pill warn">Owner notification</span>
      </div>

      <div className="owner-approval-list">
        {requests.map((request) => {
          const logicLabel =
            randomLogicChoices.find(
              (choice) => choice.value === request.logicMode,
            )?.label ?? request.logicMode;
          const modeLabel =
            request.campaign.mode === "slot_pick"
              ? "Slot pick"
              : "Instant gacha";
          const totalUnits =
            request.campaign.totalPrizeUnits ?? request.campaign.totalSlots;
          const availableUnits = request.campaign.availablePrizeUnits ?? 0;
          const shortStatusLabel: Record<YnotApprovalStatus, string> = {
            not_submitted: "Draft",
            pending_review: "Pending",
            approved: "Approved",
            rejected: "Rejected",
            changes_requested: "Changes",
          };
          const requesterLabel = request.requestedByLabel?.trim();
          return (
            <article className="owner-approval-row" key={request.id}>
              <span
                className="owner-approval-row-status"
                data-status={request.approvalStatus}
                title={approvalStatusLabel(request.approvalStatus)}
              >
                <span
                  className="owner-approval-row-status-dot"
                  aria-hidden="true"
                />
                {shortStatusLabel[request.approvalStatus]}
              </span>
              <div className="owner-approval-row-main">
                <h4>{request.campaign.titleTh || request.campaign.titleEn}</h4>
                <p>
                  <span>{request.campaign.slug}</span>
                  <span aria-hidden="true">.</span>
                  <span>{modeLabel}</span>
                  <span aria-hidden="true">.</span>
                  <span>{formatApprovalDate(request.requestedAt)}</span>
                  {requesterLabel ? (
                    <>
                      <span aria-hidden="true">.</span>
                      <span>by {requesterLabel}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="owner-approval-row-stats">
                <div>
                  <span>Sold</span>
                  <strong>{request.soldPct}%</strong>
                </div>
                <div>
                  <span>Units</span>
                  <strong>
                    {availableUnits}/{totalUnits}
                  </strong>
                </div>
                <div>
                  <span>Logic</span>
                  <strong>{logicLabel}</strong>
                </div>
              </div>
              {isOwner ? (
                <Link
                  className="btn btn-sm btn-primary owner-approval-row-cta"
                  href={`/admin/campaigns/${request.campaign.id}/review`}
                  prefetch={false}
                >
                  Review <AdminIcon name="chev-r" size={12} />
                </Link>
              ) : (
                <span className="owner-approval-row-locked">Owner only</span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function PackOrderControls({
  campaignId,
  position,
  canMoveUp,
  canMoveDown,
  prevId,
  prevSortOrder,
  nextId,
  nextSortOrder,
  currentSortOrder,
  variant = "card",
}: {
  campaignId: string;
  position: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  prevId?: string | null;
  prevSortOrder?: number | null;
  nextId?: string | null;
  nextSortOrder?: number | null;
  currentSortOrder: number;
  variant?: "card" | "feature";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function moveTo(
    neighborId: string | null | undefined,
    neighborOrder: number | null | undefined,
  ) {
    if (!neighborId || neighborOrder === null || neighborOrder === undefined) {
      return;
    }
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/ynot/admin/campaigns/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          swaps: [
            { id: campaignId, sortOrder: neighborOrder },
            { id: neighborId, sortOrder: currentSortOrder },
          ],
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(payload?.message || payload?.error || "Reorder failed");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reorder failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`pack-order-controls pack-order-controls--${variant}`}
      aria-label="Reorder pack"
    >
      <span
        className="pack-order-controls-position"
        aria-label={`Position ${position}`}
      >
        #{position}
      </span>
      <button
        type="button"
        className="pack-order-controls-button"
        onClick={() => moveTo(prevId, prevSortOrder)}
        disabled={!canMoveUp || pending}
        aria-label="Move pack up"
      >
        ↑
      </button>
      <button
        type="button"
        className="pack-order-controls-button"
        onClick={() => moveTo(nextId, nextSortOrder)}
        disabled={!canMoveDown || pending}
        aria-label="Move pack down"
      >
        ↓
      </button>
      {error && (
        <span className="pack-order-controls-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function PackDeleteButton({
  campaignId,
  campaignTitle,
  variant = "card",
}: {
  campaignId: string;
  campaignTitle: string;
  variant?: "card" | "feature";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    if (pending) return;
    const confirmed = window.confirm(
      `Archive "${campaignTitle}"?\n\nThis hides it from the storefront and active admin lists. The pack stays archived in the database and can be restored later via the admin lifecycle queue.`,
    );
    if (!confirmed) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/ynot/admin/campaigns/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, action: "archive" }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(payload?.message || payload?.error || "Archive failed");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Archive failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`pack-admin-delete pack-admin-delete--${variant}`}
        onClick={archive}
        disabled={pending}
        aria-label={`Archive ${campaignTitle}`}
        title="Archive this pack"
      >
        <svg
          viewBox="0 0 12 14"
          width="12"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="square"
          strokeLinejoin="miter"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M0 3 H12" />
          <path d="M4 3 V1 H8 V3" />
          <path d="M1.5 3 V13 H10.5 V3" />
          <path d="M5 6 V11" />
          <path d="M7 6 V11" />
        </svg>
      </button>
      {error && (
        <span className="pack-admin-delete-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

type AdminCampaignSummary = {
  id: string;
  titleTh: string;
  titleEn: string;
  series: "pokemon" | "one_piece";
  status: "draft" | "live" | "closed" | "archived";
  isTest: boolean;
};

const TIER_TARGET_COST: Record<string, number> = {
  legendary: 250,
  gold: 150,
  silver: 75,
  common: 25,
};

function PackPickerModal({
  open,
  onClose,
  targetTier,
}: {
  open: boolean;
  onClose: () => void;
  targetTier?: string;
}) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<AdminCampaignSummary[] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadCampaigns = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      fetch("/api/ynot/admin/campaigns", { method: "GET" })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as
            | {
                ok?: boolean;
                campaigns?: AdminCampaignSummary[];
                error?: string;
                message?: string;
              }
            | null;
          if (!response.ok || !payload?.ok) {
            throw new Error(
              payload?.message || payload?.error || "Failed to load packs",
            );
          }
          if (!cancelled) setCampaigns(payload.campaigns ?? []);
        })
        .catch((caught) => {
          if (!cancelled) {
            setError(caught instanceof Error ? caught.message : "Load failed");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(loadCampaigns);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  async function promote(campaign: AdminCampaignSummary) {
    if (promotingId) return;
    setPromotingId(campaign.id);
    setError(null);
    try {
      if (campaign.status === "archived") {
        const restoreRes = await fetch("/api/ynot/admin/campaigns/lifecycle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: campaign.id,
            action: "close",
          }),
        });
        if (!restoreRes.ok) {
          const payload = (await restoreRes.json().catch(() => null)) as
            | { error?: string; message?: string }
            | null;
          throw new Error(
            payload?.message || payload?.error || "Restore failed",
          );
        }
      }
      if (targetTier) {
        const costCoins = TIER_TARGET_COST[targetTier] ?? 25;
        const response = await fetch("/api/ynot/admin/campaigns/cost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id, costCoins }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; message?: string }
            | null;
          throw new Error(payload?.message || payload?.error || "Move failed");
        }
        await fetch("/api/ynot/admin/featured-packs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove", id: campaign.id }),
        }).catch(() => {});
      } else {
        const response = await fetch("/api/ynot/admin/featured-packs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add", id: campaign.id }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; message?: string }
            | null;
          throw new Error(
            payload?.message || payload?.error || "Promote failed",
          );
        }
      }
      onClose();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : targetTier
            ? "Move failed"
            : "Promote failed",
      );
    } finally {
      setPromotingId(null);
    }
  }

  if (!open || typeof window === "undefined") return null;

  const overlay = (
    <div
      className="pack-picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a pack"
    >
      <div className="pack-picker-backdrop" aria-hidden onClick={onClose} />
      <div className="pack-picker-panel">
        <header className="pack-picker-head">
          <span className="pack-picker-eyebrow">
            {targetTier ? `Move into ${targetTier}` : "Featured slot"}
          </span>
          <h2 className="pack-picker-title">
            {targetTier
              ? `Move a pack into the ${targetTier} tier`
              : "Pick an existing pack"}
          </h2>
          <button
            type="button"
            className="pack-picker-close"
            onClick={onClose}
            aria-label="Close picker"
          >
            <svg
              viewBox="0 0 14 14"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.6"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M13 1 L1 13" />
              <path d="M1 1 L13 13" />
            </svg>
          </button>
        </header>

        <div className="pack-picker-body">
          {loading && <p className="pack-picker-message">Loading...</p>}
          {error && !loading && (
            <p
              className="pack-picker-message pack-picker-message-error"
              role="alert"
            >
              {error}
            </p>
          )}
          {!loading && campaigns && (
            <ul className="pack-picker-grid">
              {campaigns.map((campaign) => {
                const isArchived = campaign.status === "archived";
                const isPromoting = promotingId === campaign.id;
                return (
                  <li key={campaign.id}>
                    <button
                      type="button"
                      className={`pack-picker-tile pack-picker-tile--${campaign.series}${isArchived ? " is-archived" : ""}`}
                      onClick={() => promote(campaign)}
                      disabled={isPromoting}
                      aria-label={
                        targetTier
                          ? `Move ${campaign.titleEn || campaign.titleTh} into ${targetTier}`
                          : isArchived
                            ? `Restore and promote ${campaign.titleEn || campaign.titleTh}`
                            : `Promote ${campaign.titleEn || campaign.titleTh}`
                      }
                    >
                      <span className="pack-picker-tile-series">
                        {campaign.series === "pokemon" ? "Pokemon" : "One Piece"}
                      </span>
                      <strong className="pack-picker-tile-title">
                        {campaign.titleTh || campaign.titleEn}
                      </strong>
                      <span className="pack-picker-tile-meta">
                        {campaign.status}
                        {campaign.isTest ? " - test" : ""}
                        {targetTier
                          ? ` - click to move into ${targetTier}`
                          : isArchived
                            ? " - click to restore"
                            : ""}
                      </span>
                      {isPromoting && (
                        <span className="pack-picker-tile-pending">
                          {targetTier
                            ? "Moving..."
                            : isArchived
                              ? "Restoring..."
                              : "Promoting..."}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              <li>
                <a
                  href="/admin/campaigns"
                  className="pack-picker-tile pack-picker-tile--create"
                  aria-label="Create a new pack"
                >
                  <span className="pack-picker-tile-plus" aria-hidden>
                    +
                  </span>
                  <span className="pack-picker-tile-title">
                    Create new pack
                  </span>
                  <span className="pack-picker-tile-meta">
                    Opens admin form
                  </span>
                </a>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

export function PackPickerLauncher({
  variant = "card",
  targetTier,
}: {
  variant?: "card" | "button";
  targetTier?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = targetTier
    ? `Move a pack into ${targetTier}`
    : "Add or pick a mystery pack";
  if (variant === "button") {
    return (
      <>
        <button
          type="button"
          className="packs-toolbar-add-btn"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label}
        >
          <span aria-hidden>+</span>
          <span>Add pack</span>
        </button>
        <PackPickerModal
          open={open}
          onClose={() => setOpen(false)}
          targetTier={targetTier}
        />
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        className="packs-feature-card packs-feature-card--placeholder"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
      >
        <span className="packs-feature-placeholder-plus" aria-hidden>
          +
        </span>
        <span className="packs-feature-placeholder-label">Add or pick pack</span>
      </button>
      <PackPickerModal
        open={open}
        onClose={() => setOpen(false)}
        targetTier={targetTier}
      />
    </>
  );
}
