"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import {
  buildAdminCardCatalogRows,
  type AdminCardCatalogRow,
} from "@/features/ynot/admin-card-catalog-helpers";
import type { YnotCampaign, YnotPrizePoolItem } from "@/features/ynot/types";
import {
  AddStockDrawer,
  type DrawerState,
  openDrawerFresh,
  openDrawerForCard,
  closedDrawer,
} from "./AddStockDrawer";
import {
  AssignCampaignModal,
  type AssignCampaignTarget,
} from "./AssignCampaignModal";
import {
  adjustCardStock,
  deleteMainSku,
  updateMainSku,
  uploadCardImage,
  upsertStockSku,
} from "./catalog-api";
import { CatalogKpis } from "./CatalogKpis";
import { CatalogToolbar } from "./CatalogToolbar";
import { EditVariantModal, type EditVariantTarget } from "./EditVariantModal";
import {
  downscaleImage,
  MAIN_IMAGE_MAX_WIDTH,
  VARIANT_IMAGE_MAX_WIDTH,
} from "./image-util";
import { LedgerRow } from "./LedgerRow";
import { MainSkuForm } from "./MainSkuForm";
import { OpenBoxModal, type OpenBoxTarget } from "./OpenBoxModal";
import { isVariantLoadedInCampaign } from "./variant-guards";

type StockSkuGroupElement = NonNullable<CardCatalogItem["stockSkuGroups"]>[number];

export type CategoryFilter = "all" | "Single Cards" | "Sealed Boxes" | "Sealed Packs";
type ModalState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; card: CardCatalogItem }
  | { kind: "editVariant"; target: EditVariantTarget }
  | { kind: "openBox"; target: OpenBoxTarget }
  | { kind: "assignCampaign"; target: AssignCampaignTarget };

