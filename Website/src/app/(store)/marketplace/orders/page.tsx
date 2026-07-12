import { redirect } from "next/navigation";
import {
  OrdersPage,
  type OrdersTab,
  type SellerSale,
} from "@/features/marketplace-ui/orders/OrdersPage";
import type { BuyingOrderRow } from "@/features/marketplace-ui/orders/BuyingTab";
import type { SubmissionRow } from "@/features/marketplace-ui/orders/ListingsTab";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import {
  getMarketplaceAccountForProfile,
  getMockMarketplaceAccount,
} from "@/lib/marketplace/account-bridge";
import { marketplaceConfig } from "@/lib/marketplace/config";
import { listBuyerOrders } from "@/lib/marketplace/orders";
import {
  listSellerSales,
  listSellerSubmissions,
} from "@/lib/marketplace/seller-consignment";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

type OrdersPageSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

const TAB_VALUES: OrdersTab[] = ["buying", "selling", "listings"];

function resolveTab(value: string | string[] | undefined): OrdersTab {
  const first = Array.isArray(value) ? value[0] : value;
  return TAB_VALUES.includes(first as OrdersTab)
    ? (first as OrdersTab)
    : "buying";
}

export default async function MarketplaceOrdersRoute({
  searchParams,
}: {
  searchParams?: OrdersPageSearchParams;
}) {
  const profile = await resolveCurrentProfile();
  const config = marketplaceConfig();
  const mockMode = config.mockData;
  if (!profile?.profileId && !mockMode) {
    redirect("/packs");
  }

  const admin = profile ? await resolveAdminSession(profile) : null;
  const devOwnerPreview = isDevAuthAllowed() && admin?.adminRole === "owner";
  const allowed =
    mockMode ||
    (config.ownerOnly ? admin?.adminRole === "owner" || devOwnerPreview : true);

  if (!allowed) {
    redirect("/packs");
  }
  if (config.unavailableReason !== null) {
    redirect("/marketplace");
  }

  const activeTab = resolveTab((searchParams ? await searchParams : {}).tab);
  const account = profile
    ? await getMarketplaceAccountForProfile(profile, admin)
    : getMockMarketplaceAccount(admin);

  const [orders, sales, submissions] = await Promise.all([
    account ? listBuyerOrders(account) : Promise.resolve([]),
    account ? listSellerSales(account) : Promise.resolve([]),
    account ? listSellerSubmissions(account) : Promise.resolve([]),
  ]);

  const buyerOrders: BuyingOrderRow[] = orders.map((order) => ({
    id: order.id,
    payment_state: order.payment_state,
    fulfilment_state: order.fulfilment_state,
    refund_state: order.refund_state,
    item_price_satang: order.item_price_satang,
    shipping_fee_satang: order.shipping_fee_satang,
    buyer_service_fee_satang: order.buyer_service_fee_satang,
    buyer_total_satang: order.buyer_total_satang,
    listing_source: order.listing_source,
    created_at: order.created_at,
    title: null,
  }));

  const sellerSales: SellerSale[] = sales.map((sale) => ({
    id: sale.id,
    payment_state: sale.payment_state,
    fulfilment_state: sale.fulfilment_state,
    refund_state: sale.refund_state,
    item_price_satang: sale.item_price_satang,
    seller_fee_satang: sale.seller_fee_satang,
    seller_payout_satang: sale.seller_payout_satang,
    seller_payout_state: sale.seller_payout_state,
    created_at: sale.created_at,
  }));

  const listingRows: SubmissionRow[] = submissions.map((s) => ({
    id: s.id,
    submission_number: s.submission_number,
    status: s.status,
    title_snapshot: s.title_snapshot,
    condition_code: s.condition_code,
    asking_price_satang: s.asking_price_satang,
    payout_preview_satang: s.payout_preview_satang,
    version: s.version,
  }));

  return (
    <OrdersPage
      activeTab={activeTab}
      buyerOrders={buyerOrders}
      sales={sellerSales}
      submissions={listingRows}
    />
  );
}
