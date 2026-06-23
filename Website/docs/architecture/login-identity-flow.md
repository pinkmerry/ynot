# Login and Identity Linking Flow

Updated: 2026-06-23

## Goal

YNOTT should give a customer one usable profile across email/password, Google, and LINE whenever the app has proof that the login method belongs to the same customer.

## Core rule

`profiles.id` is the customer value account. Wallet, pulls, collection, exchange, shipping, and admin history belong to the profile.

`user_identities` are login methods attached to that profile.

The app may attach a new login method to an existing profile only when one of these is true:

1. The customer is currently signed in and started an explicit connect flow.
2. The provider identity already belongs to a known profile.
3. A verified email anchor proves the Supabase auth user belongs to the current profile.

The app must not move wallet, pulls, collection items, orders, or shipping rows between profiles during provider login. If two profiles already exist, only the login identity may move after admin review.

## Safe outcomes

Every login or connect attempt must finish in exactly one of these outcomes:

- `connected`: the provider identity is attached to the intended profile and a fresh site session is minted.
- `logged_in`: the provider identity resolves an existing profile and a fresh site session is minted.
- `created`: no matching profile or proof exists, so a new first-time profile is created.
- `login_required`: the provider gave enough information to detect an existing account, but the user is not signed in to that account.
- `review_required`: the provider identity or verified email conflicts with another profile, so an identity review request is created.
- `session_required`: an explicit connect flow lost the original signed-in session; stop before creating a different profile.
- `failed`: provider, token, state, or session validation failed; do not mutate identity rows.

## Security and performance hardening

The one-account behavior depends on the app treating identity linking as one protected transition, not as provider-specific route logic.

### Security invariants

- LINE channel ID and callback origin must be explicit configuration. Do not use hardcoded provider/channel fallbacks in login, callback, or LIFF session routes.
- If provider config is missing, fail before token verification, profile lookup, identity mutation, or session minting.
- OAuth and LIFF tokens must be bound to the expected channel/audience, state, nonce, subject, expiry, and maximum token age before the app trusts provider data.
- Google and LINE callback routes must have cheap rate limits before provider exchange. Public session-mint routes must have both IP-level and subject-level limits.
- Public responses must not expose internal `profile_id`, `mergeRequestId`, `reviewRequestId`, provider subject, or whether a specific email exists.
- Public responses may say only that the customer should sign in with their existing method or that support review is required.
- Exact conflict metadata belongs only in `account_merge_requests.risk_summary`, `account_merge_events.metadata`, admin views, and server logs.
- LINE email is only a server-side hint. It must not be treated as proof of ownership unless it matches a verified email anchor.
- Verified email matching must query only active profiles with `email_verified_at is not null`.

### Performance and consistency invariants

- Provider identity persistence should pass through one Identity Link Module instead of each route doing read-then-write logic.
- Identity writes must be idempotent and conflict-aware. Prefer one database adapter or RPC that can create/update the identity row and create the review request in one guarded transition.
- Sync multiple Supabase identities as a batch when possible, instead of one network round trip per identity.
- Session resolution should keep a fast proof path for cookie shape/session intent and a full proof path for DB/provider validation. Use the full proof path before mutations and admin access.
- The admin review queue should stay indexed for pending work. If support volume grows, add indexes for pending review lookup and provider-conflict investigation.

## Canonical login flows

### 1. Email/password login

Entry point:

- `Website/src/features/auth/actions.ts`

Flow:

```text
login form
-> signInWithPasswordAction
-> Supabase Auth signInWithPassword
-> ensureProfileForUser(user, lineSessionProfileId())
-> set YNOTT site session
-> redirect to next path
```

Rules:

- If there is no LINE session, Supabase auth user identity chooses or creates the profile.
- If there is a LINE session, pass that profile as the target profile hint.
- If the Supabase auth user already belongs to another profile, create an identity review request instead of moving value.
- Do not expose the conflicting profile or review row to the browser. Return a generic review-required message.

### 2. Email signup completion

Entry point:

- `Website/src/features/auth/actions.ts`

Flow:

```text
signup code + password
-> completeSignUpWithPasswordAction
-> create/confirm Supabase auth user
-> sign in with password
-> ensureProfileForUser(user, lineSessionProfileId())
-> set YNOTT site session
-> redirect to next path
```

Rules:

- LINE-first customers can add email/password without creating a second profile while their LINE session is still active.
- If the email is already owned by another profile, use identity review.
- Only a verified Supabase email may become the profile email anchor.

### 3. Email OTP verification

Entry point:

- `Website/src/app/api/auth/email-otp/verify/route.ts`

Flow:

```text
email OTP verify
-> capture current LINE session profile before Supabase writes auth cookies
-> Supabase Auth verifyOtp
-> ensureProfileForUser(user, lineSessionProfileId)
-> resolveEmailAnchor(profile.id, email)
-> set YNOTT site session
```

Rules:

- Capture the LINE profile before Supabase auth changes cookies.
- `resolveEmailAnchor` is required after the profile is resolved.
- If another active profile owns the verified email, create identity review and return a generic `review_required` outcome.
- Do not return the review row id or the conflicting profile id in the public response.

