import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureProfileForUser } from "@/lib/auth/profile";
import {
  luckyDrawSessionCookie,
  readSessionCookie,
} from "@/lib/lucky-draw/session";
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
    return NextResponse.redirect(
      new URL("/login?error=Missing+auth+callback+code.", url.origin),
    );
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
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
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

  if (user) await ensureProfileForUser(user, lineSession?.profileId ?? null);

  if (lineSession?.profileId) {
    response.cookies.set(luckyDrawSessionCookie, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
