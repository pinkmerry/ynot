import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const parsed = new URL(value, "https://ynot.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function appOrigin(request: Request) {
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

function redirectWith(
  request: Request,
  nextPath: string,
  key: "error" | "message",
  value: string,
) {
  const url = new URL(nextPath, new URL(request.url).origin);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"));
  const origin = appOrigin(request);

  if (!origin) {
    return redirectWith(
      request,
      nextPath,
      "error",
      "NEXT_PUBLIC_SITE_URL is required before production Google login.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error || !data.url) {
    return redirectWith(
      request,
      nextPath,
      "error",
      error?.message ?? "Google login could not start.",
    );
  }

  return NextResponse.redirect(data.url);
}
