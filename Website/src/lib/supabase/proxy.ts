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

type UpdateSessionOptions = {
  requestHeaders?: Headers;
};

export async function updateSession(request: NextRequest, options: UpdateSessionOptions = {}) {
  function nextWithRequestHeaders() {
    const { requestHeaders } = options;
    if (!requestHeaders) {
      return NextResponse.next({ request });
    }

    const headers = new Headers(request.headers);
    const nonce = requestHeaders.get("x-nonce");
    const csp = requestHeaders.get("Content-Security-Policy");

    if (nonce) headers.set("x-nonce", nonce);
    if (csp) headers.set("Content-Security-Policy", csp);

    return NextResponse.next({ request: { headers } });
  }

  let supabaseResponse = nextWithRequestHeaders();
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
        supabaseResponse = nextWithRequestHeaders();
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
