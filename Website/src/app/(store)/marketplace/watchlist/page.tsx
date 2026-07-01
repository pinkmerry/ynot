import Link from "next/link";
import { redirect } from "next/navigation";
import { MarketplaceCartWatchlistClient } from "@/features/ynot/MarketplaceCartWatchlistClient";
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
import { getMarketplaceWatchlistState } from "@/lib/marketplace/cart-watchlist";
import { marketplaceConfig } from "@/lib/marketplace/config";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

export default async function MarketplaceWatchlistPage() {
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
  const watchlistState = await getMarketplaceWatchlistState(
    account,
    profile?.profileId ?? null,
  );
  const watchlist = watchlistState.items;

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <div className="store-home-grid marketplace-page">
        <div className="store-main-stack">
          <div className="catalog-toolbar marketplace-toolbar">
            <div>
              <span className="marketplace-card-eyebrow">YNOT marketplace</span>
              <h1>Watchlist</h1>
              <p>{watchlist.length} watched listing{watchlist.length === 1 ? "" : "s"}</p>
            </div>
            <div className="marketplace-page-actions">
              <Link href="/marketplace/cart" className="btn" prefetch={false}>
                Cart
              </Link>
              <Link href="/marketplace" className="btn btn-ghost" prefetch={false}>
                Marketplace
              </Link>
            </div>
          </div>

          <MarketplaceCartWatchlistClient
            mode="watchlist"
            initialItems={watchlist}
          />
        </div>
      </div>
    </YnotShell>
  );
}
