import "server-only";

import { cookies } from "next/headers";
import {
  readSessionCookie,
  isSessionVersionCurrent,
} from "@/lib/lucky-draw/session";
import { createServiceSupabaseClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import { ensureProfileForUser } from "./profile";

export type ResolvedProfileSession = {
  profileId: string;
  authUserId?: string;
  lineUserId?: string;
  displayName?: string;
  adminId?: string;
  adminRole?: "owner" | "admin" | "staff";
  authSource: "supabase" | "line";
};

export type ResolvedAdminSession = ResolvedProfileSession & {
  adminId: string;
  adminRole: "owner" | "admin" | "staff";
};

export function isSupabaseAuthCookieName(name: string) {
  return name.startsWith("sb-") && /-auth-token(?:\.\d+)?$/.test(name);
}

function hasSupabaseAuthCookie(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  // Supabase SSR sets cookies named like `sb-<project-ref>-auth-token`.
  // Larger sessions are chunked as `sb-<project-ref>-auth-token.0`, `.1`, etc.
  // If none are present we can skip the GoTrue round-trip entirely.
  return cookieStore.getAll().some((c) => isSupabaseAuthCookieName(c.name));
}

function adminRoleFromValue(value: unknown): ResolvedProfileSession["adminRole"] {
  return value === "owner" || value === "admin" || value === "staff"
    ? value
    : undefined;
}

async function resolveDevPreviewProfile(): Promise<ResolvedProfileSession | null> {
  const previewProfileId = process.env.YNOT_PREVIEW_PROFILE_ID?.trim();
  if (!previewProfileId) return null;

  const supabase = createServiceSupabaseClient();
  const [{ data: profile, error: profileError }, { data: admin, error: adminError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id,display_name,line_display_name,line_user_id")
        .eq("id", previewProfileId)
        .maybeSingle(),
      supabase
        .from("admin_users")
        .select("id,role")
        .eq("profile_id", previewProfileId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  if (profileError || !profile) {
    console.warn(
      "dev_preview_profile_resolution_failed",
      profileError?.message ?? "profile not found",
    );
    return null;
  }
  if (adminError) {
    console.warn("dev_preview_admin_resolution_failed", adminError.message);
  }

  const adminRole = adminRoleFromValue(admin?.role);
  return {
    profileId: profile.id,
    authUserId: "preview-user",
    lineUserId: profile.line_user_id ?? undefined,
    displayName:
      profile.display_name ?? profile.line_display_name ?? "Preview User",
    adminId: admin?.id,
    adminRole,
    authSource: "supabase",
  };
}

export async function resolveCurrentProfile(): Promise<ResolvedProfileSession | null> {
  const cookieStore = await cookies();

  // Dev-only preview bypass: when ynot-preview-auth=1 is set (via
  // /api/dev/preview-auth?mode=on), return a stub session so protected
  // routes don't redirect to /login during local testing. Requires BOTH
  // NODE_ENV != production AND YNOT_ENABLE_DEV_AUTH=true — single-flag
  // failure can't enable owner-tier auth on a live build.
  if (
    isDevAuthAllowed() &&
    cookieStore.get("ynot-preview-auth")?.value === "1"
  ) {
    const devPreviewProfile = await resolveDevPreviewProfile();
    if (devPreviewProfile) return devPreviewProfile;

    return {
      profileId: "00000000-0000-0000-0000-000000000001",
      authUserId: "preview-user",
      displayName: "Preview User",
      adminId: "00000000-0000-0000-0000-000000000001",
      adminRole: "owner",
      authSource: "supabase",
    };
  }

  const supabaseCookiePresent = hasSupabaseAuthCookie(cookieStore);

  if (supabaseCookiePresent) {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!error && user) {
        const profile = await ensureProfileForUser(user, null, { readOnly: true });
        return {
          profileId: profile.id,
          authUserId: user.id,
          lineUserId: profile.line_user_id ?? undefined,
          displayName: profile.display_name ?? profile.line_display_name ?? user.email ?? "YNot Customer",
          authSource: "supabase",
        };
      }
    } catch (error) {
      console.warn(
        "supabase_auth_profile_resolution_failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const lineSession = readSessionCookie(cookieStore);
  if (!lineSession?.profileId) return null;

  // M2: reject the cookie if its sessionVersion doesn't match the profile's
  // current version. Legacy cookies (no sessionVersion field) pass through
  // until natural expiry. The check is sourced from a server-side RPC so a
  // stolen cookie cannot be replayed once an admin has revoked the profile's
  // sessions.
  const versionOk = await isSessionVersionCurrent(lineSession);
  if (!versionOk) return null;

  return {
    profileId: lineSession.profileId,
    lineUserId: lineSession.lineUserId,
    displayName: lineSession.displayName,
    adminId: lineSession.adminId,
    adminRole: lineSession.adminRole,
    authSource: "line",
  };
}

export async function resolveAdminSession(baseSession?: ResolvedProfileSession | null): Promise<ResolvedAdminSession | null> {
  const session = baseSession === undefined ? await resolveCurrentProfile() : baseSession;
  if (!session?.profileId) return null;

  // Dev-only preview bypass: preview session already carries admin role.
  if (
    isDevAuthAllowed() &&
    session.authUserId === "preview-user" &&
    session.adminId &&
    session.adminRole
  ) {
    return {
      ...session,
      adminId: session.adminId,
      adminRole: session.adminRole,
    };
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id,role")
    .eq("profile_id", session.profileId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ...session,
    adminId: data.id,
    adminRole: data.role,
  };
}
