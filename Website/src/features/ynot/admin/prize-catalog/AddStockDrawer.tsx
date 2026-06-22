"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Module-level counter for generating unique openId values. */
let nextOpenId = 1;
import { useRouter } from "next/navigation";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import {
  adjustCardStock,
  upsertStockSku,
  type CertLookup,
  type StockAdjustInput,
} from "./catalog-api";
import {
  StepBar,
  Step1Category,
  Step2Search,
  Step2Create,
  Step3Stock,
  catalogCategoryToStock,
  stockCategoryLabel,
  stockCategoryToUnit,
  type DrawerState,
  type StockCategory,
  type ConditionMode,
  type GradingService,
} from "./add-stock";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type AddStockDrawerProps = {
  cards: CardCatalogItem[];
  state: DrawerState;
  onClose: () => void;
  onToast: (msg: string, isError?: boolean) => void;
};

/* ------------------------------------------------------------------ */
/*  Drawer shell                                                       */
/* ------------------------------------------------------------------ */

export function AddStockDrawer({ cards, state, onClose, onToast }: AddStockDrawerProps) {
  const router = useRouter();
  const drawerRef = useRef<HTMLDivElement>(null);

  /* ---- internal wizard state ----
   * Initialized directly from `state` props. The parent renders this
   * component with a key derived from `state.openId`, so a fresh mount
   * (with correct initial values) happens on every open/re-target.
   */
  const initStep = state.kind === "open" ? state.step : 1;
  const initCategory = state.kind === "open" ? state.category : null;
  const initTargetCard = state.kind === "open" ? state.targetCard : null;
  const initCreateMode = state.kind === "open" ? state.createMode : false;

  const [step, setStep] = useState<1 | 2 | 3>(initStep);
  const [category, setCategory] = useState<StockCategory | null>(initCategory);
  const [targetCard, setTargetCard] = useState<CardCatalogItem | null>(initTargetCard);
  const [createMode, setCreateMode] = useState(initCreateMode);

  /* Step 2 search */
  const [searchQuery, setSearchQuery] = useState("");

  /* Step 3 stock fields */
  const [conditionMode, setConditionMode] = useState<ConditionMode>("graded");
  const [gradingService, setGradingService] = useState<GradingService>("psa");
  const [grade, setGrade] = useState("10");
  const [certNumber, setCertNumber] = useState("");
  const [gemrateId, setGemrateId] = useState<string | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  /* Escape key closes drawer */
  useEffect(() => {
    if (state.kind !== "open") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [state.kind, onClose]);

  /* Focus first interactive element on step change */
  useEffect(() => {
    if (state.kind !== "open") return;
    drawerRef.current
      ?.querySelector<HTMLElement>("input, select, button:not(.pcx-drawer-close)")
      ?.focus();
  }, [state.kind, step]);

  /* ---- search / filter helpers ---- */
  const searchResults = useMemo(() => {
    if (!category) return [];
    const catFilter =
      category === "card" ? "Single Cards" : category === "box" ? "Sealed Boxes" : "Sealed Packs";
    const pool = cards.filter((c) => (c.catalogCategory ?? "Single Cards") === catFilter);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((c) =>
        [c.name, c.code, c.cardSet, c.series].some((s) =>
          String(s ?? "").toLowerCase().includes(q),
        ),
      )
      .slice(0, 8);
  }, [cards, category, searchQuery]);

  /* ---- cert lookup result handler ---- */
  const handleCertResult = useCallback((lookup: CertLookup) => {
    if (lookup.grade) setGrade(lookup.grade);
    if (lookup.gemrateId) setGemrateId(lookup.gemrateId);
    // Cert entered => quantity locks to 1 (one physical card)
    setQuantity(1);
  }, []);

  /* ---- resolve or create Sub-SKU, then call adjustCardStock ---- */
  const handleCommit = useCallback(async () => {
    if (!targetCard) return;
    setSubmitting(true);

    const cardId = targetCard.catalogCardId;

    let condition: StockAdjustInput["condition"];
    let adjustGrade: string | undefined;
    let adjustService: StockAdjustInput["gradingService"];
    let adjustCert: string | undefined;
    let adjustGemrateId: string | undefined;
    let unitKind: "card" | "pack" | "box" | "other";

    if (category === "card") {
      condition = conditionMode === "graded" ? "graded" : "raw";
      unitKind = "card";
      if (conditionMode === "graded") {
        adjustGrade = grade;
        adjustService = gradingService;
        adjustCert = certNumber.trim() || undefined;
        adjustGemrateId = gemrateId;
      }
    } else {
      condition = "sealed";
      unitKind = stockCategoryToUnit(category ?? "card");
    }

    /* --- Sub-SKU resolution --- */
    const groups = targetCard.stockSkuGroups ?? [];
    let stockSkuId: string | undefined;

    let skuLabel: string;
    let skuCode: string;

    if (category === "card" && conditionMode === "graded") {
      const svc = gradingService.toUpperCase();
      skuLabel = `${svc} ${grade}`;
      skuCode = `${targetCard.code ?? targetCard.modelCode ?? "CARD"}-${svc}-${grade}`.toUpperCase();
    } else if (category === "card") {
      skuLabel = "Raw / ungraded";
      skuCode = `${targetCard.code ?? targetCard.modelCode ?? "CARD"}-RAW`.toUpperCase();
    } else {
      const kindLabel = category === "box" ? "Sealed Box" : "Sealed Pack";
      skuLabel = kindLabel;
      skuCode =
        `${targetCard.code ?? targetCard.modelCode ?? "ITEM"}-${(category ?? "ITEM").toUpperCase()}`.toUpperCase();
    }

    /* --- Robust Sub-SKU matching (FIX 3) ---
     * Prefer GROUP-level fields (unitKind, sku, label) over peeking into
     * g.units[0], which fails on empty groups and can false-match raw
     * via a label substring.  Only fall back to first-unit inspection
     * when group-level fields are insufficient.
     */
    const matchingGroup = groups.find((g) => {
      // Guard: skip groups with empty units AND no usable group-level data
      const gKind = g.unitKind?.toLowerCase() ?? null;

      if (category === "card" && conditionMode === "graded") {
        // Best: match on exact sku code
        if (g.sku?.toUpperCase() === skuCode) return true;
        // Fallback: group unitKind is "card" AND label matches "PSA 10" etc.
        if (gKind === "card" && g.label === skuLabel) return true;
        // Last resort: peek at first unit (only if units exist)
        if (g.units.length > 0) {
          const first = g.units[0];
          return (
            first.condition === "graded" &&
            first.gradingService?.toLowerCase() === gradingService &&
            first.grade === grade
          );
        }
        return false;
      }

      if (category === "card" && conditionMode === "raw") {
        // Best: match on exact sku code
        if (g.sku?.toUpperCase() === skuCode) return true;
        // Group-level: unitKind is "card" AND label exactly matches
        if (gKind === "card" && g.label === skuLabel) return true;
        // Last resort: peek at first unit
        if (g.units.length > 0) {
          return g.units[0].condition === "raw";
        }
        return false;
      }

      // Box / Pack: match on group unitKind
      return gKind === category;
    });

    if (matchingGroup?.stockSkuId) {
      stockSkuId = matchingGroup.stockSkuId;
    } else {
      const skuRes = await upsertStockSku({
        cardId,
        sku: skuCode,
        label: skuLabel,
        unitKind,
      });
      if (!skuRes.ok) {
        onToast(skuRes.error, true);
        setSubmitting(false);
        return;
      }
      const created = skuRes.data.stockSku as Record<string, unknown>;
      stockSkuId = String(created.stockSkuId ?? created.id ?? "");
      if (!stockSkuId) {
        onToast("Failed to create Sub-SKU — no ID returned.", true);
        setSubmitting(false);
        return;
      }
    }

    // Cert with quantity must be exactly 1
    const finalQty = adjustCert ? 1 : quantity;

    const stockInput: StockAdjustInput = {
      cardId,
      quantityDelta: finalQty,
      reason: adjustCert
        ? `Add ${gradingService.toUpperCase()} ${grade} cert #${adjustCert}`
        : `Add ${finalQty}x ${skuLabel}`,
      stockSkuId,
      condition,
      grade: adjustGrade,
      gradingService: adjustService,
      certNumber: adjustCert,
      gemrateId: adjustGemrateId,
    };

    const res = await adjustCardStock(stockInput);
    setSubmitting(false);

    if (!res.ok) {
      onToast(res.error, true);
      return;
    }

    const isTest =
      category === "card" && conditionMode === "graded" && !adjustCert && finalQty > 1;
    const testTag = isTest ? " (TEST)" : "";
    onToast(`Added ${finalQty}x ${skuLabel}${testTag}`);
    onClose();
    router.refresh();
  }, [
    targetCard, category, conditionMode, gradingService, grade,
    certNumber, gemrateId, quantity, onToast, onClose, router,
  ]);

  /* ---- navigation ---- */
  const goBack = useCallback(() => {
    if (step === 3) {
      setStep(2);
      setTargetCard(null);
      setCreateMode(false);
    } else if (step === 2) {
      setStep(1);
      setCategory(null);
    } else {
      onClose();
    }
  }, [step, onClose]);

  const pickCategory = useCallback((cat: StockCategory) => {
    setCategory(cat);
    setStep(2);
    setTargetCard(null);
    setCreateMode(false);
    setSearchQuery("");
  }, []);

  const selectCard = useCallback((card: CardCatalogItem) => {
    setTargetCard(card);
    setCreateMode(false);
    setStep(3);
    setConditionMode("graded");
    setGradingService("psa");
    setGrade("10");
    setCertNumber("");
    setGemrateId(undefined);
    setQuantity(1);
  }, []);

  if (state.kind !== "open") return null;

  const title =
    step === 1
      ? "Add stock"
      : category
        ? `Add ${stockCategoryLabel(category).toLowerCase()} stock`
        : "Add stock";

  return (
    <>
      <div className="pcx-scrim" onClick={onClose} />
      <div
        className="pcx-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="pcx-drawer-head">
          <h2 className="pcx-drawer-title">{title}</h2>
          <button
            type="button"
            className="pcx-drawer-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </header>

        <div className="pcx-drawer-body">
          <StepBar current={step} />

          {step === 1 && (
            <Step1Category selected={category} onPick={pickCategory} />
          )}

          {step === 2 && !createMode && category && (
            <Step2Search
              category={category}
              query={searchQuery}
              onQuery={setSearchQuery}
              results={searchResults}
              onSelect={selectCard}
              onCreateNew={() => setCreateMode(true)}
            />
          )}

          {step === 2 && createMode && category && (
            <Step2Create
              onDone={(card) => {
                if (card) {
                  selectCard(card);
                } else {
                  setCreateMode(false);
                }
              }}
            />
          )}

          {step === 3 && targetCard && (
            <Step3Stock
              card={targetCard}
              category={category ?? "card"}
              conditionMode={conditionMode}
              onConditionMode={setConditionMode}
              gradingService={gradingService}
              onGradingService={setGradingService}
              grade={grade}
              onGrade={setGrade}
              certNumber={certNumber}
              onCertNumber={(v) => {
                setCertNumber(v);
                if (v.trim()) setQuantity(1);
              }}
              onCertResult={handleCertResult}
              quantity={quantity}
              onQuantity={setQuantity}
              onGoBack={() => {
                setStep(2);
                setTargetCard(null);
              }}
            />
          )}
        </div>

        <footer className="pcx-drawer-foot">
          <button
            type="button"
            className="pcx-btn pcx-btn-ghost"
            onClick={goBack}
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step === 3 && (
            <button
              type="button"
              className="pcx-btn pcx-btn-primary"
              disabled={submitting || !targetCard}
              onClick={handleCommit}
            >
              {submitting ? "Adding..." : "Add to stock"}
            </button>
          )}
        </footer>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Public helpers for parent to open the drawer                       */
/* ------------------------------------------------------------------ */

export type { DrawerState };

export function openDrawerFresh(): DrawerState {
  return { kind: "open", step: 1, category: null, targetCard: null, createMode: false, openId: nextOpenId++ };
}

export function openDrawerForCard(card: CardCatalogItem): DrawerState {
  const category = catalogCategoryToStock(card.catalogCategory);
  return { kind: "open", step: 3, category, targetCard: card, createMode: false, openId: nextOpenId++ };
}

export const closedDrawer: DrawerState = { kind: "closed" };
