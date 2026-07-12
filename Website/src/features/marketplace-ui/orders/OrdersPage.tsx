import Link from "next/link";
import { MpBadge, MpBtn, MpPanel } from "../shared/MpPrimitives";
import { formatThb } from "../shared/money";
import { BuyingTab, type BuyingOrderRow } from "./BuyingTab";
import { ListingsTab, type SubmissionRow } from "./ListingsTab";

/**
 * "My buying & selling" — three-tab orders shell (buying / selling / listings).
 * Ported from marketplace-proto-5.jsx:140-186. Tabs are URL state (?tab=),
 * rendered server-side; datasets are loaded by the page and passed in.
 */

export type OrdersTab = "buying" | "selling" | "listings";

export type SellerSale = {
  id: string;
  payment_state: string;
  fulfilment_state: string;
  refund_state: string;
  item_price_satang: number;
  seller_fee_satang: number;
  seller_payout_satang: number;
  seller_payout_state: string;
  created_at: string | null;
};

function stateLabel(value: string) {
  return value.replace(/_/g, " ");
}

const TABS: { id: OrdersTab; label: string }[] = [
  { id: "buying", label: "I'm buying" },
  { id: "selling", label: "I'm selling" },
  { id: "listings", label: "My listings" },
];

function SellingTab({ sales }: { sales: SellerSale[] }) {
  if (sales.length === 0) {
    return (
      <MpPanel className="mp-empty-panel">
        <p className="mp-mute">No sales yet. List a card to start selling.</p>
      </MpPanel>
    );
  }
  return (
    <div className="mp-selling-tab">
      {sales.map((sale) => (
        <div key={sale.id} className="mp-sale-row">
          <div className="mp-sale-main">
            <strong>Sold · {formatThb(sale.item_price_satang)}</strong>
            <span className="mp-small mp-mute">
              {stateLabel(sale.fulfilment_state)}
            </span>
          </div>
          <div className="mp-sale-payout">
            <span>Payout {formatThb(sale.seller_payout_satang)}</span>
            <MpBadge kind="graded">{stateLabel(sale.seller_payout_state)}</MpBadge>
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrdersPage({
  activeTab,
  buyerOrders,
  sales,
  submissions,
}: {
  activeTab: OrdersTab;
  buyerOrders: BuyingOrderRow[];
  sales: SellerSale[];
  submissions: SubmissionRow[];
}) {
  const counts: Record<OrdersTab, number> = {
    buying: buyerOrders.length,
    selling: sales.length,
    listings: submissions.length,
  };

  return (
    <div className="mp-orders-page">
      <div className="mp-orders-head">
        <div>
          <h1 className="mp-h1">My buying &amp; selling</h1>
        </div>
        <div className="mp-orders-head-actions">
          <Link href="/marketplace/seller">
            <MpBtn variant="primary">Sell a card</MpBtn>
          </Link>
          <Link href="/marketplace">
            <MpBtn>Back to market</MpBtn>
          </Link>
        </div>
      </div>

      <div className="mp-orders-tabs" role="tablist">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={`/marketplace/orders?tab=${tab.id}`}
            className={`mp-chip ${activeTab === tab.id ? "active" : ""}`}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            {tab.label} · {counts[tab.id]}
          </Link>
        ))}
      </div>

      <div className="mp-orders-body">
        {activeTab === "buying" ? <BuyingTab orders={buyerOrders} /> : null}
        {activeTab === "selling" ? <SellingTab sales={sales} /> : null}
        {activeTab === "listings" ? (
          <ListingsTab submissions={submissions} />
        ) : null}
      </div>
    </div>
  );
}
