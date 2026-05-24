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

function shouldRefreshSession(pathname: string) {
  return SESSION_REFRESH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const redirectHost = APEX_WEBSITE_REDIRECTS.get(request.nextUrl.hostname);

  if (redirectHost) {
    const url = request.nextUrl.clone();
    url.hostname = redirectHost;
    return NextResponse.redirect(url, 308);
  }

  if (
    request.nextUrl.pathname.startsWith("/api/") ||
    !shouldRefreshSession(request.nextUrl.pathname)
  ) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|login|signup|ranking|auth/callback|api/auth|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|css|js|map|json|txt|xml)$).*)",
  ],
};
