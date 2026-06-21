"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import {
  buildAdminCardCatalogRows,
  type AdminCardCatalogRow,
} from "@/features/ynot/admin-card-catalog-helpers";
import type { YnotPrizePoolItem } from "@/features/ynot/types";
import { deleteMainSku } from "./catalog-api";
import { CatalogKpis } from "./CatalogKpis";
import { CatalogToolbar } from "./CatalogToolbar";
import { LedgerRow } from "./LedgerRow";
import { MainSkuForm } from "./MainSkuForm";

type CategoryFilter = "all" | "Single Cards" | "Sealed Boxes" | "Sealed Packs";
type ModalState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; card: CardCatalogItem };

export function PrizeCatalogScreen({
  cards,
  prizes,
  isOwner,
}: {
  cards: CardCatalogItem[];
  prizes: YnotPrizePoolItem[];
  isOwner: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });
  const [toast, setToast] = useState<{ msg: string; isError: boolean } | null>(
    null,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const rows = useMemo(
    () => buildAdminCardCatalogRows(cards, prizes),
    [cards, prizes],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const cat = String(row.card.catalogCategory ?? "");
      if (category !== "all" && cat !== category) return false;
      if (!q) return true;
      return [row.card.name, row.card.code, row.card.cardSet, row.card.series]
        .some((s) => String(s ?? "").toLowerCase().includes(q));
    });
  }, [rows, query, category]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const showToast = useCallback(
    (msg: string, isError = false) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast({ msg, isError });
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    },
    [],
  );

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const handleEdit = useCallback(
    (row: AdminCardCatalogRow) => {
      setModal({ kind: "edit", card: row.card });
    },
    [],
  );

  const handleDelete = useCallback(
    async (row: AdminCardCatalogRow) => {
      const cardName = row.card.name || row.card.code || "this item";
      if (!window.confirm(`Delete ${cardName} and all its stock?`)) return;
      const res = await deleteMainSku(row.card.catalogCardId);
      if (!res.ok) {
        if (res.code === "CARD_IN_PRIZE_POOL") {
          showToast(
            "Remove it from its campaigns before deleting.",
            true,
          );
        } else if (res.code === "CARD_HAS_ACTIVE_STOCK") {
          showToast(
            "Archive or move its active stock before deleting.",
            true,
          );
        } else {
          showToast(res.error, true);
        }
        return;
      }
      showToast(`Deleted ${cardName}.`);
      router.refresh();
    },
    [router, showToast],
  );

  const closeModal = useCallback(() => setModal({ kind: "closed" }), []);

  return (
    <div className="pcx-screen">
      <div className="pcx-header-actions">
        <button
          type="button"
          className="pcx-btn pcx-btn-primary"
          onClick={() => setModal({ kind: "create" })}
        >
          Create Main SKU
        </button>
      </div>

      <CatalogKpis rows={rows} />
      <CatalogToolbar
        query={query}
        onQuery={setQuery}
        category={category}
        onCategory={setCategory}
        rows={rows}
      />
      <div className="pcx-ledger">
        {visible.length === 0 ? (
          <div className="pcx-empty">
            No items match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          visible.map((row) => (
            <LedgerRow
              key={row.card.catalogCardId}
              row={row}
              open={expanded.has(row.card.catalogCardId)}
              onToggle={() => toggle(row.card.catalogCardId)}
              isOwner={isOwner}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Create / Edit modal */}
      {modal.kind !== "closed" && (
        <div
          className="pcx-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="pcx-modal" role="document">
            <header className="pcx-modal-head">
              <h2 className="pcx-modal-title">
                {modal.kind === "create" ? "Create Main SKU" : "Edit Main SKU"}
              </h2>
              <button
                type="button"
                className="pcx-modal-close"
                onClick={closeModal}
                aria-label="Close"
              >
                &times;
              </button>
            </header>
            <MainSkuForm
              initial={modal.kind === "edit" ? modal.card : undefined}
              onDone={closeModal}
            />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`pcx-toast${toast.isError ? " error" : ""}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
