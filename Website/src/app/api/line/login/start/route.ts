import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { lineOAuthStateCookie } from "@/lib/line/oauth";
import { shouldUseSecureCookies } from "@/lib/security/cookies";

export const dynamic = "force-dynamic";

function lineChannelId() {
  return process.env.LINE_LOGIN_CHANNEL_ID ?? process.env.NEXT_PUBLIC_LINE_LIFF_ID?.split("-")[0] ?? "";
}

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
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

export async function GET(request: Request) {
  const channelId = lineChannelId();
  if (!channelId) {
    return Response.json({ error: "LINE login channel is not configured." }, { status: 503 });
  }
  if (!process.env.LINE_LOGIN_CHANNEL_SECRET) {
    return Response.json({ error: "LINE login channel secret is not configured." }, { status: 503 });
  }
  const redirectUri = callbackUrl(request);
  if (!redirectUri) {
    return Response.json({ error: "NEXT_PUBLIC_SITE_URL is required before production LINE login." }, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const mode = requestUrl.searchParams.get("mode") === "connect" ? "connect" : "login";
  const next = safeNext(requestUrl.searchParams.get("next"));
  const secure = shouldUseSecureCookies(request);

  const cookieStore = await cookies();
  cookieStore.set(
    lineOAuthStateCookie,
    JSON.stringify({ state, nonce, mode, next }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 10 * 60,
    },
  );

  const authorizeUrl = new URL("https://access.line.me/oauth2/v2.1/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", channelId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "profile openid");
  authorizeUrl.searchParams.set("nonce", nonce);

  return Response.redirect(authorizeUrl);
}