export function PrizeCatalogScreen({
  cards,
  prizes,
  campaigns,
  isOwner,
}: {
  cards: CardCatalogItem[];
  prizes: YnotPrizePoolItem[];
  campaigns: YnotCampaign[];
  isOwner: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });
  const [drawer, setDrawer] = useState<DrawerState>(closedDrawer);
  const [toast, setToast] = useState<{ msg: string; isError: boolean } | null>(
    null,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const mainImageRef = useRef<HTMLInputElement>(null);
  const variantImageRef = useRef<HTMLInputElement>(null);
  const pendingImageTarget = useRef<{
    kind: "main";
    row: AdminCardCatalogRow;
  } | {
    kind: "variant";
    row: AdminCardCatalogRow;
    group: StockSkuGroupElement;
  } | null>(null);
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

  const handleAddStockRow = useCallback(
    (row: AdminCardCatalogRow) => {
      setDrawer(openDrawerForCard(row.card));
    },
    [],
  );

  // ---- Image upload orchestration ----

  /** Main card image: trigger file picker, then upload + updateMainSku. */
  const handleMainImageUpload = useCallback(
    (row: AdminCardCatalogRow) => {
      pendingImageTarget.current = { kind: "main", row };
      mainImageRef.current?.click();
    },
    [],
  );

  const handleMainImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const target = pendingImageTarget.current;
      if (!file || !target || target.kind !== "main") return;
      if (mainImageRef.current) mainImageRef.current.value = "";
      pendingImageTarget.current = null;

      const { row } = target;
      try {
        const scaled = await downscaleImage(file, MAIN_IMAGE_MAX_WIDTH);
        const uploadRes = await uploadCardImage(scaled);
        if (!uploadRes.ok) {
          showToast(uploadRes.error, true);
          return;
        }
        const patchRes = await updateMainSku({
          cardId: row.card.catalogCardId,
          name: row.card.name,
          imageUrl: uploadRes.data.url,
          imageStoragePath: uploadRes.data.storagePath,
        });
        if (!patchRes.ok) {
          showToast(patchRes.error, true);
          return;
        }
        showToast("Card image updated.");
        router.refresh();
      } catch {
        showToast("Image upload failed.", true);
      }
    },
    [router, showToast],
  );

  /** Per-variant image: trigger file picker, then upload + upsertStockSku. */
  const handleVariantUploadImage = useCallback(
    (row: AdminCardCatalogRow, group: StockSkuGroupElement) => {
      pendingImageTarget.current = { kind: "variant", row, group };
      variantImageRef.current?.click();
    },
    [],
  );

  const handleVariantImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const target = pendingImageTarget.current;
      if (!file || !target || target.kind !== "variant") return;
      if (variantImageRef.current) variantImageRef.current.value = "";
      pendingImageTarget.current = null;

      const { row, group } = target;
      try {
        const scaled = await downscaleImage(file, VARIANT_IMAGE_MAX_WIDTH);
        const uploadRes = await uploadCardImage(scaled);
        if (!uploadRes.ok) {
          showToast(uploadRes.error, true);
          return;
        }
        // Carry the group's existing sku/label/unitKind so we don't blank them.
        const skuRes = await upsertStockSku({
          stockSkuId: group.stockSkuId ?? undefined,
          cardId: row.card.catalogCardId,
          sku: group.sku,
          label: group.label,
          unitKind: (group.unitKind as "card" | "pack" | "box" | "other") ?? undefined,
          imageUrl: uploadRes.data.url,
          imageStoragePath: uploadRes.data.storagePath,
        });
        if (!skuRes.ok) {
          showToast(skuRes.error, true);
          return;
        }
        showToast("Variant photo updated.");
        router.refresh();
      } catch {
        showToast("Image upload failed.", true);
      }
    },
    [router, showToast],
  );

  // ---- Quick-remove: archive 1 unit (negative delta) ----

  const handleVariantQuickRemove = useCallback(
    async (row: AdminCardCatalogRow, group: StockSkuGroupElement) => {
      if (isVariantLoadedInCampaign(group, row.prizes)) {
        showToast("Remove it from its campaigns before reducing stock.", true);
        return;
      }
      if (group.availableUnits <= 0) {
        showToast("No available stock to remove.", true);
        return;
      }

      // Prefer stockSkuId; fall back to stockUnitGroupKey.
      const identifiers: {
        stockSkuId?: string;
        stockUnitGroupKey?: string;
      } = group.stockSkuId
        ? { stockSkuId: group.stockSkuId }
        : { stockUnitGroupKey: group.key };

      const res = await adjustCardStock({
        cardId: row.card.catalogCardId,
        quantityDelta: -1,
        ...identifiers,
      });
      if (!res.ok) {
        showToast(res.error, true);
        return;
      }
      showToast("Moved 1 unit to Removed.");
      router.refresh();
    },
    [router, showToast],
  );

  // ---- Edit variant modal ----

  const handleVariantEdit = useCallback(
    (row: AdminCardCatalogRow, group: StockSkuGroupElement) => {
      setModal({
        kind: "editVariant",
        target: {
          cardId: row.card.catalogCardId,
          cardName: row.card.name,
          group,
          prizes: row.prizes,
        },
      });
    },
    [],
  );

  // ---- Open box modal ----

  const handleOpenBox = useCallback(
    (row: AdminCardCatalogRow, boxGroup: StockSkuGroupElement) => {
      setModal({
        kind: "openBox",
        target: {
          cardId: row.card.catalogCardId,
          cardName: row.card.name,
          boxGroup,
          allGroups: row.card.stockSkuGroups ?? [],
        },
      });
    },
    [],
  );

  const handleOpenBoxDone = useCallback(
    (msg: string, isError?: boolean) => {
      setModal({ kind: "closed" });
      showToast(msg, isError);
      if (!isError) router.refresh();
    },
    [router, showToast],
  );

  const closeModal = useCallback(() => setModal({ kind: "closed" }), []);

  const handleEditVariantDone = useCallback(
    (msg: string, isError?: boolean) => {
      setModal({ kind: "closed" });
      showToast(msg, isError);
      if (!isError) router.refresh();
    },
    [router, showToast],
  );

  // ---- Assign campaign modal ----

  const handleAssign = useCallback(
    (row: AdminCardCatalogRow) => {
      setModal({
        kind: "assignCampaign",
        target: {
          cardId: row.card.catalogCardId,
          cardName: row.card.name,
          catalogCategory: String(row.card.catalogCategory ?? "Single Cards"),
          prizeCategory: String(row.card.prizeCategory ?? ""),
          stockSkuGroups: row.card.stockSkuGroups ?? [],
          prizes: row.prizes,
        },
      });
    },
    [],
  );

  const handleAssignDone = useCallback(
    (msg: string, isError?: boolean) => {
      setModal({ kind: "closed" });
      showToast(msg, isError);
      if (!isError) router.refresh();
    },
    [router, showToast],
  );

  // Dialog a11y: Escape closes; move focus into the modal on open.
  useEffect(() => {
    if (modal.kind === "closed") return;
    // These modals handle their own Escape internally
    if (modal.kind === "editVariant" || modal.kind === "openBox" || modal.kind === "assignCampaign") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    modalRef.current
      ?.querySelector<HTMLElement>("input, select, textarea, button")
      ?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [modal.kind, closeModal]);

  return (
    <div className="pcx-screen">
      <div className="pcx-header-actions">
        <button
          type="button"
          className="pcx-btn pcx-btn-primary"
          onClick={() => setDrawer(openDrawerFresh())}
        >
          Add stock
        </button>
        <button
          type="button"
          className="pcx-btn pcx-btn-ghost"
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
            {query.trim()
              ? <>No items match &ldquo;{query}&rdquo;.</>
              : category !== "all"
                ? <>No {category} in catalog.</>
                : <>No items in catalog.</>}
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
              onAddStock={handleAddStockRow}
              onVariantUploadImage={handleVariantUploadImage}
              onVariantQuickRemove={handleVariantQuickRemove}
              onVariantEdit={handleVariantEdit}
              onMainImageUpload={handleMainImageUpload}
              onOpenBox={handleOpenBox}
              campaigns={campaigns}
              onAssign={handleAssign}
              onToast={showToast}
            />
          ))
        )}
      </div>

      {/* Hidden file inputs for image uploads */}
      <input
        ref={mainImageRef}
        type="file"
        accept="image/*"
        className="pcx-sr-only"
        onChange={handleMainImageChange}
        tabIndex={-1}
      />
      <input
        ref={variantImageRef}
        type="file"
        accept="image/*"
        className="pcx-sr-only"
        onChange={handleVariantImageChange}
        tabIndex={-1}
      />

      {/* Create / Edit Main SKU modal */}
      {(modal.kind === "create" || modal.kind === "edit") && (
        <div
          className="pcx-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="pcx-modal" role="document" ref={modalRef}>
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

      {/* Edit variant modal */}
      {modal.kind === "editVariant" && (
        <EditVariantModal
          target={modal.target}
          onClose={closeModal}
          onDone={handleEditVariantDone}
        />
      )}

      {/* Open box modal */}
      {modal.kind === "openBox" && (
        <OpenBoxModal
          target={modal.target}
          onClose={closeModal}
          onDone={handleOpenBoxDone}
        />
      )}

      {/* Assign campaign modal */}
      {modal.kind === "assignCampaign" && (
        <AssignCampaignModal
          target={modal.target}
          campaigns={campaigns}
          isOwner={isOwner}
          onClose={closeModal}
          onDone={handleAssignDone}
        />
      )}

      {/* Add-stock drawer — key forces remount on each open/re-target */}
      <AddStockDrawer
        key={drawer.kind === "closed" ? "closed" : `open-${drawer.openId}`}
        cards={cards}
        state={drawer}
        onClose={() => setDrawer(closedDrawer)}
        onToast={showToast}
      />

      {/* Toast */}
      {toast && (
        <div className={`pcx-toast${toast.isError ? " error" : ""}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
