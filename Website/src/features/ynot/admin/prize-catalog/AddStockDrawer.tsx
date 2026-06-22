"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import {
  adjustCardStock,
  upsertStockSku,
  type CertLookup,
  type StockAdjustInput,
} from "./catalog-api";
import { CertLookupField } from "./CertLookupField";
import { MainSkuForm } from "./MainSkuForm";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type StockCategory = "card" | "box" | "pack";
type ConditionMode = "graded" | "raw";
type GradingService = "psa" | "bgs" | "cgc";

type DrawerState =
  | { kind: "closed" }
  | { kind: "open"; step: 1 | 2 | 3; category: StockCategory | null; targetCard: CardCatalogItem | null; createMode: boolean };

type AddStockDrawerProps = {
  cards: CardCatalogItem[];
  state: DrawerState;
  onClose: () => void;
  onToast: (msg: string, isError?: boolean) => void;
};

/* Map category display string to our StockCategory type */
function catalogCategoryToStock(cat: string | undefined): StockCategory {
  if (cat === "Sealed Boxes") return "box";
  if (cat === "Sealed Packs") return "pack";
  return "card";
}

function stockCategoryLabel(cat: StockCategory): string {
  return cat === "card" ? "Single Card" : cat === "box" ? "Sealed Box" : "Sealed Pack";
}

function stockCategoryToUnit(cat: StockCategory): "card" | "box" | "pack" {
  return cat;
}

/* ------------------------------------------------------------------ */
/*  Drawer                                                             */
/* ------------------------------------------------------------------ */

