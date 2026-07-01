import type { ReactNode } from "react";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { getMarketplaceCustomerCartSummary } from "@/lib/marketplace/cart-watchlist";
import { MarketplaceCartDrawer } from "@/features/ynot/MarketplaceCartDrawer";
import { MarketplaceCartProvider } from "@/features/ynot/MarketplaceCartProvider";
import { MarketplaceHeaderActions } from "@/features/ynot/MarketplaceHeaderActions";

export default async function MarketplaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await resolveCurrentProfile();
  const admin = profile ? await resolveAdminSession(profile) : null;
  const account = profile
    ? await getMarketplaceAccountForProfile(profile, admin)
    : null;
  const initialSummary = await getMarketplaceCustomerCartSummary(
    account,
    profile?.profileId ?? null,
  );
  const showAdmin = admin?.adminRole === "owner" || admin?.adminRole === "admin";

  return (
    <MarketplaceCartProvider initialSummary={initialSummary}>
      <div className="marketplace-shared-actions-shell">
        <div>
          <span>YNOT Marketplace</span>
          <strong>Card market</strong>
        </div>
        <MarketplaceHeaderActions showAdmin={showAdmin} />
      </div>
      <MarketplaceCartDrawer />
      {children}
    </MarketplaceCartProvider>
  );
}
