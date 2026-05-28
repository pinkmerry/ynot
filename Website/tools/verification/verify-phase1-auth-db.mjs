#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationPath = path.join(root, "../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql");
const typesPath = path.join(root, "src/lib/supabase/types.ts");
const sessionPath = path.join(root, "src/lib/lucky-draw/session.ts");
const lineSessionPath = path.join(root, "src/app/api/line/session/route.ts");
const lineLinkPath = path.join(root, "src/lib/line/link-identity.ts");
const realtimeHookPath = path.join(root, "src/features/lucky-draw/realtime/useLuckyDrawRealtime.ts");

const failures = [];
const passes = [];

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function check(file, label, regex) {
  const text = read(file);
  if (regex.test(text)) passes.push(label);
  else failures.push(label);
}

function notCheck(file, label, regex) {
  const text = read(file);
  if (!regex.test(text)) passes.push(label);
  else failures.push(label);
}

check(migrationPath, "migration adds profiles.auth_user_id", /add column if not exists auth_user_id uuid references auth\.users\(id\)/i);
check(migrationPath, "migration makes profiles.line_user_id nullable", /alter column line_user_id drop not null/i);
check(migrationPath, "migration creates user_identities bridge", /create table if not exists public\.user_identities/i);
check(migrationPath, "migration creates user_addresses", /create table if not exists public\.user_addresses/i);
check(migrationPath, "migration creates private app realtime events", /create table if not exists public\.app_realtime_events/i);
check(migrationPath, "authenticated profile updates are column-scoped", /revoke update on public\.profiles from authenticated;[\s\S]*grant update \(\s*preferred_language,[\s\S]*delivery_note\s*\) on public\.profiles to authenticated;/i);
notCheck(migrationPath, "authenticated users cannot update all profile columns", /grant select, update on public\.profiles to authenticated/i);
notCheck(migrationPath, "identity profile columns are not client-updatable", /grant update \([\s\S]*(auth_user_id|line_user_id|email|profile_status)[\s\S]*\) on public\.profiles to authenticated/i);
check(migrationPath, "migration enables RLS for new public tables", /alter table public\.user_identities enable row level security;[\s\S]*alter table public\.user_addresses enable row level security;[\s\S]*alter table public\.app_realtime_events enable row level security;/i);
check(migrationPath, "RLS helper functions stay in app_private", /create or replace function app_private\.current_profile_id\(\)[\s\S]*security definer/i);
notCheck(migrationPath, "public realtime policy no longer allows all topics", /policy "Anyone can receive lucky draw refresh events"[\s\S]*using \(true\)/i);
check(migrationPath, "public realtime policy hides private order identifiers", /topic in \('draw', 'slots', 'cards'\)[\s\S]*order_id is null/i);
check(migrationPath, "trigger writes private events for order/payment changes", /insert into public\.app_realtime_events/i);
notCheck(migrationPath, "trigger does not insert private order ids into public realtime events", /insert into public\.lucky_draw_realtime_events \(topic, draw_round_id, order_id\)\s*values \([^)]*private_order_id/i);

check(typesPath, "types include user_identities", /user_identities:\s*{[\s\S]*provider_subject: string;/);
check(typesPath, "types include user_addresses", /user_addresses:\s*{[\s\S]*address_line1: string;/);
check(typesPath, "types include app_realtime_events", /app_realtime_events:\s*{[\s\S]*admin_only: boolean;/);
check(typesPath, "profiles line_user_id type is nullable", /line_user_id: string \| null;/);
check(typesPath, "profiles insert line_user_id is optional nullable", /line_user_id\?: string \| null;/);

check(sessionPath, "LINE_SESSION_SECRET is required for LINE session signing", /LINE_SESSION_SECRET is required to sign Lucky Draw sessions/);
notCheck(sessionPath, "LINE session signing never falls back to service role", /SUPABASE_SERVICE_ROLE_KEY/);

check(lineSessionPath, "LINE session records user identity bridge", /linkLineIdentity/);
check(lineLinkPath, "LINE identity helper writes user identity bridge without conflict upsert", /identityByLineSubject[\s\S]*from\("user_identities"\)\.insert/);
notCheck(lineLinkPath, "LINE identity helper does not reassign conflicting identity rows by upsert", /from\("user_identities"\)\.upsert/);
check(lineSessionPath, "LINE session uses linked verified LINE sub for cookie", /lineUserId: linked\.lineUserId/);
check(realtimeHookPath, "client subscribes to public and private event tables", /table: "lucky_draw_realtime_events"[\s\S]*table: "app_realtime_events"/);

console.log("Phase 1 auth/database static verification");
for (const pass of passes) console.log(`PASS ${pass}`);
for (const fail of failures) console.log(`FAIL ${fail}`);

if (failures.length) process.exit(1);
