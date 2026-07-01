import { redirect } from "next/navigation";
import { MarketplaceExperience, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import {
  getMarketplaceAccountForProfile,
  safeMarketplaceAccountResponse,
} from "@/lib/marketplace/account-bridge";
import { marketplaceConfig } from "@/lib/marketplace/config";
import {
  listMarketplaceProductBrowseFilterCounts,
  listMarketplaceProductBrowsePage,
  type MarketplaceBrowseFilterCounts,
  type MarketplaceProductBrowsePage,
} from "@/lib/marketplace/product-browse";
import {
  marketplaceQueryPlanFromUrl,
  type MarketplaceQueryPlan,
} from "@/lib/marketplace/query-plan";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

type MarketplacePageSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function queryFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const url = new URL("http://ynot.local/marketplace");
  for (const [key, value] of Object.entries(searchParams)) {
    const firstValue = firstSearchValue(value);
    if (firstValue) url.searchParams.set(key, firstValue);
  }
  return marketplaceQueryPlanFromUrl(url);
}

function selectedMarketplaceFilter(query: MarketplaceQueryPlan) {
  if (query.source === "official_shop") return "official_shop";
  if (query.source === "user_seller") return "user_seller";
  if (query.q === "pokemon") return "pokemon";
  if (query.q === "one piece") return "one_piece";
  if (query.grade === "psa_10") return "psa10";
  if (query.condition === "raw_a") return "raw";
  if (query.q === "holo") return "holo";
  if (query.q === "promo") return "promo";
  return "all";
}

function selectedMarketplaceSort(query: MarketplaceQueryPlan) {
  switch (query.sort) {
    case "popular":
    case "newest":
    case "price_asc":
    case "price_desc":
    case "recent_sales":
      return query.sort;
    case "recommended":
    default:
      return "recommended";
  }
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams?: MarketplacePageSearchParams;
}) {
  const profile = await resolveCurrentProfile();
  const admin = profile ? await resolveAdminSession(profile) : null;
  const config = marketplaceConfig();
  const productQuery = queryFromSearchParams(
    searchParams ? await searchParams : {},
  );
  const devOwnerPreview = isDevAuthAllowed() && admin?.adminRole === "owner";
  const allowed =
    config.ownerOnly ? admin?.adminRole === "owner" || devOwnerPreview : true;

  if (!allowed) {
    redirect("/packs");
  }

  let marketplaceAccount = safeMarketplaceAccountResponse(null, admin);
  let marketplaceProductPage: MarketplaceProductBrowsePage = {
    products: [],
    nextCursor: null,
  };
  let marketplaceFilterCounts: MarketplaceBrowseFilterCounts = {};
  if (config.unavailableReason === null && config.actions.browse) {
    const [account, productPage, filterCounts] = await Promise.all([
      profile
        ? getMarketplaceAccountForProfile(profile, admin)
        : Promise.resolve(null),
      listMarketplaceProductBrowsePage(productQuery),
      listMarketplaceProductBrowseFilterCounts(),
    ]);
    marketplaceAccount = safeMarketplaceAccountResponse(account, admin);
    marketplaceProductPage = productPage;
    marketplaceFilterCounts = filterCounts;
  }

  const data = await getYnotDashboardSlice({
    wallet: Boolean(profile?.profileId),
  });

  return (
    <YnotShell
      viewer={data.viewer}
      walletBalance={data.wallet.balanceCoins}
    >
      <MarketplaceExperience
        accountStatus={marketplaceAccount}
        launchStatus={{
          enabled: config.enabled,
          configured: config.unavailableReason === null,
          ownerOnly: config.ownerOnly,
          mockData: config.mockData,
          reason: config.unavailableReason,
          actions: config.actions,
        }}
        marketplaceProducts={marketplaceProductPage.products}
        productNextCursor={marketplaceProductPage.nextCursor}
        filterCounts={marketplaceFilterCounts}
        selectedFilterKey={selectedMarketplaceFilter(productQuery)}
        selectedSort={selectedMarketplaceSort(productQuery)}
      />
    </YnotShell>
  );
}
