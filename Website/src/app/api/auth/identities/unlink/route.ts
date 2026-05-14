import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  const session = await resolveCurrentProfile();
  if (!session?.profileId) return jsonNoStore({ error: "Login is required." }, { status: 401 });

  let payload: { identityId?: unknown };
  try {
    payload = (await request.json()) as { identityId?: unknown };
  } catch {
    return jsonNoStore({ error: "Invalid JSON body." }, { status: 400 });
  }
  const identityId = typeof payload.identityId === "string" ? payload.identityId : "";
  if (!identityId) return jsonNoStore({ error: "identityId is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();

  // Confirm ownership + count remaining identities atomically.
  const { data: rows, error: listError } = await supabase
    .from("user_identities")
    .select("id,provider,provider_subject")
    .eq("profile_id", session.profileId);

  if (listError) return jsonNoStore({ error: listError.message }, { status: 500 });
  const target = rows?.find((row) => row.id === identityId);
  if (!target) return jsonNoStore({ error: "Identity not found." }, { status: 404 });
  if ((rows?.length ?? 0) <= 1) {
    return jsonNoStore({ error: "You can't remove your last login method." }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("user_identities")
    .delete()
    .eq("id", identityId)
    .eq("profile_id", session.profileId);

  if (deleteError) return jsonNoStore({ error: deleteError.message }, { status: 500 });

  return jsonNoStore({ removed: true });
}
