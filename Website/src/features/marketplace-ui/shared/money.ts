/**
 * Formats an integer satang amount (1 THB = 100 satang) as a Thai baht string,
 * e.g. formatThb(1850000) -> "฿18,500". Non-finite input (NaN, Infinity)
 * falls back to 0 so prices never render "฿NaN".
 */
export function formatThb(satang: number): string {
  return "฿" + (Number.isFinite(satang) ? Math.round(satang / 100) : 0).toLocaleString();
}

/**
 * Formats a plain number with locale thousands separators,
 * e.g. formatNumber(4280) -> "4,280". Non-finite input falls back to 0.
 */
export function formatNumber(n: number): string {
  return (Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString();
}
