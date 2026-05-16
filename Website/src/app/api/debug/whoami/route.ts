import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  isSupabaseAuthCookieName,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG_ENDPOINTS !== "true") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const cookieStore = await cookies();
  const headerStore = await headers();
  const allCookies = cookieStore.getAll();
  const supabaseAuthCookieNames = allCookies
    .map((cookie) => cookie.name)
    .filter(isSupabaseAuthCookieName);
  const profile = await resolveCurrentProfile();

  return NextResponse.json(
    {
      now: new Date().toISOString(),
      host: headerStore.get("host"),
      xForwardedHost: headerStore.get("x-forwarded-host"),
      userAgent: headerStore.get("user-agent")?.slice(0, 80),
      cookieCount: allCookies.length,
      cookieNames: allCookies.map((c) => c.name),
      supabaseAuthCookieCount: supabaseAuthCookieNames.length,
      supabaseAuthCookieNames,
      resolvedProfile: profile
        ? {
            profileId: profile.profileId,
            authUserId: profile.authUserId,
            displayName: profile.displayName,
            authSource: profile.authSource,
          }
        : null,
    },
    {
      headers: { "cache-control": "no-store" },
    },
  );
}
