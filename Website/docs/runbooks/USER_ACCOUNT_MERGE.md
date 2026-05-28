# Account & Slip Support Runbook

How to triage the most common account / payment-slip support tickets. Keep this short — when in doubt, escalate to engineering.

All SQL queries assume you have a `service_role` connection to the production Supabase project (`szjoarkijeaspazbrchc`). Never share these queries or results outside of YNot ops.

---

## 1. "I have two accounts"

A user reports they have two separate logins (LINE + Gmail / email) and want them merged. By design, account *value* (wallet, pulls, orders) does **not** automatically move between profiles. Only the login identity moves. Set this expectation up front.

### Confirm the split

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

1. Decide which profile the user wants to keep (usually the one with the larger wallet / more pulls / earlier created_at).
2. Open `/admin/users` and look for a pending `account_merge_requests` row between the two profiles. If absent, ask the user to attempt the link themselves (e.g., LINE-side: connect from /profile/personal-info; Gmail-side: complete email OTP). The link attempt creates the merge request automatically.
3. Approve the merge request via `/admin/merge-requests` (or the admin SQL function `public.approve_identity_review_request`).
4. **Tell the user**: only their second sign-in method is now attached to the kept profile. Wallet balance / pulls / orders / collection items on the *other* profile stay there. If they care about those, escalate to engineering for manual ledger work (rare; never do this casually).

---

## 2. "I can't connect LINE — it kicks me to /profile" (the Bug 1 / merge_required case)

User signed up with Gmail, then tried to connect LINE from `/profile/personal-info`, and got bounced to `/profile` (or, after the fix, stayed on /personal-info with a yellow banner saying "support will merge them within 1 business day").

### Confirm

```sql
-- Recent merge requests
select id, source_profile_id, target_profile_id, status, risk_summary, created_at
  from public.account_merge_requests
 where status = 'pending'
   and created_at > now() - interval '24 hours'
 order by created_at desc;
```

Look for a row whose `risk_summary->>'conflict'` is `line_subject_already_linked`. That confirms the user's LINE account was previously tied to another profile (often a phantom `P_line` created by an old LIFF visit).

### Resolve

1. If the other profile is genuinely empty (no wallet, no orders, no items), approve the merge — the identity moves to the user's main profile and the phantom profile becomes orphaned (safe to leave).
2. If the other profile has value (someone else uses this LINE account too!), do NOT merge. Contact the user, explain the conflict, and ask them to use a different LINE account or wait for the original owner to release it.

---

## 3. "I completed email OTP and now I'm on a different account"

`ensureProfileForUser` automatically promotes the user to whichever profile owns the Supabase `auth.users.id`. If the user previously used the same email in a different LINE session, they may have ended up on the *older* profile after OTP verification.

### Confirm

```sql
-- Identify the user's current session profile (from the cookie they'll show you)
-- vs the auth user they just verified
select p.id, p.email, p.line_user_id, p.auth_user_id, p.created_at
  from public.profiles p
 where p.email = lower('<email>')
    or p.auth_user_id = '<supabase-user-id>'
 order by p.created_at;
```

If you see two profiles, one with `auth_user_id` set (the one they just landed on) and one with `line_user_id` set (the one they came from), it's a silent profile switch.

### Resolve

Same as #1 — explain the value doesn't move automatically; if needed, escalate.

---

## 4. "I can't re-upload my slip after rejection"

User uploaded a payment slip, admin rejected the top-up (or the slip status was set to `manual_review` and the admin decided not to approve), and now the user tries to re-upload the **same image** and gets stuck on "duplicate slip".

This was a regression from the F2 widening (commit `3b0a51e`) and was fixed in A9. The dedup query now ignores slips whose parent top-up is rejected / cancelled / expired.

### Confirm

```sql
-- Find the original slip + its parent's status
select s.id as slip_id, s.file_sha256, s.verification_status,
       s.duplicate_of_slip_id, s.top_up_request_id, s.order_id,
       t.status as top_up_status, o.status as order_status,
       s.uploaded_at
  from public.payment_slips s
  left join public.top_up_requests t on t.id = s.top_up_request_id
  left join public.orders         o on o.id = s.order_id
 where s.file_sha256 = '<hash>'
 order by s.uploaded_at desc;
```

If the original slip's parent is `rejected`/`cancelled`/`expired`/`refunded`, the new upload should now succeed. If it doesn't, check whether the parent is still `pending_review` (admin needs to reject it first) or whether the user's new file actually has a different hash (re-photographed).

### Workaround if the user is on an old build

Ask the user to re-take the photo of the same slip — different lighting / framing → different file hash → bypasses the dedup. The DB-level guard in `approve_top_up_request` is the authoritative money-flow gate; this workaround doesn't open a fraud vector.

---

## 5. "My pulls / coins disappeared"

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

## 6. Zombie profiles (`P_line` with no value)

Profiles created by `linkLineIdentity` in the old "create then merge" path. After A4 these stop being generated. Existing zombies are safe to leave; they don't expose value or PII beyond the LINE display name.

If you want to clean them up:

```sql
-- Identify zombie LINE-only profiles with no value
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

- Any request to move wallet balance / pulls / items between profiles → engineering only. No exceptions.
- Any user claiming to own multiple accounts they didn't create → security review (could be account takeover).
- Anything that requires editing `audit_events`, `coin_ledger`, or `top_up_requests` directly → engineering only, with an audit-row written explaining the manual change.
