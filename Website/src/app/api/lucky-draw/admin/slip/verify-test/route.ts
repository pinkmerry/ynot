import { getActiveDraw, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { sha256Hex } from "@/lib/slip2go/client";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

const maxTestSlipBytes = 10 * 1024 * 1024;
const allowedSlipTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function formString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function lastDigits(value: string | null | undefined, count = 4) {
  const digits = (value ?? "").replace(/\D+/g, "");
  return digits ? digits.slice(-count) : null;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return jsonNoStore({ error: "Supabase is not configured." }, { status: 503 });
  }

  const session = await resolveAdminSession();
  if (!session) {
    return jsonNoStore({ error: "Admin access is required." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonNoStore({ error: "Invalid form data." }, { status: 400 });
  }

  const slip = form.get("slip") ?? form.get("file");
  if (!(slip instanceof File) || slip.size === 0) {
    return jsonNoStore({ error: "Slip image file is required." }, { status: 400 });
  }

  if (!allowedSlipTypes.has(slip.type)) {
    return jsonNoStore({ error: "Slip must be JPG, PNG, or WEBP." }, { status: 400 });
  }

  if (slip.size > maxTestSlipBytes) {
    return jsonNoStore({ error: "Slip must be 10 MB or smaller." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const activeDraw = await getActiveDraw(supabase, {
    statuses: ["live", "closed", "draft"],
    priority: ["live", "closed", "draft"],
  });

  const fileSha256 = sha256Hex(await slip.arrayBuffer());
  const amountThb = Number(formString(form.get("amountThb")) ?? formString(form.get("amount")) ?? activeDraw?.price_thb ?? 0);
  const referenceId = `TEST-${fileSha256.slice(0, 16).toUpperCase()}`;
  const decode = `test-slip:${fileSha256}`;
  const decodedQrHash = sha256Hex(decode);
  const providerResponse: Json = {
    code: "200200",
    message: "Mock Slip2Go verification success. Dry run only.",
    data: {
      referenceId,
      decode,
      amount: String(amountThb),
      receiver: {
        bankName: activeDraw?.bank_name ?? null,
        accountName: activeDraw?.bank_account_name ?? null,
        accountLast4: lastDigits(activeDraw?.bank_account_number),
        promptPayLast4: lastDigits(activeDraw?.promptpay_id),
      },
      testMode: true,
    },
  };

  return jsonNoStore({
    ok: true,
    dryRun: true,
    databaseMutated: false,
    note: "This endpoint is for admin acceptance testing only. It does not update orders, slips, slots, or payment status.",
    file: {
      name: slip.name,
      type: slip.type,
      size: slip.size,
      sha256: fileSha256,
    },
    verification: {
      status: "valid",
      autoApprove: true,
      providerCode: "200200",
      providerMessage: "Mock Slip2Go verification success. Dry run only.",
      providerResponse,
      referenceId,
      decodedQrHash,
    },
    expectedRealOrderEffect: "A unique real Slip2Go valid response would auto-approve the order for picking.",
  });
}
