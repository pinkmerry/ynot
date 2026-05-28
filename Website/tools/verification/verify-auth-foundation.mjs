#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];
const passes = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function pass(label) {
  passes.push(label);
}

function fail(label) {
  failures.push(label);
}

function check(rel, label, pattern) {
  const text = read(rel);
  if (pattern.test(text)) pass(label);
  else fail(`${label} (${rel})`);
}

function notCheck(rel, label, pattern) {
  const text = read(rel);
  if (!pattern.test(text)) pass(label);
  else fail(`${label} (${rel})`);
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.dependencies?.["@supabase/ssr"]) pass("@supabase/ssr dependency is installed");
else fail("@supabase/ssr dependency is missing");

for (const rel of [
  "src/middleware.ts",
  "src/lib/supabase/proxy.ts",
  "src/lib/supabase/server.ts",
  "src/lib/supabase/client.ts",
  "src/lib/auth/profile.ts",
  "src/lib/auth/resolve-current-profile.ts",
  "src/lib/lucky-draw/session.ts",
  "src/features/auth/actions.ts",
  "src/features/auth/AuthForm.tsx",
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/signup/page.tsx",
  "src/app/auth/callback/route.ts",
  "src/app/api/auth/google/start/route.ts",
]) {
  if (exists(rel)) pass(`${rel} exists`);
  else fail(`${rel} is missing`);
}

