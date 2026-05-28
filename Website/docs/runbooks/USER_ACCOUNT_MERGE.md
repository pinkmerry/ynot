# Account Support Runbook

Triage script for the common account / sign-in tickets. When in doubt, escalate to engineering.

SQL queries assume a `service_role` connection to the production Supabase project. Never share queries or results outside YNot ops.

---

## 1. "I have two accounts"

A user reports two separate logins (LINE + Gmail / email) and wants them merged. The current flow does NOT automatically move account *value* (wallet, pulls, orders) between profiles — only the login identity links. Set this expectation up front.

### Confirm

```sql
-- Replace <email> with the user-reported email
select id, email, line_user_id, profile_status, created_at,
       email_verified_at, phone_verified_at
  from public.profiles
 where lower(email) = lower('<email>')
    or id in (
      select profile_id from public.user_identities
       where provider_subject = lower('<email>')
    )
 order by created_at;
```

Two rows = confirmed split.

### Resolve

1. Decide which profile the user keeps (usually the one with the larger wallet / more pulls / earlier created_at).
2. Look in `account_merge_requests` for a pending row between the two profiles. If absent, ask the user to attempt the link themselves (LINE side: connect from `/profile/personal-info`; Gmail side: complete email OTP). That creates the merge request.
3. Approve via `/admin/users` or the RPC `public.approve_identity_review_request`.
4. Tell the user: only the sign-in method moves. Wallet / pulls / orders / items on the OTHER profile stay there.

---

## 2. "I can't connect LINE — it kicks me to /profile"

User signed up with Gmail, then tried Connect LINE from `/profile/personal-info`, and got bounced. With the latest backend fixes the user now stays on `/profile/personal-info` and sees a `?message=...` query param explaining the issue. Without the fix they land on `/profile`.

### Confirm

```sql
-- Recent merge requests
select id, source_profile_id, target_profile_id, status, risk_summary, created_at
  from public.account_merge_requests
 where status = 'pending'
   and created_at > now() - interval '24 hours'
 order by created_at desc;
```

Look for a row whose `risk_summary->>'conflict'` is `line_subject_already_linked`. That confirms the user's LINE account was previously tied to another profile (often a phantom `P_line` from an old LIFF visit).

### Resolve

1. If the other profile is genuinely empty (no wallet, no orders, no items), approve the merge — the identity moves to the user's main profile and the phantom profile becomes orphaned (safe to leave).
2. If the other profile has value, do NOT merge. Contact the user, explain the conflict, ask them to use a different LINE account or wait for the original owner to release it.

---

## 3. "I tried to log in with LINE and got an error about my email"

With the `login_required` path active, the callback now refuses to silently create a new LINE-only profile if the email on the LINE token already belongs to an existing email-anchored profile. The user is sent to `/login` with a hint like *"An account already exists for je**@gmail.com. Please sign in with email or Google..."*.

### Resolve

Tell the user to sign in with the email or Google method they originally used, then connect LINE from `/profile/personal-info` after they're authenticated.

---

## 4. "My pulls / coins disappeared"

Almost always means the user signed in to a different profile than they thought.

### Confirm

```sql
-- All ledger entries for the email
select cl.created_at, cl.entry_type, cl.amount_coins,
       cl.balance_before, cl.balance_after, cl.profile_id,
       p.line_user_id, p.email
  from public.coin_ledger cl
  join public.profiles p on p.id = cl.profile_id
 where p.email = lower('<email>')
    or p.line_user_id in (
      select line_user_id from public.profiles where lower(email) = lower('<email>')
    )
 order by cl.created_at desc
 limit 50;
```

If you see entries on two different `profile_id`s, the user has a split. Follow runbook #1.

---

## 5. Zombie profiles (`P_line` with no value)

Old `linkLineIdentity` paths created LINE-only profiles when the LINE callback couldn't reach the user's existing session. After the `login_required` fix these stop being generated for the most common case. Existing zombies are safe to leave; they don't expose value or PII beyond the LINE display name.

If you want to clean them up:

```sql
select p.id, p.line_user_id, p.email, p.created_at
  from public.profiles p
  left join public.wallet_accounts w on w.profile_id = p.id
  left join public.user_identities ui on ui.profile_id = p.id and ui.provider <> 'line'
 where p.line_user_id is not null
   and p.auth_user_id is null
   and (w.balance_coins is null or w.balance_coins = 0)
   and ui.id is null
   and p.created_at < now() - interval '7 days'
 limit 100;
```

Soft-disable rather than delete: `update public.profiles set profile_status = 'disabled' where id in (...);`. Never DELETE — cascade ripples through audit tables.

---

## Escalation

- Any request to move wallet balance / pulls / items between profiles → engineering only.
- Any user claiming to own multiple accounts they didn't create → security review (possible account takeover).
- Anything that requires editing `audit_events`, `coin_ledger`, or `top_up_requests` directly → engineering only, with an audit-row written explaining the manual change.
