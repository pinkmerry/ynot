import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const allCookies = cookieStore.getAll().map((c) => ({
    name: c.name,
    valueLength: c.value.length,
    valuePrefix: c.value.slice(0, 12),
  }));

  const sbAuthCookies = allCookies.filter(
    (c) => c.name.startsWith("sb-") && c.name.includes("auth-token"),
  );

  const profile = await resolveCurrentProfile();

  return NextResponse.json(
    {
      now: new Date().toISOString(),
      host: headerStore.get("host"),
      xForwardedHost: headerStore.get("x-forwarded-host"),
      userAgent: headerStore.get("user-agent")?.slice(0, 80),
      cookieCount: allCookies.length,
      allCookies,
      sbAuthCookies,
      sbAuthCookieCount: sbAuthCookies.length,
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