check("src/lib/supabase/client.ts", "browser client uses createBrowserClient", /createBrowserClient<Database>/);
check("src/lib/supabase/server.ts", "server client uses createServerClient", /createServerClient<Database>/);
check("src/lib/supabase/server.ts", "server client uses getAll cookie API", /getAll\(\)\s*{[\s\S]*cookieStore\.getAll\(\)/);
check("src/lib/supabase/server.ts", "server client uses setAll cookie API", /setAll\(cookiesToSet\)/);
notCheck("src/lib/supabase/server.ts", "server client avoids deprecated individual cookie methods", /cookies:\s*{[\s\S]*(?:\bget\(|\bremove\()/);
check("src/lib/supabase/proxy.ts", "proxy refreshes Supabase session", /await supabase\.auth\.getUser\(\)/);
check("src/middleware.ts", "Cloudflare edge middleware convention is used", /export async function middleware/);
check("src/features/auth/actions.ts", "email password sign in exists", /signInWithPassword/);
check("src/features/auth/actions.ts", "email-first signup code request exists", /requestPendingSignUpCodeAction/);
check("src/app/api/auth/google/start/route.ts", "Google OAuth starts from route handler", /signInWithOAuth\([\s\S]*provider:\s*"google"/);
check("src/features/auth/actions.ts", "OAuth redirect origin uses configured production site URL", /NEXT_PUBLIC_SITE_URL[\s\S]*NODE_ENV === "production"[\s\S]*return null/);
notCheck("src/features/auth/AuthForm.tsx", "auth form does not show unsupported Apple sign in", /Apple|apple-button/);
check("src/features/auth/AuthForm.tsx", "auth form still offers Google sign in", /\/api\/auth\/google\/start[\s\S]*Continue[\s\S]*with Google/);
check("src/features/auth/AuthForm.tsx", "auth form still offers LINE sign in", /\/api\/line\/login\/start\?mode=login/);
check("src/features/auth/AuthForm.tsx", "signup initial form requests an email code", /requestPendingSignUpCodeAction[\s\S]*Send code/);
check("src/app/(auth)/signup/page.tsx", "signup page passes verification email state", /verifyEmail=\{params\?\.verifyEmail\}/);
check("src/app/(auth)/signup/page.tsx", "signup page passes password setup state", /setupEmail=\{params\?\.setupEmail\}[\s\S]*setupToken=\{params\?\.setupToken\}/);
check("src/features/auth/AuthForm.tsx", "signup form renders 6-digit verification state", /verifySignUpEmailCodeAction[\s\S]*6-digit code[\s\S]*Verify and continue/);
check("src/features/auth/AuthForm.tsx", "signup form can request a new signup code", /resendSignUpEmailCodeAction[\s\S]*Send a new code/);
check("src/features/auth/AuthForm.tsx", "signup password fields only render after setup token", /isSignupPasswordSetup[\s\S]*completeSignUpWithPasswordAction[\s\S]*<SignupPasswordFields \/>/);
check("src/features/auth/actions.ts", "signup creates auth user only after setup completion", /completeSignUpWithPasswordAction[\s\S]*auth\.admin\.createUser\(\{[\s\S]*email_confirm:\s*true/);
notCheck("src/features/auth/actions.ts", "signup no longer calls Supabase auth.signUp", /auth\.signUp\(/);
notCheck("src/features/auth/actions.ts", "signup verification no longer uses Supabase signup token type", /verifyOtp\(\{[\s\S]*type:\s*"signup"/);
notCheck("src/features/auth/actions.ts", "signup resend no longer uses Supabase signup token type", /auth\.resend\(\{[\s\S]*type:\s*"signup"/);
notCheck("src/features/auth/actions.ts", "signup action does not call passwordless OTP", /signInWithOtp/);
check("src/app/auth/callback/route.ts", "OAuth callback exchanges code for server session", /exchangeCodeForSession\(code\)/);
check("src/app/auth/callback/route.ts", "OAuth callback sanitizes next redirect path", /function safeRedirectPath\([\s\S]*value\.startsWith\("\/\/"\)[\s\S]*return `\$\{parsed\.pathname\}\$\{parsed\.search\}\$\{parsed\.hash\}`;/);
notCheck("src/app/auth/callback/route.ts", "OAuth callback rejects protocol-relative open redirects", /new URL\(next\.startsWith\("\/"\) \? next : "\/", url\.origin\)/);
check("src/lib/auth/profile.ts", "auth users bootstrap canonical profile", /auth_user_id:\s*user\.id/);
check("src/lib/auth/profile.ts", "auth identities sync to user_identities without conflict upsert", /function writeIdentityRow[\s\S]*from\("user_identities"\)[\s\S]*createAuthMergeRequest[\s\S]*from\("user_identities"\)\.insert/);
notCheck("src/lib/auth/profile.ts", "auth identity sync does not reassign conflicting identities by upsert", /from\("user_identities"\)\.upsert/);
check("src/lib/auth/resolve-current-profile.ts", "resolver supports Supabase Auth", /authSource:\s*"supabase"/);
check("src/lib/auth/resolve-current-profile.ts", "resolver detects chunked Supabase Auth cookies", /-auth-token\(\?:\\\.\\d\+\)\?\$/);
check("src/lib/auth/resolve-current-profile.ts", "resolver preserves LIFF cookie fallback", /readSessionCookie/);
check("src/lib/lucky-draw/session.ts", "site session cookie is canonical site-wide JWT", /luckyDrawSessionCookie = "ynot_session"[\s\S]*JWT_HEADER[\s\S]*alg: "HS256"[\s\S]*typ: "JWT"/);
check("src/lib/lucky-draw/session.ts", "site session cookie is httpOnly and scoped to the whole site", /sessionCookieOptions[\s\S]*httpOnly: true[\s\S]*sameSite: "lax"[\s\S]*path: "\/"[\s\S]*priority: "high"/);
check("src/lib/lucky-draw/session.ts", "legacy site session cookie is retained for clearing only", /legacyLuckyDrawSessionCookie = "lucky_draw_session"[\s\S]*sessionCookieNames/);
notCheck("src/lib/lucky-draw/session.ts", "legacy two-part session cookie is no longer accepted as active", /cookieStore\.get\(legacyLuckyDrawSessionCookie\)\?\.value/);
check("src/lib/lucky-draw/session.ts", "site session reader requires versioned payloads", /typeof parsed\.sessionVersion !== "number"[\s\S]*return null/);
check("src/lib/lucky-draw/session.ts", "site session version validation fails closed", /typeof session\.sessionVersion !== "number"[\s\S]*return false/);
check("src/features/auth/actions.ts", "password auth mints site JWT session cookie", /signInWithPasswordAction[\s\S]*setSupabaseProfileSessionCookie/);
check("src/app/auth/callback/route.ts", "OAuth callback mints site JWT session cookie", /createSessionCookieValue[\s\S]*authSource: "supabase"[\s\S]*sessionCookieOptions\(secure\)/);
check("src/app/api/line/session/route.ts", "LINE LIFF session mints site JWT session cookie", /createSessionCookieValue[\s\S]*authSource: "line"[\s\S]*sessionCookieOptions\(secure\)/);
check("src/features/auth/actions.ts", "logout clears canonical and legacy site sessions", /luckyDrawSessionCookie[\s\S]*sessionCookieClearOptions[\s\S]*legacyLuckyDrawSessionCookie[\s\S]*sessionCookieClearOptions/);
check("src/app/api/debug/whoami/route.ts", "whoami debug uses canonical Supabase auth-cookie detection", /isSupabaseAuthCookieName/);
notCheck("src/app/api/debug/whoami/route.ts", "whoami debug ignores auth-token code verifier cookies", /includes\("auth-token"\)/);
check("src/app/api/lucky-draw/route.ts", "order creation uses unified profile resolver", /resolveCurrentProfile\(\)/);
check("src/app/api/lucky-draw/admin/order/route.ts", "admin route uses unified admin resolver", /resolveAdminSession\(\)/);
notCheck("src/app/api/lucky-draw/route.ts", "order creation no longer requires LINE-only login text", /LINE login is required before creating an order/);

const allSource = [
  "src/lib/supabase/server.ts",
  "src/lib/supabase/client.ts",
  "src/lib/supabase/proxy.ts",
  "src/middleware.ts",
].map(read).join("\n");
if (!/@supabase\/auth-helpers-nextjs/.test(allSource)) pass("deprecated auth helpers are not imported");
else fail("deprecated auth helpers are imported");

console.log("Auth foundation static verification");
for (const item of passes) console.log(`PASS ${item}`);
for (const item of failures) console.log(`FAIL ${item}`);
if (failures.length) process.exit(1);
