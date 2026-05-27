import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  createSessionCookieValue,
  fetchSessionVersion,
  luckyDrawSessionCookie,
} from "@/lib/lucky-draw/session";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { linkLineIdentity } from "@/lib/line/link-identity";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { shouldUseSecureCookies } from "@/lib/security/cookies";

type LineVerifyResponse = {
  sub?: string;
  name?: string;
  picture?: string;
  email?: string;
};

// Decoded JWT claims we care about for replay-window enforcement. LIFF tokens
// always carry iat/exp; we treat both as optional and fail safe if missing.
type LineIdTokenClaims = {
  iat?: number;
  exp?: number;
  sub?: string;
  aud?: string;
};

const lineChannelId =
  process.env.LINE_LOGIN_CHANNEL_ID ??
  process.env.NEXT_PUBLIC_LINE_LIFF_ID?.split("-")[0] ??
  "2009971080";

// Max age of a LIFF id_token we are willing to accept. LIFF refreshes tokens
// automatically every ~30 min, so any honest client will always be fresh.
const MAX_ID_TOKEN_AGE_MS = 30 * 60 * 1000;

function decodeIdTokenClaims(idToken: string): LineIdTokenClaims | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    // Base64url -> utf-8. atob is available in the Workers/Node runtime.
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    const decoded =
      typeof Buffer !== "undefined"
        ? Buffer.from(padded + "=".repeat(padLen), "base64").toString("utf-8")
        : atob(padded + "=".repeat(padLen));
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return {
      iat: typeof parsed.iat === "number" ? parsed.iat : undefined,
      exp: typeof parsed.exp === "number" ? parsed.exp : undefined,
      sub: typeof parsed.sub === "string" ? parsed.sub : undefined,
      aud: typeof parsed.aud === "string" ? parsed.aud : undefined,
    };
  } catch {
    return null;
  }
}

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

  // Pre-verify freshness check: even if the token is a valid LINE id_token,
  // refuse to mint a session for one that's older than the LIFF refresh
  // window. This bounds the replay window for any leaked token.
  const preClaims = decodeIdTokenClaims(idToken);
  if (preClaims?.iat) {
    const ageMs = Date.now() - preClaims.iat * 1000;
    if (ageMs > MAX_ID_TOKEN_AGE_MS) {
      return Response.json(
        { error: "LINE ID token is too old. Please sign in again." },
        { status: 401 },
      );
    }
  }

  // Rate-limit per LINE user (sub) — bounds damage from a leaked id_token even
  // within its lifetime. Honest clients only mint a session once per page load;
  // 5 per 15 min is a generous ceiling. Scope key uses the sub from the
  // unverified JWT here because we have not yet called LINE verify — this is
  // safe because (a) we still verify the token below before issuing the
  // session, and (b) the attacker would have to spin up a different sub to
  // dodge the limit, which already mints sessions for a different account.
  if (preClaims?.sub) {
    const limited = await enforceRateLimit(
      request,
      "line:session:mint",
      { limit: 5, windowMs: 15 * 60_000 },
      `sub:${preClaims.sub}`,
    );
    if (limited) return limited;
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

  // Defense in depth: re-confirm the sub from the verified response matches
  // what was used for rate-limiting. If they diverge, the token's payload was
  // tampered with — LINE verify catches signature failures, but this is a
  // belt-and-braces check against future LINE-side bugs.
  if (preClaims?.sub && preClaims.sub !== verified.sub) {
    return Response.json(
      { error: "LINE ID token subject mismatch." },
      { status: 401 },
    );
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

  const sessionVersion = await fetchSessionVersion(linked.profileId);
  const sessionCookie = createSessionCookieValue({
    profileId: linked.profileId,
    lineUserId: linked.lineUserId,
    displayName: linked.displayName,
    adminId: adminUser?.id,
    adminRole: adminUser?.role,
    sessionVersion,
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

  const secure = shouldUseSecureCookies(request) ? " Secure;" : "";
  serverResponse.headers.set(
    "Set-Cookie",
    `${luckyDrawSessionCookie}=${sessionCookie}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=2592000`,
  );

  return serverResponse;
}

export async function DELETE(request: Request) {
  const response = Response.json({ ok: true });
  const secure = shouldUseSecureCookies(request) ? " Secure;" : "";
  response.headers.set(
    "Set-Cookie",
    `${luckyDrawSessionCookie}=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`,
  );
  return response;
}
