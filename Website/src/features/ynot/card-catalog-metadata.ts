export type CardLanguage = "english" | "japanese" | "chinese";
// Built-in catalog categories keep their slugs for fulfilment logic, but the
// stored value is now free text (managed like sets/brands), so the public type
// is a plain string. Use canonicalCatalogCategory() to recover a built-in slug.
export type CatalogCategorySlug =
  | "single_cards"
  | "packs"
  | "boxes"
  | "cases"
  | "sets"
  | "sealed"
  | "supplies";
export type CatalogCategory = string;
export type CardCondition = "sealed" | "raw" | "graded";
export type GradingService = "psa" | "bgs" | "cgc" | "other";

export const cardLanguageOptions: Array<{
  value: CardLanguage;
  label: string;
}> = [
  { value: "english", label: "English" },
  { value: "japanese", label: "Japanese" },
  { value: "chinese", label: "Chinese" },
];

export const catalogCategoryOptions: Array<{
  value: CatalogCategorySlug;
  label: string;
}> = [
  { value: "single_cards", label: "Single Cards" },
  { value: "packs", label: "Packs" },
  { value: "boxes", label: "Boxes" },
  { value: "cases", label: "Cases" },
  { value: "sets", label: "Sets" },
  { value: "sealed", label: "Sealed" },
  { value: "supplies", label: "Supplies" },
];

// Marketplace products use these exact values for series_name. Keeping seller
// submissions on the same controlled vocabulary prevents near-duplicate
// browse groups such as "Pokemon", "Pokemon TCG", and "Pokémon cards".
export const cardSeriesOptions = [
  { value: "Pokemon Trading Card Game", label: "Pokemon Trading Card Game" },
  { value: "One Piece Card Game", label: "One Piece Card Game" },
  { value: "Yu-Gi-Oh! Trading Card Game", label: "Yu-Gi-Oh! Trading Card Game" },
  { value: "Disney Lorcana", label: "Disney Lorcana" },
  { value: "Digimon Card Game", label: "Digimon Card Game" },
  { value: "Dragon Ball Super Card Game", label: "Dragon Ball Super Card Game" },
  { value: "Magic: The Gathering", label: "Magic: The Gathering" },
  { value: "Weiss Schwarz", label: "Weiss Schwarz" },
  { value: "Union Arena", label: "Union Arena" },
  { value: "Other Trading Card Game", label: "Other Trading Card Game" },
] as const;

export const cardConditionOptions: Array<{
  value: CardCondition;
  label: string;
}> = [
  { value: "sealed", label: "Sealed" },
  { value: "raw", label: "Raw" },
  { value: "graded", label: "Graded" },
];

export const gradingServiceOptions: Array<{
  value: GradingService;
  label: string;
}> = [
  { value: "psa", label: "PSA" },
  { value: "bgs", label: "BGS" },
  { value: "cgc", label: "CGC" },
  { value: "other", label: "Other" },
];

export const cardGradeOptions = [
  "PSA 10 (Gem Mint)",
  "PSA 9 (Mint)",
  "PSA 8 (Near Mint-Mint)",
  "PSA 7 (Near Mint)",
  "PSA 6 (Excellent-Mint)",
  "PSA 5 (Excellent)",
  "PSA 4 (Very Good-Excellent)",
  "PSA 3 (Very Good)",
  "PSA 2 (Good)",
  "PSA 1 (Poor)",
  "PSA Authentic",
] as const;

export const minCardReleaseYear = 1996;
export const maxCardReleaseYear = 2026;
export const cardReleaseYearOptions = Array.from(
  { length: maxCardReleaseYear - minCardReleaseYear + 1 },
  (_, index) => maxCardReleaseYear - index,
);

type LabelOption<T extends string> = {
  value: T;
  label: string;
};

function optionValue<T extends string>(
  value: unknown,
  options: readonly LabelOption<T>[],
) {
  return options.some((option) => option.value === value) ? (value as T) : null;
}

function optionLabel<T extends string>(
  value: unknown,
  options: readonly LabelOption<T>[],
  fallback = "",
) {
  return options.find((option) => option.value === value)?.label ?? fallback;
}

export function cardLanguageValue(value: unknown) {
  return optionValue(value, cardLanguageOptions);
}

const catalogCategorySlugSet = new Set<string>(
  catalogCategoryOptions.map((option) => option.value),
);
const catalogCategorySlugByLabel = new Map<string, CatalogCategorySlug>(
  catalogCategoryOptions.map((option) => [option.label.toLowerCase(), option.value]),
);

// Recover a built-in catalog slug from either the slug itself or its human
// label (e.g. "Boxes" -> "boxes"). Custom free-text categories return null.
export function canonicalCatalogCategory(
  value: unknown,
): CatalogCategorySlug | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (catalogCategorySlugSet.has(trimmed)) return trimmed as CatalogCategorySlug;
  return catalogCategorySlugByLabel.get(trimmed.toLowerCase()) ?? null;
}

// Canonical comparison value: built-ins collapse to their slug (whether stored
// as slug or label) so existing slug-based checks keep working; custom
// free-text categories pass through unchanged.
export function catalogCategoryValue(
  value: unknown,
  fallback: CatalogCategory = "single_cards",
): CatalogCategory {
  const canonical = canonicalCatalogCategory(value);
  if (canonical) return canonical;
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

export function cardConditionValue(
  value: unknown,
  fallback: CardCondition = "raw",
) {
  return optionValue(value, cardConditionOptions) ?? fallback;
}

export function gradingServiceValue(value: unknown) {
  return optionValue(value, gradingServiceOptions);
}

export function cardLanguageLabel(value: unknown) {
  return (
    optionLabel(value, cardLanguageOptions) ||
    (typeof value === "string" ? value : "")
  );
}

export function catalogCategoryLabel(value: unknown) {
  const canonical = canonicalCatalogCategory(value);
  if (canonical) return optionLabel(canonical, catalogCategoryOptions, "Single Cards");
  // Custom free-text category — display exactly as the admin named it.
  return typeof value === "string" && value.trim() ? value.trim() : "Single Cards";
}

export function cardConditionLabel(value: unknown) {
  return optionLabel(value, cardConditionOptions, "Raw");
}

export function gradingServiceLabel(value: unknown) {
  return optionLabel(value, gradingServiceOptions);
}

export function cardGradeValue(value: unknown) {
  if (value === "Ungraded") return "";
  return cardGradeOptions.includes(value as (typeof cardGradeOptions)[number])
    ? (value as (typeof cardGradeOptions)[number])
    : "";
}

export function releaseYearValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const year = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return null;
  return year;
}
