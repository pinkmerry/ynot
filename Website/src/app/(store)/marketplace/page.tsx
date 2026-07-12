import { redirect } from "next/navigation";
import { BrowsePage } from "@/features/marketplace-ui/browse/BrowsePage";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
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

  let marketplaceProductPage: MarketplaceProductBrowsePage = {
    products: [],
    nextCursor: null,
  };
  let marketplaceFilterCounts: MarketplaceBrowseFilterCounts = {};
  if (config.unavailableReason === null && config.actions.browse) {
    // The account read stays in this parallel batch untouched (same
    // guard, same Promise.all shape as before) even though its result is no
    // longer rendered here — BrowsePage has no account-gated affordance on
    // the browse page itself (unlike the previous experience component this
    // replaced), so there is nothing left to feed
    // safeMarketplaceAccountResponse() into.
    const [, productPage, filterCounts] = await Promise.all([
      profile
        ? getMarketplaceAccountForProfile(profile, admin)
        : Promise.resolve(null),
      listMarketplaceProductBrowsePage(productQuery),
      listMarketplaceProductBrowseFilterCounts(),
    ]);
    marketplaceProductPage = productPage;
    marketplaceFilterCounts = filterCounts;
  }

  // The wallet balance / viewer data getYnotDashboardSlice used to fetch for
  // the old page-level header shell is no longer needed here: the
  // marketplace layout (src/app/(store)/marketplace/layout.tsx) already
  // renders MarketTopbar with its own getYnotDashboardSlice({wallet: true})
  // read for the coin pill, so fetching it again here would be a redundant
  // duplicate read.

  return (
    <BrowsePage
      query={productQuery}
      products={marketplaceProductPage.products}
      filterCounts={marketplaceFilterCounts}
      selectedFilterKey={selectedMarketplaceFilter(productQuery)}
      selectedSort={selectedMarketplaceSort(productQuery)}
    />
  );
}
