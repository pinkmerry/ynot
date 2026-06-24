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
  const mode = requestUrl.searchParams.get("mode") === "connect" ? "connect" : "login";
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
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", nextPath);
  if (mode === "connect") {
    callbackUrl.searchParams.set("mode", "connect");
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    if (error) {
      console.warn("google_oauth_start_failed", {
        message: error.message,
      });
    }
    return redirectWith(
      request,
      nextPath,
      "error",
      "Google login could not start. Please try again.",
    );
  }

  return NextResponse.redirect(data.url);
}
