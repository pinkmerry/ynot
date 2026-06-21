import { NextResponse } from "next/server";
import { isSupabaseAuthCookieName } from "@/lib/auth/resolve-current-profile";
import {
  legacyLuckyDrawSessionCookie,
  luckyDrawSessionCookie,
  sessionCookieClearOptions,
} from "@/lib/lucky-draw/session";
import { shouldUseSecureCookies } from "@/lib/security/cookies";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function loginTarget(origin: string) {
  const target = new URL("/login", origin);
  target.searchParams.set("message", "You have signed out.");
  return target;
}

function requestCookieNames(request: Request) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter(Boolean);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secure = shouldUseSecureCookies(request);
  const response = NextResponse.redirect(loginTarget(url.origin));
  response.headers.set("cache-control", "private, no-store");

  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.warn(
      "auth_sign_out_failed",
      error instanceof Error ? error.message : String(error),
    );
  }

  response.cookies.set(
    luckyDrawSessionCookie,
    "",
    sessionCookieClearOptions(secure),
  );
  response.cookies.set(
    legacyLuckyDrawSessionCookie,
    "",
    sessionCookieClearOptions(secure),
  );

  for (const name of requestCookieNames(request)) {
    if (!isSupabaseAuthCookieName(name)) continue;
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });
  }

  return response;
}

export const POST = GET;
