import "server-only";

import {
  resolveCurrentProfile,
  type ResolvedAdminSession,
  type ResolvedProfileSession,
} from "@/lib/auth/resolve-current-profile";
import {
  getMarketplaceAccountForProfile,
  type SafeMarketplaceAccount,
} from "./account-bridge";
import {
  customerMarketplaceAccess,
  ownerOnlyMarketplaceAccess,
  publicMarketplaceAccess,
  type MarketplaceAccessResult,
} from "./route-guards";

type MarketplaceActorMode = "public" | "customer" | "owner";

type MarketplaceActorSuccess = Extract<MarketplaceAccessResult, { allowed: true }>;

export type MarketplaceActorContext =
  | {
      ok: false;
      response: Response;
      profile: null;
      admin: ResolvedAdminSession | null;
      access: MarketplaceAccessResult | null;
      account: null;
    }
  | {
      ok: true;
      response: null;
      profile: ResolvedProfileSession;
      admin: ResolvedAdminSession | null;
      access: MarketplaceActorSuccess;
      account: null;
    };

export type MarketplaceActorSuccessContext = Extract<
  MarketplaceActorContext,
  { ok: true }
>;

function defaultLoginRequired() {
  return Response.json(
    { error: "Login is required.", code: "marketplace_login_required" },
    { status: 401 },
  );
}

async function accessForMode(
  mode: MarketplaceActorMode,
  profile: ResolvedProfileSession,
): Promise<MarketplaceAccessResult> {
  if (mode === "owner") return ownerOnlyMarketplaceAccess(profile);
  if (mode === "customer") return customerMarketplaceAccess(profile);
  return publicMarketplaceAccess(profile);
}

export async function getMarketplaceActorContext(options: {
  mode: MarketplaceActorMode;
  loginResponse?: () => Response;
}): Promise<MarketplaceActorContext> {
  const profile = await resolveCurrentProfile();
  if (!profile?.profileId) {
    return {
      ok: false,
      response: options.loginResponse?.() ?? defaultLoginRequired(),
      profile: null,
      admin: null,
      access: null,
      account: null,
    };
  }

  const access = await accessForMode(options.mode, profile);
  if (!access.allowed) {
    return {
      ok: false,
      response: access.response,
      profile: null,
      admin: access.admin,
      access,
      account: null,
    };
  }

  return {
    ok: true,
    response: null,
    profile,
    admin: access.admin,
    access,
    account: null,
  };
}

export async function getMarketplaceActorAccount(
  actor: MarketplaceActorSuccessContext,
): Promise<SafeMarketplaceAccount | null> {
  return getMarketplaceAccountForProfile(actor.profile, actor.admin);
}
