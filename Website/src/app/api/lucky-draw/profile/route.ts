import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { ProfileInfo } from "@/lib/lucky-draw/types";

type ProfileBody = Partial<Record<keyof ProfileInfo, unknown>>;

const profileSelect = "display_name,line_display_name,full_name,phone,address_line1,address_line2,subdistrict,district,province,postal_code,country,delivery_note";
const addressSelect = "id,label,recipient_name,phone,address_line1,address_line2,subdistrict,district,province,postal_code,country,delivery_note,is_default";

export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return cleaned || null;
}

type ProfileRow = {
  display_name?: string | null;
  line_display_name?: string | null;
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

type AddressRow = {
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

function toProfileInfo(row: ProfileRow, defaultAddress?: AddressRow | null) {
  return {
    fullName: row.full_name ?? defaultAddress?.recipient_name ?? "",
    phone: row.phone ?? defaultAddress?.phone ?? "",
    addressLine1: defaultAddress?.address_line1 ?? row.address_line1 ?? "",
    addressLine2: defaultAddress?.address_line2 ?? row.address_line2 ?? "",
    subdistrict: defaultAddress?.subdistrict ?? row.subdistrict ?? "",
    district: defaultAddress?.district ?? row.district ?? "",
    province: defaultAddress?.province ?? row.province ?? "",
    postalCode: defaultAddress?.postal_code ?? row.postal_code ?? "",
    country: defaultAddress?.country ?? row.country ?? "Thailand",
    deliveryNote: defaultAddress?.delivery_note ?? row.delivery_note ?? "",
  } satisfies ProfileInfo;
}

function toAddressPayload(row: AddressRow) {
  return {
    id: row.id,
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

async function getDefaultAddress(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  profileId: string,
) {
  const { data, error } = await supabase
    .from("user_addresses")
    .select(addressSelect)
    .eq("profile_id", profileId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as AddressRow | null;
}

async function syncDefaultAddress(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  profileId: string,
  patch: {
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
  },
) {
  if (!patch.address_line1) return null;

  const existing = await getDefaultAddress(supabase, profileId);
  const addressPatch = {
    recipient_name: patch.full_name,
    phone: patch.phone,
    address_line1: patch.address_line1,
    address_line2: patch.address_line2,
    subdistrict: patch.subdistrict,
    district: patch.district,
    province: patch.province,
    postal_code: patch.postal_code,
    country: patch.country ?? "Thailand",
    delivery_note: patch.delivery_note,
    is_default: true,
  };

  const query = existing
    ? supabase
        .from("user_addresses")
        .update(addressPatch)
        .eq("id", existing.id)
        .select(addressSelect)
        .single()
    : supabase
        .from("user_addresses")
        .insert({
          profile_id: profileId,
          label: "Default",
          ...addressPatch,
        })
        .select(addressSelect)
        .single();

  const { data, error } = await query;
  if (error) throw error;
  return data as AddressRow;
}

async function readProfile() {
  if (!isSupabaseConfigured()) {
    return jsonNoStore({ error: "Supabase is not configured." }, { status: 503 });
  }

  const session = await resolveCurrentProfile();
  if (!session?.profileId) {
    return jsonNoStore({ error: "Login is required." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("id", session.profileId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return jsonNoStore({ error: "Profile was not found." }, { status: 404 });

  const defaultAddress = await getDefaultAddress(supabase, session.profileId);

  return jsonNoStore({
    displayName: data.display_name ?? data.line_display_name ?? session.displayName ?? "YNot Customer",
    profile: toProfileInfo(data, defaultAddress),
    defaultAddress: defaultAddress ? toAddressPayload(defaultAddress) : null,
  });
}

export async function GET() {
  try {
    return await readProfile();
  } catch (error) {
    console.error("Failed to read profile", error);
    return jsonNoStore({ error: "Profile could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return jsonNoStore({ error: "Supabase is not configured." }, { status: 503 });
    }

    const session = await resolveCurrentProfile();
    if (!session?.profileId) {
      return jsonNoStore({ error: "Login is required." }, { status: 401 });
    }

    let body: ProfileBody;
    try {
      body = (await request.json()) as ProfileBody;
    } catch {
      return jsonNoStore({ error: "Invalid profile body." }, { status: 400 });
    }

    const patch = {
      full_name: cleanText(body.fullName, 120),
      phone: cleanText(body.phone, 40),
      address_line1: cleanText(body.addressLine1, 180),
      address_line2: cleanText(body.addressLine2, 180),
      subdistrict: cleanText(body.subdistrict, 100),
      district: cleanText(body.district, 100),
      province: cleanText(body.province, 100),
      postal_code: cleanText(body.postalCode, 20),
      country: cleanText(body.country, 80) ?? "Thailand",
      delivery_note: cleanText(body.deliveryNote, 240),
    };

    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", session.profileId)
      .select(profileSelect)
      .single();

    if (error) throw error;

    const defaultAddress = await syncDefaultAddress(
      supabase,
      session.profileId,
      patch,
    );

    return jsonNoStore({
      displayName: data.display_name ?? data.line_display_name ?? session.displayName ?? "YNot Customer",
      profile: toProfileInfo(data, defaultAddress),
      defaultAddress: defaultAddress ? toAddressPayload(defaultAddress) : null,
    });
  } catch (error) {
    console.error("Failed to update profile", error);
    return jsonNoStore({ error: "Profile could not be saved." }, { status: 500 });
  }
}
