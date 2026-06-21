"use client";

import type { AdminCardCatalogRow } from "@/features/ynot/admin-card-catalog-helpers";

export function LedgerRow({
  row,
  open,
  onToggle,
  isOwner,
}: {
  row: AdminCardCatalogRow;
  open: boolean;
  onToggle: () => void;
  isOwner: boolean;
}) {
  return <div className="pcx-lrow">{/* Task 1.4 */}</div>;
}
