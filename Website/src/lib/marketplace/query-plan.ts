import type {
  MarketplaceListingSource,
  MarketplaceListingSort,
} from "./listings";

export type MarketplaceConditionBucket =
  | "raw_a"
  | "raw_b"
  | "raw_c"
  | "raw_d";

export type MarketplaceGradeBucket =
  | "psa_10"
  | "psa_9"
  | "psa_8_or_under"
  | "bgs_10_black_label"
  | "bgs_10_gold_label"
  | "bgs_9_5"
  | "bgs_9_or_under"
  | "ars_10_plus"
  | "ars_10"
  | "ars_9"
  | "ars_8_or_under"
  | "other_graded";

export type MarketplaceProductSort =
  | "recommended"
  | MarketplaceListingSort
  | "recent_sales"
  | "popular";

export type MarketplaceItemType = "card" | "sealed_box" | "sealed_pack";

export type MarketplaceQueryPlan = {
  source?: MarketplaceListingSource;
  itemType?: MarketplaceItemType;
  q?: string;
  condition?: MarketplaceConditionBucket;
  grade?: MarketplaceGradeBucket;
  sort?: MarketplaceProductSort;
  inStockOnly: boolean;
  limit: number;
  cursor: string | null;
};

const SOURCES = new Set(["official_shop", "user_seller"]);
const ITEM_TYPES = new Set(["card", "sealed_box", "sealed_pack"]);
const CONDITIONS = new Set([
  "raw_a",
  "raw_b",
  "raw_c",
  "raw_d",
]);
const GRADES = new Set([
  "psa_10",
  "psa_9",
  "psa_8_or_under",
  "bgs_10_black_label",
  "bgs_10_gold_label",
  "bgs_9_5",
  "bgs_9_or_under",
  "ars_10_plus",
  "ars_10",
  "ars_9",
  "ars_8_or_under",
  "other_graded",
]);
const SORTS = new Set([
  "recommended",
  "newest",
  "price_asc",
  "price_desc",
  "recent_sales",
  "popular",
]);
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;
const MAX_CURSOR_BYTES = 768;

function safeText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function safeInteger(value: string | null | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function safeLimit(value: string | null | undefined) {
  const parsed = safeInteger(value);
  if (!parsed || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function safeFlag(value: string | null | undefined) {
  return value === "1" || value === "true";
}

export function marketplaceQueryPlanFromUrl(url: string | URL): MarketplaceQueryPlan {
  const searchParams = new URL(url).searchParams;
  const source = safeText(searchParams.get("source"), 32);
  const itemType = safeText(searchParams.get("itemType"), 32);
  const condition = safeText(searchParams.get("condition"), 40);
  const grade = safeText(searchParams.get("grade"), 60);
  const sort = safeText(searchParams.get("sort"), 32);

  return {
    source:
      source && SOURCES.has(source)
        ? (source as MarketplaceListingSource)
        : undefined,
    itemType:
      itemType && ITEM_TYPES.has(itemType)
        ? (itemType as MarketplaceItemType)
        : undefined,
    q: safeText(searchParams.get("q"), 80) ?? undefined,
    condition:
      condition && CONDITIONS.has(condition)
        ? (condition as MarketplaceConditionBucket)
        : undefined,
    grade:
      grade && GRADES.has(grade)
        ? (grade as MarketplaceGradeBucket)
        : undefined,
    sort:
      sort && SORTS.has(sort)
        ? (sort as MarketplaceProductSort)
        : undefined,
    inStockOnly: safeFlag(searchParams.get("inStockOnly")),
    limit: safeLimit(searchParams.get("limit")),
    cursor: safeText(searchParams.get("cursor"), MAX_CURSOR_BYTES),
  };
}

export function marketplaceQueryPlanToSearchParams(plan: MarketplaceQueryPlan) {
  const params = new URLSearchParams();
  if (plan.source) params.set("source", plan.source);
  if (plan.itemType) params.set("itemType", plan.itemType);
  if (plan.q) params.set("q", plan.q);
  if (plan.condition) params.set("condition", plan.condition);
  if (plan.grade) params.set("grade", plan.grade);
  if (plan.sort && plan.sort !== "recommended") params.set("sort", plan.sort);
  if (plan.inStockOnly) params.set("inStockOnly", "1");
  if (plan.limit !== DEFAULT_LIMIT) params.set("limit", String(plan.limit));
  if (plan.cursor) params.set("cursor", plan.cursor);
  return params;
}
