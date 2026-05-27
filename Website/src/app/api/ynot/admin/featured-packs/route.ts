import { cookies } from "next/headers";
import {
  HERO_PACKS_COOKIE,
  parseHeroPacksCookie,
} from "@/features/ynot/demo-pack-order";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

/**
 * Storefront "hero" / featured-pack list.
 *
 * The featured list is intentionally decoupled from the campaigns table's
 * `sort_order` column so that reordering a pack inside its tier shelf
 * never promotes / demotes it from the hero row. We persist it in a
 * cookie keyed by browser (admin uses a single device per session) so we
 * don't need a schema change to ship the UX.
 *
 * Supported payloads:
 *   { action: "add",    id: "<campaign-id>" }
 *   { action: "remove", id: "<campaign-id>" }
 *   { ids: ["<id-1>", "<id-2>", ...] }  // explicit reorder
 */
export async function POST(request: Request) {
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:featured-packs",
    { limit: 60, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as
    | { action?: string; id?: string; ids?: unknown }
    | null;
  if (!body) {
    return adminErrorResponse("INVALID_BODY", "Body must be JSON.", 400);
  }

  const cookieStore = await cookies();
  const current = parseHeroPacksCookie(
    cookieStore.get(HERO_PACKS_COOKIE)?.value,
  );

  let next: string[] = current.slice();

  if (Array.isArray(body.ids)) {
    next = body.ids.filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  } else if (body.action === "add" && typeof body.id === "string") {
    const id = body.id.trim();
    if (!id) {
      return adminErrorResponse(
        "FEATURED_PACK_ID_REQUIRED",
        "An id is required to add a featured pack.",
        400,
      );
    }
    if (!next.includes(id)) next = [id, ...next];
  } else if (body.action === "remove" && typeof body.id === "string") {
    const id = body.id.trim();
    next = next.filter((entry) => entry !== id);
  } else {
    return adminErrorResponse(
      "FEATURED_PACK_INVALID_ACTION",
      "Expected { action: 'add' | 'remove', id } or { ids: string[] }.",
      400,
    );
  }

  cookieStore.set(HERO_PACKS_COOKIE, JSON.stringify(next), {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });
  return Response.json({ ok: true, ids: next });
}

export async function GET(request: Request) {
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:featured-packs",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const cookieStore = await cookies();
  const ids = parseHeroPacksCookie(cookieStore.get(HERO_PACKS_COOKIE)?.value);
  return Response.json({ ok: true, ids });
}
