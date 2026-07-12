"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { MpIcon } from "../shared/MpIcon";
import type {
  MarketplaceConditionBucket,
  MarketplaceGradeBucket,
  MarketplaceProductSort,
  MarketplaceQueryPlan,
} from "@/lib/marketplace/query-plan";
import type { MarketplaceBrowseFilterCounts } from "@/lib/marketplace/product-browse";

// Derived from the query plan (not @/lib/marketplace/listings, which is a
// server-only module client components must not import — see
// scripts/test-marketplace-one-account-flow.mjs).
type MarketplaceListingSource = NonNullable<MarketplaceQueryPlan["source"]>;

/**
 * Filter rail — visuals ported from the design prototype's ProtoBrowse rail
 * (/Users/pinkmerry/Downloads/ynott/project/marketplace-proto-1.jsx:230-252),
 * rewired from client-only useState filters to real URL state.
 *
 * All filter state lives in the URL: every change builds a URLSearchParams
 * and calls router.push, wrapped in useTransition so the grid can dim while
 * the server re-renders (INP budget — no client-side filtering/store
 * duplicating what the server already computes from marketplaceQueryPlanFromUrl).
 *
 * The values placed on the URL are exactly the values
 * marketplaceQueryPlanFromUrl() / MarketplaceQueryPlan understands — see
 * src/lib/marketplace/query-plan.ts. Series/condition checkboxes here map to
 * the same "q" and "condition" query-plan fields the backend already reads;
 * this mirrors the existing MarketplaceFilterControls
 * (src/features/ynot/MarketplaceFilterControls.tsx) filter-key -> URLSearchParams
 * mapping rather than inventing a new one.
 */

export type BrowseSeriesKey = "pokemon" | "one_piece";

export interface FilterRailProps {
  source: MarketplaceListingSource | undefined;
  q: string;
  condition: MarketplaceConditionBucket | undefined;
  grade: MarketplaceGradeBucket | undefined;
  sort: MarketplaceProductSort;
  filterCounts: MarketplaceBrowseFilterCounts;
}

const SERIES_OPTIONS: { key: BrowseSeriesKey; label: string; q: string }[] = [
  { key: "one_piece", label: "One Piece", q: "one piece" },
  { key: "pokemon", label: "Pokémon", q: "pokemon" },
];

const CONDITION_OPTIONS: {
  key: "graded" | "raw";
  label: string;
  grade?: MarketplaceGradeBucket;
  condition?: MarketplaceConditionBucket;
  countKey: "psa10" | "raw";
}[] = [
  { key: "graded", label: "Graded (PSA 10)", grade: "psa_10", countKey: "psa10" },
  { key: "raw", label: "Raw", condition: "raw_a", countKey: "raw" },
];

const SORT_OPTIONS: { value: MarketplaceProductSort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price - low to high" },
  { value: "price_desc", label: "Price - high to low" },
  { value: "recent_sales", label: "Recent sales" },
  { value: "popular", label: "Popular" },
];

function buildParams(input: {
  source: MarketplaceListingSource | undefined;
  q: string;
  condition: MarketplaceConditionBucket | undefined;
  grade: MarketplaceGradeBucket | undefined;
  sort: MarketplaceProductSort;
}) {
  const params = new URLSearchParams();
  if (input.source) params.set("source", input.source);
  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.condition) params.set("condition", input.condition);
  if (input.grade) params.set("grade", input.grade);
  if (input.sort !== "recommended") params.set("sort", input.sort);
  return params;
}

