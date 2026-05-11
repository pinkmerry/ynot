import { NextResponse } from "next/server";
import { ensureProfileForUser } from "@/lib/auth/profile";
import {
  luckyDrawSessionCookie,
  readSessionCookie,
} from "@/lib/lucky-draw/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const supabase = await createSupabaseServerClient();
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

  const response = NextResponse.redirect(new URL(next, url.origin));
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
