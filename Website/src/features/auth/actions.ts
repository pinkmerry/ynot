"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureProfileForUser } from "@/lib/auth/profile";
import {
  luckyDrawSessionCookie,
  readSessionCookie,
} from "@/lib/lucky-draw/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

async function lineSessionProfileId() {
  const lineSession = readSessionCookie(await cookies());
  return lineSession?.profileId ?? null;
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(
      withMessage(
        "/login",
        "error",
        error?.message ?? "Login failed.",
        nextPath,
      ),
    );
  }

  await ensureProfileForUser(data.user, await lineSessionProfileId());
  redirect(nextPath);
}

export async function signUpWithPasswordAction(formData: FormData) {
  const email = formString(formData, "email").toLowerCase();
  const password = formString(formData, "password");
  const confirmPassword = formString(formData, "confirmPassword");
  const nextPath = formNextPath(formData);

  if (!email || !password) {
    redirect(
      withMessage(
        "/signup",
        "error",
        "Email and password are required.",
        nextPath,
      ),
    );
  }

  if (!isValidSignupPassword(password)) {
    redirect(
      withMessage(
        "/signup",
        "error",
        SIGNUP_PASSWORD_ERROR,
        nextPath,
      ),
    );
  }

  if (password !== confirmPassword) {
    redirect(
      withMessage("/signup", "error", "Passwords do not match.", nextPath),
    );
  }

  const origin = await appOrigin();
  if (!origin) {
    redirect(
      withMessage(
        "/signup",
        "error",
        "NEXT_PUBLIC_SITE_URL is required before production sign up.",
        nextPath,
      ),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error || !data.user) {
    redirect(
      withMessage(
        "/signup",
        "error",
        error?.message ?? "Sign up failed.",
        nextPath,
      ),
    );
  }

  if (!data.session) {
    redirect(
      withSignupCodeMessage(
        email,
        "message",
        "Enter the 6-digit code we sent to your email to finish creating your account.",
        nextPath,
      ),
    );
  }

  await ensureProfileForUser(data.user, await lineSessionProfileId());
  redirect(nextPath);
}

export async function verifySignUpEmailCodeAction(formData: FormData) {
  const email = formString(formData, "email").toLowerCase();
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "signup",
  });

  if (error || !data.user) {
    redirect(
      withSignupCodeMessage(
        email,
        "error",
        error?.message ?? "Code is invalid or expired.",
        nextPath,
      ),
    );
  }

  await ensureProfileForUser(data.user, await lineSessionProfileId());
  redirect(nextPath);
}

export async function resendSignUpEmailCodeAction(formData: FormData) {
  const email = formString(formData, "email").toLowerCase();
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

  const origin = await appOrigin();
  if (!origin) {
    redirect(
      withSignupCodeMessage(
        email,
        "error",
        "NEXT_PUBLIC_SITE_URL is required before production sign up.",
        nextPath,
      ),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error) {
    redirect(withSignupCodeMessage(email, "error", error.message, nextPath));
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
    redirect(
      withMessage(
        "/login",
        "error",
        error?.message ?? "Google login could not start.",
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
  cookieStore.set(luckyDrawSessionCookie, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  redirect(withMessage("/login", "message", "You have signed out."));
}
