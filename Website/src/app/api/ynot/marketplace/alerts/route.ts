import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import {
  ensureMarketplaceAccountForProfile,
  getMarketplaceAccountForProfile,
} from "@/lib/marketplace/account-bridge";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  cancelProductAlert,
  listProductAlerts,
  subscribeProductAlert,
} from "@/lib/marketplace/product-alerts";
import {
  customerMarketplaceAccess,
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseAlertProductId(value: unknown) {
  const productId = String(value ?? "");
  if (!UUID_RE.test(productId)) return null;
  return productId.toLowerCase();
}

export async function GET(request: Request) {
  const requestId = marketplaceRequestId(request);
  const profile = await resolveCurrentProfile();
  if (!profile?.profileId) {
    return Response.json(
      { error: "Login is required.", code: "marketplace_login_required" },
      { status: 401 },
    );
  }

  const access = await customerMarketplaceAccess(profile);
  if (!access.allowed) return access.response;

  const rateLimited = await enforceRateLimit(
    request,
    "ynot:marketplace:alerts:list",
    { limit: 60, windowMs: 60_000 },
    profile.profileId,
  );
  if (rateLimited) return rateLimited;

  try {
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    if (!account) {
      return Response.json({ ok: true, request_id: requestId, alerts: [] });
    }
    const alerts = await listProductAlerts({ accountId: account.accountId });
    return Response.json({ ok: true, request_id: requestId, alerts });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    accessMode: "customer",
    action: "checkout",
    rateLimit: {
      key: "ynot:marketplace:alerts:subscribe",
      limit: 20,
      windowMs: 60_000,
    },
    allowedFields: ["productId"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, idempotencyKey, profile, requestId } = mutation;

  const productId = parseAlertProductId(body.productId);
  if (!productId) {
    return Response.json(
      {
        error: "Invalid product.",
        code: "marketplace_alert_product_invalid",
        request_id: requestId,
      },
      { status: 400 },
    );
  }

  try {
    const account = await ensureMarketplaceAccountForProfile(profile, {
      admin: access.admin,
      actorProfileId: profile.profileId,
      requestId,
      idempotencyKey,
      requestHash: await mutation.emptyRequestHash("account.ensure"),
    });
    const alert = await subscribeProductAlert({
      productId,
      accountId: account.accountId,
    });
    return Response.json({ ok: true, request_id: requestId, alert });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "DELETE",
    accessMode: "customer",
    action: "checkout",
    rateLimit: {
      key: "ynot:marketplace:alerts:cancel",
      limit: 20,
      windowMs: 60_000,
    },
    allowedFields: ["productId"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, profile, requestId } = mutation;

  const productId = parseAlertProductId(body.productId);
  if (!productId) {
    return Response.json(
      {
        error: "Invalid product.",
        code: "marketplace_alert_product_invalid",
        request_id: requestId,
      },
      { status: 400 },
    );
  }

  try {
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    if (!account) {
      return Response.json(
        {
          error: "Marketplace account is required.",
          code: "marketplace_account_required",
          request_id: requestId,
        },
        { status: 400 },
      );
    }
    const alert = await cancelProductAlert({
      productId,
      accountId: account.accountId,
    });
    return Response.json({ ok: true, request_id: requestId, alert });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
