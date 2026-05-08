import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const luckyDrawSessionCookie = "lucky_draw_session";

export type LuckyDrawSession = {
  profileId: string;
  lineUserId?: string;
  displayName?: string;
  adminId?: string;
  adminRole?: "owner" | "admin" | "staff";
};

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

function sessionSecret() {
  const secret = process.env.LINE_SESSION_SECRET;
  if (secret) return secret;

  console.error("LINE_SESSION_SECRET is required to sign Lucky Draw sessions.");
  return null;
}

function sign(value: string) {
  const secret = sessionSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionCookieValue(session: LuckyDrawSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = sign(payload);
  if (!signature) return null;
  return `${payload}.${signature}`;
}

export function readSessionCookie(cookieStore: CookieReader): LuckyDrawSession | null {
  const raw = cookieStore.get(luckyDrawSessionCookie)?.value;
  if (!raw) return null;

  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  if (!expected) return null;

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LuckyDrawSession;
  } catch {
    return null;
  }
}

export function isAdminSession(session: LuckyDrawSession | null) {
  return !!session?.adminId && (session.adminRole === "owner" || session.adminRole === "admin" || session.adminRole === "staff");
}

export async function verifyAdminSession(session: LuckyDrawSession | null): Promise<LuckyDrawSession | null> {
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
