import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function exists(path) {
  return existsSync(new URL(path, import.meta.url));
}

test("admin shell sign-out link has a route that clears app and Supabase sessions", () => {
  const shell = source("../src/features/ynot/admin/Shell.tsx");
  const session = source("../src/lib/lucky-draw/session.ts");
  const routePath = "../src/app/auth/sign-out/route.ts";
  const route = source(routePath);

  assert.match(
    shell,
    /href="\/auth\/sign-out"/,
    "admin shell points at the sign-out route",
  );
  assert.ok(exists(routePath), "admin sign-out route must exist");
  assert.match(
    route,
    /isSupabaseAuthCookieName/,
    "sign-out route clears Supabase auth-token cookies from the request",
  );
  assert.match(
    route,
    /luckyDrawSessionCookie/,
    "sign-out route clears the YNOTT app session cookie",
  );
  assert.match(
    route,
    /legacyLuckyDrawSessionCookie/,
    "sign-out route clears the legacy app session cookie",
  );
  assert.match(
    session,
    /expires:\s*new Date\(0\)[\s\S]*maxAge:\s*0/,
    "clear-cookie options expire deleted session cookies for stubborn browsers",
  );
});

test("site session cookies require current versioned JWT payloads", () => {
  const session = source("../src/lib/lucky-draw/session.ts");

  assert.doesNotMatch(
    session,
    /cookieStore\.get\(legacyLuckyDrawSessionCookie\)\?\.value/,
    "legacy two-part cookies must not be accepted as active sessions",
  );
  assert.match(
    session,
    /typeof parsed\.sessionVersion !== "number"[\s\S]*return null/,
    "reader rejects cookies that predate sessionVersion",
  );
  assert.match(
    session,
    /typeof session\.sessionVersion !== "number"[\s\S]*return false/,
    "sessionVersion validation fails closed when the cookie has no version",
  );
  assert.doesNotMatch(
    session,
    /isLegacySchemaError\(error\)[\s\S]*return true/,
    "sessionVersion validation must not fail open on missing DB schema",
  );
});

test("auth profile resolution only accepts active profiles", () => {
  const resolver = source("../src/lib/auth/resolve-current-profile.ts");
  const profile = source("../src/lib/auth/profile.ts");
  const lineIdentity = source("../src/lib/line/link-identity.ts");

  assert.match(
    resolver,
    /profileRow\.profile_status !== "active"/,
    "LINE/site session resolver rejects merged and disabled profiles",
  );
  assert.match(
    profile,
    /\.eq\("profile_status", "active"\)/,
    "Supabase profile lookup requires active profile status",
  );
  assert.doesNotMatch(
    profile,
    /\.neq\("profile_status", "disabled"\)/,
    "Supabase profile lookup must not treat merged profiles as active",
  );
  assert.match(
    lineIdentity,
    /\.eq\("profile_status", "active"\)/,
    "LINE identity linking only targets active profiles",
  );
  assert.doesNotMatch(
    lineIdentity,
    /\.neq\("profile_status", "disabled"\)/,
    "LINE identity linking must not treat merged profiles as active",
  );
});

