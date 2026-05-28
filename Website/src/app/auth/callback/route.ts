import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureProfileForUser } from "@/lib/auth/profile";
import {
  createSessionCookieValue,
  fetchSessionVersion,
  legacyLuckyDrawSessionCookie,
  luckyDrawSessionCookie,
  readSessionCookie,
  sessionCookieClearOptions,
  sessionCookieOptions,
} from "@/lib/lucky-draw/session";
import { shouldUseSecureCookies } from "@/lib/security/cookies";
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"));

  if (!code) {
    // Stay on the originating page so the failure is visible inline instead
    // of dumping the user on /login with no context.
    const target = new URL(next, url.origin);
    target.searchParams.set("error", "Missing auth callback code.");
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
            response.cookies.set(name, value, options);
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

  const lineSession = readSessionCookie({
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const secure = shouldUseSecureCookies(request);
  if (user) {
    const profile = await ensureProfileForUser(user, lineSession?.profileId ?? null);
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
