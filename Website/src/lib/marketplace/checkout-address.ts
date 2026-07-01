import "server-only";

import { isCompleteShippingAddress } from "@/features/ynot/address-utils";
import { getProfileAddresses } from "@/features/ynot/server-addresses";
import type { YnotAddress } from "@/features/ynot/types";
import { MarketplaceServiceError } from "./supabase-adapter";

export type MarketplaceCheckoutAddress = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  summary: string;
  deliveryNote: string | null;
};

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

export async function assertMarketplaceCheckoutAddress(input: {
  profileId: string;
  shippingAddressId: unknown;
  addressConfirmed: unknown;
}): Promise<MarketplaceCheckoutAddress> {
  if (input.addressConfirmed !== true) {
    throw new MarketplaceServiceError(
      "marketplace_shipping_address_confirmation_required",
      "Confirm the shipping address before checkout.",
      422,
    );
  }

  if (
    typeof input.shippingAddressId !== "string" ||
    input.shippingAddressId.trim().length < 8
  ) {
    throw new MarketplaceServiceError(
      "marketplace_shipping_address_required",
      "A valid shipping address is required.",
      422,
    );
  }

  const addressId = input.shippingAddressId.trim();
  const addresses = await getProfileAddresses(input.profileId);
  const address = addresses.find((row) => row.id === addressId);
  if (!address || !isCompleteShippingAddress(address)) {
    throw new MarketplaceServiceError(
      "marketplace_shipping_address_invalid",
      "A complete shipping address is required.",
      422,
    );
  }

  return {
    id: address.id,
    label: address.label ?? null,
    recipientName: address.recipientName ?? "",
    phone: address.phone ?? "",
    summary: addressSummary(address),
    deliveryNote: address.deliveryNote ?? null,
  };
}
