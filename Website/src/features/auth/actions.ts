"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureProfileForUser } from "@/lib/auth/profile";
import { sendSignupCodeEmail } from "@/lib/email/send-signup-code";
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
import {
  createServiceSupabaseClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import {
  consumePendingSignupSetup,
  createPendingSignupCode,
  normalizeSignupEmail,
  verifyPendingSignupCode,
} from "./pending-signup";
import { isValidSignupPassword, SIGNUP_PASSWORD_ERROR } from "./password-policy";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNUP_CODE_RE = /^\d{6}$/;

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeNextPath(value: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const base = new URL("https://ynot.local");
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function formNextPath(formData: FormData) {
  return safeNextPath(formString(formData, "next"));
}

async function appOrigin() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSiteUrl) {
    try {
      return new URL(configuredSiteUrl).origin;
    } catch {
      return null;
    }
  }

  if (process.env.NODE_ENV === "production") return null;

  const headerStore = await headers();
  return headerStore.get("origin") ?? "http://localhost:3005";
}

function withMessage(
  path: string,
  key: "error" | "message",
  value: string,
  nextPath = "/",
) {
  const params = new URLSearchParams({ [key]: value });
  if (nextPath !== "/") params.set("next", nextPath);
  return `${path}?${params.toString()}`;
}

function withSignupCodeMessage(
  email: string,
  key: "error" | "message",
  value: string,
  nextPath = "/",
) {
  const params = new URLSearchParams({
    verifyEmail: email,
    [key]: value,
  });
  if (nextPath !== "/") params.set("next", nextPath);
  return `/signup?${params.toString()}`;
}

function withSignupSetupMessage(
  email: string,
  setupToken: string,
  key: "error" | "message",
  value: string,
  nextPath = "/",
) {
  const params = new URLSearchParams({
    setupEmail: email,
    setupToken,
    [key]: value,
  });
  if (nextPath !== "/") params.set("next", nextPath);
  return `/signup?${params.toString()}`;
}

async function authRequestMetadata() {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress:
      headerStore.get("cf-connecting-ip") ??
      headerStore.get("x-real-ip") ??
      forwardedFor ??
      null,
    userAgent: headerStore.get("user-agent"),
  };
}

async function authRateLimitError(
  scope: string,
  subject: string,
  unavailableMessage: string,
) {
  const metadata = await authRequestMetadata();
  const request = new Request("https://ynot.local/auth", {
    headers: {
      ...(metadata.ipAddress ? { "x-forwarded-for": metadata.ipAddress } : {}),
      ...(metadata.userAgent ? { "user-agent": metadata.userAgent } : {}),
    },
  });
  const limited = await enforceRateLimit(
    request,
    scope,
    {
      limit: 6,
      windowMs: 10 * 60 * 1000,
    },
    subject,
  );

  if (!limited) return null;
  if (limited.status === 429) {
    return "Too many requests. Please wait and try again.";
  }
  return unavailableMessage;
}

function logAuthServerError(event: string, error: unknown) {
  console.error(event, {
    message: error instanceof Error ? error.message : String(error),
  });
}

function isExistingAuthUserError(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("already") ||
    message.includes("registered") ||
    message.includes("exists")
  );
}

async function lineSessionProfileId() {
  const lineSession = readSessionCookie(await cookies());
  return lineSession?.profileId ?? null;
}

async function setSupabaseProfileSessionCookie(
  profile: Awaited<ReturnType<typeof ensureProfileForUser>>,
  authUserId: string,
  email?: string | null,
) {
  const sessionVersion = await fetchSessionVersion(profile.id);
  const sessionCookie = createSessionCookieValue({
    profileId: profile.id,
    authSource: "supabase",
    authUserId,
    lineUserId: profile.line_user_id ?? undefined,
    displayName: profile.display_name ?? profile.line_display_name ?? email ?? "YNot Customer",
    sessionVersion,
  });
  if (!sessionCookie) return;

  const cookieStore = await cookies();
  const secure = shouldUseSecureCookies();
  cookieStore.set(luckyDrawSessionCookie, sessionCookie, sessionCookieOptions(secure));
  cookieStore.set(legacyLuckyDrawSessionCookie, "", sessionCookieClearOptions(secure));
}

