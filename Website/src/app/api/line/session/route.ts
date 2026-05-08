import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { createSessionCookieValue, luckyDrawSessionCookie } from "@/lib/lucky-draw/session";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { linkLineIdentity } from "@/lib/line/link-identity";

type LineVerifyResponse = {
  sub?: string;
  name?: string;
  picture?: string;
  email?: string;
};

const lineChannelId =
  process.env.LINE_LOGIN_CHANNEL_ID ??
  process.env.NEXT_PUBLIC_LINE_LIFF_ID?.split("-")[0] ??
  "2009942829";

export async function POST(request: Request) {
  let idToken: unknown;

  try {
    const body = (await request.json()) as { idToken?: unknown };
    idToken = body.idToken;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof idToken !== "string" || idToken.length === 0) {
    return Response.json({ error: "Missing LINE ID token." }, { status: 400 });
  }

  const form = new URLSearchParams({
    id_token: idToken,
    client_id: lineChannelId,
  });

  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });

  if (!response.ok) {
    return Response.json({ error: "LINE ID token verification failed." }, { status: 401 });
  }

  const verified = (await response.json()) as LineVerifyResponse;
  if (!verified.sub) {
    return Response.json({ error: "LINE profile did not include a user ID." }, { status: 401 });
  }

  const profile = {
    lineUserId: verified.sub,
    displayName: verified.name ?? "LINE Customer",
    pictureUrl: verified.picture,
    email: verified.email,
  };

  const current = await resolveCurrentProfile().catch(() => null);
  const targetProfileId = current?.authSource === "supabase" ? current.profileId : null;
  const linked = await linkLineIdentity(
    {
      ...profile,
      channelId: lineChannelId,
      source: "line_id_token",
    },
    targetProfileId,
  ).catch((error) => {
    console.error("LINE identity link failed", error);
    return null;
  });

  if (!linked) {
    return Response.json({ error: "LINE identity could not be linked." }, { status: 500 });
  }

  if (linked.status === "merge_required") {
    return Response.json({
      error: "LINE identity is already connected to another profile. Admin merge review is required.",
      mergeRequestId: linked.mergeRequestId,
      profileId: linked.profileId,
    }, { status: 409 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("id,role")
    .eq("profile_id", linked.profileId)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError) {
    console.error("LINE admin lookup failed", adminError);
    return Response.json({ error: "LINE profile could not be checked for admin access." }, { status: 500 });
  }

  const sessionCookie = createSessionCookieValue({
    profileId: linked.profileId,
    lineUserId: linked.lineUserId,
    displayName: linked.displayName,
    adminId: adminUser?.id,
    adminRole: adminUser?.role,
  });

  if (!sessionCookie) {
    return Response.json({ error: "LINE session could not be created." }, { status: 500 });
  }

  const serverResponse = Response.json({
    ...profile,
    profileId: linked.profileId,
    isAdmin: !!adminUser,
    adminRole: adminUser?.role ?? null,
  });

  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  serverResponse.headers.set(
    "Set-Cookie",
    `${luckyDrawSessionCookie}=${sessionCookie}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=2592000`,
  );

  return serverResponse;
}

export async function DELETE() {
  const response = Response.json({ ok: true });
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  response.headers.set(
    "Set-Cookie",
    `${luckyDrawSessionCookie}=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`,
  );
  return response;
}
