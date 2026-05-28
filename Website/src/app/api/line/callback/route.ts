import { cookies } from "next/headers";
import { linkLineIdentity } from "@/lib/line/link-identity";
import {
  createSessionCookieValue,
  fetchSessionVersion,
  luckyDrawSessionCookie,
} from "@/lib/lucky-draw/session";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { lineOAuthStateCookie } from "@/lib/line/oauth";
import { shouldUseSecureCookies } from "@/lib/security/cookies";

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

function lineChannelId() {
  return process.env.LINE_LOGIN_CHANNEL_ID ?? process.env.NEXT_PUBLIC_LINE_LIFF_ID?.split("-")[0] ?? "";
}

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

function siteOrigin(request: Request) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSiteUrl) {
    try {
      return new URL(configuredSiteUrl).origin;
    } catch {
      return null;
    }
  }
  if (process.env.NODE_ENV === "production") return null;
  return new URL(request.url).origin;
}

function callbackUrl(request: Request) {
  const origin = siteOrigin(request);
  if (!origin) return null;
  return `${origin}/api/line/callback`;
}

function redirectWith(request: Request, next: string, key: "error" | "message", value: string) {
  const responseUrl = new URL(safeNext(next), new URL(request.url).origin);
  responseUrl.searchParams.set(key, value);
  return Response.redirect(responseUrl);
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

async function exchangeCode(request: Request, code: string, channelId: string) {
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelSecret) throw new Error("LINE_LOGIN_CHANNEL_SECRET is not configured.");
  const redirectUri = callbackUrl(request);
  if (!redirectUri) throw new Error("NEXT_PUBLIC_SITE_URL is required before production LINE login.");

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
    return redirectWith(request, "/login", "error", "LINE login state was invalid. Please try again.");
  }

  const channelId = lineChannelId();
  if (!channelId) {
    return redirectWith(request, storedState.next, "error", "LINE login channel is not configured.");
  }

  try {
    const idToken = await exchangeCode(request, code, channelId);
    const verified = await verifyIdToken(idToken, channelId, storedState.nonce);
    const current = await resolveCurrentProfile();
    const targetProfileId = storedState.mode === "connect" && current?.authSource === "supabase" ? current.profileId : null;
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
        "/profile",
        "message",
        `LINE is already connected to another profile. Identity link request ${linked.mergeRequestId} is waiting for admin review.`,
      );
    }

    const admin = await adminForProfile(linked.profileId);
    const sessionVersion = await fetchSessionVersion(linked.profileId);
    const sessionCookie = createSessionCookieValue({
      profileId: linked.profileId,
      lineUserId: linked.lineUserId,
      displayName: linked.displayName,
      adminId: admin?.id,
      adminRole: admin?.role,
      sessionVersion,
    });

    if (!sessionCookie) throw new Error("LINE session could not be created.");

    cookieStore.set(luckyDrawSessionCookie, sessionCookie, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      priority: "high",
    });

    return redirectWith(
      request,
      storedState.next,
      "message",
      storedState.mode === "connect" ? "LINE connected to this account." : "Logged in with LINE.",
    );
  } catch (error) {
    console.error("line_oauth_callback_failed", error instanceof Error ? error.message : String(error));
    // Generic user-facing message — provider internals never reach the browser.
    return redirectWith(request, storedState.next, "error", "LINE login failed. Please try again.");
  }
}