export async function signInWithPasswordAction(formData: FormData) {
  const email = formString(formData, "email").toLowerCase();
  const password = formString(formData, "password");
  const nextPath = formNextPath(formData);

  if (!email || !password) {
    redirect(
      withMessage(
        "/login",
        "error",
        "Email and password are required.",
        nextPath,
      ),
    );
  }

  const rateLimitError = await authRateLimitError(
    "ynot:auth:password",
    email,
    "Login is temporarily unavailable. Please try again later.",
  );
  if (rateLimitError) {
    redirect(withMessage("/login", "error", rateLimitError, nextPath));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    if (error) logAuthServerError("password_sign_in_failed", error);
    redirect(
      withMessage(
        "/login",
        "error",
        "Email or password is incorrect.",
        nextPath,
      ),
    );
  }

  const profile = await ensureProfileForUser(data.user, await lineSessionProfileId());
  await setSupabaseProfileSessionCookie(profile, data.user.id, data.user.email);
  redirect(nextPath);
}

export async function requestPendingSignUpCodeAction(formData: FormData) {
  const email = normalizeSignupEmail(formString(formData, "email"));
  const nextPath = formNextPath(formData);

  if (!EMAIL_RE.test(email)) {
    redirect(
      withMessage(
        "/signup",
        "error",
        "Please enter a valid email before requesting a code.",
        nextPath,
      ),
    );
  }

  const rateLimitError = await authRateLimitError(
    "ynot:signup:request",
    email,
    "Sign up is temporarily unavailable. Please try again later.",
  );
  if (rateLimitError) {
    redirect(withMessage("/signup", "error", rateLimitError, nextPath));
  }

  try {
    const metadata = await authRequestMetadata();
    const pending = await createPendingSignupCode({
      email,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    await sendSignupCodeEmail({ email: pending.email, code: pending.code });
  } catch (error) {
    logAuthServerError("signup_code_request_failed", error);
    const message =
      error instanceof Error && error.message === "SIGNUP_CODE_RESEND_LIMIT"
        ? "Too many codes requested. Please wait and try again."
        : "We could not send the sign up code right now. Please try again later.";
    redirect(withMessage("/signup", "error", message, nextPath));
  }

  redirect(
    withSignupCodeMessage(
      email,
      "message",
      "Enter the 6-digit code we sent to your email to continue.",
      nextPath,
    ),
  );
}

export async function verifySignUpEmailCodeAction(formData: FormData) {
  const email = normalizeSignupEmail(formString(formData, "email"));
  const code = formString(formData, "code");
  const nextPath = formNextPath(formData);

  if (!EMAIL_RE.test(email) || !SIGNUP_CODE_RE.test(code)) {
    redirect(
      withSignupCodeMessage(
        email,
        "error",
        "Please enter the 6-digit code sent to your email.",
        nextPath,
      ),
    );
  }

  const rateLimitError = await authRateLimitError(
    "ynot:signup:verify",
    email,
    "Sign up is temporarily unavailable. Please try again later.",
  );
  if (rateLimitError) {
    redirect(withSignupCodeMessage(email, "error", rateLimitError, nextPath));
  }

  let setup: Awaited<ReturnType<typeof verifyPendingSignupCode>>;
  try {
    setup = await verifyPendingSignupCode(email, code);
  } catch (error) {
    logAuthServerError("signup_code_verify_failed", error);
    redirect(
      withSignupCodeMessage(
        email,
        "error",
        "Code is invalid or expired. Request a new code if needed.",
        nextPath,
      ),
    );
  }

  redirect(
    withSignupSetupMessage(
      setup.email,
      setup.setupToken,
      "message",
      "Email verified. Create your password to finish your account.",
      nextPath,
    ),
  );
}

export async function resendSignUpEmailCodeAction(formData: FormData) {
  const email = normalizeSignupEmail(formString(formData, "email"));
  const nextPath = formNextPath(formData);

  if (!EMAIL_RE.test(email)) {
    redirect(
      withSignupCodeMessage(
        email,
        "error",
        "Please enter a valid email before requesting a new code.",
        nextPath,
      ),
    );
  }

  const rateLimitError = await authRateLimitError(
    "ynot:signup:resend",
    email,
    "Sign up is temporarily unavailable. Please try again later.",
  );
  if (rateLimitError) {
    redirect(withSignupCodeMessage(email, "error", rateLimitError, nextPath));
  }

  try {
    const metadata = await authRequestMetadata();
    const pending = await createPendingSignupCode({
      email,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    await sendSignupCodeEmail({ email: pending.email, code: pending.code });
  } catch (error) {
    logAuthServerError("signup_code_resend_failed", error);
    const message =
      error instanceof Error && error.message === "SIGNUP_CODE_RESEND_LIMIT"
        ? "Too many codes requested. Please wait and try again."
        : "We could not send a new code right now. Please try again later.";
    redirect(withSignupCodeMessage(email, "error", message, nextPath));
  }

  redirect(
    withSignupCodeMessage(
      email,
      "message",
      "We sent a new 6-digit code to your email.",
      nextPath,
    ),
  );
}

export async function completeSignUpWithPasswordAction(formData: FormData) {
  const email = normalizeSignupEmail(formString(formData, "email"));
  const setupToken = formString(formData, "setupToken");
  const password = formString(formData, "password");
  const confirmPassword = formString(formData, "confirmPassword");
  const nextPath = formNextPath(formData);

  if (!EMAIL_RE.test(email) || !setupToken) {
    redirect(
      withMessage(
        "/signup",
        "error",
        "Sign up setup expired. Request a new code to continue.",
        nextPath,
      ),
    );
  }

  if (!isValidSignupPassword(password)) {
    redirect(
      withSignupSetupMessage(
        email,
        setupToken,
        "error",
        SIGNUP_PASSWORD_ERROR,
        nextPath,
      ),
    );
  }

  if (password !== confirmPassword) {
    redirect(
      withSignupSetupMessage(
        email,
        setupToken,
        "error",
        "Passwords do not match.",
        nextPath,
      ),
    );
  }

  let verifiedEmail: string;
  try {
    const consumed = await consumePendingSignupSetup(email, setupToken);
    verifiedEmail = consumed.email;
  } catch (error) {
    logAuthServerError("signup_setup_consume_failed", error);
    redirect(
      withMessage(
        "/signup",
        "error",
        "Sign up setup expired. Request a new code to continue.",
        nextPath,
      ),
    );
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { error: createError } = await serviceSupabase.auth.admin.createUser({
    email: verifiedEmail,
    password,
    email_confirm: true,
  });

  if (createError) {
    logAuthServerError("signup_admin_create_failed", createError);
    if (isExistingAuthUserError(createError)) {
      redirect(
        withMessage(
          "/login",
          "message",
          "This email already has an account. Log in with your password or continue with Google.",
          nextPath,
        ),
      );
    }
    redirect(
      withMessage(
        "/signup",
        "error",
        "Account could not be created. Request a new code and try again.",
        nextPath,
      ),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email: verifiedEmail,
    password,
  });

  if (signInError || !data.user) {
    redirect(
      withMessage(
        "/login",
        "message",
        "Account created. Log in with your password to continue.",
        nextPath,
      ),
    );
  }

  try {
    const profile = await ensureProfileForUser(data.user, await lineSessionProfileId());
    await setSupabaseProfileSessionCookie(profile, data.user.id, data.user.email);
  } catch (error) {
    logAuthServerError("signup_profile_bootstrap_failed", error);
    redirect(
      withMessage(
        "/login",
        "message",
        "Account created. Log in with your password to continue.",
        nextPath,
      ),
    );
  }

  redirect(nextPath);
}

export async function signInWithGoogleAction(formData: FormData) {
  const nextPath = formNextPath(formData);
  const origin = await appOrigin();
  if (!origin) {
    redirect(
      withMessage(
        "/login",
        "error",
        "NEXT_PUBLIC_SITE_URL is required before production Google login.",
        nextPath,
      ),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error || !data.url) {
    if (error) logAuthServerError("google_sign_in_start_failed", error);
    redirect(
      withMessage(
        "/login",
        "error",
        "Google login could not start. Please try again.",
        nextPath,
      ),
    );
  }

  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  const secure = shouldUseSecureCookies();
  cookieStore.set(luckyDrawSessionCookie, "", sessionCookieClearOptions(secure));
  cookieStore.set(legacyLuckyDrawSessionCookie, "", sessionCookieClearOptions(secure));
  redirect(withMessage("/login", "message", "You have signed out."));
}
