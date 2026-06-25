import type { StockCategory } from "./types";

type Step1CategoryProps = {
  selected: StockCategory | null;
  onPick: (c: StockCategory) => void;
};

/** Step 1 -- pick card / box / pack. */
export function Step1Category({ selected, onPick }: Step1CategoryProps) {
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
        Pick a category first &mdash; it decides what gets linked. A{" "}
        <strong>Sealed Box</strong> links to the pack it opens into so stock
        stays connected.
      </p>
    </div>
  );
}
