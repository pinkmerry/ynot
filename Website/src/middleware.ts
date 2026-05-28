import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const APEX_WEBSITE_REDIRECTS = new Map([
  ["ynotopen.com", "www.ynotopen.com"],
]);

const SESSION_REFRESH_PREFIXES = [
  "/admin",
  "/collection",
  "/exchange",
  "/notifications",
  "/profile",
  "/shipping",
  "/wallet",
] as const;

const API_MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function shouldRefreshSession(pathname: string) {
  return SESSION_REFRESH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function crossOriginMutationResponse(request: NextRequest) {
  if (!API_MUTATION_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return NextResponse.json(
      { error: "Cross-origin mutation requests are not allowed." },
      { status: 403 },
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) return null;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return NextResponse.json(
      { error: "Cross-origin mutation requests are not allowed." },
      { status: 403 },
    );
  }

  if (originUrl.origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: "Cross-origin mutation requests are not allowed." },
      { status: 403 },
    );
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const redirectHost = APEX_WEBSITE_REDIRECTS.get(request.nextUrl.hostname);

  if (redirectHost) {
    const url = request.nextUrl.clone();
    url.hostname = redirectHost;
    return NextResponse.redirect(url, 308);
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const blocked = crossOriginMutationResponse(request);
    if (blocked) return blocked;
    return NextResponse.next();
  }

  if (!shouldRefreshSession(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|login|signup|ranking|auth/callback|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|css|js|map|json|txt|xml)$).*)",
  ],
};
