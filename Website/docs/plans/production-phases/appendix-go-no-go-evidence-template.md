# Appendix — Go/No-Go Evidence Template

Updated: 2026-05-08

Use this template at the end of every phase. Save completed copies under `../../verification/` or `.omx/artifacts/`.

## Phase

- Phase number/name:
- Date/time:
- Operator:
- Environment: local / staging / preview / production
- Decision: GO / NO-GO / BLOCKED

## Target references

- Website URL:
- Vercel project/deployment/commit:
- Supabase ref:
- Supabase URL:
- Migration versions applied:
- Provider callback URLs checked:
- Payment/test-mode policy:

## User stories verified

- [ ] Owner/admin story:
- [ ] Customer story:
- [ ] Non-admin/security story:
- [ ] LIFF compatibility story:
- [ ] Admin content/operations story:

## Acceptance criteria result

| Criterion | Pass/Fail/Blocked | Evidence |
| --- | --- | --- |
|  |  |  |

## UAT evidence

- Screenshots:
- Browser URLs:
- Test account public identifiers:
- Admin account public identifiers:
- Notes:

## Real technical evidence

- Commands run:
- Command outputs/log paths:
- DB row IDs/public codes:
- Storage object paths:
- Vercel logs checked:
- Supabase Auth logs checked:
- Supabase DB/RPC logs checked:

## Security/data checks

- [ ] Production backup/restore evidence current when required.
- [ ] Correct Supabase ref; no staging/production cross-wire.
- [ ] RLS enabled for new public/exposed tables.
- [ ] Data API grants/policies verified where needed.
- [ ] Service role/secret keys not exposed to browser.
- [ ] Non-admin receives 403 on admin APIs.
- [ ] No fake payment approval path in production.
- [ ] Existing LIFF path tested or safe-fail documented.

## Stop/no-go triggers

- Trigger observed:
- Impact:
- Immediate mitigation:
- Owner decision required:

## Rollback/recovery

- Rollback action available:
- Rollback tested or documented:
- Data cleanup required:
- Follow-up owner/admin action:

## Final decision

- GO / NO-GO / BLOCKED:
- Why:
- Next phase/action:
