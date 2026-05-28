export type CardLanguage = "english" | "japanese" | "chinese";
export type CatalogCategory =
  | "single_cards"
  | "packs"
  | "boxes"
  | "cases"
  | "sets"
  | "supplies";
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
  value: CatalogCategory;
  label: string;
}> = [
  { value: "single_cards", label: "Single Cards" },
  { value: "packs", label: "Packs" },
  { value: "boxes", label: "Boxes" },
  { value: "cases", label: "Cases" },
  { value: "sets", label: "Sets" },
  { value: "supplies", label: "Supplies" },
];

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

export function catalogCategoryValue(
  value: unknown,
  fallback: CatalogCategory = "single_cards",
) {
  return optionValue(value, catalogCategoryOptions) ?? fallback;
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
  return optionLabel(value, cardLanguageOptions);
}

export function catalogCategoryLabel(value: unknown) {
  return optionLabel(value, catalogCategoryOptions, "Single Cards");
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
