import { timingSafeEqual } from "node:crypto";
import { expireMarketplacePendingPaymentOrders } from "@/lib/marketplace/orders";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";

export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

async function requestLimit(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    limit?: unknown;
  } | null;
  const value = Number(body?.limit ?? 100);
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(Math.floor(value), 200));
}

export async function POST(request: Request) {
  const requestId = marketplaceRequestId(request);
  const secret = process.env.MARKETPLACE_PENDING_ORDER_EXPIRY_SECRET?.trim();
  if (!secret) {
    return jsonNoStore(
      {
        error: "Marketplace expiry job is not configured.",
        code: "marketplace_expiry_secret_missing",
        request_id: requestId,
      },
      { status: 503 },
    );
  }

  if (!constantTimeEqual(bearerToken(request), secret)) {
    return jsonNoStore(
      {
        error: "Marketplace expiry job is not authorized.",
        code: "marketplace_expiry_unauthorized",
        request_id: requestId,
      },
      { status: 401 },
    );
  }

  try {
    const result = await expireMarketplacePendingPaymentOrders({
      requestId,
      limit: await requestLimit(request),
    });
    return jsonNoStore({
      ok: true,
      request_id: requestId,
      result,
    });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
