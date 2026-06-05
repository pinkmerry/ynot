import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { addressActionToken } from "@/lib/ynot/address-action-tokens";
import { isCompleteShippingAddress } from "./address-utils";
import type { YnotAddress } from "./types";

type SupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

export const profileAddressSelect =
  "full_name,phone,address_line1,address_line2,subdistrict,district,province,postal_code,country,delivery_note";

export const userAddressSelect =
  "id,label,recipient_name,phone,address_line1,address_line2,subdistrict,district,province,postal_code,country,delivery_note,is_default";

export type ProfileAddressRow = {
  full_name: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  delivery_note: string | null;
};

export type UserAddressRow = {
  id: string;
  label: string;
  recipient_name: string | null;
  phone: string | null;
  address_line1: string;
  address_line2: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  delivery_note: string | null;
  is_default: boolean;
};

type CompleteProfileAddress = YnotAddress & {
  recipientName: string;
  phone: string;
  addressLine1: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  country: string;
};

export function toPublicAddressShape(row: UserAddressRow): Omit<YnotAddress, "id"> {
  return {
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    subdistrict: row.subdistrict,
    district: row.district,
    province: row.province,
    postalCode: row.postal_code,
    country: row.country,
    deliveryNote: row.delivery_note,
    isDefault: row.is_default,
  };
}

export async function toYnotAddress(
  profileId: string,
  row: UserAddressRow,
): Promise<YnotAddress> {
  return {
    id: await addressActionToken(profileId, row.id),
    ...toPublicAddressShape(row),
  };
}

function profileRowToAddressInput(row: ProfileAddressRow): Omit<YnotAddress, "id" | "label" | "isDefault"> {
  return {
    recipientName: row.full_name,
    phone: row.phone,
    addressLine1: row.address_line1 ?? "",
    addressLine2: row.address_line2,
    subdistrict: row.subdistrict,
    district: row.district,
    province: row.province,
    postalCode: row.postal_code,
    country: row.country,
    deliveryNote: row.delivery_note,
  };
}

async function readAddressRows(
  supabase: SupabaseClient,
  profileId: string,
): Promise<UserAddressRow[]> {
  const { data, error } = await supabase
    .from("user_addresses")
    .select(userAddressSelect)
    .eq("profile_id", profileId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data ?? []) as UserAddressRow[];
}

export async function ensureDefaultAddressFromProfile(
  profileId: string,
  supabase = createServiceSupabaseClient(),
): Promise<UserAddressRow[]> {
  const existing = await readAddressRows(supabase, profileId);
  if (existing.length > 0) return existing;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(profileAddressSelect)
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return existing;

  const profileAddress = {
    id: "profile",
    label: "Profile default",
    isDefault: true,
    ...profileRowToAddressInput(profile as ProfileAddressRow),
  } satisfies YnotAddress;
  if (!isCompleteShippingAddress(profileAddress)) {
    return existing;
  }
  const completeProfileAddress = profileAddress as CompleteProfileAddress;

  const { data: inserted, error: insertError } = await supabase
    .from("user_addresses")
    .insert({
      profile_id: profileId,
      label: "Profile default",
      recipient_name: completeProfileAddress.recipientName,
      phone: completeProfileAddress.phone,
      address_line1: completeProfileAddress.addressLine1,
      address_line2: completeProfileAddress.addressLine2,
      subdistrict: completeProfileAddress.subdistrict,
      district: completeProfileAddress.district,
      province: completeProfileAddress.province,
      postal_code: completeProfileAddress.postalCode,
      country: completeProfileAddress.country,
      delivery_note: completeProfileAddress.deliveryNote,
      is_default: true,
    })
    .select(userAddressSelect)
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return readAddressRows(supabase, profileId);
    }
    throw insertError;
  }
  return inserted ? [inserted as UserAddressRow] : existing;
}

export async function getProfileAddresses(profileId: string): Promise<YnotAddress[]> {
  const rows = await ensureDefaultAddressFromProfile(profileId);
  return Promise.all(rows.map((row) => toYnotAddress(profileId, row)));
}
