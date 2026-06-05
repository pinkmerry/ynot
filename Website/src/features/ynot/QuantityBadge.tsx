type QuantityBadgeProps = {
  quantity?: number | null;
};

export function QuantityBadge({ quantity }: QuantityBadgeProps) {
  const numeric = Number(quantity ?? 1);
  if (!Number.isFinite(numeric)) return null;
  const normalized = Math.max(1, Math.trunc(numeric));
  if (normalized <= 1) return null;
  return (
    <span className="ynot-quantity-badge" aria-label={`${normalized} items`}>
      x{normalized}
    </span>
  );
}
