import { getAddresses } from "@/features/ynot/data";
import { toYnotAddress, type UserAddressRow } from "@/features/ynot/server-addresses";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

function clean(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ").slice(0, max) : null;
}

function addressSaveFailure(stage: string, error: { message?: string }) {
  console.warn("ynot_address_save_failed", {
    stage,
    message: error.message,
  });
  return Response.json(
    { error: "Could not save this address. Please check the details and try again." },
    { status: 409 },
  );
}

export async function GET() {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const session = await resolveCurrentProfile();
  if (!session?.profileId) return Response.json({ error: "Login is required." }, { status: 401 });
  return Response.json({ addresses: await getAddresses(session.profileId) });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const session = await resolveCurrentProfile();
  if (!session?.profileId) return Response.json({ error: "Login is required." }, { status: 401 });
  const limited = await enforceRateLimit(request, "ynot:addresses:save", { limit: 12, windowMs: 60_000 }, session.profileId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const recipientName = clean(body?.recipientName, 120);
  const phone = clean(body?.phone, 40);
  const addressLine1 = clean(body?.addressLine1, 180);
  const addressLine2 = clean(body?.addressLine2, 180);
  const subdistrict = clean(body?.subdistrict, 100);
  const district = clean(body?.district, 100);
  const province = clean(body?.province, 100);
  const postalCode = clean(body?.postalCode, 20);
  const country = clean(body?.country, 80);
  const deliveryNote = clean(body?.deliveryNote, 240);
  if ([recipientName, phone, addressLine1, subdistrict, district, province, postalCode, country].some((value) => !value)) {
    return Response.json(
      { error: "Complete recipient name, phone, and full shipping address before saving." },
      { status: 400 },
    );
  }
  if (!recipientName || !phone || !addressLine1 || !subdistrict || !district || !province || !postalCode || !country) {
    throw new Error("Address validation invariant failed.");
  }
  const requiredAddress = {
    recipientName,
    phone,
    addressLine1,
    subdistrict,
    district,
    province,
    postalCode,
    country,
  } as const satisfies Record<string, string>;
  const supabase = createServiceSupabaseClient();
  const shouldBeDefault = Boolean(body?.isDefault);
  const { data: inserted, error: insertError } = await supabase
    .from("user_addresses")
    .insert({
      profile_id: session.profileId,
      label: clean(body?.label, 40) ?? "Default",
      recipient_name: requiredAddress.recipientName,
      phone: requiredAddress.phone,
      address_line1: requiredAddress.addressLine1,
      address_line2: addressLine2,
      subdistrict: requiredAddress.subdistrict,
      district: requiredAddress.district,
      province: requiredAddress.province,
      postal_code: requiredAddress.postalCode,
      country: requiredAddress.country,
      delivery_note: deliveryNote,
      is_default: false,
    })
    .select("*")
    .single();
  if (insertError) return addressSaveFailure("insert", insertError);

  let data = inserted;
  if (shouldBeDefault) {
    const { error: clearError } = await supabase
      .from("user_addresses")
      .update({ is_default: false })
      .eq("profile_id", session.profileId)
      .neq("id", inserted.id);
    if (clearError) return addressSaveFailure("clear_default", clearError);

    const { data: defaultAddress, error: defaultError } = await supabase
      .from("user_addresses")
      .update({ is_default: true })
      .eq("id", inserted.id)
      .select("*")
      .single();
    if (defaultError) return addressSaveFailure("set_default", defaultError);
    data = defaultAddress;
  }

  return Response.json(
    {
      address: await toYnotAddress(session.profileId, data as UserAddressRow),
    },
    { status: 201 },
  );
}
