import "server-only";

import { createHmac } from "node:crypto";

import { createServiceSupabaseClient } from "@/lib/supabase/server";

const PAYMENT_METHOD_ACTION_TOKEN_RE = /^pm_[A-Za-z0-9_-]{43}$/;
const PAYMENT_METHOD_ACTION_TOKEN_SECRET_ENV_KEYS = [
  "YNOT_PAYMENT_METHOD_ACTION_TOKEN_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

function paymentMethodActionTokenSecret() {
  for (const key of PAYMENT_METHOD_ACTION_TOKEN_SECRET_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  throw new Error("Missing server-only payment method action token secret.");
}

async function paymentMethodTokenSignature(paymentMethodId: string) {
  return createHmac("sha256", paymentMethodActionTokenSecret())
    .update(paymentMethodId)
    .digest("base64url");
}

export async function paymentMethodActionToken(paymentMethodId: string) {
  const signature = await paymentMethodTokenSignature(paymentMethodId);
  return `pm_${signature}`;
}

export function isPaymentMethodActionToken(value: string) {
  return PAYMENT_METHOD_ACTION_TOKEN_RE.test(value);
}

export async function resolvePaymentMethodActionToken(token: string) {
  if (!isPaymentMethodActionToken(token)) return null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id")
    .eq("is_active", true);
  if (error) throw error;

  for (const paymentMethod of data ?? []) {
    if ((await paymentMethodActionToken(paymentMethod.id)) === token) {
      return paymentMethod.id;
    }
  }
  return null;
}
