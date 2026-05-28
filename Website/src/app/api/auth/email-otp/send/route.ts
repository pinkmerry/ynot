import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  let payload: { email?: unknown; purpose?: unknown };
  try {
    payload = (await request.json()) as { email?: unknown; purpose?: unknown };
  } catch {
    return jsonNoStore({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const purpose = typeof payload.purpose === "string" ? payload.purpose : "verify_email";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return jsonNoStore({ error: "Please enter a valid email." }, { status: 400 });
  }
  if (purpose !== "verify_email" && purpose !== "link_identity") {
    return jsonNoStore({ error: "Unsupported purpose." }, { status: 400 });
  }

  const session = await resolveCurrentProfile();
  const subject = session?.profileId ?? `email:${email}`;
  const limited = await enforceRateLimit(request, "auth:email-otp:send", { limit: 5, windowMs: 60_000 }, subject);
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    // Log the real provider message for ops; respond with a generic message
    // so we don't enumerate account state or rate-limit details.
    console.warn(
      "email_otp_send_provider_error",
      error.message ?? "unknown",
    );
    return jsonNoStore(
      { error: "Could not send code. Please try again in a moment." },
      { status: 400 },
    );
  }

  return jsonNoStore({ sent: true, email });
}
