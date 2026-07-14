import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  MarketplacePaymentProofClient,
  type MarketplacePaymentProofOrder,
} from "@/features/ynot/MarketplacePaymentProofClient";
import { OrderConfirmView } from "@/features/marketplace-ui/orders/OrderConfirmView";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import {
  getMarketplaceAccountForProfile,
  getMockMarketplaceAccount,
} from "@/lib/marketplace/account-bridge";
import { marketplaceConfig } from "@/lib/marketplace/config";
import {
  getBuyerOrder,
  getBuyerPendingPaymentOrder,
} from "@/lib/marketplace/orders";
import {
  getMarketplacePaymentInstructions,
  getMarketplacePaymentInstructionsFromSnapshot,
} from "@/lib/marketplace/payment-instructions";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

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
  const account = profile
    ? await getMarketplaceAccountForProfile(profile, admin)
    : getMockMarketplaceAccount(admin);
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
  const pendingOrder =
    canResumePayment && !mockMode
      ? await getBuyerPendingPaymentOrder({
          pendingOrderId: order.pending_payment_order_id,
          account,
        })
      : null;
  const paymentProofOrder: MarketplacePaymentProofOrder = {
    pendingPaymentOrderId: order.pending_payment_order_id,
    orderId: order.id,
    paymentState: order.payment_state,
    fulfilmentState: order.fulfilment_state,
    itemPriceSatang: pendingOrder?.checkout_group_id
      ? pendingOrder.item_subtotal_satang
      : order.item_price_satang,
    shippingFeeSatang: pendingOrder?.checkout_group_id
      ? pendingOrder.shipping_fee_satang
      : order.shipping_fee_satang,
    buyerServiceFeeSatang: pendingOrder?.checkout_group_id
      ? pendingOrder.buyer_service_fee_satang
      : order.buyer_service_fee_satang,
    buyerTotalSatang: pendingOrder?.checkout_group_id
      ? pendingOrder.buyer_total_satang
      : order.buyer_total_satang,
    currency: order.currency,
  };
  const paymentInstructions =
    getMarketplacePaymentInstructionsFromSnapshot(
      pendingOrder?.shipping_snapshot,
    ) ?? (await getMarketplacePaymentInstructions());

  return (
    <div className="mp-order-detail-page">
      <Link href="/marketplace/orders" className="mp-back-link">
        ← My buying &amp; selling
      </Link>
      {canResumePayment ? (
        <section className="mp-order-resume">
          <h1 className="mp-h1">Finish your payment</h1>
          <MarketplacePaymentProofClient
            order={paymentProofOrder}
            paymentInstructions={paymentInstructions}
            mockMode={mockMode}
          />
        </section>
      ) : (
        <OrderConfirmView
          order={{
            id: order.id,
            payment_state: order.payment_state,
            fulfilment_state: order.fulfilment_state,
            refund_state: order.refund_state,
            buyer_total_satang: order.buyer_total_satang,
            created_at: order.created_at,
            title: order.listing?.title ?? null,
          }}
        />
      )}
    </div>
  );
}
