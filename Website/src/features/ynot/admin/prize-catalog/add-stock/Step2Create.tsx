import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import { MainSkuForm } from "../MainSkuForm";
import type { StockCategory } from "./types";

type Step2CreateProps = {
  category: StockCategory;
  onDone: (card: CardCatalogItem | null) => void;
};

/**
 * Step 2 (create mode) -- delegates to MainSkuForm to create a new Main SKU,
 * then returns to search so the user can pick the newly created card.
 */
export function Step2Create({ category, onDone }: Step2CreateProps) {
  return (
    <div className="pcx-wiz-sec">
      <div className="pcx-step-label">
        <span className="pcx-step-n">2</span> Create new Main SKU
      </div>
      <p className="pcx-wiz-help">
        This creates the identity record. You will add stock in the next step.
      </p>
      <MainSkuForm
        initialCategory={category}
        lockCategory
        onDone={() => {
          // After creation + router.refresh, the user can search for
          // the newly created card. We exit create mode so they can pick it.
          onDone(null);
        }}
      />
      <div className="pcx-wiz-cancel">
        <button
          type="button"
          className="pcx-btn pcx-btn-ghost"
          onClick={() => onDone(null)}
        >
          Back to search
        </button>
      </div>
    </div>
  );
}
