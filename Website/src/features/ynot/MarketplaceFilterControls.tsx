"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type MouseEvent,
  useOptimistic,
  useTransition,
} from "react";
import { i18n } from "./i18n";

type MarketplaceFilterKey =
  | "all"
  | "official_shop"
  | "user_seller"
  | "pokemon"
  | "one_piece"
  | "psa10"
  | "raw"
  | "holo"
  | "promo";

type MarketplaceSortKey =
  | "recommended"
  | "popular"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "recent_sales";

type MarketplaceFilterOption = {
  key: MarketplaceFilterKey;
  label: ReturnType<typeof i18n>;
  helper: ReturnType<typeof i18n>;
};

type MarketplaceFilterCount = {
  productCount: number;
  offerCount: number;
};

type MarketplaceFilterCounts = Partial<Record<MarketplaceFilterKey, MarketplaceFilterCount>>;

const sourceFilters: MarketplaceFilterOption[] = [
  {
    key: "all",
    label: i18n("All Listings", "สินค้าทั้งหมด"),
    helper: i18n("Official + user sellers", "ร้านทางการ + ผู้ขายทั่วไป"),
  },
  {
    key: "official_shop",
    label: i18n("Official Shop", "ร้านทางการ"),
    helper: i18n("YNOT stock only", "สินค้าจาก YNOT เท่านั้น"),
  },
  {
    key: "user_seller",
    label: i18n("User Sellers", "ผู้ขายทั่วไป"),
    helper: i18n("Cards from members", "การ์ดจากสมาชิก"),
  },
];

const categoryFilters: MarketplaceFilterOption[] = [
  {
    key: "pokemon",
    label: i18n("Pokemon", "Pokemon"),
    helper: i18n("Search Pokemon items", "ค้นหา Pokemon"),
  },
  {
    key: "one_piece",
    label: i18n("One Piece", "One Piece"),
    helper: i18n("Search One Piece items", "ค้นหา One Piece"),
  },
  {
    key: "psa10",
    label: i18n("PSA 10", "PSA 10"),
    helper: i18n("Graded PSA 10", "เกรด PSA 10"),
  },
  {
    key: "raw",
    label: i18n("Raw", "การ์ดไม่เกรด"),
    helper: i18n("Ungraded cards", "การ์ดไม่เกรด"),
  },
  {
    key: "holo",
    label: i18n("Holo", "โฮโล"),
    helper: i18n("Holo cards", "การ์ดโฮโล"),
  },
  {
    key: "promo",
    label: i18n("Promo", "โปรโม"),
    helper: i18n("Promo items", "สินค้าโปรโม"),
  },
];

const sortOptions = [
  { key: "recommended", label: i18n("Recommended", "แนะนำ") },
  { key: "popular", label: i18n("Popular", "ยอดนิยม") },
  { key: "newest", label: i18n("Newest", "ใหม่ล่าสุด") },
  { key: "price_asc", label: i18n("Lowest price", "ราคาต่ำสุด") },
  { key: "price_desc", label: i18n("Highest price", "ราคาสูงสุด") },
  { key: "recent_sales", label: i18n("Recent sales", "ขายล่าสุด") },
] satisfies { key: MarketplaceSortKey; label: ReturnType<typeof i18n> }[];

function marketplaceFilterParams(filterKey: MarketplaceFilterKey) {
  const params = new URLSearchParams();
  switch (filterKey) {
    case "official_shop":
      params.set("source", "official_shop");
      break;
    case "user_seller":
      params.set("source", "user_seller");
      break;
    case "pokemon":
      params.set("q", "pokemon");
      break;
    case "one_piece":
      params.set("q", "one piece");
      break;
    case "psa10":
      params.set("grade", "psa_10");
      break;
    case "raw":
      params.set("condition", "raw_a");
      break;
    case "holo":
      params.set("q", "holo");
      break;
    case "promo":
      params.set("q", "promo");
      break;
    case "all":
    default:
      break;
  }
  return params;
}

function marketplaceFilterHref(
  filterKey: MarketplaceFilterKey,
  sortKey: MarketplaceSortKey,
) {
  const params = marketplaceFilterParams(filterKey);
  if (sortKey !== "recommended") params.set("sort", sortKey);
  const query = params.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}

function isPlainClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  );
}

function resultText(count: number) {
  return i18n(
    `${count} result${count === 1 ? "" : "s"}`,
    `${count} รายการ`,
  );
}

function offerCountText(count: number | undefined) {
  if (typeof count !== "number") return null;
  return i18n(
    `${count} offer${count === 1 ? "" : "s"}`,
    `${count} ข้อเสนอ`,
  );
}

function countSuffix(count: number | undefined) {
  return typeof count === "number" ? ` (${count})` : "";
}

