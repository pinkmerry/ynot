import { cookies } from "next/headers";
import { getLineCallbackUrl, getLineLoginChannelId } from "@/lib/line/config";
import { linkLineIdentity } from "@/lib/line/link-identity";
import {
  createSessionCookieValue,
  fetchSessionVersion,
  legacyLuckyDrawSessionCookie,
  luckyDrawSessionCookie,
  sessionCookieClearOptions,
  sessionCookieOptions,
} from "@/lib/lucky-draw/session";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { lineOAuthStateCookie } from "@/lib/line/oauth";
import { shouldUseSecureCookies } from "@/lib/security/cookies";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type LineOAuthState = {
  state: string;
  nonce: string;
  mode: "login" | "connect";
  next: string;
};

type LineTokenResponse = {
  id_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
};

type LineVerifyResponse = {
  sub?: string;
  name?: string;
  picture?: string;
  email?: string;
};

function safeNext(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const base = new URL("https://ynot.local");
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function redirectWith(request: Request, next: string, key: "error" | "message", value: string, code?: string) {
  const responseUrl = new URL(safeNext(next), new URL(request.url).origin);
  responseUrl.searchParams.set(key, value);
  if (code) responseUrl.searchParams.set("code", code);
  return Response.redirect(responseUrl);
}

function redirectForRateLimitFailure(request: Request, next: string, response: Response) {
  if (response.status === 429) {
    return redirectWith(
      request,
      next,
      "error",
      "Too many sign-in attempts. Please wait and try again.",
      "auth_rate_limited",
    );
  }

  console.warn("line_oauth_callback_rate_limit_unavailable", response.status);
  return redirectWith(
    request,
    next,
    "error",
    "Sign-in is temporarily unavailable. Please try again.",
    "auth_temporarily_unavailable",
  );
}

function parseState(rawState: string | undefined): LineOAuthState | null {
  if (!rawState) return null;
  try {
    const parsed = JSON.parse(rawState) as Partial<LineOAuthState>;
    if (
      typeof parsed.state === "string"
      && typeof parsed.nonce === "string"
      && (parsed.mode === "login" || parsed.mode === "connect")
    ) {
      return {
        state: parsed.state,
        nonce: parsed.nonce,
        mode: parsed.mode,
        next: safeNext(parsed.next),
      };
    }
  } catch {
    return null;
  }
  return null;
}

async function exchangeCode(code: string, channelId: string, channelSecret: string, redirectUri: string) {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: channelId,
    client_secret: channelSecret,
  });

  const response = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const payload = (await response.json()) as LineTokenResponse;
  if (!response.ok || !payload.id_token) {
    throw new Error(payload.error_description ?? payload.error ?? "LINE token exchange failed.");
  }
  return payload.id_token;
}

async function verifyIdToken(idToken: string, channelId: string, nonce: string): Promise<LineVerifyResponse> {
  const form = new URLSearchParams({
    id_token: idToken,
    client_id: channelId,
    nonce,
  });
  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const payload = (await response.json()) as LineVerifyResponse & { error_description?: string; error?: string };
  if (!response.ok || !payload.sub) {
    throw new Error(payload.error_description ?? payload.error ?? "LINE ID token verification failed.");
  }
  return payload;
}

async function adminForProfile(profileId: string) {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id,role")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const storedState = parseState(cookieStore.get(lineOAuthStateCookie)?.value);
  const secure = shouldUseSecureCookies(request);

  cookieStore.set(lineOAuthStateCookie, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });

  if (!code || !state || !storedState || state !== storedState.state) {
    // Fall back to /login only when we truly lost the state cookie. If the
    // cookie survived but state mismatched (rare — usually a stale tab), keep
    // the user on the page they started from so the failure is recoverable.
    return redirectWith(
      request,
      storedState?.next ?? "/login",
      "error",
      "LINE login state was invalid. Please try again.",
    );
  }

  const channelId = getLineLoginChannelId();
  if (!channelId) {
    return redirectWith(request, storedState.next, "error", "LINE login is temporarily unavailable. Please try again.", "line_login_unavailable");
  }

  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET?.trim();
  const redirectUri = getLineCallbackUrl();
  if (!channelSecret || !redirectUri) {
    return redirectWith(request, storedState.next, "error", "LINE login is temporarily unavailable. Please try again.", "line_login_unavailable");
  }

  const rateLimited = await enforceRateLimit(
    request,
    "line:callback",
    { limit: 20, windowMs: 10 * 60_000 },
  );
  if (rateLimited) {
    return redirectForRateLimitFailure(request, storedState.next, rateLimited);
  }

  try {
    const idToken = await exchangeCode(code, channelId, channelSecret, redirectUri);
    const verified = await verifyIdToken(idToken, channelId, storedState.nonce);
    const current = await resolveCurrentProfile().catch((error) => {
      console.warn(
        "line_oauth_current_profile_resolution_failed",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    });

    if (storedState.mode === "connect" && current?.authSource !== "supabase") {
      return redirectWith(
        request,
        storedState.next,
        "error",
        "Your account connection expired. Sign in with email or Google first, then connect LINE again.",
        "line_connect_session_required",
      );
    }

    const targetProfileId =
      current?.authSource === "supabase" ? current.profileId : null;
    const linked = await linkLineIdentity(
      {
        lineUserId: verified.sub!,
        displayName: verified.name ?? "LINE Customer",
        pictureUrl: verified.picture ?? null,
        email: verified.email ?? null,
        channelId,
        source: "line_oauth_callback",
      },
      targetProfileId,
    );

    if (linked.status === "merge_required") {
      return redirectWith(
        request,
        storedState.next,
        "error",
        "This account needs review before LINE can be connected. Please contact support.",
        "identity_review_required",
      );
    }

    if (linked.status === "login_required") {
      return redirectWith(
        request,
        "/login",
        "error",
        "Please sign in with your existing email or Google account, then connect LINE from the profile page.",
        "line_existing_account_sign_in_required",
      );
    }

    const admin = await adminForProfile(linked.profileId);
    const sessionVersion = await fetchSessionVersion(linked.profileId);
    const sessionCookie = createSessionCookieValue({
      profileId: linked.profileId,
      authSource: "line",
      lineUserId: linked.lineUserId,
      displayName: linked.displayName,
      adminId: admin?.id,
      adminRole: admin?.role,
      sessionVersion,
    });

    if (!sessionCookie) throw new Error("LINE session could not be created.");

    cookieStore.set(luckyDrawSessionCookie, sessionCookie, sessionCookieOptions(secure));
    cookieStore.set(legacyLuckyDrawSessionCookie, "", sessionCookieClearOptions(secure));

    return redirectWith(
      request,
      storedState.next,
      "message",
      targetProfileId ? "LINE connected to this account." : "Logged in with LINE.",
    );
  } catch (error) {
    console.error("line_oauth_callback_failed", error instanceof Error ? error.message : String(error));
    // Generic user-facing message — provider internals never reach the browser.
    return redirectWith(request, storedState.next, "error", "LINE login failed. Please try again.");
  }
}