### 4. Google login

Entry points:

- `Website/src/app/api/auth/google/start/route.ts`
- `Website/src/app/auth/callback/route.ts`

Flow:

```text
Google login button
-> /api/auth/google/start?next=...
-> Supabase Google OAuth
-> /auth/callback?next=...
-> rate-limit valid callback before exchangeCodeForSession
-> exchangeCodeForSession
-> ensureProfileForUser(user, lineSessionFromOriginalRequest)
-> set YNOTT site session
```

Rules:

- Normal Google login uses login mode.
- If a valid LINE site session exists on the original request, the callback may use that profile as the target hint.
- If no target hint or existing auth identity exists, a first-time Google profile may be created.
- The callback must rate-limit every valid callback request before `exchangeCodeForSession` and must not echo provider error details to the browser.

### 5. Google connect from a LINE profile

Entry points:

- `Website/src/app/(store)/profile/personal-info/page.tsx`
- `Website/src/features/auth/IdentitiesPanel.tsx`
- `Website/src/app/api/auth/google/start/route.ts`
- `Website/src/app/auth/callback/route.ts`

Flow:

```text
LINE-signed-in profile page
-> /api/auth/google/start?mode=connect&next=...
-> Supabase Google OAuth
-> /auth/callback?mode=connect&next=...
-> validate original YNOTT LINE app session cookie
-> require authSource = "line", current session version, and active profile
-> exchangeCodeForSession
-> ensureProfileForUser(user, lineProfileId)
-> set YNOTT site session
```

Rules:

- Connect mode must preserve `mode=connect` through the OAuth callback.
- If the LINE app session cookie is missing, stale, revoked, not LINE-sourced, or no longer points to an active profile, return `google_connect_session_required`.
- Do not use the generic current-profile resolver as Google connect proof because mixed browsers can still carry Supabase cookies from another login method.
- Do not call `ensureProfileForUser` in connect mode unless the current LINE profile is known.
- If the Supabase identity already belongs to another profile, create identity review and keep the user on the existing safe session.

### 6. LINE OAuth login

Entry points:

- `Website/src/app/api/line/login/start/route.ts`
- `Website/src/app/api/line/callback/route.ts`

Flow:

```text
LINE login button
-> /api/line/login/start?mode=login&next=...
-> store state, nonce, mode, next in httpOnly state cookie
-> LINE authorize
-> /api/line/callback
-> validate state and nonce
-> require configured channel, secret, and callback URL
-> rate-limit valid callback before LINE code exchange
-> exchange and verify LINE ID token
-> resolveCurrentProfile if available
-> linkLineIdentity(identity, targetProfileId)
-> set YNOTT site session
```

Rules:

- LINE channel ID, channel secret, and callback origin are required. Missing config must stop the flow before exchange.
- If a current Supabase-authenticated profile exists, pass it as the target profile. This lets a signed-in Gmail/Google customer press LINE login and still keep one profile.
- If no current profile exists, resolve by existing LINE identity first.
- If LINE returns an email that matches a verified existing profile and there is no active session, return a generic `login_required` outcome instead of creating a LINE-only profile.
- If there is no identity, no email match, and no active session, create a first-time LINE profile.
- Do not include the existing account email, profile id, or review id in the public redirect.

### 7. LINE OAuth connect from a Supabase profile

Entry points:

- `Website/src/app/(store)/profile/personal-info/page.tsx`
- `Website/src/features/auth/IdentitiesPanel.tsx`
- `Website/src/app/api/line/login/start/route.ts`
- `Website/src/app/api/line/callback/route.ts`

Flow:

```text
Supabase-signed-in profile page
-> /api/line/login/start?mode=connect&next=...
-> LINE authorize
-> /api/line/callback
-> validate state and nonce
-> require configured channel, secret, and callback URL
-> rate-limit valid callback before LINE code exchange
-> exchange and verify LINE ID token
-> resolveCurrentProfile must return authSource = "supabase"
-> linkLineIdentity(identity, supabaseProfileId)
-> set YNOTT site session
```

Rules:

- Explicit LINE connect must fail closed if the Supabase profile session is gone.
- Return `line_connect_session_required` before creating a LINE-only profile.
- Existing LINE identity conflicts must create an identity review request, not reassign silently.
- The provider callback should rate-limit exchange attempts and use the same public redaction policy as normal LINE login.

### 8. LIFF LINE session

Entry point:

- `Website/src/app/api/line/session/route.ts`

Flow:

```text
LIFF client posts LINE id_token
-> validate token shape, age, exp, aud, and subject
-> verify with LINE
-> resolveCurrentProfile if available
-> linkLineIdentity(identity, targetProfileId)
-> set YNOTT site session
```

Rules:

- Normal LIFF login may create or resolve a LINE profile.
- LIFF connect mode must require an existing Supabase-authenticated profile.
- Old or mismatched LINE ID tokens must fail before identity mutation.
- LIFF session minting must use the same required LINE channel config as OAuth login. No hardcoded channel fallback is allowed.
- Conflict responses must not return `mergeRequestId`, conflicting `profileId`, provider subject, or email hint to the client.

