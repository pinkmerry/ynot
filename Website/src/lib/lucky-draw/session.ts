import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const luckyDrawSessionCookie = "lucky_draw_session";

// Absolute lifetime baked into the signed payload. Matches the cookie's
// browser-side Max-Age so an attacker can't extend a cookie beyond what the
// browser would have done anyway, but gives us a server-checkable timestamp
// even if the browser ignores Max-Age.
export const LUCKY_DRAW_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type LuckyDrawSession = {
  profileId: string;
  lineUserId?: string;
  displayName?: string;
  adminId?: string;
  adminRole?: "owner" | "admin" | "staff";
  // M2: issued-at (epoch seconds), absolute expiry, and per-profile revocation
  // counter. All three are optional on read so legacy cookies (minted before
  // this migration) continue to verify until their 30-day Max-Age elapses,
  // after which only the new format exists.
  iat?: number;
  exp?: number;
  sessionVersion?: number;
};

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

function sessionSecret() {
  // The HMAC secret used to sign / verify the lucky_draw_session cookie.
  // Returning null causes every sign and read attempt to fail, which means
  // no session can be created or recognised — the app refuses to mint
  // sessions rather than fall back to a known value.
  //
  // SECURITY: there is NO dev-default fallback. Previously, a hard-coded
  // "dev-local-lucky-draw-session-secret" was returned when NODE_ENV was
  // not "production", which meant any environment that ever shipped a
  // non-prod build (preview deploy, mis-built worker, missing NODE_ENV in
  // wrangler vars) would sign cookies with a publicly-known secret — and
  // an attacker could forge arbitrary profileId / adminRole into a valid
  // signed cookie. Both dev and prod now require this env var to be set
  // explicitly. See `.env.example` for a suggested local development value.
  const secret = process.env.LINE_SESSION_SECRET?.trim();
  if (secret) return secret;

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

/**
 * Stamp a session payload with iat + exp before signing. exp defaults to
 * iat + LUCKY_DRAW_SESSION_TTL_SECONDS. Caller may pass a pre-fetched
 * sessionVersion to embed; otherwise it stays undefined and the read-side
 * version check is skipped.
 */
export function createSessionCookieValue(session: LuckyDrawSession) {
  const iat = session.iat ?? nowEpochSeconds();
  const exp = session.exp ?? iat + LUCKY_DRAW_SESSION_TTL_SECONDS;
  const stamped: LuckyDrawSession = {
    ...session,
    iat,
    exp,
  };
  const payload = Buffer.from(JSON.stringify(stamped)).toString("base64url");
  const signature = sign(payload);
  if (!signature) return null;
  return `${payload}.${signature}`;
}

/**
 * Verify HMAC + decode the payload + enforce exp (if present).
 * Returns null for: missing/malformed cookie, HMAC mismatch, expired token.
 * Does NOT check sessionVersion — that requires a DB round-trip and is the
 * caller's responsibility (see resolveCurrentProfile).
 */
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

  let parsed: LuckyDrawSession;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LuckyDrawSession;
  } catch {
    return null;
  }

  // M2: enforce absolute expiry when present. Legacy cookies without exp pass
  // through; they'll be replaced as the user signs in again.
  if (typeof parsed.exp === "number" && parsed.exp <= nowEpochSeconds()) {
    return null;
  }

  return parsed;
}

// Postgres SQLSTATE codes we treat as "schema not yet migrated":
//   42883 = undefined_function (get_profile_session_version doesn't exist)
//   42703 = undefined_column (session_version column doesn't exist)
// In both cases we fail open — the cookie's version field is ignored and
// the session is treated as current. This lets the code deploy ahead of the
// migration without locking everyone out.
function isLegacySchemaError(error: { code?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42883" || error.code === "42703";
}

type RpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

/**
 * M2 sessionVersion check. Pulled out of readSessionCookie because it needs
 * a DB call. Returns true if the cookie's sessionVersion matches the
 * profile's current session_version, OR if the cookie predates the field
 * (legacy compatibility window), OR if the DB schema predates the column.
 */
export async function isSessionVersionCurrent(
  session: LuckyDrawSession,
): Promise<boolean> {
  if (typeof session.sessionVersion !== "number") {
    // Legacy cookie; no version to verify against. Treat as valid until
    // natural expiry.
    return true;
  }
  if (!session.profileId) return false;

  try {
    const supabase = createServiceSupabaseClient();
    const callRpc = supabase.rpc.bind(supabase) as unknown as RpcFn;
    const { data, error } = await callRpc("get_profile_session_version", {
      p_profile_id: session.profileId,
    });
    if (error) {
      if (isLegacySchemaError(error)) return true;
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
