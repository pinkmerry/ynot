export type PrizeCategory =
  | "psa10_card"
  | "sealed_product"
  | "console_gaming"
  | "audio_electronics"
  | "store_credit"
  | "other";

export type PrizeSourceType = "card" | "sealed" | "physical" | "credit" | "other";

export const randomPsa10CardCode = "RANDOM-PSA10";

type PrizeCardIdentity = {
  card_code?: string | null;
  code?: string | null;
  name?: string | null;
  search_code?: string | null;
};

export function isRandomPsa10PrizeCard(card: PrizeCardIdentity) {
  const code = (card.card_code ?? card.code ?? "").toUpperCase();
  const searchCode = (card.search_code ?? "").toLowerCase();
  const name = (card.name ?? "").toLowerCase();
  return (
    code === randomPsa10CardCode ||
    searchCode === randomPsa10CardCode.toLowerCase() ||
    name.includes("random psa10")
  );
}

export const prizeCategoryOptions: Array<{
  value: PrizeCategory;
  label: string;
  sourceType: PrizeSourceType;
}> = [
  { value: "psa10_card", label: "PSA10 card", sourceType: "card" },
  { value: "sealed_product", label: "Sealed/card product", sourceType: "sealed" },
  { value: "console_gaming", label: "Console/gaming", sourceType: "physical" },
  { value: "audio_electronics", label: "Audio/electronics", sourceType: "physical" },
  { value: "store_credit", label: "Store credit", sourceType: "credit" },
  { value: "other", label: "Other prize", sourceType: "other" },
];

export function prizeCategoryValue(value: unknown): PrizeCategory {
  return prizeCategoryOptions.some((option) => option.value === value)
    ? (value as PrizeCategory)
    : "psa10_card";
}

export function prizeCategoryLabel(category: unknown) {
  return (
    prizeCategoryOptions.find((option) => option.value === category)?.label ??
    "PSA10 card"
  );
}

export function prizeSourceType(category: unknown) {
  return (
    prizeCategoryOptions.find((option) => option.value === category)
      ?.sourceType ?? "card"
  );
}
