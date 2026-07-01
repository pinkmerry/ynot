import { resolveIdentityActionToken } from "@/lib/auth/identity-action-tokens";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function identityUnlinkFailure(stage: string, error: { message?: string }) {
  console.warn("identity_unlink_failed", {
    stage,
    message: error.message,
  });
  return jsonNoStore(
    { error: "Could not remove this login method right now." },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;

  const session = await resolveCurrentProfile();
  if (!session?.profileId) return jsonNoStore({ error: "Login is required." }, { status: 401 });

  const limited = await enforceRateLimit(
    request,
    "ynot:auth:identity-unlink",
    { limit: 20, windowMs: 60_000 },
    session.profileId,
  );
  if (limited) return limited;

  let payload: { identityToken?: unknown };
  try {
    payload = (await request.json()) as { identityToken?: unknown };
  } catch {
    return jsonNoStore({ error: "Invalid JSON body." }, { status: 400 });
  }
  const identityToken =
    typeof payload.identityToken === "string" ? payload.identityToken : "";
  if (!identityToken) return jsonNoStore({ error: "Login method token is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  let identityId: string | null;
  try {
    identityId = await resolveIdentityActionToken(session.profileId, identityToken);
  } catch (error) {
    return identityUnlinkFailure(
      "resolve",
      error instanceof Error ? error : { message: String(error) },
    );
  }
  if (!identityId) return jsonNoStore({ error: "Login method not found." }, { status: 404 });

  // Confirm ownership + count remaining identities atomically.
  const { data: rows, error: listError } = await supabase
    .from("user_identities")
    .select("id")
    .eq("profile_id", session.profileId);

  if (listError) return identityUnlinkFailure("list", listError);
  const target = rows?.find((row) => row.id === identityId);
  if (!target) return jsonNoStore({ error: "Login method not found." }, { status: 404 });
  if ((rows?.length ?? 0) <= 1) {
    return jsonNoStore({ error: "You can't remove your last login method." }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("user_identities")
    .delete()
    .eq("id", identityId)
    .eq("profile_id", session.profileId);

  if (deleteError) return identityUnlinkFailure("delete", deleteError);

  return jsonNoStore({ removed: true });
}
