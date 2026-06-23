import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url);
const envPath = new URL(".env.local", root);
const allowRealAccountTest = process.env.ALLOW_REAL_ACCOUNT_IDENTITY_TEST === "1";

function loadLocalEnv() {
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
}

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function transpile(sourceText) {
  return ts.transpileModule(sourceText, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function loadModule(path, mocks) {
  const testModule = { exports: {} };
  vm.runInNewContext(transpile(read(path)), {
    exports: testModule.exports,
    module: testModule,
    require(id) {
      if (id === "server-only") return {};
      if (id in mocks) return mocks[id];
      return require(id);
    },
    console,
    Buffer,
    Date,
    URL,
    process,
  });
  return testModule.exports;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url, "NEXT_PUBLIC_SUPABASE_URL is required");
  assert.ok(key, "SUPABASE_SERVICE_ROLE_KEY is required");
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function makeGoogleUser(authUser, subject, email) {
  const now = new Date().toISOString();
  return {
    ...authUser,
    id: authUser.id,
    email,
    email_confirmed_at: authUser.email_confirmed_at ?? now,
    user_metadata: {
      ...(authUser.user_metadata ?? {}),
      name: `Codex Identity ${subject}`,
      full_name: `Codex Identity ${subject}`,
    },
    identities: [
      {
        id: `google-${subject}`,
        user_id: authUser.id,
        provider: "google",
        identity_data: {
          sub: subject,
          email,
          name: `Codex Identity ${subject}`,
          full_name: `Codex Identity ${subject}`,
          avatar_url: "https://example.test/avatar.png",
        },
        created_at: now,
        updated_at: now,
        last_sign_in_at: now,
      },
    ],
  };
}

function lineIdentity({ lineUserId, email }) {
  return {
    lineUserId,
    displayName: `LINE ${lineUserId}`,
    pictureUrl: "https://example.test/line.png",
    email,
    channelId: "real-account-test-channel",
    source: "line_id_token",
  };
}

async function createAuthUser(supabase, email, createdAuthUserIds) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: `Ynot-${randomUUID()}!1a`,
    email_confirm: true,
    user_metadata: {
      createdBy: "codex-auth-identity-real-account-scenarios",
    },
  });
  if (error) throw error;
  createdAuthUserIds.add(data.user.id);
  return data.user;
}

