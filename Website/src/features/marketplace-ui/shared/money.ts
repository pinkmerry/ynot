/**
 * Formats an integer satang amount (1 THB = 100 satang) as a Thai baht string,
 * e.g. formatThb(1850000) -> "฿18,500".
 */
export function formatThb(satang: number): string {
  return "฿" + Math.round(satang / 100).toLocaleString();
}

/**
 * Formats a plain number with locale thousands separators,
 * e.g. formatNumber(4280) -> "4,280".
 */
export function formatNumber(n: number): string {
  return Number(n).toLocaleString();
}
