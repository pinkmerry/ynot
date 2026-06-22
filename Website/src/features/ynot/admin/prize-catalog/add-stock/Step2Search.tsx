import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import { stockCategoryLabel, type StockCategory } from "./types";

type Step2SearchProps = {
  category: StockCategory;
  query: string;
  onQuery: (q: string) => void;
  results: CardCatalogItem[];
  onSelect: (c: CardCatalogItem) => void;
  onCreateNew: () => void;
};

/** Step 2 -- search existing cards (or trigger create mode). */
export function Step2Search({
  category,
  query,
  onQuery,
  results,
  onSelect,
  onCreateNew,
}: Step2SearchProps) {
  const catLabel = stockCategoryLabel(category).toLowerCase();
  return (
    <div className="pcx-wiz-sec">
      <div className="pcx-step-label">
        <span className="pcx-step-n">2</span> Which {catLabel}?
      </div>
      <p className="pcx-wiz-help">
        Search your catalog. If it exists, pick it and skip straight to adding
        stock. If not, create it once.
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
                    {groups.length} variant{groups.length === 1 ? "" : "s"}{" "}
                    &middot; <strong>{avail}</strong> free
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
        <button
          type="button"
          className="pcx-wiz-create-row"
          onClick={onCreateNew}
        >
          <span>+ Create a new {catLabel}</span>
        </button>
      </div>
    </div>
  );
}
