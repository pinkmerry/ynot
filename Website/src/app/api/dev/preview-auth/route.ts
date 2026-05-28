import { NextResponse } from "next/server";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isDevAuthAllowed()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
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
