import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { isCompleteShippingAddress } from "@/features/ynot/address-utils";
import {
  MarketplaceListingDetailPage,
  type MarketplaceListingCheckoutAddress,
} from "@/features/ynot/MarketplaceListingDetailPage";
import { getProfileAddresses } from "@/features/ynot/server-addresses";
import type { YnotAddress } from "@/features/ynot/types";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import { marketplaceConfig } from "@/lib/marketplace/config";
import { getMarketplaceListing } from "@/lib/marketplace/listings";
import {
  buildMarketplaceListingJsonLd,
  buildMarketplaceListingMetadata,
  serializeMarketplaceJsonLd,
} from "@/lib/marketplace/marketplace-metadata";
import { getMarketplacePaymentInstructions } from "@/lib/marketplace/payment-instructions";
import { MOCK_MARKETPLACE_ADDRESS } from "@/lib/marketplace/mock-data";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";
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

function checkoutAddress(address: YnotAddress): MarketplaceListingCheckoutAddress {
  return {
    id: address.id,
    label: address.label ?? null,
    recipientName: address.recipientName ?? "",
    phone: address.phone ?? "",
    summary: addressSummary(address),
    deliveryNote: address.deliveryNote ?? null,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ listingId: string }>;
}): Promise<Metadata> {
  const { listingId } = await params;
  try {
    const listing = await getMarketplaceListing(listingId);
    return buildMarketplaceListingMetadata(listing);
  } catch (error) {
    if (
      error instanceof MarketplaceServiceError &&
      error.code === "marketplace_listing_not_found"
    ) {
      return {
        title: "Marketplace listing | YNOT Marketplace",
        description: "Review trading card listing photos, condition, and prices on YNOT.",
      };
    }
    throw error;
  }
}

export default async function MarketplaceListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const profile = await resolveCurrentProfile();
  const admin = profile ? await resolveAdminSession(profile) : null;
  const config = marketplaceConfig();
  const devOwnerPreview = isDevAuthAllowed() && admin?.adminRole === "owner";
  const allowed =
    config.ownerOnly ? admin?.adminRole === "owner" || devOwnerPreview : true;

  if (!allowed) {
    redirect("/packs");
  }
  if (config.unavailableReason !== null) {
    redirect("/marketplace");
  }
  if (!config.actions.browse) {
    redirect("/marketplace");
  }

  const { listingId } = await params;
  let listing: Awaited<ReturnType<typeof getMarketplaceListing>>;
  try {
    listing = await getMarketplaceListing(listingId);
  } catch (error) {
    if (
      error instanceof MarketplaceServiceError &&
      error.code === "marketplace_listing_not_found"
    ) {
      notFound();
    }
    throw error;
  }

  const addresses = profile
    ? await getProfileAddresses(profile.profileId)
    : [];
  const checkoutAddresses = addresses
    .filter(isCompleteShippingAddress)
    .map(checkoutAddress);
  if (config.mockData && checkoutAddresses.length === 0) {
    checkoutAddresses.push(MOCK_MARKETPLACE_ADDRESS);
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeMarketplaceJsonLd(buildMarketplaceListingJsonLd(listing)),
        }}
      />
      <MarketplaceListingDetailPage
        listing={listing}
        checkoutAddresses={checkoutAddresses}
        canUseAccountActions={Boolean(profile || config.mockData)}
        canCheckout={Boolean(profile || config.mockData)}
        checkoutEnabled={config.actions.checkout}
        paymentInstructions={getMarketplacePaymentInstructions()}
      />
    </>
  );
}
