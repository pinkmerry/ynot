"use client";

import type { AdminCardCatalogRow } from "@/features/ynot/admin-card-catalog-helpers";

type CategoryFilter = "all" | "Single Cards" | "Sealed Boxes" | "Sealed Packs";

export function CatalogToolbar({
  query,
  onQuery,
  category,
  onCategory,
  rows,
}: {
  query: string;
  onQuery: (v: string) => void;
  category: CategoryFilter;
  onCategory: (c: CategoryFilter) => void;
  rows: AdminCardCatalogRow[];
}) {
  const count = (c: CategoryFilter) =>
    c === "all"
      ? rows.length
      : rows.filter((r) => String(r.card.catalogCategory ?? "") === c).length;

  const tabs: Array<[CategoryFilter, string, string?]> = [
    ["all", "All"],
    ["Single Cards", "Single Cards", "var(--pcx-cat-card)"],
    ["Sealed Boxes", "Sealed Boxes", "var(--pcx-cat-box)"],
    ["Sealed Packs", "Sealed Packs", "var(--pcx-cat-pack)"],
  ];

  return (
    <div className="pcx-toolbar-wrap">
      <div className="pcx-legend">
        <span className="pcx-legend-item">
          <span
            className="pcx-dot"
            style={{ background: "var(--pcx-available)" }}
          />
          Available
        </span>
        <span className="pcx-legend-item">
          <span
            className="pcx-dot"
            style={{ background: "var(--pcx-packs)" }}
          />
          In packs
        </span>
        <span className="pcx-legend-item">
          <span
            className="pcx-dot"
            style={{ background: "var(--pcx-bags)" }}
          />
          In bags
        </span>
        <span className="pcx-legend-item">
          <span
            className="pcx-dot"
            style={{ background: "var(--pcx-removed)" }}
          />
          Removed
        </span>
      </div>
      <div className="pcx-toolbar">
        <label className="pcx-search">
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search by name, code (EB01-113), set, cert number…"
            aria-label="Search prize catalog"
          />
        </label>
        <div
          className="pcx-cat-tabs"
          role="tablist"
          aria-label="Category filter"
        >
          {tabs.map(([cat, label, color]) => (
            <button
              key={cat}
              role="tab"
              aria-selected={category === cat}
              className={`pcx-cat-tab${category === cat ? " on" : ""}`}
              onClick={() => onCategory(cat)}
            >
              {color && (
                <span
                  className="pcx-cat-dot"
                  style={{ background: color }}
                />
              )}
              {label}
              {cat !== "all" && (
                <span className="pcx-cat-n">{count(cat)}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
