import { getAddresses } from "@/features/ynot/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function clean(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ").slice(0, max) : null;
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
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const addressLine1 = clean(body?.addressLine1, 180);
  if (!addressLine1) return Response.json({ error: "Address line 1 is required." }, { status: 400 });
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("user_addresses")
    .insert({
      profile_id: session.profileId,
      label: clean(body?.label, 40) ?? "Default",
      recipient_name: clean(body?.recipientName, 120),
      phone: clean(body?.phone, 40),
      address_line1: addressLine1,
      address_line2: clean(body?.addressLine2, 180),
      subdistrict: clean(body?.subdistrict, 100),
      district: clean(body?.district, 100),
      province: clean(body?.province, 100),
      postal_code: clean(body?.postalCode, 20),
      country: clean(body?.country, 80) ?? "Thailand",
      delivery_note: clean(body?.deliveryNote, 240),
      is_default: Boolean(body?.isDefault),
    })
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ address: { id: data.id, label: data.label, addressLine1: data.address_line1 } }, { status: 201 });
}
