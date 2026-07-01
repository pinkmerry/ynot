import "server-only";

import {
  resolveCurrentProfile,
  type ResolvedProfileSession,
} from "@/lib/auth/resolve-current-profile";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { type MarketplaceAction } from "./config";
import {
  marketplaceActionDeniedResponse,
  marketplaceErrorResponse,
  ownerOnlyMarketplaceAccess,
  publicMarketplaceAccess,
  type MarketplaceAccessResult,
} from "./route-guards";
import { marketplaceRequestId } from "./route-utils";
import {
  marketplaceIdempotencyKey,
  marketplaceRequestHash,
  readMarketplaceJsonBody,
} from "./request-guard";

type MutationMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export type MarketplaceMutationRateLimit = {
  key: string;
  limit: number;
  windowMs: number;
};

export type PrepareMarketplaceMutationOptions = {
  method: MutationMethod;
  accessMode?: "customer" | "owner";
  action?: MarketplaceAction;
  rateLimit: MarketplaceMutationRateLimit;
  allowedFields?: readonly string[];
  readBody?: boolean;
  requireIdempotency?: boolean;
};

export type PreparedMarketplaceMutation =
  | {
      ok: false;
      requestId: string;
      response: Response;
    }
  | {
      ok: true;
      requestId: string;
      profile: ResolvedProfileSession;
      access: Extract<MarketplaceAccessResult, { allowed: true }>;
      idempotencyKey: string;
      body: Record<string, unknown>;
      canonicalBody: string;
      requestHash: (command: string) => Promise<string>;
      emptyRequestHash: (command: string) => Promise<string>;
      requestHashForBody: (
        command: string,
        canonicalBody: string,
      ) => Promise<string>;
      requestHashForTarget: (
        command: string,
        targetId: string,
      ) => Promise<string>;
      requestHashForTargetBody: (
        command: string,
        targetId: string,
        canonicalBody: string,
      ) => Promise<string>;
    };

function methodDenied(method: string, allowed: MutationMethod) {
  return Response.json(
    {
      error: "Marketplace method is not allowed.",
      code: "marketplace_method_not_allowed",
      allowed_method: allowed,
    },
    {
      status: 405,
      headers: { Allow: allowed },
    },
  );
}

function loginRequired() {
  return Response.json(
    { error: "Login is required.", code: "marketplace_login_required" },
    { status: 401 },
  );
}

function commandForTarget(command: string, targetId: string) {
  return `${command}:${targetId.trim()}`;
}

export async function prepareMarketplaceMutation(
  request: Request,
  options: PrepareMarketplaceMutationOptions,
): Promise<PreparedMarketplaceMutation> {
  const requestId = marketplaceRequestId(request);

  if (request.method !== options.method) {
    return {
      ok: false,
      requestId,
      response: methodDenied(request.method, options.method),
    };
  }

  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return { ok: false, requestId, response: crossOrigin };

  const profile = await resolveCurrentProfile();
  if (!profile?.profileId) {
    return { ok: false, requestId, response: loginRequired() };
  }

  const access =
    options.accessMode === "customer"
      ? await publicMarketplaceAccess(profile)
      : await ownerOnlyMarketplaceAccess(profile);
  if (!access.allowed) return { ok: false, requestId, response: access.response };

  if (options.action) {
    const actionDenied = marketplaceActionDeniedResponse(options.action, requestId);
    if (actionDenied) return { ok: false, requestId, response: actionDenied };
  }

  const rateLimited = await enforceRateLimit(
    request,
    options.rateLimit.key,
    { limit: options.rateLimit.limit, windowMs: options.rateLimit.windowMs },
    profile.profileId,
  );
  if (rateLimited) return { ok: false, requestId, response: rateLimited };

  try {
    const idempotencyKey =
      options.requireIdempotency === false ? "" : marketplaceIdempotencyKey(request);
    const readBody = options.readBody ?? true;
    const { body, canonicalBody } = readBody
      ? await readMarketplaceJsonBody(request, options.allowedFields ?? [])
      : { body: {}, canonicalBody: "{}" };

    return {
      ok: true,
      requestId,
      profile,
      access,
      idempotencyKey,
      body,
      canonicalBody,
      requestHash: (command: string) =>
        marketplaceRequestHash({
          command,
          profileId: profile.profileId,
          canonicalBody,
        }),
      emptyRequestHash: (command: string) =>
        marketplaceRequestHash({
          command,
          profileId: profile.profileId,
          canonicalBody: "{}",
        }),
      requestHashForBody: (command: string, nextCanonicalBody: string) =>
        marketplaceRequestHash({
          command,
          profileId: profile.profileId,
          canonicalBody: nextCanonicalBody,
        }),
      requestHashForTarget: (command: string, targetId: string) =>
        marketplaceRequestHash({
          command: commandForTarget(command, targetId),
          profileId: profile.profileId,
          canonicalBody,
        }),
      requestHashForTargetBody: (
        command: string,
        targetId: string,
        nextCanonicalBody: string,
      ) =>
        marketplaceRequestHash({
          command: commandForTarget(command, targetId),
          profileId: profile.profileId,
          canonicalBody: nextCanonicalBody,
        }),
    };
  } catch (error) {
    return {
      ok: false,
      requestId,
      response: marketplaceErrorResponse(error, requestId),
    };
  }
}
