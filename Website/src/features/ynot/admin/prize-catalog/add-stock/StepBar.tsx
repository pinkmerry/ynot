/** Horizontal step indicator for the 3-step add-stock wizard. */
export function StepBar({ current }: { current: 1 | 2 | 3 }) {
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
          current === sn
            ? "pcx-ws on"
            : current > sn
              ? "pcx-ws done"
              : "pcx-ws";
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
