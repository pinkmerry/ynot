#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const repoRoot = path.resolve(root, "..");
const failures = [];
const passes = [];

function readProject(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function readRepo(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function pass(label) {
  passes.push(label);
}

function fail(label) {
  failures.push(label);
}

function includes(text, snippet, label) {
  if (text.includes(snippet)) pass(label);
  else fail(label);
}

function matches(text, pattern, label) {
  if (pattern.test(text)) pass(label);
  else fail(label);
}

function notMatches(text, pattern, label) {
  if (!pattern.test(text)) pass(label);
  else fail(label);
}

const actions = readProject("src/features/auth/actions.ts");
const authForm = readProject("src/features/auth/AuthForm.tsx");
const pending = readProject("src/features/auth/pending-signup.ts");
const sender = readProject("src/lib/email/send-signup-code.ts");
const passwordPolicy = readProject("src/features/auth/password-policy.ts");
const types = readProject("src/lib/supabase/types.ts");
const migration = readRepo(
  "Database/supabase/migrations/20260522080000_pending_signup_email_codes.sql",
);

includes(migration, "create table if not exists public.pending_signup_email_codes", "pending signup table migration exists");
includes(migration, "code_hash text not null", "pending signup stores code hash only");
includes(migration, "setup_token_hash text", "pending signup stores setup token hash only");
includes(migration, "where consumed_at is null", "pending signup active-row uniqueness is scoped to unconsumed rows");
includes(migration, "alter table public.pending_signup_email_codes enable row level security", "pending signup table has RLS enabled");
includes(migration, "grant select, insert, update, delete on table public.pending_signup_email_codes to service_role", "pending signup table grants service role only");
includes(migration, "purge_expired_pending_signup_email_codes", "pending signup cleanup function exists");

includes(types, "pending_signup_email_codes", "Supabase types include pending signup table");

includes(pending, "import \"server-only\"", "pending signup helper is server-only");
includes(pending, "createHmac", "pending signup helper hashes codes/tokens with HMAC");
includes(pending, "timingSafeEqual", "pending signup helper uses timing-safe hash comparison");
includes(pending, "randomInt(0, 1_000_000)", "pending signup code is 6-digit random");
includes(pending, "randomBytes(32)", "pending signup setup token is random");
includes(pending, "MAX_VERIFY_ATTEMPTS", "pending signup helper enforces attempt limits");
includes(pending, "MAX_RESENDS_PER_WINDOW", "pending signup helper enforces resend limits");

includes(sender, "import \"server-only\"", "signup email sender is server-only");
includes(sender, "https://api.resend.com/emails", "signup email sender uses Resend HTTP endpoint");
includes(sender, "RESEND_API_KEY", "signup email sender requires Resend API key in resend mode");
includes(sender, "SIGNUP_EMAIL_FROM", "signup email sender requires a configured from address");
includes(sender, "process.env.NODE_ENV === \"production\" ? \"resend\" : \"mock\"", "signup email sender defaults production to resend and local to mock");

matches(actions, /requestPendingSignUpCodeAction[\s\S]*createPendingSignupCode[\s\S]*sendSignupCodeEmail/, "signup first step writes pending code and sends email");
matches(actions, /verifySignUpEmailCodeAction[\s\S]*verifyPendingSignupCode[\s\S]*withSignupSetupMessage/, "signup verify step uses app-owned code then setup token");
matches(actions, /completeSignUpWithPasswordAction[\s\S]*consumePendingSignupSetup[\s\S]*auth\.admin\.createUser\(\{[\s\S]*email_confirm:\s*true/, "signup completion consumes setup token before confirmed auth user creation");
matches(actions, /completeSignUpWithPasswordAction[\s\S]*signInWithPassword[\s\S]*ensureProfileForUser/, "signup completion signs in and bootstraps profile after auth creation");
notMatches(actions, /auth\.signUp\(/, "signup flow does not call Supabase auth.signUp");
notMatches(actions, /verifyOtp\(\{[\s\S]*type:\s*"signup"/, "signup flow does not call Supabase signup verifyOtp");
notMatches(actions, /auth\.resend\(\{[\s\S]*type:\s*"signup"/, "signup flow does not call Supabase signup resend");
notMatches(actions, /signInWithOtp/, "signup flow does not call passwordless OTP");

matches(authForm, /requestPendingSignUpCodeAction[\s\S]*Send code/, "signup UI starts with email-only code request");
matches(authForm, /isSignupPasswordSetup[\s\S]*completeSignUpWithPasswordAction[\s\S]*<SignupPasswordFields \/>/, "signup UI renders password fields only after setup token");
matches(authForm, /verifySignUpEmailCodeAction[\s\S]*autoComplete="one-time-code"/, "signup UI supports 6-digit one-time code entry");

includes(passwordPolicy, "SIGNUP_PASSWORD_MIN_LENGTH = 8", "signup password minimum is 8");
includes(passwordPolicy, "at least 8 characters and include at least one number and one special character", "signup password error copy says 8 plus number and special");

console.log("Signup pending-flow static verification");
for (const item of passes) console.log(`PASS ${item}`);
for (const item of failures) console.log(`FAIL ${item}`);
if (failures.length) process.exit(1);
