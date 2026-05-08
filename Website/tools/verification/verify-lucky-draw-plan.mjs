#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
const srcDir = path.join(root, "src");
const args = new Set(process.argv.slice(2));
const strictShell = args.has("--strict-shell");
const baseUrlArg = process.argv.find((arg) => arg.startsWith("--base-url="));
const baseUrl = baseUrlArg?.slice("--base-url=".length).replace(/\/$/, "");

const hardFailures = [];
const warnings = [];
const passes = [];
const infos = [];

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function exists(file) {
  return fs.existsSync(file);
}

function walk(dir) {
  if (!exists(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".git"].includes(entry.name)) return [];
      return walk(full);
    }
    return [full];
  });
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function matchesInFile(file, regex) {
  const text = read(file);
  return [...text.matchAll(regex)].map((match) => ({ file, line: lineNumber(text, match.index ?? 0), match: match[0] }));
}

function isClientFile(file) {
  const text = read(file).trimStart();
  return text.startsWith('"use client"') || text.startsWith("'use client'");
}

function pushPass(message) {
  passes.push(message);
}

function pushFail(message) {
  hardFailures.push(message);
}

function pushWarn(message) {
  warnings.push(message);
}

const sourceFiles = walk(srcDir).filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file));
const clientFiles = sourceFiles.filter(isClientFile);