function sortOptionText(sortKey: MarketplaceSortKey) {
  switch (sortKey) {
    case "popular":
      return "Popular / ยอดนิยม";
    case "newest":
      return "Newest / ใหม่ล่าสุด";
    case "price_asc":
      return "Lowest price / ราคาต่ำสุด";
    case "price_desc":
      return "Highest price / ราคาสูงสุด";
    case "recent_sales":
      return "Recent sales / ขายล่าสุด";
    case "recommended":
    default:
      return "Recommended / แนะนำ";
  }
}

export function MarketplaceFilterControls({
  selectedFilterKey,
  selectedSort,
  resultCount,
  filterCounts = {},
}: {
  selectedFilterKey: MarketplaceFilterKey;
  selectedSort: MarketplaceSortKey;
  resultCount: number;
  filterCounts?: MarketplaceFilterCounts;
}) {
  const router = useRouter();
  const [optimisticFilter, setOptimisticFilter] = useOptimistic(
    selectedFilterKey,
    (_current: MarketplaceFilterKey, next: MarketplaceFilterKey) => next,
  );
  const [optimisticSort, setOptimisticSort] = useOptimistic(
    selectedSort,
    (_current: MarketplaceSortKey, next: MarketplaceSortKey) => next,
  );
  const [isPending, startTransition] = useTransition();
  const allFilters = [...sourceFilters, ...categoryFilters];
  const selectedOption =
    allFilters.find((option) => option.key === optimisticFilter) ??
    sourceFilters[0];
  const isUpdating =
    isPending ||
    optimisticFilter !== selectedFilterKey ||
    optimisticSort !== selectedSort;

  function navigate(filterKey: MarketplaceFilterKey, sortKey: MarketplaceSortKey) {
    const href = marketplaceFilterHref(filterKey, sortKey);
    startTransition(() => {
      setOptimisticFilter(filterKey);
      setOptimisticSort(sortKey);
      router.push(href, { scroll: false });
    });
  }

  function handleFilterClick(
    event: MouseEvent<HTMLAnchorElement>,
    filterKey: MarketplaceFilterKey,
  ) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    navigate(filterKey, optimisticSort);
  }

  function handleSortChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextSort = event.currentTarget.value as MarketplaceSortKey;
    navigate(optimisticFilter, nextSort);
  }

  return (
    <div className="marketplace-filter-panel" data-pending={isUpdating}>
      <div
        className="marketplace-source-switcher"
        aria-label="Seller source / แหล่งผู้ขาย"
      >
        {sourceFilters.map((option) => {
          const isActive = optimisticFilter === option.key;
          const offerCount = filterCounts[option.key]?.offerCount;
          const countLabel = offerCountText(offerCount);
          return (
            <Link
              key={option.key}
              href={marketplaceFilterHref(option.key, optimisticSort)}
              className={`marketplace-source-option${
                isActive ? " active" : ""
              }`}
              aria-current={isActive ? "page" : undefined}
              onClick={(event) => handleFilterClick(event, option.key)}
              prefetch={false}
              scroll={false}
            >
              <span className="marketplace-source-title">{option.label}</span>
              <span className="marketplace-source-helper">
                {option.helper}
                {countLabel ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    {countLabel}
                  </>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="marketplace-filter-toolbar">
        <p className="marketplace-filter-summary" aria-live="polite">
          <span>{i18n("Showing", "กำลังแสดง")}</span>
          <strong>{selectedOption.label}</strong>
          <small>
            {isUpdating
              ? i18n("Updating results", "กำลังอัปเดตผลลัพธ์")
              : resultText(resultCount)}
          </small>
        </p>

        <form className="marketplace-sort" action="/marketplace">
          {Array.from(marketplaceFilterParams(optimisticFilter)).map(
            ([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ),
          )}
          <span>{i18n("Sort by", "เรียงตาม")}</span>
          <select
            name="sort"
            value={optimisticSort}
            aria-label="Sort marketplace listings / เรียงรายการในตลาด"
            onChange={handleSortChange}
          >
            {sortOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {sortOptionText(option.key)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-ghost">
            {i18n("Apply sort", "ใช้การเรียง")}
          </button>
        </form>
      </div>

      <div className="marketplace-filter-chips" aria-label="Category filters / ตัวกรองหมวดหมู่">
        {categoryFilters.map((option) => {
          const isActive = optimisticFilter === option.key;
          return (
            <Link
              key={option.key}
              href={marketplaceFilterHref(option.key, optimisticSort)}
              className={`marketplace-filter-pill${isActive ? " active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              title={
                option.key === "psa10"
                  ? "PSA 10"
                  : option.key === "one_piece"
                    ? "One Piece"
                    : undefined
              }
              onClick={(event) => handleFilterClick(event, option.key)}
              prefetch={false}
              scroll={false}
            >
              <span>
                {option.label}
                {countSuffix(filterCounts[option.key]?.offerCount)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