async function matchingProfiles(supabase, { email, lineUserId, authUserId }) {
  const rows = new Map();
  const addRows = (items) => {
    for (const row of items ?? []) rows.set(row.id, row);
  };

  if (email) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,auth_user_id,line_user_id,profile_status")
      .eq("email", email);
    if (error) throw error;
    addRows(data);
  }

  if (lineUserId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,auth_user_id,line_user_id,profile_status")
      .eq("line_user_id", lineUserId);
    if (error) throw error;
    addRows(data);
  }

  if (authUserId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,auth_user_id,line_user_id,profile_status")
      .eq("auth_user_id", authUserId);
    if (error) throw error;
    addRows(data);
  }

  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function identitiesFor(supabase, profileIds) {
  if (profileIds.length === 0) return [];
  const { data, error } = await supabase
    .from("user_identities")
    .select("id,profile_id,auth_user_id,provider,provider_subject,email")
    .in("profile_id", profileIds)
    .order("provider", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function pendingReviewsFor(supabase, profileIds) {
  if (profileIds.length === 0) return [];
  const ids = profileIds.join(",");
  const { data, error } = await supabase
    .from("account_merge_requests")
    .select("id,source_profile_id,target_profile_id,status,risk_summary")
    .or(`source_profile_id.in.(${ids}),target_profile_id.in.(${ids})`);
  if (error) throw error;
  return data ?? [];
}

async function collectEvidence(supabase, label, probe) {
  const profiles = await matchingProfiles(supabase, probe);
  const identities = await identitiesFor(supabase, profiles.map((profile) => profile.id));
  const reviews = await pendingReviewsFor(supabase, profiles.map((profile) => profile.id));
  return {
    label,
    profileCount: profiles.length,
    profileIds: profiles.map((profile) => profile.id),
    profiles,
    identities: identities.map((identity) => ({
      profileId: identity.profile_id,
      authUserId: identity.auth_user_id,
      provider: identity.provider,
      providerSubject: identity.provider_subject,
      email: identity.email,
    })),
    pendingReviewCount: reviews.filter((review) => review.status === "pending").length,
    pendingReviews: reviews.map((review) => ({
      id: review.id,
      sourceProfileId: review.source_profile_id,
      targetProfileId: review.target_profile_id,
      status: review.status,
      mode: review.risk_summary?.mode ?? null,
      conflict: review.risk_summary?.conflict ?? null,
    })),
  };
}

async function cleanupRun(supabase, { runId, createdAuthUserIds }) {
  const { data: profilesByEmail } = await supabase
    .from("profiles")
    .select("id")
    .like("email", `codex-one-account-${runId}%@example.test`);
  const { data: profilesByLine } = await supabase
    .from("profiles")
    .select("id")
    .like("line_user_id", `codex-line-${runId}%`);
  const profileIds = [
    ...new Set([
      ...(profilesByEmail ?? []).map((row) => row.id),
      ...(profilesByLine ?? []).map((row) => row.id),
    ]),
  ];

  if (profileIds.length > 0) {
    const requests = await pendingReviewsFor(supabase, profileIds);
    const requestIds = requests.map((request) => request.id);
    if (requestIds.length > 0) {
      await supabase.from("account_merge_events").delete().in("merge_request_id", requestIds);
      await supabase.from("account_merge_requests").delete().in("id", requestIds);
    }
    await supabase.from("user_identities").delete().in("profile_id", profileIds);
    await supabase.from("profiles").delete().in("id", profileIds);
  }

  for (const authUserId of createdAuthUserIds) {
    await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
  }
}

test(
  "real temporary accounts keep one profile when Google/email and LINE are connected",
  { skip: !allowRealAccountTest },
  async (t) => {
    loadLocalEnv();
    const supabase = serviceClient();
    const runId = randomUUID().slice(0, 8);
    const createdAuthUserIds = new Set();
    const mocks = {
      "@/lib/supabase/server": { createServiceSupabaseClient: () => supabase },
      "@/lib/supabase/types": {},
    };
    const { ensureProfileForUser } = loadModule("../src/lib/auth/profile.ts", mocks);
    const { linkLineIdentity } = loadModule("../src/lib/line/link-identity.ts", mocks);
    const evidence = [];

    t.after(async () => {
      await cleanupRun(supabase, { runId, createdAuthUserIds });
    });

    await cleanupRun(supabase, { runId, createdAuthUserIds });

    const googleFirstEmail = `codex-one-account-${runId}-google-first@example.test`;
    const googleFirstLine = `codex-line-${runId}-google-first`;
    const googleFirstAuth = await createAuthUser(supabase, googleFirstEmail, createdAuthUserIds);
    const googleFirstUser = makeGoogleUser(googleFirstAuth, `google-${runId}-first`, googleFirstEmail);
    const googleFirstProfile = await ensureProfileForUser(googleFirstUser);
    const googleFirstLink = await linkLineIdentity(
      lineIdentity({ lineUserId: googleFirstLine, email: googleFirstEmail }),
      googleFirstProfile.id,
    );
    assert.equal(googleFirstLink.status, "linked");
    assert.equal(googleFirstLink.profileId, googleFirstProfile.id);
    evidence.push(await collectEvidence(supabase, "Google/email signup first, then connect LINE", {
      email: googleFirstEmail,
      lineUserId: googleFirstLine,
      authUserId: googleFirstAuth.id,
    }));
    assert.equal(evidence.at(-1).profileCount, 1);

    const lineFirstEmail = `codex-one-account-${runId}-line-first@example.test`;
    const lineFirstLine = `codex-line-${runId}-line-first`;
    const lineFirstLink = await linkLineIdentity(
      lineIdentity({ lineUserId: lineFirstLine, email: null }),
      null,
    );
    assert.equal(lineFirstLink.status, "linked");
    const lineFirstAuth = await createAuthUser(supabase, lineFirstEmail, createdAuthUserIds);
    const lineFirstUser = makeGoogleUser(lineFirstAuth, `google-${runId}-line-first`, lineFirstEmail);
    const lineFirstProfile = await ensureProfileForUser(lineFirstUser, lineFirstLink.profileId);
    assert.equal(lineFirstProfile.id, lineFirstLink.profileId);
    evidence.push(await collectEvidence(supabase, "LINE signup first, then connect Google/email", {
      email: lineFirstEmail,
      lineUserId: lineFirstLine,
      authUserId: lineFirstAuth.id,
    }));
    assert.equal(evidence.at(-1).profileCount, 1);

    const gmailOnlyEmail = `codex-one-account-${runId}-gmail-only@example.test`;
    const gmailOnlyAuth = await createAuthUser(supabase, gmailOnlyEmail, createdAuthUserIds);
    const gmailOnlyUser = makeGoogleUser(gmailOnlyAuth, `google-${runId}-gmail-only`, gmailOnlyEmail);
    await ensureProfileForUser(gmailOnlyUser);
    evidence.push(await collectEvidence(supabase, "Existing Google/email-only account remains one profile", {
      email: gmailOnlyEmail,
      authUserId: gmailOnlyAuth.id,
    }));
    assert.equal(evidence.at(-1).profileCount, 1);
    assert.equal(evidence.at(-1).profiles[0].line_user_id, null);

    const lineOnlyLine = `codex-line-${runId}-line-only`;
    const lineOnlyLink = await linkLineIdentity(
      lineIdentity({ lineUserId: lineOnlyLine, email: null }),
      null,
    );
    assert.equal(lineOnlyLink.status, "linked");
    evidence.push(await collectEvidence(supabase, "Existing LINE-only account remains one profile", {
      lineUserId: lineOnlyLine,
    }));
    assert.equal(evidence.at(-1).profileCount, 1);
    assert.equal(evidence.at(-1).profiles[0].auth_user_id, null);

    const duplicateEmail = `codex-one-account-${runId}-duplicate@example.test`;
    const duplicateLine = `codex-line-${runId}-duplicate`;
    const duplicateAuth = await createAuthUser(supabase, duplicateEmail, createdAuthUserIds);
    const duplicateUser = makeGoogleUser(duplicateAuth, `google-${runId}-duplicate`, duplicateEmail);
    const duplicateAuthProfile = await ensureProfileForUser(duplicateUser);
    const duplicateLineProfile = await linkLineIdentity(
      lineIdentity({ lineUserId: duplicateLine, email: null }),
      null,
    );
    assert.equal(duplicateLineProfile.status, "linked");
    assert.notEqual(duplicateAuthProfile.id, duplicateLineProfile.profileId);

    const duplicateConnect = await linkLineIdentity(
      lineIdentity({ lineUserId: duplicateLine, email: null }),
      duplicateAuthProfile.id,
    );
    assert.equal(duplicateConnect.status, "merge_required");
    evidence.push(await collectEvidence(supabase, "Old duplicate Google/email and LINE profiles create review, not a third account", {
      email: duplicateEmail,
      lineUserId: duplicateLine,
      authUserId: duplicateAuth.id,
    }));
    assert.equal(evidence.at(-1).profileCount, 2);
    assert.equal(evidence.at(-1).pendingReviewCount, 1);

    console.log(JSON.stringify({
      runId,
      supabaseOrigin: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin,
      acceptanceCriteria: [
        "Connected Google/email and LINE login methods resolve to the same profile id.",
        "Existing single-method accounts stay as one profile until a new method is connected.",
        "Existing old duplicate accounts do not create a third account or move value rows automatically.",
        "Unsafe duplicate accounts create identity review instead of silent reassignment.",
      ],
      evidence,
    }, null, 2));
  },
);