function checkServerSecrets() {
  const secretPattern = /\b(SUPABASE_SERVICE_ROLE_KEY|SLIP2GO_SECRET_KEY|LINE_SESSION_SECRET|LINE_CHANNEL_SECRET|LINE_MESSAGING_API_ACCESS_TOKEN)\b/g;
  const clientSecretHits = clientFiles.flatMap((file) => matchesInFile(file, secretPattern));
  if (clientSecretHits.length) {
    pushFail(`server secrets referenced from client files: ${clientSecretHits.map((hit) => `${rel(hit.file)}:${hit.line}`).join(", ")}`);
  } else {
    pushPass("server secret env names are absent from client components");
  }

  const bannedImportPattern = /from\s+["'](@\/lib\/(supabase\/server|slip2go\/client)|\.\.?\/.*(supabase\/server|slip2go\/client))["']/g;
  const bannedImports = clientFiles.flatMap((file) => matchesInFile(file, bannedImportPattern));
  if (bannedImports.length) {
    pushFail(`client imports server-only helpers: ${bannedImports.map((hit) => `${rel(hit.file)}:${hit.line}`).join(", ")}`);
  } else {
    pushPass("client files do not import supabase/server or slip2go/client");
  }
}

function checkRealtimeSubscriptions() {
  const hits = sourceFiles.flatMap((file) => matchesInFile(file, /postgres_changes/g));
  if (!hits.length) {
    pushWarn("no postgres_changes subscription found; verify realtime hook/shell has not been removed accidentally");
    return;
  }

  const rawTables = new Set(["orders", "payment_slips", "profiles", "admin_users", "draw_slots", "payment_qr_codes"]);
  let invalid = [];
  let sensitive = [];

  for (const hit of hits) {
    const text = read(hit.file);
    const lines = text.split("\n");
    const start = Math.max(0, hit.line - 8);
    const end = Math.min(lines.length, hit.line + 8);
    const context = lines.slice(start, end).join("\n");
    const tableMatch = context.match(/table\s*:\s*["']([^"']+)["']/);
    const table = tableMatch?.[1];
    if (!["lucky_draw_realtime_events", "app_realtime_events"].includes(table ?? "")) invalid.push(`${rel(hit.file)}:${hit.line}${table ? ` table=${table}` : " table=unknown"}`);
    for (const sensitiveTable of rawTables) {
      if (new RegExp(`table\\s*:\\s*["']${sensitiveTable}["']`).test(context)) sensitive.push(`${rel(hit.file)}:${hit.line} table=${sensitiveTable}`);
    }
  }

  if (invalid.length) pushFail(`realtime subscriptions must target only safe event tables: ${invalid.join(", ")}`);
  else pushPass("postgres_changes subscriptions target only safe event tables");

  if (sensitive.length) pushFail(`sensitive raw table realtime subscriptions found: ${sensitive.join(", ")}`);
  else pushPass("no realtime subscriptions to raw order/payment/profile/admin tables detected");
}

function checkShellOwnership() {
  const page = path.join(srcDir, "app/page.tsx");
  if (!exists(page)) {
    pushFail("src/app/page.tsx is missing");
    return;
  }
  const pageText = read(page);
  const pageFetch = [...pageText.matchAll(/\bfetch\s*\(/g)].map((m) => lineNumber(pageText, m.index ?? 0));
  const pageBrowserSupabase = [...pageText.matchAll(/createBrowserSupabaseClient/g)].map((m) => lineNumber(pageText, m.index ?? 0));
  if (pageFetch.length || pageBrowserSupabase.length) {
    pushFail(`src/app/page.tsx owns direct data/realtime work (fetch lines: ${pageFetch.join(",") || "none"}; createBrowserSupabaseClient lines: ${pageBrowserSupabase.join(",") || "none"})`);
  } else {
    pushPass("src/app/page.tsx is a thin app-shell entry with no direct fetch or createBrowserSupabaseClient usage");
  }

  const shellCandidates = [
    path.join(srcDir, "features/lucky-draw/shell/LuckyDrawShell.tsx"),
    path.join(srcDir, "features/lucky-draw/shell/index.tsx"),
  ].filter(exists);
  for (const shell of shellCandidates) {
    const text = read(shell);
    const fetchLines = [...text.matchAll(/\bfetch\s*\(/g)].map((m) => lineNumber(text, m.index ?? 0));
    const supabaseLines = [...text.matchAll(/createBrowserSupabaseClient/g)].map((m) => lineNumber(text, m.index ?? 0));
    const message = `${rel(shell)} direct ownership check: fetch lines ${fetchLines.join(",") || "none"}; createBrowserSupabaseClient lines ${supabaseLines.join(",") || "none"}`;
    if (strictShell && (fetchLines.length || supabaseLines.length)) pushFail(message);
    else if (fetchLines.length || supabaseLines.length) pushWarn(`${message} (allowed during current incremental shell-extraction slice; run with --strict-shell for final target)`);
    else pushPass(`${rel(shell)} has no direct fetch or createBrowserSupabaseClient usage`);
  }
}

function checkFeatureViewExtraction() {
  const requiredFeatureViews = [
    ["src/features/lucky-draw/customer/HomeView.tsx", "HomeView"],
    ["src/features/lucky-draw/customer/CheckoutView.tsx", "CheckoutView"],
    ["src/features/lucky-draw/customer/PickView.tsx", "PickView"],
    ["src/features/lucky-draw/customer/OrdersView.tsx", "OrdersView"],
    ["src/features/lucky-draw/profile/ProfileView.tsx", "ProfileView"],
    ["src/features/lucky-draw/admin/AdminView.tsx", "AdminView"],
  ];

  const missing = [];
  const stubbed = [];
  for (const [filePath, componentName] of requiredFeatureViews) {
    const absolute = path.join(root, filePath);
    if (!exists(absolute)) {
      missing.push(filePath);
      continue;
    }
    const text = read(absolute);
    if (!new RegExp(`export\\s+function\\s+${componentName}\\b`).test(text)) {
      stubbed.push(`${filePath} missing export function ${componentName}`);
    }
    if (/^\s*export\s+\{[^}]+\}\s+from\s+['"]/m.test(text) && text.split("\n").filter((line) => line.trim()).length <= 3) {
      stubbed.push(`${filePath} is only a re-export stub`);
    }
  }

  const shellViews = path.join(root, "src/features/lucky-draw/shell/views.tsx");
  if (exists(shellViews)) {
    const shellText = read(shellViews);
    const shellOwned = [...shellText.matchAll(/export\s+function\s+(HomeView|CheckoutView|PickView|OrdersView|ProfileView|AdminView)\b/g)].map((match) => match[1]);
    if (shellOwned.length) stubbed.push(`shell/views.tsx still owns feature views: ${shellOwned.join(", ")}`);
  }

  if (missing.length) pushFail(`required feature view files missing: ${missing.join(", ")}`);
  if (stubbed.length) pushFail(`feature view extraction incomplete: ${stubbed.join("; ")}`);
  if (!missing.length && !stubbed.length) pushPass("customer/profile/admin views are implemented in feature-owned files, not shell re-export stubs");
}

function checkAdminRouteInventory() {
  const requiredRoutes = [
    "src/app/api/lucky-draw/admin/order/route.ts",
    "src/app/api/lucky-draw/admin/draw/route.ts",
    "src/app/api/lucky-draw/admin/draw/lifecycle/route.ts",
    "src/app/api/lucky-draw/admin/slip/route.ts",
    "src/app/api/lucky-draw/admin/slip/verify-test/route.ts",
    "src/app/api/lucky-draw/admin/qr/route.ts",
    "src/app/api/lucky-draw/admin/card-image/route.ts",
  ];
  const missing = requiredRoutes.filter((route) => !exists(path.join(root, route)));
  if (missing.length) pushFail(`required admin smoke route files missing: ${missing.join(", ")}`);
  else pushPass("admin smoke route inventory exists, including qr and card-image endpoints");
}

const smokeChecklist = [
  "Non-admin UI: admin nav, admin panels, slip tools, lifecycle controls, QR/card upload controls are hidden; direct admin view falls back to profile.",
  "Non-admin API rejection: PATCH/POST/GET admin endpoints return 401/403 or safe validation rejection without mutation.",
  "Admin UI: admin dashboard, order controls, lifecycle controls, QR/card upload, card admin, and slip tools render only for active admin/owner session.",
  "Customer order flow: POST /api/lucky-draw returns 401 without authenticated session; Supabase Auth or LIFF session creates order or safe validation error; configured:false does not persist.",
  "Pick flow: POST /api/lucky-draw/picks returns 401 without authenticated session; duplicate slots and non-admin quantity mismatch are rejected; valid approved order pick succeeds.",
  "Realtime: inserting lucky_draw_realtime_events/app_realtime_events or safe state change triggers client refetch of /api/lucky-draw; no raw order/payment/profile payload is streamed.",
  "Dry-run slip: POST /api/lucky-draw/admin/slip/verify-test returns ok=true, dryRun=true, databaseMutated=false for admin; orders/payment_slips/draw_slots stay unchanged.",
  "Profile separation: GET/PATCH /api/lucky-draw/profile is handled from profile UI; checkout/orders do not become profile-management surfaces.",
  "Demo/unconfigured: /api/lucky-draw may return configured:false demo read state; admin/payment/mutation endpoints fail safely with no persistence or bypass claim.",
];

async function runUnauthAdminSmoke() {
  if (!baseUrl) return;
  const endpoints = [
    ["PATCH", "/api/lucky-draw/admin/order"],
    ["PATCH", "/api/lucky-draw/admin/draw"],
    ["POST", "/api/lucky-draw/admin/draw/lifecycle"],
    ["GET", "/api/lucky-draw/admin/slip"],
    ["POST", "/api/lucky-draw/admin/slip/verify-test"],
    ["POST", "/api/lucky-draw/admin/qr"],
    ["POST", "/api/lucky-draw/admin/card-image"],
  ];
  infos.push(`Running unauthenticated admin endpoint smoke against ${baseUrl}`);
  for (const [method, endpoint] of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, { method, redirect: "manual" });
      const okStatus = [400, 401, 403, 405, 422].includes(response.status);
      const line = `${method} ${endpoint} -> ${response.status}`;
      if (okStatus) pushPass(`unauth smoke safe rejection: ${line}`);
      else pushFail(`unauth smoke expected safe rejection, got ${line}`);
    } catch (error) {
      pushFail(`unauth smoke request failed for ${method} ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

checkServerSecrets();
checkRealtimeSubscriptions();
checkShellOwnership();
checkFeatureViewExtraction();
checkAdminRouteInventory();
await runUnauthAdminSmoke();

console.log("Lucky Draw verification artifact check");
console.log(`Root: ${root}`);
console.log("");
for (const message of infos) console.log(`INFO  ${message}`);
for (const message of passes) console.log(`PASS  ${message}`);
for (const message of warnings) console.log(`WARN  ${message}`);
for (const message of hardFailures) console.log(`FAIL  ${message}`);
console.log("");
console.log("Manual smoke checklist:");
smokeChecklist.forEach((item, index) => console.log(`${index + 1}. ${item}`));
console.log("");
console.log("Usage:");
console.log("  node tools/verification/verify-lucky-draw-plan.mjs");
console.log("  node tools/verification/verify-lucky-draw-plan.mjs --strict-shell");
console.log("  node tools/verification/verify-lucky-draw-plan.mjs --base-url=http://localhost:3000");

if (hardFailures.length) process.exit(1);
