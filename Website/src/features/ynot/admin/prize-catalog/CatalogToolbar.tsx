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
  return <div className="pcx-toolbar-wrap">{/* Task 1.3 */}</div>;
}
