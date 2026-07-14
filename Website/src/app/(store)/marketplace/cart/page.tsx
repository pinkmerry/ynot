import Link from "next/link";
import { redirect } from "next/navigation";
import { isCompleteShippingAddress } from "@/features/ynot/address-utils";
import {
  MarketplaceCartSummaryCopy,
  MarketplaceCartWatchlistClient,
} from "@/features/ynot/MarketplaceCartWatchlistClient";
import { getProfileAddresses } from "@/features/ynot/server-addresses";
import type { YnotAddress } from "@/features/ynot/types";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import {
  getMarketplaceAccountForProfile,
  getMockMarketplaceAccount,
} from "@/lib/marketplace/account-bridge";
import { getMarketplaceCustomerCartState } from "@/lib/marketplace/cart-watchlist";
import { marketplaceConfig } from "@/lib/marketplace/config";
import { MOCK_MARKETPLACE_ADDRESS } from "@/lib/marketplace/mock-data";
import { getMarketplacePaymentInstructions } from "@/lib/marketplace/payment-instructions";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

function addressSummary(address: YnotAddress) {
  return [
    address.addressLine1,
    address.addressLine2,
    address.subdistrict,
    address.district,
    address.province,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function checkoutAddress(address: YnotAddress) {
  return {
    id: address.id,
    label: address.label ?? null,
    recipientName: address.recipientName ?? "",
    phone: address.phone ?? "",
    summary: addressSummary(address),
    deliveryNote: address.deliveryNote ?? null,
  };
}

export default async function MarketplaceCartPage() {
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

  const account = profile
    ? await getMarketplaceAccountForProfile(profile, admin)
    : getMockMarketplaceAccount(admin);
  const cartState = await getMarketplaceCustomerCartState(
    account,
    profile?.profileId ?? null,
  );
  const cart = cartState.items;
  const addresses = profile
    ? await getProfileAddresses(profile.profileId)
    : [];
  const checkoutAddresses = addresses
    .filter(isCompleteShippingAddress)
    .map(checkoutAddress);
  if (mockMode && checkoutAddresses.length === 0) {
    checkoutAddresses.push(MOCK_MARKETPLACE_ADDRESS);
  }
  const paymentInstructions = await getMarketplacePaymentInstructions();

  return (
    <div className="store-home-grid marketplace-page">
      <div className="store-main-stack">
        <div className="catalog-toolbar marketplace-toolbar">
          <div>
            <span className="marketplace-card-eyebrow">YNOT marketplace</span>
            <h1>Cart</h1>
            <MarketplaceCartSummaryCopy mode="cart" />
          </div>
          <div className="marketplace-page-actions">
            <Link href="/marketplace/watchlist" className="btn" prefetch={false}>
              Watchlist
            </Link>
            <Link href="/marketplace" className="btn btn-ghost" prefetch={false}>
              Marketplace
            </Link>
          </div>
        </div>

        <MarketplaceCartWatchlistClient
          mode="cart"
          initialItems={cart}
          initialSummary={cartState.summary}
          checkoutAddresses={checkoutAddresses}
          checkoutEnabled={config.actions.checkout}
          paymentInstructions={paymentInstructions}
        />
      </div>
    </div>
  );
}