export function FilterRail({
  source,
  q,
  condition,
  grade,
  sort,
  filterCounts,
}: FilterRailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(q);

  function navigate(next: {
    q?: string;
    condition?: MarketplaceConditionBucket | undefined;
    grade?: MarketplaceGradeBucket | undefined;
    sort?: MarketplaceProductSort;
  }) {
    const params = buildParams({
      source,
      q: next.q ?? q,
      condition: "condition" in next ? next.condition : condition,
      grade: "grade" in next ? next.grade : grade,
      sort: next.sort ?? sort,
    });
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/marketplace?${query}` : "/marketplace", { scroll: false });
    });
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: searchDraft });
  }

  function handleSeriesToggle(option: (typeof SERIES_OPTIONS)[number]) {
    const isOn = q.trim().toLowerCase() === option.q;
    const nextQ = isOn ? "" : option.q;
    setSearchDraft(nextQ);
    navigate({ q: nextQ });
  }

  function handleConditionToggle(option: (typeof CONDITION_OPTIONS)[number]) {
    if (option.grade) {
      navigate({ grade: grade === option.grade ? undefined : option.grade });
      return;
    }
    if (option.condition) {
      navigate({ condition: condition === option.condition ? undefined : option.condition });
    }
  }

  function handleSortChange(event: ChangeEvent<HTMLSelectElement>) {
    navigate({ sort: event.currentTarget.value as MarketplaceProductSort });
  }

  function handleClear() {
    setSearchDraft("");
    const params = new URLSearchParams();
    if (source) params.set("source", source);
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/marketplace?${query}` : "/marketplace", { scroll: false });
    });
  }

  const activeSeriesQ = q.trim().toLowerCase();

  return (
    <div className="mp-rail" data-pending={isPending} style={{ opacity: isPending ? 0.55 : 1 }}>
      <form className="mp-search" onSubmit={handleSearchSubmit} role="search">
        <MpIcon name="search" size={13} />
        <input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search this list..."
          aria-label="Search marketplace products"
          style={{
            border: 0,
            outline: 0,
            background: "transparent",
            font: "inherit",
            color: "var(--mp-ink)",
            width: "100%",
            padding: "4px 0",
          }}
        />
      </form>

      <div className="mp-rail-group">
        <span className="mp-rail-label">Series</span>
        {SERIES_OPTIONS.map((option) => {
          const isOn = activeSeriesQ === option.q;
          const count = filterCounts[option.key]?.productCount ?? 0;
          return (
            <span
              key={option.key}
              className={"mp-check" + (isOn ? " on" : "")}
              role="checkbox"
              aria-checked={isOn}
              tabIndex={0}
              style={{ cursor: "pointer", userSelect: "none" }}
              onClick={() => handleSeriesToggle(option)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSeriesToggle(option);
                }
              }}
            >
              <span className="box">{isOn ? <MpIcon name="check" size={11} strokeWidth={2.6} /> : null}</span>
              {option.label}
              <span className="count">{count}</span>
            </span>
          );
        })}
      </div>

      <div className="mp-rail-group">
        <span className="mp-rail-label">Condition</span>
        {CONDITION_OPTIONS.map((option) => {
          const isOn = option.grade ? grade === option.grade : condition === option.condition;
          const count = filterCounts[option.countKey]?.productCount ?? 0;
          return (
            <span
              key={option.key}
              className={"mp-check" + (isOn ? " on" : "")}
              role="checkbox"
              aria-checked={isOn}
              tabIndex={0}
              style={{ cursor: "pointer", userSelect: "none" }}
              onClick={() => handleConditionToggle(option)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleConditionToggle(option);
                }
              }}
            >
              <span className="box">{isOn ? <MpIcon name="check" size={11} strokeWidth={2.6} /> : null}</span>
              {option.label}
              <span className="count">{count}</span>
            </span>
          );
        })}
      </div>

      <span className="mp-sort">
        Sort
        <select
          value={sort}
          onChange={handleSortChange}
          aria-label="Sort marketplace products"
          style={{
            border: "1px solid var(--mp-line-strong)",
            background: "var(--mp-paper)",
            borderRadius: 999,
            padding: "7px 12px",
            font: "inherit",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--mp-ink)",
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>

      <button type="button" className="mp-btn" style={{ justifyContent: "center" }} onClick={handleClear}>
        Clear filters
      </button>
    </div>
  );
}
