import { NextResponse } from "next/server";
import { isDevBypassAllowed } from "@/lib/security/dev-bypass";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Two-factor gate: NODE_ENV must be non-prod AND the explicit
  // YNOTT_ALLOW_DEV_BYPASS=true env flag must be set in the developer's
  // .env.local. Production wrangler configs never set the flag, so even if
  // NODE_ENV ever ships incorrectly, this endpoint stays closed.
  if (!isDevBypassAllowed()) {
    return NextResponse.json({ error: "Preview auth is disabled." }, { status: 404 });
  }
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const response = NextResponse.redirect(new URL(safeNext, request.url));
  if (mode === "off") {
    response.cookies.set("ynot-preview-auth", "", { path: "/", maxAge: 0 });
  } else {
    response.cookies.set("ynot-preview-auth", "1", {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
    });
  }
  return response;
}
