import "server-only";

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type PendingSignupRow =
  Database["public"]["Tables"]["pending_signup_email_codes"]["Row"];

type RequestMetadata = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type CreatePendingSignupCodeInput = RequestMetadata & {
  email: string;
};

export type CreatedPendingSignupCode = {
  email: string;
  code: string;
  expiresAt: string;
};

const CODE_TTL_MS = 10 * 60 * 1000;
const SETUP_TOKEN_TTL_MS = 15 * 60 * 1000;
const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_RESENDS_PER_WINDOW = 6;
const MAX_VERIFY_ATTEMPTS = 6;

function nowDate() {
  return new Date();
}

function addMs(date: Date, ms: number) {
  return new Date(date.getTime() + ms);
}

export function normalizeSignupEmail(email: string) {
  return email.trim().toLowerCase();
}

function signupSecret() {
  const value =
    process.env.SIGNUP_OTP_SECRET?.trim() ??
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!value) throw new Error("Missing SIGNUP_OTP_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  return value;
}

function hmacSignupValue(purpose: "code" | "setup", value: string) {
  return createHmac("sha256", signupSecret())
    .update(`${purpose}:${value}`)
    .digest("hex");
}

function safeHashMatches(
  purpose: "code" | "setup",
  value: string,
  expectedHash: string | null,
) {
  if (!expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hmacSignupValue(purpose, value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function generateSetupToken() {
  return randomBytes(32).toString("base64url");
}

async function activePendingSignupForEmail(email: string) {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("pending_signup_email_codes")
    .select("*")
    .eq("email", email)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function shouldResetResendWindow(row: PendingSignupRow, current: Date) {
  const createdAt = Date.parse(row.created_at);
  const expiresAt = Date.parse(row.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt <= current.getTime()) return true;
  if (!Number.isFinite(createdAt)) return true;
  return current.getTime() - createdAt >= RESEND_WINDOW_MS;
}

async function updatePendingSignupCodeRow({
  row,
  current,
  codeHash,
  expiresAt,
  ipAddress,
  userAgent,
}: RequestMetadata & {
  row: PendingSignupRow;
  current: Date;
  codeHash: string;
  expiresAt: string;
}) {
  const resetWindow = shouldResetResendWindow(row, current);
  const nextResendCount = resetWindow ? 1 : row.resend_count + 1;
  if (nextResendCount > MAX_RESENDS_PER_WINDOW) {
    throw new Error("SIGNUP_CODE_RESEND_LIMIT");
  }

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("pending_signup_email_codes")
    .update({
      code_hash: codeHash,
      setup_token_hash: null,
      expires_at: expiresAt,
      setup_expires_at: null,
      attempts: 0,
      resend_count: nextResendCount,
      last_sent_at: current.toISOString(),
      verified_at: null,
      created_at: resetWindow ? current.toISOString() : row.created_at,
      ip_address: ipAddress ?? row.ip_address,
      user_agent: userAgent ?? row.user_agent,
    })
    .eq("id", row.id)
    .is("consumed_at", null);

  if (error) throw error;
}

export async function createPendingSignupCode({
  email,
  ipAddress,
  userAgent,
}: CreatePendingSignupCodeInput): Promise<CreatedPendingSignupCode> {
  const normalizedEmail = normalizeSignupEmail(email);
  const current = nowDate();
  const code = generateCode();
  const expiresAt = addMs(current, CODE_TTL_MS).toISOString();
  const codeHash = hmacSignupValue("code", code);
  const existing = await activePendingSignupForEmail(normalizedEmail);
  const supabase = createServiceSupabaseClient();

  if (!existing) {
    const { error } = await supabase.from("pending_signup_email_codes").insert({
      email: normalizedEmail,
      code_hash: codeHash,
      expires_at: expiresAt,
      resend_count: 1,
      last_sent_at: current.toISOString(),
      ip_address: ipAddress ?? null,
      user_agent: userAgent ?? null,
    });

    if (error) {
      if (error.code !== "23505") throw error;
      const racedExisting = await activePendingSignupForEmail(normalizedEmail);
      if (!racedExisting) throw error;
      await updatePendingSignupCodeRow({
        row: racedExisting,
        current,
        codeHash,
        expiresAt,
        ipAddress,
        userAgent,
      });
    }
    return { email: normalizedEmail, code, expiresAt };
  }

  await updatePendingSignupCodeRow({
    row: existing,
    current,
    codeHash,
    expiresAt,
    ipAddress,
    userAgent,
  });
  return { email: normalizedEmail, code, expiresAt };
}

export async function verifyPendingSignupCode(email: string, code: string) {
  const normalizedEmail = normalizeSignupEmail(email);
  const row = await activePendingSignupForEmail(normalizedEmail);
  const supabase = createServiceSupabaseClient();
  const current = nowDate();

  if (!row || Date.parse(row.expires_at) <= current.getTime()) {
    throw new Error("SIGNUP_CODE_INVALID_OR_EXPIRED");
  }

  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    await supabase
      .from("pending_signup_email_codes")
      .update({ consumed_at: current.toISOString() })
      .eq("id", row.id)
      .is("consumed_at", null);
    throw new Error("SIGNUP_CODE_INVALID_OR_EXPIRED");
  }

  if (!safeHashMatches("code", code, row.code_hash)) {
    const attempts = row.attempts + 1;
    await supabase
      .from("pending_signup_email_codes")
      .update({
        attempts,
        consumed_at:
          attempts >= MAX_VERIFY_ATTEMPTS ? current.toISOString() : row.consumed_at,
      })
      .eq("id", row.id)
      .is("consumed_at", null);
    throw new Error("SIGNUP_CODE_INVALID_OR_EXPIRED");
  }

  const setupToken = generateSetupToken();
  const setupExpiresAt = addMs(current, SETUP_TOKEN_TTL_MS).toISOString();
  const { error } = await supabase
    .from("pending_signup_email_codes")
    .update({
      verified_at: current.toISOString(),
      setup_token_hash: hmacSignupValue("setup", setupToken),
      setup_expires_at: setupExpiresAt,
    })
    .eq("id", row.id)
    .is("consumed_at", null);

  if (error) throw error;
  return {
    email: normalizedEmail,
    setupToken,
    setupExpiresAt,
  };
}

export async function consumePendingSignupSetup(
  email: string,
  setupToken: string,
) {
  const normalizedEmail = normalizeSignupEmail(email);
  const setupTokenHash = hmacSignupValue("setup", setupToken);
  const supabase = createServiceSupabaseClient();
  const current = nowDate();
  const { data: row, error: selectError } = await supabase
    .from("pending_signup_email_codes")
    .select("*")
    .eq("email", normalizedEmail)
    .eq("setup_token_hash", setupTokenHash)
    .is("consumed_at", null)
    .maybeSingle();

  if (selectError) throw selectError;
  if (
    !row ||
    !row.verified_at ||
    !safeHashMatches("setup", setupToken, row.setup_token_hash) ||
    !row.setup_expires_at ||
    Date.parse(row.setup_expires_at) <= current.getTime()
  ) {
    throw new Error("SIGNUP_SETUP_INVALID_OR_EXPIRED");
  }

  const { data: consumed, error: updateError } = await supabase
    .from("pending_signup_email_codes")
    .update({ consumed_at: current.toISOString() })
    .eq("id", row.id)
    .eq("setup_token_hash", setupTokenHash)
    .is("consumed_at", null)
    .select("email")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!consumed) throw new Error("SIGNUP_SETUP_INVALID_OR_EXPIRED");
  return { email: consumed.email };
}
