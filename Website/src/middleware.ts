import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.hostname === "ynottcg.com") {
    const url = request.nextUrl.clone();
    url.hostname = "www.ynottcg.com";
    return NextResponse.redirect(url, 308);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|login|signup|ranking|auth/callback|api/auth|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|css|js|map|json|txt|xml)$).*)",
  ],
};