## Conflict flow

Use identity review when the app detects two profiles that may belong to the same customer but cannot safely prove automatic attachment.

```text
provider identity or verified email belongs to profile A
current connect target is profile B
-> create account_merge_requests row
-> create account_merge_events row
-> return generic public review-required outcome
-> keep value rows on both profiles
-> admin approves or rejects identity-only move
```

Rules:

- Never move wallet, pulls, orders, collection items, exchange rows, shipping rows, or audit history automatically.
- Approval moves the login identity only.
- Existing duplicate profiles remain until support or engineering decides whether cleanup is safe.
- Duplicate pending review rows for the same source, target, provider, and subject should be prevented by the Identity Link Module or by a targeted database constraint/index.

## Stop rules

Stop the flow without identity mutation when:

- OAuth state or nonce is invalid.
- Provider callback URL or channel config is missing.
- Provider config relies on a hardcoded fallback instead of explicit env.
- Connect mode has no valid current profile.
- LINE ID token is expired, too old, wrong audience, or subject-mismatched.
- Callback exchange is rate-limited.
- Supabase auth exchange fails.
- Existing identity belongs to another profile and no admin review exists yet.

## Perfect-flow matrix

| User starts with | User action | Required result |
| --- | --- | --- |
| No account | Sign up with email/password | New Supabase-backed profile |
| No account | Sign up/login with Google | New Supabase-backed profile |
| No account | Login with LINE | New LINE-backed profile unless verified provider email hint matches existing profile |
| Gmail/Google profile | Connect LINE from profile/login methods | Same profile gains LINE identity |
| Gmail/Google profile | Press LINE login while still signed in | Same profile gains LINE identity |
| LINE profile | Connect Google from profile/login methods | Same profile gains Google/email identity |
| LINE profile | Add email/password or verify email OTP | Same profile gains Supabase/email identity unless email conflict needs review |
| Existing LINE identity belongs elsewhere | Connect LINE to current profile | Identity review request; no silent reassignment |
| Existing Google/email auth belongs elsewhere | Connect Google/email to current profile | Identity review request; no value move |
| Separate Gmail and LINE signups with no active session proof | User asks to merge | Support/admin identity review; no automatic merge |

## Executable acceptance test

The guarded real-account scenario test is:

```bash
ALLOW_REAL_ACCOUNT_IDENTITY_TEST=1 npm run test:auth-identity-real-account-scenarios
```

The test creates temporary Supabase auth users plus `profiles` and `user_identities` rows, verifies the row-level account result, and then deletes only rows from the generated test run.

Acceptance criteria:

- Gmail/Google first, then connect LINE -> one active profile with email, Google, and LINE identities.
- LINE first, then connect Gmail/Google -> one active profile with LINE, email, and Google identities.
- Existing Gmail/Google-only account -> one active profile and no LINE identity until connected.
- Existing LINE-only account -> one active profile and no Supabase auth user until connected.
- Existing old duplicate Gmail/Google and LINE profiles -> two existing profiles remain, one pending identity review is created, and no third profile is created.

## Required modules to inspect before changing login

Do not change login, signup, provider connect, or account merge behavior without tracing these modules:

- `Website/src/lib/auth/profile.ts`
- `Website/src/lib/line/link-identity.ts`
- `Website/src/lib/auth/resolve-current-profile.ts`
- `Website/src/lib/auth/identity-merge.ts`
- `Website/src/features/auth/actions.ts`
- `Website/src/app/api/auth/email-otp/verify/route.ts`
- `Website/src/app/api/auth/google/start/route.ts`
- `Website/src/app/auth/callback/route.ts`
- `Website/src/app/api/line/login/start/route.ts`
- `Website/src/app/api/line/callback/route.ts`
- `Website/src/app/api/line/session/route.ts`
- `Website/src/app/(store)/profile/personal-info/page.tsx`
- `Website/src/features/auth/IdentitiesPanel.tsx`

## Architecture direction

The current implementation works by sharing two lower-level modules:

- `ensureProfileForUser` for Supabase auth users.
- `linkLineIdentity` for LINE identities.

The next architecture improvement should deepen one Identity Link Module around those functions. Route handlers should not each decide provider config, connect preconditions, target profile selection, conflict mapping, public redaction, rate limits, or session output by hand.

The future module should own:

- mode: `login` or `connect`;
- provider config and callback origin validation;
- current profile requirement;
- target profile selection;
- provider identity normalization;
- verified email anchor lookup;
- idempotent identity persistence;
- conflict outcome mapping;
- public response redaction;
- rate-limit scope selection;
- session outcome shape;
- public error code and message.

Tests should target that module with table-driven cases for every row in the perfect-flow matrix.

The database architecture does not need a full redesign for this login plan. It already has `profiles`, `user_identities`, and identity-review request/event tables. Future database work should be limited to hardening:

- add a pending-review uniqueness guard if duplicate review rows appear in production;
- add admin queue indexes if pending review volume grows;
- keep legacy full-account merge RPCs disabled;
- keep generated Supabase types in sync after any migration.
