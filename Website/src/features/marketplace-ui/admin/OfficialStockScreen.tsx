import type { OfficialItemType } from "@/lib/marketplace/official-shop";
import { MpBadge, MpEmpty, type MpBadgeKind } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";
import { AddStockButton, StockActions } from "./StockActions";

/**
 * Marketplace admin Official stock screen -- a dense inventory table plus
 * Add/Edit/Restock/Publish/Archive actions. Recreated (data-driven, not
 * 1:1 markup) from marketplace-admin-2.jsx's AdminStock (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-2.jsx:
 * 185-238).
 *
 * listOfficialInventory() (src/lib/marketplace/official-shop.ts:404-430)
 * has no exported row type or return-type annotation of its own (unlike
 * listSellerPayoutQueue's SellerPayoutQueueRow or listAdminRefundRequests's
 * MarketplaceRefundRequestRow) and no mock-data branch, so
 * OfficialInventoryRow is defined here to match its exact `.select(...)`
 * column list, and the page gates the read on canReadMarketplaceQueues
 * the same way payouts/page.tsx does.
 *
 * The prototype invents "set", "grade", and a "views 7d" column. The real
 * select list is id/item_type/item_state/title_snapshot/condition_code/
 * quantity_total/quantity_available/item_price_satang/currency/version/
 * updated_at -- no set/grade/views (those live in the per-item
 * reference_snapshot and public listing analytics, neither of which the
 * bulk list read carries), so this table shows item_type + condition_code
 * and the real quantity_available/quantity_total split instead. "Art" stays
 * a blank .mpa-thumb placeholder, same as the prototype itself (its own
 * AdminStock row renders `<span className="mpa-thumb"></span>` with no
 * image src -- this list read has no photo_urls either).
 *
 * Pure presentational server component: the page (page.tsx) loads
 * `inventory` up front via listOfficialInventory() and passes it down as a
 * prop -- this file only renders it, same split as PayoutsScreen.tsx/
 * page.tsx.
 */

export interface OfficialInventoryRow {
  id: string;
  item_type: OfficialItemType;
  item_state: string;
  title_snapshot: string;
  condition_code: string | null;
  quantity_total: number;
  quantity_available: number;
  item_price_satang: number;
  currency: "THB";
  version: number;
  updated_at: string | null;
}

const ITEM_TYPE_LABELS: Record<OfficialItemType, string> = {
  card: "Card",
  sealed_box: "Sealed box",
  sealed_pack: "Sealed pack",
};

function itemStateBadge(state: string): { kind: MpBadgeKind; label: string } {
  switch (state) {
    case "draft":
      return { kind: "raw", label: "Draft" };
    case "listed":
      return { kind: "official", label: "Live" };
    case "sold":
      return { kind: "sold", label: "Sold out" };
    case "archived":
      return { kind: "community", label: "Archived" };
    default:
      return { kind: "raw", label: state.replace(/_/g, " ") };
  }
}

function typeConditionLabel(row: OfficialInventoryRow): string {
  const typeLabel = ITEM_TYPE_LABELS[row.item_type] ?? row.item_type;
  return row.condition_code ? `${typeLabel} · ${row.condition_code}` : typeLabel;
}

export interface OfficialStockScreenProps {
  inventory: OfficialInventoryRow[];
}

export function OfficialStockScreen({ inventory }: OfficialStockScreenProps) {
  return (
    <>
      <div className="mp-row" style={{ alignItems: "flex-end", marginBottom: 22 }}>
        <div className="mp-stack" style={{ gap: 5 }}>
          <span className="mp-eyebrow">Official shop</span>
          <h1 className="mp-h1" style={{ fontSize: 26 }}>
            Official stock
          </h1>
          <p className="mp-lead" style={{ fontSize: 13 }}>
            Authorized goods sold by YNOTT -- pinned on top of every card page. No
            seller fee on official sales.
          </p>
        </div>
        <span className="mp-spacer" />
        <AddStockButton />
      </div>

      {inventory.length === 0 ? (
        <MpEmpty
          glyph="store"
          title="No official stock yet"
          hint="Add the first item to start selling from the official shop."
        />
      ) : (
        <div className="mpa-table-wrap">
          <table className="mpa-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Type · condition</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>Qty (avail / total)</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const badge = itemStateBadge(item.item_state);
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="mp-row" style={{ gap: 10 }}>
                        <span className="mpa-thumb" />
                        <b>{item.title_snapshot}</b>
                      </div>
                    </td>
                    <td className="mp-small mp-mute">{typeConditionLabel(item)}</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatThb(item.item_price_satang)}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {item.quantity_available} / {item.quantity_total}
                    </td>
                    <td>
                      <MpBadge kind={badge.kind}>{badge.label}</MpBadge>
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      <StockActions
                        item={{
                          id: item.id,
                          title_snapshot: item.title_snapshot,
                          item_state: item.item_state,
                          quantity_available: item.quantity_available,
                          version: item.version,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
