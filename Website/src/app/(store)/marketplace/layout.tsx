import { JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { getMarketplaceCustomerCartSummary } from "@/lib/marketplace/cart-watchlist";
import { MarketplaceCartDrawer } from "@/features/ynot/MarketplaceCartDrawer";
import { MarketplaceCartProvider } from "@/features/ynot/MarketplaceCartProvider";
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
  const initialSummary = await getMarketplaceCustomerCartSummary(
    account,
    profile?.profileId ?? null,
  );

  return (
    <div className={`mp-root ${jetbrainsMono.variable}`}>
      <MarketplaceCartProvider initialSummary={initialSummary}>
        <MarketplaceCartDrawer />
        {children}
      </MarketplaceCartProvider>
    </div>
  );
}
