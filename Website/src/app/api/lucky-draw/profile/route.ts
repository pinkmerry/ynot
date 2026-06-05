import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { ProfileInfo } from "@/lib/lucky-draw/types";
import {
  ensureDefaultAddressFromProfile,
  toYnotAddress,
  type ProfileAddressRow,
} from "@/features/ynot/server-addresses";

type ProfileBody = Partial<Record<keyof ProfileInfo, unknown>>;

const profileSelect = "display_name,line_display_name,full_name,phone,address_line1,address_line2,subdistrict,district,province,postal_code,country,delivery_note";

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

function toProfileInfo(row: ProfileRow) {
  return {
    fullName: row.full_name ?? "",
    phone: row.phone ?? "",
    addressLine1: row.address_line1 ?? "",
    addressLine2: row.address_line2 ?? "",
    subdistrict: row.subdistrict ?? "",
    district: row.district ?? "",
    province: row.province ?? "",
    postalCode: row.postal_code ?? "",
    country: row.country ?? "Thailand",
    deliveryNote: row.delivery_note ?? "",
  } satisfies ProfileInfo;
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

  const addresses = await ensureDefaultAddressFromProfile(session.profileId, supabase);
  const defaultAddress = addresses.find((address) => address.is_default) ?? addresses[0] ?? null;

  return jsonNoStore({
    displayName: data.display_name ?? data.line_display_name ?? session.displayName ?? "YNot Customer",
    profile: toProfileInfo(data as ProfileAddressRow & ProfileRow),
    defaultAddress: defaultAddress
      ? await toYnotAddress(session.profileId, defaultAddress)
      : null,
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

    const addresses = await ensureDefaultAddressFromProfile(session.profileId, supabase);
    const defaultAddress = addresses.find((address) => address.is_default) ?? addresses[0] ?? null;

    return jsonNoStore({
      displayName: data.display_name ?? data.line_display_name ?? session.displayName ?? "YNot Customer",
      profile: toProfileInfo(data as ProfileAddressRow & ProfileRow),
      defaultAddress: defaultAddress
        ? await toYnotAddress(session.profileId, defaultAddress)
        : null,
    });
  } catch (error) {
    console.error("Failed to update profile", error);
    return jsonNoStore({ error: "Profile could not be saved." }, { status: 500 });
  }
}
