import type { YnotAddress } from "./types";

export const REQUIRED_SHIPPING_ADDRESS_FIELDS = [
  { key: "recipientName", label: "recipient name" },
  { key: "phone", label: "phone" },
  { key: "addressLine1", label: "address line 1" },
  { key: "subdistrict", label: "subdistrict" },
  { key: "district", label: "district" },
  { key: "province", label: "province" },
  { key: "postalCode", label: "postal code" },
  { key: "country", label: "country" },
] as const satisfies readonly {
  key: keyof Pick<
    YnotAddress,
    | "recipientName"
    | "phone"
    | "addressLine1"
    | "subdistrict"
    | "district"
    | "province"
    | "postalCode"
    | "country"
  >;
  label: string;
}[];

export function missingShippingAddressFields(address?: YnotAddress | null) {
  return REQUIRED_SHIPPING_ADDRESS_FIELDS.filter(({ key }) => {
    const value = address?.[key];
    return typeof value !== "string" || !value.trim();
  }).map(({ label }) => label);
}

export function isCompleteShippingAddress(address?: YnotAddress | null) {
  return missingShippingAddressFields(address).length === 0;
}
