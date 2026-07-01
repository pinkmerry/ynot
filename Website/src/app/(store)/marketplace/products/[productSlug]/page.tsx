import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { MarketplaceProductPage } from "@/features/ynot/MarketplaceProductPage";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import { marketplaceConfig } from "@/lib/marketplace/config";
import {
  buildMarketplaceProductJsonLd,
  buildMarketplaceProductMetadata,
  serializeMarketplaceJsonLd,
} from "@/lib/marketplace/marketplace-metadata";
import { getMarketplaceProductMarket } from "@/lib/marketplace/product-market";
import { marketplaceQueryPlanFromUrl } from "@/lib/marketplace/query-plan";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

type ProductPageSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function queryUrl(
  productSlug: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const url = new URL(`http://ynot.local/marketplace/products/${productSlug}`);
  for (const [key, value] of Object.entries(searchParams)) {
    const firstValue = firstSearchValue(value);
    if (firstValue) url.searchParams.set(key, firstValue);
  }
  return url;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ productSlug: string }>;
  searchParams?: ProductPageSearchParams;
}): Promise<Metadata> {
  const { productSlug } = await params;
  const query = marketplaceQueryPlanFromUrl(
    queryUrl(productSlug, searchParams ? await searchParams : {}),
  );

  try {
    const market = await getMarketplaceProductMarket(productSlug, query);
    return buildMarketplaceProductMetadata(market);
  } catch (error) {
    if (
      error instanceof MarketplaceServiceError &&
      error.code === "marketplace_product_not_found"
    ) {
      return {
        title: "Marketplace product | YNOT Marketplace",
        description: "Compare trading card offers, variants, grades, and prices on YNOT.",
      };
    }
    throw error;
  }
}

export default async function MarketplaceProductRoute({
  params,
  searchParams,
}: {
  params: Promise<{ productSlug: string }>;
  searchParams?: ProductPageSearchParams;
}) {
  const profile = await resolveCurrentProfile();
  const admin = profile ? await resolveAdminSession(profile) : null;
  const config = marketplaceConfig();
  const devOwnerPreview = isDevAuthAllowed() && admin?.adminRole === "owner";
  const allowed =
    config.ownerOnly ? admin?.adminRole === "owner" || devOwnerPreview : true;

  if (!allowed) redirect("/packs");
  if (config.unavailableReason !== null || !config.actions.browse) {
    redirect("/marketplace");
  }

  const { productSlug } = await params;
  const query = marketplaceQueryPlanFromUrl(
    queryUrl(productSlug, searchParams ? await searchParams : {}),
  );

  let market: Awaited<ReturnType<typeof getMarketplaceProductMarket>>;
  try {
    market = await getMarketplaceProductMarket(productSlug, query);
  } catch (error) {
    if (
      error instanceof MarketplaceServiceError &&
      error.code === "marketplace_product_not_found"
    ) {
      notFound();
    }
    throw error;
  }

  const data = await getYnotDashboardSlice({
    wallet: Boolean(profile?.profileId),
  });

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeMarketplaceJsonLd(buildMarketplaceProductJsonLd(market)),
        }}
      />
      <MarketplaceProductPage
        market={market}
        selectedGrade={query.grade ?? query.condition ?? null}
      />
    </YnotShell>
  );
}
