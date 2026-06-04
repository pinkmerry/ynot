import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  GEMRATE_CERT_LOOKUP_URL,
  extractGemRateLookup,
  gemRateFindMessage,
  normalizeGrader,
} from "@/features/ynot/gemrate-cert";

export const dynamic = "force-dynamic";

type Body = { cert?: unknown; grader?: unknown };

export async function POST(request: Request) {
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:gemrate-cert",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const apiKey = process.env.GEMRATE_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GemRate API key is not configured." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const cert = typeof body?.cert === "string" ? body.cert.trim() : "";
  const grader = normalizeGrader(
    typeof body?.grader === "string" ? body.grader : "psa",
  );
  if (!cert) return Response.json({ error: "Cert number is required." }, { status: 400 });
  if (!grader) return Response.json({ error: "Grading service is required." }, { status: 400 });

  let response: Response;
  try {
    response = await fetch(GEMRATE_CERT_LOOKUP_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ grader, cert, parsed_description: true }),
    });
  } catch {
    return Response.json({ error: "Could not reach GemRate." }, { status: 502 });
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    if (response.ok) {
      return Response.json({ error: "GemRate returned an invalid response." }, { status: 502 });
    }
  }

  if (!response.ok) {
    const message = gemRateFindMessage(payload) ?? `GemRate lookup failed (${response.status}).`;
    return Response.json({ error: message }, { status: response.status === 404 ? 404 : 502 });
  }

  return Response.json({ lookup: extractGemRateLookup(payload) });
}
