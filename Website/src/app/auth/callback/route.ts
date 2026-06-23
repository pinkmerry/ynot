import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureProfileForUser } from "@/lib/auth/profile";
import {
  createSessionCookieValue,
  fetchSessionVersion,
  isSessionVersionCurrent,
  legacyLuckyDrawSessionCookie,
  luckyDrawSessionCookie,
  readSessionCookie,
  sessionCookieClearOptions,
  sessionCookieOptions,
} from "@/lib/lucky-draw/session";
import { shouldUseSecureCookies } from "@/lib/security/cookies";
import { hardenSupabaseCookieOptions } from "@/lib/supabase/cookie-options";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseAuthCookieName } from "@/lib/auth/resolve-current-profile";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const parsed = new URL(value, "https://ynot.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function readRequestLineSession(request: Request) {
  return readSessionCookie({
    get(name: string) {
      const value = request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`))
        ?.slice(name.length + 1);
      return value ? { value } : undefined;
    },
  });
}

function requestCookieNames(request: Request) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter(Boolean);
}

async function validatedLineAppSessionProfileId(request: Request) {
  const session = readRequestLineSession(request);
  if (session?.authSource !== "line" || !session.profileId) return null;

  const versionOk = await isSessionVersionCurrent(session);
  if (!versionOk) return null;

  const supabase = createServiceSupabaseClient();
  const { data: profileRow, error } = await supabase
    .from("profiles")
    .select("id,profile_status")
    .eq("id", session.profileId)
    .maybeSingle();

  if (error) {
    console.warn("google_connect_line_profile_lookup_failed", error.message);
    return null;
  }

  if (!profileRow || profileRow.profile_status !== "active") return null;
  return profileRow.id;
}

function redirectForIdentityReview(request: Request, next: string, secure: boolean) {
  const url = new URL(request.url);
  const target = new URL(next, url.origin);
  target.searchParams.set(
    "error",
    "This account needs review before Google can be connected. Please contact support.",
  );
  target.searchParams.set("code", "identity_review_required");

  const conflictResponse = NextResponse.redirect(target);
  conflictResponse.headers.set("cache-control", "private, no-store");

  for (const name of requestCookieNames(request)) {
    if (!isSupabaseAuthCookieName(name)) continue;
    conflictResponse.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });
  }

  return conflictResponse;
}

function redirectForRateLimitFailure(request: Request, next: string, response: Response) {
  const url = new URL(request.url);
  const target = new URL(next, url.origin);

  if (response.status === 429) {
    target.searchParams.set("error", "Too many sign-in attempts. Please wait and try again.");
    target.searchParams.set("code", "auth_rate_limited");
    return NextResponse.redirect(target);
  }

  console.warn("auth_callback_rate_limit_unavailable", response.status);
  target.searchParams.set("error", "Sign-in is temporarily unavailable. Please try again.");
  target.searchParams.set("code", "auth_temporarily_unavailable");
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"));
  const mode = url.searchParams.get("mode") === "connect" ? "connect" : "login";

  if (!code) {
    // Stay on the originating page so the failure is visible inline instead
    // of dumping the user on /login with no context.
    const target = new URL(next, url.origin);
    target.searchParams.set("error", "Missing auth callback code.");
    return NextResponse.redirect(target);
  }

  const rateLimited = await enforceRateLimit(
    request,
    "auth:callback",
    { limit: 30, windowMs: 10 * 60_000 },
  );
  if (rateLimited) {
    return redirectForRateLimitFailure(request, next, rateLimited);
  }

  const lineSession = mode === "connect" ? null : readRequestLineSession(request);
  const connectLineProfileId =
    mode === "connect" ? await validatedLineAppSessionProfileId(request) : null;

  if (mode === "connect" && !connectLineProfileId) {
    const target = new URL(next, url.origin);
    target.searchParams.set(
      "error",
      "Your account connection expired. Sign in with LINE first, then connect Google again.",
    );
    target.searchParams.set("code", "google_connect_session_required");
    return NextResponse.redirect(target);
  }

  // Build the success response up-front so Supabase can write the session
  // cookies directly onto it. Next.js 16 does not reliably attach cookies
  // set via cookies().set() to a separately-constructed NextResponse.redirect.
  const response = NextResponse.redirect(new URL(next, url.origin));
  // Vercel's edge CDN strips Set-Cookie from responses it considers
  // publicly cacheable. Force-private so the auth-token cookies actually
  // reach the browser.
  response.headers.set("cache-control", "private, no-store");
  const cookieStore = await cookies();
  const secure = shouldUseSecureCookies(request);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(
              name,
              value,
              hardenSupabaseCookieOptions(options, secure),
            );
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Same reasoning as above — stay on the originating page so the user can
    // retry without losing context. Sanitize the provider message: don't
    // leak GoTrue internals beyond a short token.
    const target = new URL(next, url.origin);
    target.searchParams.set("error", "Sign-in failed. Please try again.");
    console.warn("auth_callback_exchange_failed", error.message ?? "unknown");
    return NextResponse.redirect(target);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const targetProfileId =
      mode === "connect" ? connectLineProfileId : lineSession?.profileId ?? null;
    const profile = await ensureProfileForUser(user, targetProfileId);
    if (mode === "connect" && profile.id !== connectLineProfileId) {
      return redirectForIdentityReview(request, next, secure);
    }

    const sessionVersion = await fetchSessionVersion(profile.id);
    const sessionCookie = createSessionCookieValue({
      profileId: profile.id,
      authSource: "supabase",
      authUserId: user.id,
      lineUserId: profile.line_user_id ?? undefined,
      displayName: profile.display_name ?? profile.line_display_name ?? user.email ?? "YNot Customer",
      sessionVersion,
    });

    if (sessionCookie) {
      response.cookies.set(
        luckyDrawSessionCookie,
        sessionCookie,
        sessionCookieOptions(secure),
      );
    }
    response.cookies.set(
      legacyLuckyDrawSessionCookie,
      "",
      sessionCookieClearOptions(secure),
    );
  }

  return response;
}
