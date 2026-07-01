import "server-only";

import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import type {
  ResolvedAdminSession,
  ResolvedProfileSession,
} from "@/lib/auth/resolve-current-profile";

export const MARKETPLACE_AUTH_BRIDGE_SECRET_ENV =
  "MARKETPLACE_AUTH_BRIDGE_SECRET" as const;
export const MARKETPLACE_AUTH_BRIDGE_URL_ENV =
  "MARKETPLACE_AUTH_BRIDGE_URL" as const;
export const MARKETPLACE_WORKER_SURFACE_ENV = "YNOT_WORKER_SURFACE" as const;
export const MARKETPLACE_AUTH_BRIDGE_HEADER =
  "x-ynot-marketplace-auth" as const;

type BridgeSessionPayload = {
  ok?: unknown;
  profile?: unknown;
};

function envText(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function safeString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeAdminRole(value: unknown): ResolvedProfileSession["adminRole"] {
  return value === "owner" || value === "admin" || value === "staff"
    ? value
    : undefined;
}

function safeAuthSource(value: unknown): ResolvedProfileSession["authSource"] {
  return value === "supabase" || value === "line" ? value : "supabase";
}

function constantTimeMatches(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function authBridgeSecret() {
  return envText(MARKETPLACE_AUTH_BRIDGE_SECRET_ENV);
}

function authBridgeUrl() {
  return envText(MARKETPLACE_AUTH_BRIDGE_URL_ENV);
}

export function isMarketplaceWorkerRuntime() {
  return envText(MARKETPLACE_WORKER_SURFACE_ENV) === "marketplace";
}

export function shouldUseMarketplaceAuthBridge() {
  return isMarketplaceWorkerRuntime();
}

export function isMarketplaceAuthBridgeProfile(
  session: ResolvedProfileSession | null | undefined,
): session is ResolvedProfileSession & {
  authResolution: "marketplace_auth_bridge";
} {
  return session?.authResolution === "marketplace_auth_bridge";
}

export function verifyMarketplaceAuthBridgeRequest(request: Request) {
  const expected = authBridgeSecret();
  const actual = request.headers.get(MARKETPLACE_AUTH_BRIDGE_HEADER)?.trim();
  if (!expected || !actual) return false;
  return constantTimeMatches(actual, expected);
}

function bridgeUrl() {
  const raw = authBridgeUrl();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeBridgeProfile(value: unknown): ResolvedProfileSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const profileId = safeString(record.profileId);
  if (!profileId) return null;

  return {
    profileId,
    authUserId: safeString(record.authUserId),
    lineUserId: safeString(record.lineUserId),
    displayName: safeString(record.displayName),
    adminId: safeString(record.adminId),
    adminRole: safeAdminRole(record.adminRole),
    authSource: safeAuthSource(record.authSource),
    authResolution: "marketplace_auth_bridge",
  };
}

export function marketplaceBridgeProfileResponse(
  profile: ResolvedProfileSession,
  admin: ResolvedAdminSession | null,
) {
  return {
    ok: true,
    profile: {
      profileId: profile.profileId,
      authUserId: profile.authUserId,
      lineUserId: profile.lineUserId,
      displayName: profile.displayName,
      adminId: admin?.adminId,
      adminRole: admin?.adminRole,
      authSource: profile.authSource,
    },
  };
}

export async function resolveProfileViaMarketplaceAuthBridge(): Promise<ResolvedProfileSession | null> {
  const secret = authBridgeSecret();
  const url = bridgeUrl();
  if (!secret || !url) {
    console.warn("marketplace_auth_bridge_not_configured");
    return null;
  }

  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie");
  if (!cookieHeader) return null;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: {
        accept: "application/json",
        cookie: cookieHeader,
        [MARKETPLACE_AUTH_BRIDGE_HEADER]: secret,
      },
    });

    if (response.status === 401 || response.status === 404) return null;
    if (!response.ok) {
      console.warn("marketplace_auth_bridge_failed", response.status);
      return null;
    }

    const payload = (await response.json()) as BridgeSessionPayload;
    if (payload.ok !== true) return null;
    return normalizeBridgeProfile(payload.profile);
  } catch (error) {
    console.warn(
      "marketplace_auth_bridge_threw",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
