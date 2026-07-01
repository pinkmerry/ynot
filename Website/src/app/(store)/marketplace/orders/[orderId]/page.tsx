import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  MarketplacePaymentProofClient,
  type MarketplacePaymentProofOrder,
} from "@/features/ynot/MarketplacePaymentProofClient";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import {
  getMarketplaceAccountForProfile,
  getMockMarketplaceAccount,
} from "@/lib/marketplace/account-bridge";
import { marketplaceConfig } from "@/lib/marketplace/config";
import { getBuyerOrder } from "@/lib/marketplace/orders";
import { getMarketplacePaymentInstructions } from "@/lib/marketplace/payment-instructions";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

function thb(amountSatang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amountSatang / 100);
}

function stateLabel(value: string) {
  return value.replace(/_/g, " ");
}

export default async function MarketplaceOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
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
    mockMode || (config.ownerOnly ? admin?.adminRole === "owner" || devOwnerPreview : true);

  if (!allowed) {
    redirect("/packs");
  }
  if (config.unavailableReason !== null) {
    redirect("/marketplace");
  }

  const { orderId } = await params;
  const [data, account] = await Promise.all([
    getYnotDashboardSlice({ wallet: Boolean(profile?.profileId) }),
    profile
      ? getMarketplaceAccountForProfile(profile, admin)
      : Promise.resolve(getMockMarketplaceAccount(admin)),
  ]);
  if (!account) notFound();

  let order: Awaited<ReturnType<typeof getBuyerOrder>>;
  try {
    order = await getBuyerOrder({ orderId, account });
  } catch (error) {
    if (
      error instanceof MarketplaceServiceError &&
      error.code === "marketplace_order_not_found"
    ) {
      notFound();
    }
    throw error;
  }
  const canResumePayment =
    order.payment_state === "pending_payment" ||
    order.payment_state === "payment_submitted";
  const paymentProofOrder: MarketplacePaymentProofOrder = {
    pendingPaymentOrderId: order.pending_payment_order_id,
    orderId: order.id,
    paymentState: order.payment_state,
    fulfilmentState: order.fulfilment_state,
    itemPriceSatang: order.item_price_satang,
    shippingFeeSatang: order.shipping_fee_satang,
    buyerServiceFeeSatang: order.buyer_service_fee_satang,
    buyerTotalSatang: order.buyer_total_satang,
    currency: order.currency,
  };

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <div className="store-home-grid marketplace-detail-page">
        <div className="store-main-stack">
          <Link href="/marketplace/orders" className="marketplace-back-link" prefetch={false}>
            Marketplace orders
          </Link>
          <section className="marketplace-order-detail">
            <div>
              <span className="marketplace-card-eyebrow">
                {order.listing_source === "user_seller"
                  ? "Seller consignment"
                  : "Official shop"}
              </span>
              <h1>{order.listing?.title ?? `Order ${order.id.slice(0, 8)}`}</h1>
              <p>
                Payment {stateLabel(order.payment_state)} · Fulfilment{" "}
                {stateLabel(order.fulfilment_state)}
              </p>
            </div>

            <dl className="marketplace-checkout-summary">
              <div>
                <dt>Item</dt>
                <dd>{thb(order.item_price_satang)}</dd>
              </div>
              <div>
                <dt>Service fee</dt>
                <dd>{thb(order.buyer_service_fee_satang)}</dd>
              </div>
              <div>
                <dt>Shipping</dt>
                <dd>{thb(order.shipping_fee_satang)}</dd>
              </div>
              <div>
                <dt>Total paid</dt>
                <dd>{thb(order.buyer_total_satang)}</dd>
              </div>
            </dl>

            <div className="marketplace-order-states">
              <span className="status-pill ready">
                Payment {stateLabel(order.payment_state)}
              </span>
              <span className="status-pill">
                Fulfilment {stateLabel(order.fulfilment_state)}
              </span>
              {order.refund_state !== "none" ? (
                <span className="status-pill warn">
                  Refund {stateLabel(order.refund_state)}
                </span>
              ) : null}
            </div>

            <small>
              Order ID {order.id} · Created{" "}
              {new Date(order.created_at).toLocaleString("th-TH")}
            </small>

            {canResumePayment ? (
              <MarketplacePaymentProofClient
                order={paymentProofOrder}
                paymentInstructions={getMarketplacePaymentInstructions()}
                mockMode={mockMode}
              />
            ) : null}
          </section>
        </div>
      </div>
    </YnotShell>
  );
}
