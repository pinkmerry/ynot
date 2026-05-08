import "server-only";

import { cookies } from "next/headers";
import { readSessionCookie } from "@/lib/lucky-draw/session";
import { createServiceSupabaseClient, createSupabaseServerClient } from "@/lib/supabase/server";
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

export async function resolveCurrentProfile(): Promise<ResolvedProfileSession | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (!error && user) {
      const profile = await ensureProfileForUser(user);
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

  const lineSession = readSessionCookie(await cookies());
  if (!lineSession?.profileId) return null;

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
