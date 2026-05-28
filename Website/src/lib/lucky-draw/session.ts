import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const luckyDrawSessionCookie = "ynot_session";
export const legacyLuckyDrawSessionCookie = "lucky_draw_session";
export const sessionCookieNames = [
  luckyDrawSessionCookie,
  legacyLuckyDrawSessionCookie,
] as const;

// Absolute lifetime baked into the signed payload. Matches the cookie's
// browser-side Max-Age so an attacker can't extend a cookie beyond what the
// browser would have done anyway, but gives us a server-checkable timestamp
// even if the browser ignores Max-Age.
export const LUCKY_DRAW_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type LuckyDrawSession = {
  profileId: string;
  authSource?: "supabase" | "line";
  authUserId?: string;
  lineUserId?: string;
  displayName?: string;
  adminId?: string;
  adminRole?: "owner" | "admin" | "staff";
  // Issued-at (epoch seconds), absolute expiry, and per-profile revocation
  // counter. Read paths require all three for active sessions.
  iat?: number;
  exp?: number;
  sessionVersion?: number;
};

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

const JWT_HEADER = {
  alg: "HS256",
  typ: "JWT",
} as const;

function sessionSecret() {
  const secret = process.env.LINE_SESSION_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV !== "production") {
    return "dev-local-lucky-draw-session-secret";
  }

  console.error("LINE_SESSION_SECRET is required to sign Lucky Draw sessions.");
  return null;
}

function sign(value: string) {
  const secret = sessionSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function parseJsonSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function signedValueMatches(value: string, signature: string) {
  const expected = sign(value);
  if (!expected) return false;

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function authSourceValue(value: unknown): LuckyDrawSession["authSource"] {
  return value === "supabase" || value === "line" ? value : undefined;
}

function adminRoleValue(value: unknown): LuckyDrawSession["adminRole"] {
  return value === "owner" || value === "admin" || value === "staff" ? value : undefined;
}

function normalizeSessionPayload(value: unknown): LuckyDrawSession | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const profileId = stringValue(payload.profileId);
  if (!profileId) return null;

  return {
    profileId,
    authSource: authSourceValue(payload.authSource),
    authUserId: stringValue(payload.authUserId),
    lineUserId: stringValue(payload.lineUserId),
    displayName: stringValue(payload.displayName),
    adminId: stringValue(payload.adminId),
    adminRole: adminRoleValue(payload.adminRole),
    iat: numberValue(payload.iat),
    exp: numberValue(payload.exp),
    sessionVersion: numberValue(payload.sessionVersion),
  };
}

function readJwtSession(raw: string): LuckyDrawSession | null {
  const [encodedHeader, encodedPayload, signature] = raw.split(".");
  if (!encodedHeader || !encodedPayload || !signature) return null;
  if (!signedValueMatches(`${encodedHeader}.${encodedPayload}`, signature)) return null;

  try {
    const header = parseJsonSegment(encodedHeader);
    if (!header || typeof header !== "object") return null;
    const values = header as Record<string, unknown>;
    if (values.alg !== JWT_HEADER.alg || values.typ !== JWT_HEADER.typ) return null;
    return normalizeSessionPayload(parseJsonSegment(encodedPayload));
  } catch {
    return null;
  }
}

function isExpired(session: LuckyDrawSession) {
  return typeof session.exp === "number" && session.exp <= nowEpochSeconds();
}

export function sessionCookieOptions(secure: boolean, maxAge = LUCKY_DRAW_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge,
    priority: "high" as const,
  };
}

export function sessionCookieClearOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 0,
  };
}

/**
 * Stamp a session payload with iat + exp before signing. exp defaults to
 * iat + LUCKY_DRAW_SESSION_TTL_SECONDS. Caller must pass a pre-fetched
 * sessionVersion so read-side revocation checks can fail closed.
 */
export function createSessionCookieValue(session: LuckyDrawSession) {
  if (typeof session.sessionVersion !== "number") return null;
  const iat = session.iat ?? nowEpochSeconds();
  const exp = session.exp ?? iat + LUCKY_DRAW_SESSION_TTL_SECONDS;
  const stamped: LuckyDrawSession = {
    ...session,
    iat,
    exp,
  };
  const header = encodeJson(JWT_HEADER);
  const payload = encodeJson(stamped);
  const signature = sign(`${header}.${payload}`);
  if (!signature) return null;
  return `${header}.${payload}.${signature}`;
}

/**
 * Verify HMAC + decode the JWT payload + enforce exp (if present).
 * Returns null for: missing/malformed cookie, HMAC mismatch, expired token.
 * Legacy two-part cookies are intentionally not accepted as active sessions.
 * Does NOT check sessionVersion — that requires a DB round-trip and is the
 * caller's responsibility (see resolveCurrentProfile).
 */
export function readSessionCookie(cookieStore: CookieReader): LuckyDrawSession | null {
  const raw = cookieStore.get(luckyDrawSessionCookie)?.value;
  if (!raw) return null;

  const parsed = raw.split(".").length === 3 ? readJwtSession(raw) : null;

  if (!parsed || isExpired(parsed)) {
    return null;
  }
  if (
    typeof parsed.iat !== "number" ||
    typeof parsed.exp !== "number" ||
    typeof parsed.sessionVersion !== "number"
  ) {
    return null;
  }

  return parsed;
}

type RpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

/**
 * M2 sessionVersion check. Pulled out of readSessionCookie because it needs
 * a DB call. Returns true only if the cookie's sessionVersion matches the
 * profile's current session_version.
 */
export async function isSessionVersionCurrent(
  session: LuckyDrawSession,
): Promise<boolean> {
  if (typeof session.sessionVersion !== "number") {
    return false;
  }
  if (!session.profileId) return false;

  try {
    const supabase = createServiceSupabaseClient();
    const callRpc = supabase.rpc.bind(supabase) as unknown as RpcFn;
    const { data, error } = await callRpc("get_profile_session_version", {
      p_profile_id: session.profileId,
    });
    if (error) {
      return false;
    }
    return Number((data as number | null) ?? 0) === session.sessionVersion;
  } catch {
    // Fail closed on unexpected exception so a database hiccup does not
    // enable revoked-session reuse.
    return false;
  }
}

/**
 * Fetch a profile's current session_version. Cookie writers call this
 * before signing a new cookie so the cookie picks up the latest counter.
 * Returns 0 on read failure or pre-migration schema so we don't block
 * sign-in.
 */
export async function fetchSessionVersion(profileId: string): Promise<number> {
  if (!profileId) return 0;
  try {
    const supabase = createServiceSupabaseClient();
    const callRpc = supabase.rpc.bind(supabase) as unknown as RpcFn;
    const { data, error } = await callRpc("get_profile_session_version", {
      p_profile_id: profileId,
    });
    if (error) return 0;
    return Number((data as number | null) ?? 0);
  } catch {
    return 0;
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
