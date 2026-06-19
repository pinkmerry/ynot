import "server-only";

import { createHmac } from "node:crypto";

import { dedicatedActionTokenSecret } from "@/lib/security/action-token-secret";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const PAYMENT_METHOD_ACTION_TOKEN_RE = /^pm_[A-Za-z0-9_-]{43}$/;

function paymentMethodActionTokenSecret() {
  return dedicatedActionTokenSecret("YNOT_PAYMENT_METHOD_ACTION_TOKEN_SECRET");
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
