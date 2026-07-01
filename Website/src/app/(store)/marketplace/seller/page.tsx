import Link from "next/link";
import { redirect } from "next/navigation";
import { MarketplaceSellerClient } from "@/features/ynot/MarketplaceSellerClient";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import {
  getMockMarketplaceAccount,
  getMarketplaceAccountForProfile,
} from "@/lib/marketplace/account-bridge";
import { marketplaceConfig } from "@/lib/marketplace/config";
import { getActiveMarketplaceMoneyPolicy } from "@/lib/marketplace/money";
import { listSellerSubmissions } from "@/lib/marketplace/seller-consignment";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

export default async function MarketplaceSellerPage() {
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
  const [submissions, moneyPolicy] = await Promise.all([
    listSellerSubmissions(account),
    getActiveMarketplaceMoneyPolicy(),
  ]);
  const data = await getYnotDashboardSlice({
    wallet: Boolean(profile?.profileId),
  });

  return (
    <YnotShell
      viewer={data.viewer}
      walletBalance={data.wallet.balanceCoins}
    >
      <div className="store-home-grid marketplace-detail-page">
        <div className="store-main-stack">
          <Link href="/marketplace" className="marketplace-back-link" prefetch={false}>
            Marketplace
          </Link>
          <div className="catalog-toolbar marketplace-toolbar">
            <h1>Sell cards and upload photos</h1>
            <p>{submissions.length} item request{submissions.length === 1 ? "" : "s"}</p>
          </div>
          <MarketplaceSellerClient
            sellerStatus={account?.sellerStatus ?? null}
            payoutStatus={account?.payoutStatus ?? null}
            sellerFeeBps={moneyPolicy.sellerFeeBps}
            submissions={submissions}
            mockMode={mockMode}
          />
        </div>
      </div>
    </YnotShell>
  );
}
