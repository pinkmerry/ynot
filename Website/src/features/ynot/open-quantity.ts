export const defaultOpenQuantityOptions = [1, 10, 100];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeOpenQuantityOptions(value: unknown): number[] {
  const source =
    Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.openQuantityOptions)
        ? value.openQuantityOptions
        : defaultOpenQuantityOptions;
  const options = source
    .map((option) => Math.max(1, Math.min(100, Math.round(Number(option)))))
    .filter((option) => Number.isFinite(option))
    .filter((option, index, all) => all.indexOf(option) === index)
    .sort((left, right) => left - right)
    .slice(0, 5);
  return options.length ? options : defaultOpenQuantityOptions;
}