export function AddStockDrawer({ cards, state, onClose, onToast }: AddStockDrawerProps) {
  const router = useRouter();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Internal wizard state (derived from DrawerState, then independent)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [category, setCategory] = useState<StockCategory | null>(null);
  const [targetCard, setTargetCard] = useState<CardCatalogItem | null>(null);
  const [createMode, setCreateMode] = useState(false);

  // Step 2 search
  const [searchQuery, setSearchQuery] = useState("");

  // Step 3 stock fields
  const [conditionMode, setConditionMode] = useState<ConditionMode>("graded");
  const [gradingService, setGradingService] = useState<GradingService>("psa");
  const [grade, setGrade] = useState("10");
  const [certNumber, setCertNumber] = useState("");
  const [gemrateId, setGemrateId] = useState<string | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Sync from parent-controlled state when drawer opens
  useEffect(() => {
    if (state.kind === "open") {
      setStep(state.step);
      setCategory(state.category);
      setTargetCard(state.targetCard);
      setCreateMode(state.createMode);
      setSearchQuery("");
      setConditionMode("graded");
      setGradingService("psa");
      setGrade("10");
      setCertNumber("");
      setGemrateId(undefined);
      setQuantity(1);
      setSubmitting(false);
    }
  }, [state]);

  // Escape key closes drawer
  useEffect(() => {
    if (state.kind !== "open") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [state.kind, onClose]);

  // Focus first interactive element on step change
  useEffect(() => {
    if (state.kind !== "open") return;
    drawerRef.current
      ?.querySelector<HTMLElement>("input, select, button:not(.pcx-drawer-close)")
      ?.focus();
  }, [state.kind, step]);

  /* ---------- Search / filter helpers ---------- */
  const searchResults = useMemo(() => {
    if (!category) return [];
    const catFilter = category === "card" ? "Single Cards" : category === "box" ? "Sealed Boxes" : "Sealed Packs";
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

  /* ---------- Cert lookup result handler ---------- */
  const handleCertResult = useCallback((lookup: CertLookup) => {
    if (lookup.grade) setGrade(lookup.grade);
    if (lookup.gemrateId) setGemrateId(lookup.gemrateId);
    // Cert entered => quantity locks to 1 (one physical card)
    setQuantity(1);
  }, []);

  /* ---------- Resolve or create Sub-SKU, then call adjustCardStock ---------- */
  const handleCommit = useCallback(async () => {
    if (!targetCard) return;
    setSubmitting(true);

    const cardId = targetCard.catalogCardId;

    // Determine condition and stock-sku resolution parameters
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

    // --- Sub-SKU resolution ---
    // The route REQUIRES a stockSkuId when adding stock (delta > 0).
    // 1. Check if the Main SKU already has a matching Sub-SKU in stockSkuGroups.
    // 2. If none exists, create one via upsertStockSku, then use the returned id.

    const groups = targetCard.stockSkuGroups ?? [];
    let stockSkuId: string | undefined;

    // Build the SKU label/code we want to match or create
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
      skuCode = `${targetCard.code ?? targetCard.modelCode ?? "ITEM"}-${category?.toUpperCase() ?? "ITEM"}`.toUpperCase();
    }

    // Try to find a matching existing Sub-SKU
    const matchingGroup = groups.find((g) => {
      // For graded cards, match by unitKind + condition of first unit
      if (category === "card" && conditionMode === "graded") {
        const firstUnit = g.units[0];
        return (
          firstUnit?.condition === "graded" &&
          firstUnit?.gradingService?.toLowerCase() === gradingService &&
          firstUnit?.grade === grade
        );
      }
      if (category === "card" && conditionMode === "raw") {
        const firstUnit = g.units[0];
        return firstUnit?.condition === "raw" || g.label?.toLowerCase().includes("raw");
      }
      // For box/pack, match by unitKind
      const gKind = g.unitKind?.toLowerCase();
      return gKind === category;
    });

    if (matchingGroup?.stockSkuId) {
      stockSkuId = matchingGroup.stockSkuId;
    } else {
      // Create the Sub-SKU first
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
      // Extract the stockSkuId from the response
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

    // Success — build toast message
    const isTest = category === "card" && conditionMode === "graded" && !adjustCert && finalQty > 1;
    const testTag = isTest ? " (TEST)" : "";
    onToast(`Added ${finalQty}x ${skuLabel}${testTag}`);
    onClose();
    router.refresh();
  }, [
    targetCard, category, conditionMode, gradingService, grade,
    certNumber, gemrateId, quantity, onToast, onClose, router,
  ]);

  /* ---------- Navigation ---------- */
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

  const title = step === 1
    ? "Add stock"
    : category
      ? `Add ${stockCategoryLabel(category).toLowerCase()} stock`
      : "Add stock";

  return (
    <>
      <div className="pcx-scrim" onClick={onClose} />
      <div className="pcx-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label={title}>
        <header className="pcx-drawer-head">
          <h2 className="pcx-drawer-title">{title}</h2>
          <button type="button" className="pcx-drawer-close" onClick={onClose} aria-label="Close">&times;</button>
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
              cards={cards}
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
                // Cert entered => lock quantity to 1
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
          <button type="button" className="pcx-btn pcx-btn-ghost" onClick={goBack}>
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
/*  Step bar                                                           */
/* ------------------------------------------------------------------ */

function StepBar({ current }: { current: 1 | 2 | 3 }) {
  const steps: Array<[string, string]> = [
    ["1", "Category"],
    ["2", "Card / product"],
    ["3", "Stock"],
  ];
  return (
    <div className="pcx-wiz-steps">
      {steps.map(([num, label], i) => {
        const sn = (i + 1) as 1 | 2 | 3;
        const cls =
          current === sn ? "pcx-ws on" : current > sn ? "pcx-ws done" : "pcx-ws";
        return (
          <div key={num} className={cls}>
            <span className="pcx-ws-n">{current > sn ? "✓" : num}</span>
            <span className="pcx-ws-l">{label}</span>
            {i < steps.length - 1 && <span className="pcx-ws-sep" />}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1 — Category picker                                           */
/* ------------------------------------------------------------------ */

function Step1Category({
  selected,
  onPick,
}: {
  selected: StockCategory | null;
  onPick: (c: StockCategory) => void;
}) {
  const choices: Array<{ cat: StockCategory; label: string; sub: string }> = [
    { cat: "card", label: "Single Card", sub: "graded or raw" },
    { cat: "box", label: "Sealed Box", sub: "opens into packs" },
    { cat: "pack", label: "Sealed Pack", sub: "single sealed pack" },
  ];
  return (
    <div className="pcx-wiz-sec">
      <div className="pcx-step-label">
        <span className="pcx-step-n">1</span> What category are you adding?
      </div>
      <div className="pcx-choice-grid">
        {choices.map(({ cat, label, sub }) => (
          <button
            key={cat}
            type="button"
            className={`pcx-choice${selected === cat ? " on" : ""}`}
            onClick={() => onPick(cat)}
          >
            <span className="pcx-choice-label">{label}</span>
            <span className="pcx-choice-sub">{sub}</span>
          </button>
        ))}
      </div>
      <p className="pcx-wiz-help">
        Pick a category first &mdash; it decides what gets linked. A <strong>Sealed Box</strong> links to the pack it opens into so stock stays connected.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2 — Search existing cards                                     */
/* ------------------------------------------------------------------ */

function Step2Search({
  category,
  query,
  onQuery,
  results,
  onSelect,
  onCreateNew,
}: {
  category: StockCategory;
  query: string;
  onQuery: (q: string) => void;
  results: CardCatalogItem[];
  onSelect: (c: CardCatalogItem) => void;
  onCreateNew: () => void;
}) {
  const catLabel = stockCategoryLabel(category).toLowerCase();
  return (
    <div className="pcx-wiz-sec">
      <div className="pcx-step-label">
        <span className="pcx-step-n">2</span> Which {catLabel}?
      </div>
      <p className="pcx-wiz-help">
        Search your catalog. If it exists, pick it and skip straight to adding stock. If not, create it once.
      </p>
      <div className="pcx-wiz-search">
        <input
          className="pcx-input"
          placeholder={`Type a code or name...`}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="pcx-wiz-results">
        {results.length > 0
          ? results.map((c) => {
              const groups = c.stockSkuGroups ?? [];
              const avail = c.stockAvailable ?? 0;
              return (
                <button
                  key={c.catalogCardId}
                  type="button"
                  className="pcx-wiz-result"
                  onClick={() => onSelect(c)}
                >
                  <span className="pcx-wr-main">
                    <span className="pcx-wr-name">{c.name}</span>
                    <span className="pcx-wr-meta mono">
                      {c.code ?? c.modelCode ?? ""} &middot; {c.series ?? ""}
                    </span>
                  </span>
                  <span className="pcx-wr-stock">
                    {groups.length} variant{groups.length === 1 ? "" : "s"} &middot;{" "}
                    <strong>{avail}</strong> free
                  </span>
                  <span className="pcx-wr-go">&rsaquo;</span>
                </button>
              );
            })
          : query.trim() && (
              <div className="pcx-wiz-noresult">
                No {catLabel} matches &ldquo;{query}&rdquo;.
              </div>
            )}
        <button type="button" className="pcx-wiz-create-row" onClick={onCreateNew}>
          <span>+ Create a new {catLabel}</span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2 — Create new Main SKU (delegates to existing MainSkuForm)   */
/* ------------------------------------------------------------------ */

function Step2Create({
  cards,
  onDone,
}: {
  cards: CardCatalogItem[];
  onDone: (card: CardCatalogItem | null) => void;
}) {
  // After the MainSkuForm completes (router.refresh), the new card
  // will appear in `cards` on re-render. For now we close the create
  // pane so step 2 search can find the newly created card.
  return (
    <div className="pcx-wiz-sec">
      <div className="pcx-step-label">
        <span className="pcx-step-n">2</span> Create new Main SKU
      </div>
      <p className="pcx-wiz-help">
        This creates the identity record. You will add stock in the next step.
      </p>
      <MainSkuForm
        onDone={() => {
          // After creation + router.refresh, the user can search for
          // the newly created card. We exit create mode so they can pick it.
          onDone(null);
        }}
      />
      <div className="pcx-wiz-cancel">
        <button type="button" className="pcx-btn pcx-btn-ghost" onClick={() => onDone(null)}>
          Back to search
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3 — Add stock details                                         */
/* ------------------------------------------------------------------ */

const GRADE_OPTIONS = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6", "5", "4"];

function Step3Stock({
  card,
  category,
  conditionMode,
  onConditionMode,
  gradingService,
  onGradingService,
  grade,
  onGrade,
  certNumber,
  onCertNumber,
  onCertResult,
  quantity,
  onQuantity,
  onGoBack,
}: {
  card: CardCatalogItem;
  category: StockCategory;
  conditionMode: ConditionMode;
  onConditionMode: (m: ConditionMode) => void;
  gradingService: GradingService;
  onGradingService: (s: GradingService) => void;
  grade: string;
  onGrade: (g: string) => void;
  certNumber: string;
  onCertNumber: (c: string) => void;
  onCertResult: (lookup: CertLookup) => void;
  quantity: number;
  onQuantity: (q: number) => void;
  onGoBack: () => void;
}) {
  const hasCert = certNumber.trim().length > 0;
  const isTest = category === "card" && conditionMode === "graded" && !hasCert && quantity > 1;

  return (
    <div className="pcx-wiz-sec">
      <div className="pcx-step-label">
        <span className="pcx-step-n">3</span> Add stock
      </div>

      {/* Anchor — shows which card we are adding to */}
      <div className="pcx-wiz-anchor">
        <div className="pcx-wa-info">
          <div className="pcx-wa-name">{card.name}</div>
          <div className="pcx-wa-meta mono">{card.code ?? card.modelCode ?? ""} &middot; {card.series ?? ""}</div>
        </div>
        <button type="button" className="pcx-btn pcx-btn-ghost pcx-wa-change" onClick={onGoBack}>
          Change
        </button>
      </div>

      <div className="pcx-wiz-fields">
        {category === "card" && (
          <>
            {/* Condition pills */}
            <div className="pcx-field">
              <label>Condition</label>
              <div className="pcx-seg-pills">
                <button
                  type="button"
                  className={`pcx-seg-pill${conditionMode === "graded" ? " on" : ""}`}
                  onClick={() => onConditionMode("graded")}
                >
                  Graded
                </button>
                <button
                  type="button"
                  className={`pcx-seg-pill${conditionMode === "raw" ? " on" : ""}`}
                  onClick={() => onConditionMode("raw")}
                >
                  Raw / ungraded
                </button>
              </div>
            </div>

            {conditionMode === "graded" && (
              <>
                {/* Grading service pills */}
                <div className="pcx-form-row2">
                  <div className="pcx-field">
                    <label>Grading company</label>
                    <div className="pcx-seg-pills">
                      {(["psa", "bgs", "cgc"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`pcx-seg-pill${gradingService === s ? " on" : ""}`}
                          onClick={() => onGradingService(s)}
                        >
                          {s.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pcx-field">
                    <label htmlFor="pcx-stock-grade">Grade</label>
                    <select
                      id="pcx-stock-grade"
                      className="pcx-input"
                      value={grade}
                      onChange={(e) => onGrade(e.target.value)}
                    >
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Cert number + GemRate lookup */}
                <div className="pcx-field">
                  <label>
                    Cert number <span className="pcx-opt">optional</span>
                  </label>
                  <CertLookupField
                    grader={gradingService}
                    onResult={(lookup) => {
                      onCertResult(lookup);
                      // If the lookup found a grade, set it
                      if (lookup.grade) onGrade(lookup.grade);
                    }}
                  />
                  <span className="pcx-hint">
                    A real graded card is one-of-one &mdash; enter its cert (qty locks to 1).{" "}
                    <strong>Leave blank for test stock</strong> (qty can be &gt;1, tagged TEST).
                  </span>
                </div>

                {/* Quantity */}
                <div className="pcx-field">
                  <label htmlFor="pcx-stock-qty">Quantity</label>
                  <input
                    id="pcx-stock-qty"
                    className="pcx-input"
                    type="number"
                    min={1}
                    value={quantity}
                    disabled={hasCert}
                    onChange={(e) => onQuantity(Math.max(1, Number(e.target.value) || 1))}
                  />
                  {hasCert && (
                    <span className="pcx-hint">Locked to 1 &mdash; one cert = one physical card.</span>
                  )}
                  {isTest && (
                    <span className="pcx-hint pcx-hint-warn">
                      No cert + qty &gt; 1 = <strong>TEST</strong> stock (tagged TEST in the catalog).
                    </span>
                  )}
                </div>
              </>
            )}

            {conditionMode === "raw" && (
              <div className="pcx-field">
                <label htmlFor="pcx-stock-qty-raw">Quantity</label>
                <input
                  id="pcx-stock-qty-raw"
                  className="pcx-input"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => onQuantity(Math.max(1, Number(e.target.value) || 1))}
                />
                <span className="pcx-hint">
                  Pooled into this card&apos;s raw / ungraded line.
                </span>
              </div>
            )}
          </>
        )}

        {/* Box / Pack: just quantity */}
        {(category === "box" || category === "pack") && (
          <div className="pcx-field">
            <label htmlFor="pcx-stock-qty-sealed">
              How many sealed {category === "box" ? "boxes" : "packs"}
            </label>
            <input
              id="pcx-stock-qty-sealed"
              className="pcx-input"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => onQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
        )}

        {/* Preview chip */}
        <StockPreview card={card} category={category} conditionMode={conditionMode} gradingService={gradingService} isTest={isTest} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Preview chip at bottom of step 3                                   */
/* ------------------------------------------------------------------ */

function StockPreview({
  card,
  category,
  conditionMode,
  gradingService,
  isTest,
}: {
  card: CardCatalogItem;
  category: StockCategory;
  conditionMode: ConditionMode;
  gradingService: GradingService;
  isTest: boolean;
}) {
  let chipClass: string;
  let chipText: string;
  let meta: string;

  if (category === "card" && conditionMode === "graded") {
    chipClass = "pcx-grade-chip g10";
    chipText = `${gradingService.toUpperCase()}`;
    meta = isTest
      ? "Test stock (no cert) - tagged TEST in the catalog."
      : "Graded card - its own row. With a cert = one real card.";
  } else if (category === "card") {
    chipClass = "pcx-grade-chip raw";
    chipText = "RAW";
    meta = "Pooled into this card's single raw / ungraded line.";
  } else if (category === "box") {
    chipClass = "pcx-grade-chip sealed";
    chipText = "SEALED BOX";
    meta = "Sealed boxes - open later to make packs.";
  } else {
    chipClass = "pcx-grade-chip sealed";
    chipText = "SEALED PACK";
    meta = "Sealed packs, ship to winners unopened.";
  }

  return (
    <div className="pcx-preview">
      <div className="pcx-pv-label">This adds to</div>
      <div className="pcx-pv-sku">
        <span className={chipClass}>{chipText}</span>
        <span className="mono">{card.code ?? card.modelCode ?? ""}</span>
      </div>
      <div className="pcx-pv-meta">
        {meta} Lands in <strong style={{ color: "var(--pcx-available)" }}>Available</strong> stock.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Public helpers for parent to open the drawer                       */
/* ------------------------------------------------------------------ */

export type { DrawerState };

export function openDrawerFresh(): DrawerState {
  return { kind: "open", step: 1, category: null, targetCard: null, createMode: false };
}

export function openDrawerForCard(card: CardCatalogItem): DrawerState {
  const category = catalogCategoryToStock(card.catalogCategory);
  return { kind: "open", step: 3, category, targetCard: card, createMode: false };
}

export const closedDrawer: DrawerState = { kind: "closed" };
