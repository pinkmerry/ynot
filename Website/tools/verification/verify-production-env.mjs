#!/usr/bin/env node
// Pre-launch env sanity check. Run against the *resolved* environment that
// production will see (e.g. via `wrangler secret list` plus the wrangler.jsonc
// vars block, or your CI's production env dump).
//
// Usage:
//   YNOT_ENV=production node tools/verification/verify-production-env.mjs
//
// Exits 1 if any required secret/var is missing, fails a sanity check, or any
// dev-only flag is still set in production.

const REQUIRED_SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "LINE_LOGIN_CHANNEL_SECRET",
  "LINE_SESSION_SECRET",
  "SLIP2GO_SECRET_KEY",
  "RESEND_API_KEY",
];

const DEDICATED_CUSTOMER_TOKEN_SECRETS = [
  "SIGNUP_OTP_SECRET",
  "YNOT_IDENTITY_ACTION_TOKEN_SECRET",
  "YNOT_COLLECTION_ACTION_TOKEN_SECRET",
  "YNOT_ADDRESS_ACTION_TOKEN_SECRET",
  "YNOT_PAYMENT_METHOD_ACTION_TOKEN_SECRET",
];

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "LINE_LOGIN_CHANNEL_ID",
  "RATE_LIMIT_BACKEND",
  "SLIP2GO_API_URL",
];

const FORBIDDEN_IN_PRODUCTION = [
  "YNOT_ENABLE_DEV_AUTH",
  "RATE_LIMIT_ALLOW_IN_MEMORY_PRODUCTION",
];

const failures = [];

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function check(name, condition, detail) {
  if (condition) pass(name);
  else fail(`${name}${detail ? ` — ${detail}` : ""}`);
}

const env = process.env;
const isProd = (env.YNOT_ENV ?? env.NODE_ENV) === "production";

if (!isProd) {
  console.warn(
    "verify-production-env: not running in production mode (YNOT_ENV or NODE_ENV != production). " +
      "Will still report missing required values but skip the forbidden-flag checks.",
  );
}

for (const name of [...REQUIRED_SECRETS, ...DEDICATED_CUSTOMER_TOKEN_SECRETS]) {
  check(`secret ${name} is set`, Boolean(env[name]?.length), "secret missing");
}

for (const name of REQUIRED_VARS) {
  check(`var ${name} is set`, Boolean(env[name]?.length), "var missing");
}

// Specific value checks
if (env.NEXT_PUBLIC_SITE_URL) {
  let urlOk = false;
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL);
    urlOk = url.protocol === "https:";
  } catch {
    urlOk = false;
  }
  check(
    "NEXT_PUBLIC_SITE_URL is https",
    urlOk,
    "must be a parseable https:// URL",
  );
}

if (env.NEXT_PUBLIC_SUPABASE_URL) {
  check(
    "NEXT_PUBLIC_SUPABASE_URL is supabase.co",
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL),
    "must match https://<ref>.supabase.co",
  );
}

if (env.RATE_LIMIT_BACKEND) {
  check(
    "RATE_LIMIT_BACKEND = supabase",
    env.RATE_LIMIT_BACKEND.trim().toLowerCase() === "supabase",
    "in-memory rate limit is unsafe in production (per-Worker, not shared)",
  );
}

if (env.SLIP2GO_API_URL) {
  let hostOk = false;
  try {
    hostOk = new URL(env.SLIP2GO_API_URL).hostname === "connect.slip2go.com";
  } catch {
    hostOk = false;
  }
  check(
    "SLIP2GO_API_URL points to connect.slip2go.com",
    hostOk,
    "non-allowlisted host would be rejected by the client allowlist",
  );
}

if (env.LINE_SESSION_SECRET) {
  check(
    "LINE_SESSION_SECRET length >= 32 chars",
    env.LINE_SESSION_SECRET.length >= 32,
    "use at least 32 random characters (openssl rand -base64 32)",
  );
  check(
    "LINE_SESSION_SECRET is not the dev placeholder",
    env.LINE_SESSION_SECRET !== "dev-local-lucky-draw-session-secret",
    "rotate immediately — this is the literal dev fallback",
  );
}

for (const name of DEDICATED_CUSTOMER_TOKEN_SECRETS) {
  const value = env[name];
  if (!value) continue;

  check(
    `${name} length >= 32 chars`,
    value.length >= 32,
    "use at least 32 random characters (openssl rand -base64 32)",
  );

  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    check(
      `${name} is separate from SUPABASE_SERVICE_ROLE_KEY`,
      value !== env.SUPABASE_SERVICE_ROLE_KEY,
      "must not share the service-role blast radius",
    );
  }
}

if (isProd) {
  for (const name of FORBIDDEN_IN_PRODUCTION) {
    check(
      `flag ${name} is NOT set in production`,
      !env[name]?.length,
      "must be unset on production deployments",
    );
  }
  check(
    "NODE_ENV is production",
    env.NODE_ENV === "production",
    "all dev-auth bypasses key off NODE_ENV; a missing or wrong value re-enables them",
  );

  // Security alerts: at least one delivery channel should be wired in
  // production so sensitive admin events aren't only in the audit table.
  const hasEmail = Boolean(env.YNOT_SECURITY_ALERT_EMAIL?.length);
  const hasWebhook = Boolean(env.YNOT_SECURITY_ALERT_WEBHOOK?.length);
  check(
    "at least one security alert channel is configured",
    hasEmail || hasWebhook,
    "set YNOT_SECURITY_ALERT_EMAIL and/or YNOT_SECURITY_ALERT_WEBHOOK",
  );
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll checks passed.`);
