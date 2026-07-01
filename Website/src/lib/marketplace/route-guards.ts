import "server-only";

import {
  resolveAdminSession,
  type ResolvedAdminSession,
  type ResolvedProfileSession,
} from "@/lib/auth/resolve-current-profile";
import { marketplaceConfig, type MarketplaceAction } from "./config";
import { MarketplaceServiceError } from "./supabase-adapter";

export type MarketplaceLaunchStatus = {
  enabled: boolean;
  ownerOnly: boolean;
  configured: boolean;
  allowed: boolean;
  reason: string | null;
  admin: {
    isOperator: boolean;
    isOwner: boolean;
  };
};

type MarketplaceAccessDenied = {
  allowed: false;
  admin: ResolvedAdminSession | null;
  status: MarketplaceLaunchStatus;
  response: Response;
};

type MarketplaceAccessAllowed = {
  allowed: true;
  admin: ResolvedAdminSession | null;
  status: MarketplaceLaunchStatus;
  response: null;
};

export type MarketplaceAccessResult =
  | MarketplaceAccessDenied
  | MarketplaceAccessAllowed;

function launchStatus(
  allowed: boolean,
  admin: ResolvedAdminSession | null,
  reason: string | null,
): MarketplaceLaunchStatus {
  const config = marketplaceConfig();
  return {
    enabled: config.enabled,
    ownerOnly: config.ownerOnly,
    configured: config.unavailableReason === null,
    allowed,
    reason,
    admin: {
      isOperator: Boolean(admin?.adminRole),
      isOwner: admin?.adminRole === "owner",
    },
  };
}

export async function ownerOnlyMarketplaceAccess(
  profile: ResolvedProfileSession,
): Promise<MarketplaceAccessResult> {
  const config = marketplaceConfig();
  const admin = await resolveAdminSession(profile);

  if (config.unavailableReason) {
    return {
      allowed: false,
      admin,
      status: launchStatus(false, admin, config.unavailableReason),
      response: Response.json(
        {
          error: "Marketplace is not available.",
          code: config.unavailableReason,
          marketplace: launchStatus(false, admin, config.unavailableReason),
        },
        { status: 503 },
      ),
    };
  }

  if (config.ownerOnly && admin?.adminRole !== "owner") {
    return {
      allowed: false,
      admin,
      status: launchStatus(false, admin, "marketplace_owner_required"),
      response: Response.json(
        {
          error: "Marketplace is owner-only during prelaunch.",
          code: "marketplace_owner_required",
          marketplace: launchStatus(false, admin, "marketplace_owner_required"),
        },
        { status: 403 },
      ),
    };
  }

  return {
    allowed: true,
    admin,
    status: launchStatus(true, admin, null),
    response: null,
  };
}

export async function publicMarketplaceAccess(
  profile: ResolvedProfileSession | null | undefined,
): Promise<MarketplaceAccessResult> {
  const config = marketplaceConfig();
  const admin = profile ? await resolveAdminSession(profile) : null;

  if (config.unavailableReason) {
    return {
      allowed: false,
      admin,
      status: launchStatus(false, admin, config.unavailableReason),
      response: Response.json(
        {
          error: "Marketplace is not available.",
          code: config.unavailableReason,
          marketplace: launchStatus(false, admin, config.unavailableReason),
        },
        { status: 503 },
      ),
    };
  }

  if (config.ownerOnly && admin?.adminRole !== "owner") {
    return {
      allowed: false,
      admin,
      status: launchStatus(false, admin, "marketplace_owner_required"),
      response: Response.json(
        {
          error: "Marketplace is owner-only during prelaunch.",
          code: "marketplace_owner_required",
          marketplace: launchStatus(false, admin, "marketplace_owner_required"),
        },
        { status: profile?.profileId ? 403 : 401 },
      ),
    };
  }

  return {
    allowed: true,
    admin,
    status: launchStatus(true, admin, null),
    response: null,
  };
}

export async function customerMarketplaceAccess(
  profile: ResolvedProfileSession,
): Promise<MarketplaceAccessResult> {
  return publicMarketplaceAccess(profile);
}

const MARKETPLACE_ACTION_LABELS: Record<MarketplaceAction, string> = {
  publicNav: "public navigation",
  browse: "browse",
  checkout: "checkout",
  sellerSubmission: "seller submission",
  listingActivation: "listing activation",
  paymentProof: "payment proof",
  payoutRelease: "payout release",
};

export function marketplaceActionDeniedResponse(
  action: MarketplaceAction,
  requestId?: string | null,
) {
  const config = marketplaceConfig();
  if (config.actions[action]) return null;
  const code = `marketplace_${action}_disabled`;
  return Response.json(
    {
      error: `Marketplace ${MARKETPLACE_ACTION_LABELS[action]} is temporarily disabled.`,
      code,
      request_id: requestId ?? null,
    },
    { status: 503 },
  );
}

export function assertMarketplaceActionEnabled(action: MarketplaceAction) {
  const blocked = marketplaceActionDeniedResponse(action);
  if (!blocked) return;
  throw new MarketplaceServiceError(
    `marketplace_${action}_disabled`,
    `Marketplace ${MARKETPLACE_ACTION_LABELS[action]} is temporarily disabled.`,
    503,
  );
}

export function marketplaceErrorResponse(error: unknown, requestId?: string | null) {
  if (error instanceof MarketplaceServiceError) {
    console.warn(
      "marketplace_route_error",
      error.code,
      error.internalMessage ?? error.message,
      requestId ?? "",
    );
    return Response.json(
      { error: error.message, code: error.code, request_id: requestId ?? null },
      { status: error.status },
    );
  }

  console.warn(
    "marketplace_route_error",
    error instanceof Error ? error.message : String(error),
    requestId ?? "",
  );
  return Response.json(
    {
      error: "Marketplace request failed.",
      code: "marketplace_request_failed",
      request_id: requestId ?? null,
    },
    { status: 500 },
  );
}
