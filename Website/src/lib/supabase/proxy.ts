import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { shouldUseSecureCookies } from "@/lib/security/cookies";
import { hardenSupabaseCookieOptions } from "./cookie-options";
import type { Database } from "./types";

function isSupabaseAuthCookieName(name: string) {
  return name.startsWith("sb-") && /-auth-token(?:\.\d+)?$/.test(name);
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => isSupabaseAuthCookieName(cookie.name));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secure = shouldUseSecureCookies(request);

  if (!supabaseUrl || !supabasePublishableKey) return supabaseResponse;
  if (!hasSupabaseAuthCookie(request)) return supabaseResponse;

  const supabase = createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(
            name,
            value,
            hardenSupabaseCookieOptions(options, secure),
          ),
        );
        Object.entries(headers).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch (error) {
    console.warn(
      "supabase_middleware_session_refresh_failed",
      error instanceof Error ? error.message : String(error),
    );
  }

  return supabaseResponse;
}
