"use client";

import { useMemo, useState } from "react";
import { GradeTabs } from "./GradeTabs";
import { PriceHistoryPanel } from "./PriceHistoryPanel";
import type { MarketplaceListingSnapshot } from "@/lib/marketplace/types";
import type { MarketplaceProductMarketPriceHistoryPoint } from "@/lib/marketplace/product-market";

/**
 * Thin client boundary that owns the selected-grade state shared between
 * GradeTabs (the tab the shopper clicked) and PriceHistoryPanel (the chart
 * badge that must follow that same selection) — mirrors ProtoDetail's single
 * `grade` useState feeding both the grade strip and the price-history panel
 * (marketplace-proto-2.jsx:11, 82-95, 131).
 *
 * Everything else on the page (art, spec grid, stats strip, similar cards)
 * stays server-rendered in ProductDetail; only this grade-linked pair needs
 * to cross the client boundary.
 */

export interface ProductMarketClientProps {
  listings: MarketplaceListingSnapshot[];
  priceHistory: MarketplaceProductMarketPriceHistoryPoint[];
  defaultConditionLabel: string;
  initialSelectedGrade: string | null;
}

function listingGradeKey(listing: MarketplaceListingSnapshot) {
  return (
    listing.snapshot_payload?.gradeValue ??
    listing.snapshot_payload?.conditionBucket ??
    "ungraded"
  );
}

function historyGradeKey(point: MarketplaceProductMarketPriceHistoryPoint) {
  return point.grade_value ?? point.condition_bucket;
}

// Never surface a raw snake_case bucket (e.g. "raw_a") straight to the UI —
// title-case it so an absent conditionCode still reads as a label ("Raw A")
// instead of a slug.
function prettifyBucket(bucket: string) {
  return bucket
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function gradeLabelForKey(listings: MarketplaceListingSnapshot[], key: string) {
  const match = listings.find((listing) => listingGradeKey(listing) === key);
  if (!match) return prettifyBucket(key);
  const service = match.snapshot_payload?.gradeService;
  const value = match.snapshot_payload?.gradeValue;
  if (service && value) return `${service} ${value}`;
  if (match.snapshot_payload?.conditionCode) return match.snapshot_payload.conditionCode;
  return prettifyBucket(match.snapshot_payload?.conditionBucket ?? key);
}

export function ProductMarketClient({
  listings,
  priceHistory,
  defaultConditionLabel,
  initialSelectedGrade,
}: ProductMarketClientProps) {
  const [selectedGrade, setSelectedGrade] = useState<string | null>(initialSelectedGrade);

  const scopedPriceHistory = useMemo(() => {
    if (!selectedGrade) return priceHistory;
    return priceHistory.filter((point) => historyGradeKey(point) === selectedGrade);
  }, [priceHistory, selectedGrade]);

  const selectedGradeLabel = selectedGrade
    ? gradeLabelForKey(listings, selectedGrade)
    : defaultConditionLabel;

  return (
    <>
      <GradeTabs listings={listings} selectedGrade={selectedGrade} onSelectGrade={setSelectedGrade} />
      <PriceHistoryPanel priceHistory={scopedPriceHistory} selectedGradeLabel={selectedGradeLabel} />
    </>
  );
}
