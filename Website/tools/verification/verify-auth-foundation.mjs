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
  "src/proxy.ts",
  "src/lib/supabase/proxy.ts",
  "src/lib/supabase/server.ts",
  "src/lib/supabase/client.ts",
  "src/lib/auth/profile.ts",
  "src/lib/auth/resolve-current-profile.ts",
  "src/features/auth/actions.ts",
  "src/features/auth/AuthForm.tsx",
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/signup/page.tsx",
  "src/app/auth/callback/route.ts",
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
check("src/proxy.ts", "Next 16 proxy convention is used", /export async function proxy/);
check("src/features/auth/actions.ts", "email password sign in exists", /signInWithPassword/);
check("src/features/auth/actions.ts", "email password sign up exists", /signUp\(/);
check("src/features/auth/actions.ts", "Google OAuth starts from server action", /signInWithOAuth\([\s\S]*provider:\s*"google"/);
check("src/features/auth/actions.ts", "OAuth redirect origin uses configured production site URL", /NEXT_PUBLIC_SITE_URL[\s\S]*NODE_ENV === "production"[\s\S]*return null/);
notCheck("src/features/auth/AuthForm.tsx", "auth form does not show unsupported Apple sign in", /Apple|apple-button/);
check("src/features/auth/AuthForm.tsx", "auth form still offers Google sign in", /signInWithGoogleAction[\s\S]*Continue[\s\S]*with Google/);
check("src/features/auth/AuthForm.tsx", "auth form still offers LINE sign in", /\/api\/line\/login\/start\?mode=login/);
check("src/features/auth/AuthForm.tsx", "auth form still offers email password account creation", /signUpWithPasswordAction[\s\S]*Create account/);
check("src/app/auth/callback/route.ts", "OAuth callback exchanges code for server session", /exchangeCodeForSession\(code\)/);
check("src/app/auth/callback/route.ts", "OAuth callback sanitizes next redirect path", /function safeRedirectPath\([\s\S]*value\.startsWith\("\/\/"\)[\s\S]*return `\$\{parsed\.pathname\}\$\{parsed\.search\}\$\{parsed\.hash\}`;/);
notCheck("src/app/auth/callback/route.ts", "OAuth callback rejects protocol-relative open redirects", /new URL\(next\.startsWith\("\/"\) \? next : "\/", url\.origin\)/);
check("src/lib/auth/profile.ts", "auth users bootstrap canonical profile", /auth_user_id:\s*user\.id/);
check("src/lib/auth/profile.ts", "auth identities sync to user_identities", /from\("user_identities"\)\.upsert/);
check("src/lib/auth/resolve-current-profile.ts", "resolver supports Supabase Auth", /authSource:\s*"supabase"/);
check("src/lib/auth/resolve-current-profile.ts", "resolver preserves LIFF cookie fallback", /readSessionCookie/);
check("src/app/api/lucky-draw/route.ts", "order creation uses unified profile resolver", /resolveCurrentProfile\(\)/);
check("src/app/api/lucky-draw/admin/order/route.ts", "admin route uses unified admin resolver", /resolveAdminSession\(\)/);
notCheck("src/app/api/lucky-draw/route.ts", "order creation no longer requires LINE-only login text", /LINE login is required before creating an order/);

const allSource = [
  "src/lib/supabase/server.ts",
  "src/lib/supabase/client.ts",
  "src/lib/supabase/proxy.ts",
  "src/proxy.ts",
].map(read).join("\n");
if (!/@supabase\/auth-helpers-nextjs/.test(allSource)) pass("deprecated auth helpers are not imported");
else fail("deprecated auth helpers are imported");

console.log("Auth foundation static verification");
for (const item of passes) console.log(`PASS ${item}`);
for (const item of failures) console.log(`FAIL ${item}`);
if (failures.length) process.exit(1);
