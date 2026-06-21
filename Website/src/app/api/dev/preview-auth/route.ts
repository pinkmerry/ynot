import { NextResponse } from "next/server";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import {
  LOCAL_PREVIEW_SOLD_STATE_COOKIE,
  clearPreviewRewardsForProfile,
} from "@/features/ynot/local-preview-rewards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isDevAuthAllowed()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const reset = url.searchParams.get("reset");
  const soldState = url.searchParams.get("sold");
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const response = NextResponse.redirect(new URL(safeNext, request.url));
  if (mode === "off") {
    clearPreviewRewardsForProfile();
    response.cookies.set("ynot-preview-auth", "", { path: "/", maxAge: 0 });
    response.cookies.set(LOCAL_PREVIEW_SOLD_STATE_COOKIE, "", {
      path: "/",
      maxAge: 0,
    });
  } else {
    if (reset === "1") clearPreviewRewardsForProfile();
    response.cookies.set("ynot-preview-auth", "1", {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
    });
    if (soldState === "after60") {
      response.cookies.set(LOCAL_PREVIEW_SOLD_STATE_COOKIE, "after60", {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
      });
    } else if (reset === "1") {
      response.cookies.set(LOCAL_PREVIEW_SOLD_STATE_COOKIE, "", {
        path: "/",
        maxAge: 0,
      });
    }
  }
  return response;
}
