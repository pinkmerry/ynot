"use client";

import { useMemo } from "react";
import Link from "next/link";
import { MpIcon } from "../shared/MpIcon";
import { formatThb } from "../shared/money";
import type { MarketplaceListingSnapshot } from "@/lib/marketplace/types";

/**
 * Grade tabs + listing rows — ports ProtoDetail's grade filter strip and
 * `.mp-listing-rows` (/Users/pinkmerry/Downloads/ynott/project/
 * marketplace-proto-2.jsx:79-121): an "All" tab plus one tab per
 * grade/condition group (each showing count + lowest price), and a sorted
 * list of individual listing rows below with a Buy button per row.
 *
 * Grouping key mirrors gradeKey() in the prototype: `grade_value` when the
 * listing is graded (PSA/BGS/ARS), otherwise the raw `condition_bucket`
 * (from MarketplaceListingSnapshot.snapshot_payload — see
 * src/lib/marketplace/types.ts). Official-source rows are pinned to the top
 * and get the "pinned" row treatment + an Official badge, matching the
 * prototype's `r.official` handling.
 *
 * Buy always links to /marketplace/listings/[listingId] — checkout starts
 * on the listing page (a separate follow-up task), so this component never
 * POSTs anything itself.
 */

export interface GradeTabsProps {
  listings: MarketplaceListingSnapshot[];
  selectedGrade: string | null;
  onSelectGrade: (grade: string | null) => void;
}

type GradeGroup = {
  key: string;
  label: string;
  count: number;
  fromSatang: number;
};

function listingGradeKey(listing: MarketplaceListingSnapshot) {
  return (
    listing.snapshot_payload?.gradeValue ??
    listing.snapshot_payload?.conditionBucket ??
    "ungraded"
  );
}

function listingGradeLabel(listing: MarketplaceListingSnapshot) {
  const service = listing.snapshot_payload?.gradeService;
  const value = listing.snapshot_payload?.gradeValue;
  if (service && value) return `${service} ${value}`;
  return listing.snapshot_payload?.conditionCode ?? listing.snapshot_payload?.conditionBucket ?? "Item";
}

function isGradedListing(listing: MarketplaceListingSnapshot) {
  return Boolean(listing.snapshot_payload?.gradeService && listing.snapshot_payload?.gradeValue);
}

function isOfficialListing(listing: MarketplaceListingSnapshot) {
  return listing.listing_source === "official_shop";
}

function sellerName(listing: MarketplaceListingSnapshot) {
  if (isOfficialListing(listing)) return "YNOTT Shop";
  return listing.seller_public_profile_id ? `Seller ${listing.seller_public_profile_id.slice(0, 8)}` : "Community seller";
}

function sellerStatusLine(listing: MarketplaceListingSnapshot) {
  if (isOfficialListing(listing)) return "Official · ships from our vault";
  return listing.snapshot_payload?.sourceBadge ?? "Photos verified";
}

function buildGradeGroups(listings: MarketplaceListingSnapshot[]): GradeGroup[] {
  const groups = new Map<string, GradeGroup>();
  for (const listing of listings) {
    const key = listingGradeKey(listing);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        label: listingGradeLabel(listing),
        count: 1,
        fromSatang: listing.item_price_satang,
      });
      continue;
    }
    existing.count += 1;
    existing.fromSatang = Math.min(existing.fromSatang, listing.item_price_satang);
  }
  return Array.from(groups.values());
}

function sortListingRows(listings: MarketplaceListingSnapshot[]) {
  return [...listings].sort((left, right) => {
    const officialDiff = Number(isOfficialListing(right)) - Number(isOfficialListing(left));
    if (officialDiff !== 0) return officialDiff;
    return left.item_price_satang - right.item_price_satang;
  });
}

export function GradeTabs({ listings, selectedGrade, onSelectGrade }: GradeTabsProps) {
  const groups = useMemo(() => buildGradeGroups(listings), [listings]);
  const lowestSatang = useMemo(
    () => (listings.length > 0 ? Math.min(...listings.map((l) => l.item_price_satang)) : 0),
    [listings],
  );
  const visibleRows = useMemo(() => {
    const scoped = selectedGrade ? listings.filter((l) => listingGradeKey(l) === selectedGrade) : listings;
    return sortListingRows(scoped);
  }, [listings, selectedGrade]);

  return (
    <div className="mp-stack" style={{ gap: 20 }}>
      <div className="mp-stack" style={{ gap: 10 }}>
        <span className="mp-eyebrow">Buy · lowest price per grade</span>
        <div className="mp-grades" style={{ gridTemplateColumns: `repeat(${groups.length + 1}, 1fr)` }}>
          <span
            className={`mp-grade${selectedGrade === null ? " on" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelectGrade(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onSelectGrade(null);
            }}
          >
            <span className="g">All</span>
            <span className="p">{formatThb(lowestSatang)}</span>
            <span className="c">
              {listings.length} listing{listings.length === 1 ? "" : "s"} · from
            </span>
          </span>
          {groups.map((group) => (
            <span
              key={group.key}
              className={`mp-grade${selectedGrade === group.key ? " on" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectGrade(group.key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelectGrade(group.key);
              }}
            >
              <span className="g">{group.label}</span>
              <span className="p">{formatThb(group.fromSatang)}</span>
              <span className="c">
                {group.count} listing{group.count === 1 ? "" : "s"} · from
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="mp-stack" style={{ gap: 10 }}>
        <div className="mp-row">
          <span className="mp-eyebrow">
            {visibleRows.length} listing{visibleRows.length === 1 ? "" : "s"}
            {selectedGrade ? ` · ${groups.find((g) => g.key === selectedGrade)?.label ?? selectedGrade}` : ""}
          </span>
          <span className="mp-spacer" />
          <span className="mp-small mp-mute">Price · low to high</span>
        </div>
        <div className="mp-listing-rows">
          {visibleRows.map((listing) => (
            <div key={listing.listing_id} className={`mp-lrow${isOfficialListing(listing) ? " pinned" : ""}`}>
              <span className="gr">
                <span className={`mp-badge ${isGradedListing(listing) ? "mp-badge-graded" : "mp-badge-raw"}`}>
                  {listingGradeLabel(listing)}
                </span>
              </span>
              <span className="who">
                <span className="nm">
                  {sellerName(listing)}
                  {isOfficialListing(listing) ? (
                    <span className="mp-badge mp-badge-official" style={{ padding: "2px 7px", fontSize: 8.5 }}>
                      <MpIcon name="shield" size={9} /> Official
                    </span>
                  ) : null}
                </span>
                <span className="st">{sellerStatusLine(listing)}</span>
              </span>
              <span className="pr">{formatThb(listing.item_price_satang)}</span>
              <Link
                href={`/marketplace/listings/${listing.listing_id}`}
                className={`mp-btn ${isOfficialListing(listing) ? "mp-btn-green" : "mp-btn-primary"}`}
                style={{ padding: "7px 16px", fontSize: 12.5 }}
                prefetch={false}
              >
                Buy
              </Link>
            </div>
          ))}
          {visibleRows.length === 0 ? (
            <div style={{ padding: "22px 16px", textAlign: "center", color: "var(--mp-mute)", fontSize: 13 }}>
              No listings in this grade right now — set an alert to hear about the next one.
            </div>
          ) : null}
        </div>
        <div className="mp-alert mp-alert-green" style={{ padding: "10px 12px" }}>
          <MpIcon name="shield" size={15} />
          <span>
            Every community card ships to YNOT first for in-hand verification. Your payment is held in escrow
            until it passes.
          </span>
        </div>
      </div>
    </div>
  );
}