test("LIFF session minting requires fresh LINE claims and coarse rate limit", () => {
  const route = source("../src/app/api/line/session/route.ts");
  const liffClient = source("../src/lib/line/use-liff-session.ts");
  const config = source("../src/lib/line/config.ts");
  const configIndex = route.indexOf("const lineChannelId = getLineLoginChannelId()");
  const preClaimsIndex = route.indexOf("const preClaims = decodeIdTokenClaims(idToken)");
  const coarseLimitIndex = route.indexOf('const coarseLimited = await enforceRateLimit');
  const subjectLimitIndex = route.indexOf('const limited = await enforceRateLimit');
  const successJsonIndex = route.indexOf("const serverResponse = NextResponse.json({");
  const successCookieIndex = route.indexOf("serverResponse.cookies.set(");
  const successJsonBranch = route.slice(successJsonIndex, successCookieIndex);

  assert.doesNotMatch(
    route,
    /NEXT_PUBLIC_LINE_LIFF_ID|2009971080/,
    "LIFF session mint must not fall back to LIFF ID parsing or a hardcoded LINE channel",
  );
  assert.match(
    config,
    /process\.env\.LINE_LOGIN_CHANNEL_ID\?\.trim\(\) \|\| null/,
    "LINE server config requires the explicit login channel ID",
  );
  assert.doesNotMatch(
    config,
    /NEXT_PUBLIC_LINE_LIFF_ID|2009971080/,
    "LINE server config must not derive or hardcode the login channel",
  );
  assert.ok(
    configIndex !== -1 && preClaimsIndex !== -1 && configIndex < preClaimsIndex,
    "LIFF session mint must fail closed on missing LINE config before decoding token claims",
  );
  assert.match(
    route,
    /enforceRateLimit\(\s*request,\s*"line:session:mint:ip"/,
    "LIFF session mint has an IP fallback rate limit before provider verification",
  );
  assert.match(
    route,
    /function rateLimitJson[\s\S]*response\.status === 429[\s\S]*auth_rate_limited[\s\S]*auth_temporarily_unavailable/,
    "LIFF session mint sanitizes rate-limit helper failures before returning JSON",
  );
  assert.ok(
    coarseLimitIndex !== -1
      && subjectLimitIndex !== -1
      && route.includes('if (coarseLimited) return rateLimitJson("line:session:mint:ip", coarseLimited);')
      && route.includes('if (limited) return rateLimitJson("line:session:mint", limited);'),
    "LIFF session mint must not return raw rate-limit helper responses",
  );
  assert.doesNotMatch(
    route,
    /if \((coarseLimited|limited)\) return \1;/,
    "LIFF session mint public JSON must not expose raw rate-limit backend/config messages",
  );
  assert.match(
    route,
    /!preClaims[\s\S]*typeof preClaims\.iat !== "number"[\s\S]*typeof preClaims\.exp !== "number"[\s\S]*!preClaims\.sub[\s\S]*preClaims\.aud !== lineChannelId/,
    "LIFF session mint rejects missing iat/exp/sub/aud claims before LINE verify",
  );
  assert.match(
    route,
    /Date\.now\(\) >= preClaims\.exp \* 1000/,
    "LIFF session mint rejects expired id tokens locally",
  );
  assert.match(
    route,
    /preClaims\.sub !== verified\.sub/,
    "LIFF session mint compares verified LINE subject to pre-verified subject",
  );
  assert.ok(
    successJsonIndex !== -1 && successCookieIndex !== -1 && successJsonIndex < successCookieIndex,
    "LIFF session mint success JSON must be explicit before setting cookies",
  );
  assert.doesNotMatch(
    successJsonBranch,
    /\.\.\.profile|profileId|lineUserId|verified\.sub/,
    "LIFF session mint success JSON must not expose internal profile IDs or LINE subjects",
  );
  assert.match(
    successJsonBranch,
    /displayName: profile\.displayName[\s\S]*pictureUrl: profile\.pictureUrl[\s\S]*isAdmin[\s\S]*adminRole/,
    "LIFF session mint success JSON includes only client-safe display/admin fields",
  );
  assert.doesNotMatch(
    liffClient,
    /profileId|lineUserId|session\?\.profileId/,
    "LIFF client must not require or model internal profile IDs or LINE subjects",
  );
  assert.match(
    liffClient,
    /if \(!response\.ok \|\| !session\)/,
    "LIFF client success should be based on response.ok and parsed body, not profileId",
  );
});

test("provider callbacks rate-limit before provider code exchange", () => {
  const lineStart = source("../src/app/api/line/login/start/route.ts");
  const lineCallback = source("../src/app/api/line/callback/route.ts");
  const googleCallback = source("../src/app/auth/callback/route.ts");
  const lineStateValidationIndex = lineCallback.indexOf("if (!code || !state || !storedState || state !== storedState.state)");
  const lineConfigIndex = lineCallback.indexOf("const channelId = getLineLoginChannelId()");
  const lineRateLimitIndex = lineCallback.indexOf("const rateLimited = await enforceRateLimit");
  const lineExchangeIndex = lineCallback.indexOf("const idToken = await exchangeCode");
  const lineProfileLookupIndex = lineCallback.indexOf("const current = await resolveCurrentProfile()");
  const googleRateLimitIndex = googleCallback.indexOf("const rateLimited = await enforceRateLimit");
  const googleExchangeIndex = googleCallback.indexOf("supabase.auth.exchangeCodeForSession(code)");

  assert.doesNotMatch(
    lineStart,
    /NEXT_PUBLIC_LINE_LIFF_ID|2009971080/,
    "LINE login start must not fall back to LIFF ID parsing or a hardcoded LINE channel",
  );
  assert.match(
    lineStart,
    /getLineLoginChannelId\(\)[\s\S]*getLineCallbackUrl\(\)/,
    "LINE login start uses explicit channel and callback-origin config",
  );
  assert.doesNotMatch(
    lineCallback,
    /NEXT_PUBLIC_LINE_LIFF_ID|2009971080/,
    "LINE callback must not fall back to LIFF ID parsing or a hardcoded LINE channel",
  );
  assert.match(
    lineCallback,
    /getLineLoginChannelId\(\)/,
    "LINE callback reads the explicit server-side channel config",
  );
  assert.ok(
    lineStateValidationIndex !== -1
      && lineConfigIndex !== -1
      && lineRateLimitIndex !== -1
      && lineStateValidationIndex < lineConfigIndex
      && lineConfigIndex < lineRateLimitIndex,
    "LINE callback validates OAuth state before config checks and before consuming the rate-limit bucket",
  );
  assert.ok(
    lineRateLimitIndex !== -1 && lineExchangeIndex !== -1 && lineRateLimitIndex < lineExchangeIndex,
    "LINE callback must rate-limit before exchanging the provider code",
  );
  assert.ok(
    lineExchangeIndex !== -1
      && lineProfileLookupIndex !== -1
      && lineExchangeIndex < lineProfileLookupIndex,
    "LINE callback performs config/rate-limit/provider verification before local profile lookup",
  );
  assert.match(
    lineCallback,
    /response\.status === 429[\s\S]*auth_rate_limited[\s\S]*auth_temporarily_unavailable/,
    "LINE callback maps 429 to a rate-limit redirect and backend/config failures to temporary-unavailable",
  );
  assert.match(
    lineCallback,
    /console\.warn\("line_oauth_callback_rate_limit_unavailable", response\.status\)/,
    "LINE callback logs non-429 rate-limit helper failures without exposing backend internals",
  );
  assert.ok(
    googleRateLimitIndex !== -1 && googleExchangeIndex !== -1 && googleRateLimitIndex < googleExchangeIndex,
    "Google auth callback must rate-limit before exchanging the provider code",
  );
  assert.match(
    googleCallback,
    /"auth:callback"/,
    "Google auth callback uses a cheap generic callback rate-limit scope",
  );
  assert.match(
    googleCallback,
    /response\.status === 429[\s\S]*auth_rate_limited[\s\S]*auth_temporarily_unavailable/,
    "Google auth callback maps 429 to a rate-limit redirect and backend/config failures to temporary-unavailable",
  );
  assert.match(
    googleCallback,
    /console\.warn\("auth_callback_rate_limit_unavailable", response\.status\)/,
    "Google auth callback logs non-429 rate-limit helper failures without exposing backend internals",
  );
});

test("public LINE conflict responses do not expose account linkage internals", () => {
  const lineCallback = source("../src/app/api/line/callback/route.ts");
  const lineSession = source("../src/app/api/line/session/route.ts");
  const lineIdentity = source("../src/lib/line/link-identity.ts");
  const callbackMergeRequiredIndex = lineCallback.indexOf('linked.status === "merge_required"');
  const callbackLoginRequiredIndex = lineCallback.indexOf('linked.status === "login_required"');
  const callbackAdminLookupIndex = lineCallback.indexOf("const admin = await adminForProfile");
  const callbackConflictBranches = lineCallback.slice(callbackMergeRequiredIndex, callbackAdminLookupIndex);
  const sessionMergeRequiredIndex = lineSession.indexOf('linked.status === "merge_required"');
  const sessionLoginRequiredIndex = lineSession.indexOf('linked.status === "login_required"');
  const sessionAdminLookupIndex = lineSession.indexOf("const supabase = createServiceSupabaseClient()");
  const callbackLoginRequiredBranch = lineCallback.slice(callbackLoginRequiredIndex, callbackAdminLookupIndex);
  const sessionConflictBranches = lineSession.slice(sessionMergeRequiredIndex, sessionAdminLookupIndex);

  assert.ok(
    callbackMergeRequiredIndex !== -1
      && callbackLoginRequiredIndex !== -1
      && callbackAdminLookupIndex !== -1
      && callbackMergeRequiredIndex < callbackLoginRequiredIndex
      && callbackLoginRequiredIndex < callbackAdminLookupIndex,
    "LINE OAuth callback conflict branches must be present before session creation",
  );
  assert.doesNotMatch(
    callbackConflictBranches,
    /already tied to another|Support will merge|merge them within|linked\.emailHint|emailHint|An account already exists for/,
    "LINE OAuth callback conflict redirects must not reveal account-linkage internals",
  );
  assert.match(
    callbackConflictBranches,
    /identity_review_required[\s\S]*line_existing_account_sign_in_required/,
    "LINE OAuth callback uses neutral conflict codes",
  );
  assert.doesNotMatch(
    callbackLoginRequiredBranch,
    /linked\.emailHint|emailHint|An account already exists for/,
    "LINE OAuth callback must not reveal or interpolate the existing account email",
  );
  assert.match(
    callbackLoginRequiredBranch,
    /Please sign in with your existing email or Google account[\s\S]*line_existing_account_sign_in_required/,
    "LINE OAuth callback uses generic existing-account sign-in copy and code",
  );
  assert.ok(
    sessionMergeRequiredIndex !== -1
      && sessionLoginRequiredIndex !== -1
      && sessionAdminLookupIndex !== -1
      && sessionMergeRequiredIndex < sessionLoginRequiredIndex
      && sessionLoginRequiredIndex < sessionAdminLookupIndex,
    "LIFF session conflict branches must be present before session creation",
  );
  assert.doesNotMatch(
    sessionConflictBranches,
    /mergeRequestId|emailHint|linked\.emailHint|An account already exists for/,
    "LIFF session conflict JSON must not expose merge request IDs or email hints",
  );
  assert.doesNotMatch(
    sessionConflictBranches,
    /profileId:\s*linked\.profileId/,
    "LIFF session merge-required JSON must not expose the target profile ID",
  );
  assert.match(
    sessionConflictBranches,
    /identity_review_required[\s\S]*line_existing_account_sign_in_required/,
    "LIFF session conflict JSON uses generic review/sign-in codes",
  );
  assert.doesNotMatch(
    lineIdentity,
    /emailHint|maskEmail/,
    "LINE identity linker must not expose or encourage public email hints",
  );
  assert.match(
    lineIdentity,
    /\.not\("email_verified_at", "is", null\)/,
    "LINE email matching only considers verified email anchors",
  );
});

test("public email OTP verification response does not expose identity internals", () => {
  const route = source("../src/app/api/auth/email-otp/verify/route.ts");
  const responseStart = route.indexOf("const response = jsonNoStore({");
  const secureCookieStart = route.indexOf("const secure = shouldUseSecureCookies(request)");
  const responseJson = route.slice(responseStart, secureCookieStart);

  assert.ok(
    responseStart !== -1 && secureCookieStart !== -1 && responseStart < secureCookieStart,
    "email OTP verify success JSON must be explicit before cookie handling",
  );
  assert.doesNotMatch(
    responseJson,
    /profileId|reviewRequestId|email[,:\s]/,
    "email OTP verify public JSON must not expose profile IDs, review request IDs, or echo the email",
  );
  assert.match(
    responseJson,
    /identityReviewRequired: outcome\.kind === "review_required"/,
    "email OTP verify keeps the safe review-required flag",
  );
  assert.match(
    responseJson,
    /identityReviewMessage:[\s\S]*We need to review this sign-in before linking it to your account/,
    "email OTP verify keeps generic review copy for the client banner",
  );
  assert.doesNotMatch(
    responseJson,
    /outcome\.profileId|outcome\.reviewRequestId|already linked to another|merge them within|another YNot account/,
    "email OTP review copy must not include identifiers or account-existence details",
  );
});

test("provider connect mode cannot silently create a second account", () => {
  const lineCallback = source("../src/app/api/line/callback/route.ts");
  const lineSession = source("../src/app/api/line/session/route.ts");
  const googleStart = source("../src/app/api/auth/google/start/route.ts");
  const authCallback = source("../src/app/auth/callback/route.ts");
  const personalInfoPage = source("../src/app/(store)/profile/personal-info/page.tsx");
  const identitiesPanel = source("../src/features/auth/IdentitiesPanel.tsx");
  const identityReviewIndex = authCallback.indexOf("function redirectForIdentityReview");
  const rateLimitRedirectIndex = authCallback.indexOf("function redirectForRateLimitFailure");
  const identityReviewBranch = authCallback.slice(identityReviewIndex, rateLimitRedirectIndex);

  assert.match(
    lineCallback,
    /storedState\.mode === "connect"[\s\S]*current\?\.authSource !== "supabase"[\s\S]*line_connect_session_required[\s\S]*linkLineIdentity/,
    "LINE OAuth connect must require the current Google/email account before linking",
  );
  assert.match(
    lineCallback,
    /resolveCurrentProfile\(\)\.catch[\s\S]*return null/,
    "LINE OAuth login should continue without a current account while explicit connect still fails closed",
  );
  assert.match(
    lineCallback,
    /const targetProfileId =\s*current\?\.authSource === "supabase"\s*\?\s*current\.profileId\s*:\s*null/,
    "LINE OAuth login must attach to the current Google/email account when one is already signed in",
  );
  assert.match(
    lineSession,
    /connectMode[\s\S]*current\?\.authSource !== "supabase"[\s\S]*line_connect_session_required[\s\S]*linkLineIdentity/,
    "LIFF LINE connect mode must fail instead of creating a LINE-only profile when the current account is missing",
  );
  assert.match(
    googleStart,
    /mode === "connect"[\s\S]*callbackUrl\.searchParams\.set\("mode", "connect"\)/,
    "Google start route must preserve explicit connect mode through the OAuth callback",
  );
  assert.match(
    authCallback,
    /validatedLineAppSessionProfileId\(request\)[\s\S]*mode === "connect"[\s\S]*!connectLineProfileId[\s\S]*google_connect_session_required[\s\S]*mode === "connect" \? connectLineProfileId[\s\S]*ensureProfileForUser\(user, targetProfileId\)/,
    "Google OAuth connect must require a validated original LINE app session before linking",
  );
  assert.match(
    authCallback,
    /session\?\.authSource !== "line"[\s\S]*!session\.profileId[\s\S]*isSessionVersionCurrent\(session\)[\s\S]*\.from\("profiles"\)[\s\S]*\.select\("id,profile_status"\)[\s\S]*profileRow\.profile_status !== "active"/,
    "Google OAuth connect proof must validate session version and active profile status",
  );
  assert.match(
    authCallback,
    /profile\.id !== connectLineProfileId[\s\S]*return redirectForIdentityReview\(request, next, secure\);[\s\S]*const sessionVersion = await fetchSessionVersion/,
    "Google OAuth connect mismatch must redirect for review before minting a YNOTT Supabase session",
  );
  assert.match(
    authCallback,
    /function redirectForIdentityReview[\s\S]*const conflictResponse = NextResponse\.redirect\(target\)[\s\S]*isSupabaseAuthCookieName\(name\)[\s\S]*conflictResponse\.cookies\.set/,
    "Google OAuth connect mismatch uses a fresh redirect and clears Supabase auth cookies",
  );
  assert.ok(
    identityReviewIndex !== -1
      && rateLimitRedirectIndex !== -1
      && identityReviewIndex < rateLimitRedirectIndex,
    "Google OAuth connect mismatch helper must be isolated before other redirect helpers",
  );
  assert.match(
    identityReviewBranch,
    /identity_review_required/,
    "Google OAuth connect mismatch uses a neutral review-required code",
  );
  assert.doesNotMatch(
    identityReviewBranch,
    /luckyDrawSessionCookie|legacyLuckyDrawSessionCookie/,
    "Google OAuth connect mismatch must preserve the original YNOTT app session",
  );
  assert.doesNotMatch(
    authCallback,
    /resolveCurrentProfile/,
    "Google OAuth connect must not accept a Supabase-resolved profile in mixed-cookie browsers",
  );
  assert.match(
    personalInfoPage,
    /\/api\/auth\/google\/start\?mode=connect&next=\/profile\/personal-info/,
    "LINE-first personal-info flow must start Google OAuth in connect mode",
  );
  assert.match(
    identitiesPanel,
    /name="mode" value="connect"[\s\S]*name="next" value="\/account\/identities"/,
    "login-methods Google link form must start OAuth in connect mode",
  );
});

test("all API mutations receive a global same-origin guard", () => {
  const middleware = source("../src/middleware.ts");

  assert.match(
    middleware,
    /API_MUTATION_METHODS = new Set/,
    "middleware defines mutating methods",
  );
  assert.match(
    middleware,
    /request\.nextUrl\.pathname\.startsWith\("\/api\/"\)/,
    "middleware applies the guard to API routes",
  );
  assert.match(
    middleware,
    /Cross-origin mutation requests are not allowed/,
    "middleware returns the shared cross-origin mutation error",
  );
  assert.doesNotMatch(
    middleware,
    /api\/auth/,
    "auth API routes must not be excluded from the API mutation guard",
  );
});
