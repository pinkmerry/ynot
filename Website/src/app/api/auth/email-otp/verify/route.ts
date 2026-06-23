import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureProfileForUser } from "@/lib/auth/profile";
import { resolveEmailAnchor } from "@/lib/auth/identity-merge";
import {
  createSessionCookieValue,
  fetchSessionVersion,
  legacyLuckyDrawSessionCookie,
  luckyDrawSessionCookie,
  readSessionCookie,
  sessionCookieClearOptions,
  sessionCookieOptions,
} from "@/lib/lucky-draw/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { shouldUseSecureCookies } from "@/lib/security/cookies";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  let payload: { email?: unknown; code?: unknown };
  try {
    payload = (await request.json()) as { email?: unknown; code?: unknown };
  } catch {
    return jsonNoStore({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  if (!EMAIL_RE.test(email) || !CODE_RE.test(code)) {
    return jsonNoStore({ error: "Please enter the 6-digit code sent to your email." }, { status: 400 });
  }

  const limited = await enforceRateLimit(request, "auth:email-otp:verify", { limit: 10, windowMs: 60_000 }, `email:${email}`);
  if (limited) return limited;

  // Capture the LINE-only session BEFORE Supabase verify writes a new cookie,
  // so we can request identity linking against that profile without moving
  // wallet/ledger/order data.
  const cookieStore = await cookies();
  const lineSessionProfileId = readSessionCookie(cookieStore)?.profileId ?? null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    if (error) {
      console.warn("email_otp_verify_provider_error", error.message ?? "unknown");
    }
    return jsonNoStore({ error: "Code is invalid or expired." }, { status: 400 });
  }

  const supabaseUser = data.user;
  // ensureProfileForUser handles auth-user-id-first, then verified-email fallback.
  // We pass the LINE session profile as a hint so a freshly-linked auth user
  // adopts that profile when no other profile owns the email.
  const profile = await ensureProfileForUser(supabaseUser, lineSessionProfileId ?? undefined);

  // If another active profile already owns this verified email, never merge
  // account data. Create an identity review request for admin approval.
  const outcome = await resolveEmailAnchor(profile.id, email, "verified_email_anchor");

  const response = jsonNoStore({
    identityReviewRequired: outcome.kind === "review_required",
    // Friendly copy the client can surface verbatim without re-mapping the
    // outcome kind. Null when no review is needed so the client can branch on
    // truthiness instead of having to interpret a status string.
    identityReviewMessage:
      outcome.kind === "review_required"
        ? "We need to review this sign-in before linking it to your account. You can keep using your current login while support reviews it."
        : null,
  });
  const secure = shouldUseSecureCookies(request);
  const sessionVersion = await fetchSessionVersion(profile.id);
  const sessionCookie = createSessionCookieValue({
    profileId: profile.id,
    authSource: "supabase",
    authUserId: supabaseUser.id,
    lineUserId: profile.line_user_id ?? undefined,
    displayName: profile.display_name ?? profile.line_display_name ?? supabaseUser.email ?? "YNot Customer",
    sessionVersion,
  });

  if (sessionCookie) {
    response.cookies.set(
      luckyDrawSessionCookie,
      sessionCookie,
      sessionCookieOptions(secure),
    );
  }
  response.cookies.set(legacyLuckyDrawSessionCookie, "", sessionCookieClearOptions(secure));

  return response;
}
