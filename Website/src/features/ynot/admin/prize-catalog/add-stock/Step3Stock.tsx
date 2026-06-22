import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import type { CertLookup } from "../catalog-api";
import { CertLookupField } from "../CertLookupField";
import type { ConditionMode, GradingService, StockCategory } from "./types";

const GRADE_OPTIONS = [
  "10",
  "9.5",
  "9",
  "8.5",
  "8",
  "7.5",
  "7",
  "6",
  "5",
  "4",
];

const GRADING_SERVICES: readonly GradingService[] = [
  "psa",
  "bgs",
  "cgc",
  "other",
];

type Step3StockProps = {
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
};

/** Step 3 -- fill in stock details: condition, grading, cert, quantity. */
export function Step3Stock({
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
}: Step3StockProps) {
  const hasCert = certNumber.trim().length > 0;
  const isTest =
    category === "card" &&
    conditionMode === "graded" &&
    !hasCert &&
    quantity > 1;

  return (
    <div className="pcx-wiz-sec">
      <div className="pcx-step-label">
        <span className="pcx-step-n">3</span> Add stock
      </div>

      {/* Anchor -- shows which card we are adding to */}
      <div className="pcx-wiz-anchor">
        <div className="pcx-wa-info">
          <div className="pcx-wa-name">{card.name}</div>
          <div className="pcx-wa-meta mono">
            {card.code ?? card.modelCode ?? ""} &middot; {card.series ?? ""}
          </div>
        </div>
        <button
          type="button"
          className="pcx-btn pcx-btn-ghost pcx-wa-change"
          onClick={onGoBack}
        >
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
                {/* Grading service pills -- psa | bgs | cgc | other */}
                <div className="pcx-form-row2">
                  <div className="pcx-field">
                    <label>Grading company</label>
                    <div className="pcx-seg-pills">
                      {GRADING_SERVICES.map((s) => (
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
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Cert number + GemRate lookup — CONTROLLED via parent */}
                <div className="pcx-field">
                  <label>
                    Cert number <span className="pcx-opt">optional</span>
                  </label>
                  <CertLookupField
                    value={certNumber}
                    onChange={onCertNumber}
                    grader={gradingService}
                    onResult={(lookup) => {
                      onCertResult(lookup);
                      if (lookup.grade) onGrade(lookup.grade);
                    }}
                  />
                  <span className="pcx-hint">
                    A real graded card is one-of-one &mdash; enter its cert (qty
                    locks to 1).{" "}
                    <strong>Leave blank for test stock</strong> (qty can be
                    &gt;1, tagged TEST).
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
                    onChange={(e) =>
                      onQuantity(Math.max(1, Number(e.target.value) || 1))
                    }
                  />
                  {hasCert && (
                    <span className="pcx-hint">
                      Locked to 1 &mdash; one cert = one physical card.
                    </span>
                  )}
                  {isTest && (
                    <span className="pcx-hint pcx-hint-warn">
                      No cert + qty &gt; 1 ={" "}
                      <strong>TEST</strong> stock (tagged TEST in the catalog).
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
                  onChange={(e) =>
                    onQuantity(Math.max(1, Number(e.target.value) || 1))
                  }
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
              onChange={(e) =>
                onQuantity(Math.max(1, Number(e.target.value) || 1))
              }
            />
          </div>
        )}

        {/* Preview chip */}
        <StockPreview
          card={card}
          category={category}
          conditionMode={conditionMode}
          gradingService={gradingService}
          isTest={isTest}
        />
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
        {meta} Lands in{" "}
        <strong style={{ color: "var(--pcx-available)" }}>Available</strong>{" "}
        stock.
      </div>
    </div>
  );
}
