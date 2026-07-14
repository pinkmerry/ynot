import { JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import { signOutAction } from "@/features/auth/actions";
import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { getMarketplaceBagSummary } from "@/lib/marketplace/bag-summary";
import { getMarketplaceCustomerCartSummary } from "@/lib/marketplace/cart-watchlist";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { MarketplaceCartDrawer } from "@/features/ynot/MarketplaceCartDrawer";
import { MarketplaceCartProvider } from "@/features/ynot/MarketplaceCartProvider";
import { MarketTopbar } from "@/features/marketplace-ui/shell/MarketTopbar";
import "@/features/marketplace-ui/theme/marketplace-theme.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--mp-font-mono",
});

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

  // Parallelize the three independent reads that only depend on
  // profile/account (already resolved above) — avoids a parent-child
  // request waterfall across cart, wallet, and bag-summary reads.
  const [initialSummary, dashboard, bagSummary] = await Promise.all([
    getMarketplaceCustomerCartSummary(account, profile?.profileId ?? null),
    // wallet:true forces the balance read even when resolveCurrentProfile()
    // returns a viewer getYnotViewer() itself would treat as unauthenticated
    // (e.g. dev-auth preview) — mirrors YnotShell's existing wallet fetch.
    profile ? getYnotDashboardSlice({ wallet: true }) : null,
    getMarketplaceBagSummary(account),
  ]);

  const balanceCoins = dashboard?.wallet.balanceCoins ?? 0;
  const pendingActionCount =
    bagSummary.pendingPaymentOrders + bagSummary.sellerSubmissions;

  return (
    <div className={`mp-root ${jetbrainsMono.variable}`}>
      <MarketplaceCartProvider initialSummary={initialSummary}>
        <MarketTopbar
          isAdmin={!!admin}
          isAuthenticated={!!profile}
          displayName={profile?.displayName?.trim() || "YNOTT Customer"}
          balanceCoins={balanceCoins}
          pendingActionCount={pendingActionCount}
          signOutAction={signOutAction}
        />
        <MarketplaceCartDrawer />
        {children}
      </MarketplaceCartProvider>
    </div>
  );
}
