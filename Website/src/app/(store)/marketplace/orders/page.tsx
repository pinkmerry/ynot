import Link from "next/link";
import { redirect } from "next/navigation";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
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

export default async function MarketplaceOrdersPage() {
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

  const [data, account] = await Promise.all([
    getYnotDashboardSlice({ wallet: Boolean(profile?.profileId) }),
    profile
      ? getMarketplaceAccountForProfile(profile, admin)
      : Promise.resolve(getMockMarketplaceAccount(admin)),
  ]);
  const orders = account ? await listBuyerOrders(account) : [];

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <div className="store-home-grid marketplace-page">
        <div className="store-main-stack">
          <div className="catalog-toolbar marketplace-toolbar">
            <div>
              <h1>Marketplace orders</h1>
              <p>{orders.length} buyer order{orders.length === 1 ? "" : "s"}</p>
            </div>
            <Link href="/marketplace" className="btn btn-ghost" prefetch={false}>
              Marketplace
            </Link>
          </div>

          {orders.length ? (
            <section className="marketplace-order-list" aria-label="Marketplace orders">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/marketplace/orders/${order.id}`}
                  className="marketplace-order-row"
                  prefetch={false}
                >
                  <span className="marketplace-card-eyebrow">
                    {order.listing_source === "user_seller"
                      ? "Seller consignment"
                      : "Official shop"}
                  </span>
                  <strong>{thb(order.buyer_total_satang)}</strong>
                  <span>{stateLabel(order.payment_state)}</span>
                  <span>{stateLabel(order.fulfilment_state)}</span>
                  {order.refund_state !== "none" ? (
                    <span>{stateLabel(order.refund_state)}</span>
                  ) : null}
                  <small>{new Date(order.created_at).toLocaleString("th-TH")}</small>
                </Link>
              ))}
            </section>
          ) : (
            <section className="marketplace-empty">
              <strong>No marketplace orders yet</strong>
              <p>Checkout from the marketplace to see physical-money orders here.</p>
              <Link href="/marketplace" className="btn btn-primary" prefetch={false}>
                Browse marketplace
              </Link>
            </section>
          )}
        </div>
      </div>
    </YnotShell>
  );
}
