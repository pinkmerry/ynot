"use client";

import { useMemo, useState } from "react";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import {
  buildAdminCardCatalogRows,
  type AdminCardCatalogRow,
} from "@/features/ynot/admin-card-catalog-helpers";
import type { YnotPrizePoolItem } from "@/features/ynot/types";
import { CatalogKpis } from "./CatalogKpis";
import { CatalogToolbar } from "./CatalogToolbar";
import { LedgerRow } from "./LedgerRow";

type CategoryFilter = "all" | "Single Cards" | "Sealed Boxes" | "Sealed Packs";

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

  return (
    <div className="pcx-screen">
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
            />
          ))
        )}
      </div>
    </div>
  );
}
