import { NextResponse } from "next/server";
import {
  createSessionCookieValue,
  fetchSessionVersion,
  luckyDrawSessionCookie,
} from "@/lib/lucky-draw/session";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TEST_LINE_USER_ID = "dev-local-admin-email-test";
const TEST_DISPLAY_NAME = "YNot Test Admin";

function requestCookieNames(cookieHeader: string | null) {
  return (cookieHeader ?? "")
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .filter(Boolean);
}

function devRedirectUrl(request: Request) {
  const redirectTo = new URL("/admin", request.url);
  const host = request.headers.get("host");
  if (host) {
    redirectTo.host = host;
  }
  return redirectTo;
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Dev admin login is disabled in production." }, { status: 404 });
  }

  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  const { data: existingProfile, error: readError } = await supabase
    .from("profiles")
    .select("id,line_user_id,line_display_name")
    .eq("line_user_id", TEST_LINE_USER_ID)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  const profile = existingProfile ?? (await supabase
    .from("profiles")
    .insert({
      line_user_id: TEST_LINE_USER_ID,
      line_display_name: TEST_DISPLAY_NAME,
      preferred_language: "en",
      full_name: TEST_DISPLAY_NAME,
      country: "Thailand",
    })
    .select("id,line_user_id,line_display_name")
    .single()).data;

  if (!profile?.id) {
    return NextResponse.json({ error: "Could not create dev test profile." }, { status: 500 });
  }

  await supabase
    .from("profiles")
    .update({
      line_display_name: TEST_DISPLAY_NAME,
      full_name: TEST_DISPLAY_NAME,
      updated_at: now,
    })
    .eq("id", profile.id);

  const { data: admin, error: adminError } = await supabase
    .from("admin_users")
    .upsert(
      {
        profile_id: profile.id,
        role: "owner",
        is_active: true,
      },
      { onConflict: "profile_id" },
    )
    .select("id,role,is_active")
    .single();

  if (adminError || !admin) {
    return NextResponse.json({ error: adminError?.message ?? "Could not create dev admin user." }, { status: 500 });
  }

  const sessionVersion = await fetchSessionVersion(profile.id);
  const sessionCookie = createSessionCookieValue({
    profileId: profile.id,
    lineUserId: TEST_LINE_USER_ID,
    displayName: TEST_DISPLAY_NAME,
    adminId: admin.id,
    adminRole: admin.role,
    sessionVersion,
  });

  if (!sessionCookie) {
    return NextResponse.json({ error: "LINE_SESSION_SECRET is required for dev admin login." }, { status: 500 });
  }

  const response = NextResponse.redirect(devRedirectUrl(request));
  for (const cookieName of requestCookieNames(request.headers.get("cookie"))) {
    if (cookieName.startsWith("sb-")) {
      response.cookies.set(cookieName, "", { path: "/", maxAge: 0 });
    }
  }

  response.cookies.set(luckyDrawSessionCookie, sessionCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
