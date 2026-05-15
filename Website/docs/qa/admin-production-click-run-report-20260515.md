# Admin Production Click Run Report

- Run id: `RALPH-20260515T082158Z`
- Created: 2026-05-15T08:21:58Z
- Target: `https://www.ynottcg.com/admin`
- Source test suite: `Website/docs/qa/admin-production-click-test-cases.md`
- Mode: `$ralph` execution pass

## Executive Result

Ralph reran the production admin suite in the user's Chrome session after the user completed browser-mediated login. Chrome now reaches the production admin shell as an owner/admin account. All tests that could be executed safely without production data mutation were run through the real production browser session. No approve, reject, publish, delete, role-change, payment, stock, shipping, exchange, or owner-odds mutation was performed.

- Total test cases in suite: 164
- Result counts: PASS: 33; FAIL: 12; BLOCKED-PRECONDITION: 43; BLOCKED-TEST-DATA-MUTATION: 45; BLOCKED-OWNER-GATE: 18; BLOCKED-FINANCIAL-DATA: 12; SAFETY-SKIPPED: 1
- Production mutation performed: none
- Production admin credentials used: none
- Financial/order approvals performed: none
- Primary finding: several production admin `Link` clicks receive trusted browser click events, but Next.js prevents the default link action and the route does not change.

## Initial Chrome Rerun Addendum Before User Relogin

- Rerun timestamp: 2026-05-15T08:40:05Z
- Browser target: user's Google Chrome, `https://www.ynottcg.com/admin`
- Chrome session result: signed in, but not an active owner/admin/staff in `admin_users`
- Visible denial text: `ADMIN DENIED`, `Admin access is required`, and `Your account is signed in, but it is not an active owner/admin/staff account in admin_users.`
- Admin navigation leak: none observed; the page showed normal customer navigation and a Back Home action
- JavaScript DOM extraction from Chrome was not available because Chrome has `Allow JavaScript from Apple Events` disabled; visual screenshot inspection was used instead
- Password/database boundary: no database passwords were read, extracted, printed, or typed

## Authenticated Owner Chrome Addendum

- Rerun timestamp: 2026-05-15T09:31:00Z
- Browser target: user's Google Chrome via Chrome DevTools Protocol at `127.0.0.1:9222`
- Session result: production `/admin` loaded with `ADMIN MENU`, `Control Panel`, dashboard side navigation, and owner role visible in the dashboard.
- Direct authenticated page loads passed for `/admin`, `/admin/campaigns`, `/admin/categories`, `/admin/prizes`, `/admin/users`, `/admin/top-ups`, `/admin/exchange`, `/admin/shipping`, `/admin/settings`, `/admin/tier-animations`, `/admin/rankings`, `/admin/audit`, and `/admin/health`.
- Trusted click probes were run from the real production admin UI. Passing click routes: top-ups, shipping, exchange, settings, reveal videos, audit, and matching dashboard cards for top-ups, shipping, exchange, and settings. Failing click routes: random packs, categories, prizes, users, rankings, health, and matching dashboard/category links.
- Failure evidence: click events were trusted and reached the intended anchor, but the event was default-prevented and `location.href` stayed on the previous admin route.
- Password/database boundary: no database passwords were read, extracted, printed, or typed.

## Safe Production Evidence Collected

| Route | HTTP | Admin gate visible | Admin nav leak | Bytes | Result |
| --- | ---: | --- | --- | ---: | --- |
| `/admin` | 200 | yes | no | 20063 | PASS |
| `/admin/campaigns` | 200 | yes | no | 20528 | PASS |
| `/admin/categories` | 200 | yes | no | 20530 | PASS |
| `/admin/prizes` | 200 | yes | no | 20522 | PASS |
| `/admin/users` | 200 | yes | no | 20563 | PASS |
| `/admin/top-ups` | 200 | yes | no | 20567 | PASS |
| `/admin/rankings` | 200 | yes | no | 20526 | PASS |
| `/admin/shipping` | 200 | yes | no | 20569 | PASS |
| `/admin/exchange` | 200 | yes | no | 20569 | PASS |
| `/admin/settings` | 200 | yes | no | 20526 | PASS |
| `/admin/tier-animations` | 200 | yes | no | 20583 | PASS |
| `/admin/audit` | 200 | yes | no | 20563 | PASS |
| `/admin/health` | 200 | yes | no | 20565 | PASS |

Observed access-gate text on `/admin` and `/admin/campaigns`: `Admin denied`, `Admin access is required`, and `Back home`. The server rendered `authenticated:false` and `isAdmin:false` in the page payload for the unauthenticated check.

## Authenticated Page-Load Evidence

| Route | Expected production content | Result |
| --- | --- | --- |
| `/admin` | `Admin Control`, `Control Panel`, owner dashboard state | PASS |
| `/admin/campaigns` | Random pack studio and campaign controls | PASS |
| `/admin/categories` | Category form/list and existing category dropdown | PASS |
| `/admin/prizes` | Prize catalog, prize selectors, tiers, stock controls, image previews | PASS |
| `/admin/users` | Users and role controls | PASS |
| `/admin/top-ups` | Manual payment confirmation queue | PASS |
| `/admin/exchange` | Exchange request queue | PASS |
| `/admin/shipping` | Shipping/fulfillment queue | PASS |
| `/admin/settings` | Payment settings form | PASS |
| `/admin/tier-animations` | Tier reveal video forms | PASS |
| `/admin/rankings` | Ranking snapshots page | PASS |
| `/admin/audit` | Operational event log page | PASS |
| `/admin/health` | Production readiness health panel | PASS |

## Authenticated Trusted-Click Evidence

| Case range | Click source | PASS | FAIL |
| --- | --- | ---: | ---: |
| TC-006 to TC-017 | Admin side navigation | 6 | 6 |
| TC-019 to TC-027 | Dashboard action cards/health link | 4 | 5 |
| TC-037 | Category page link to Random Pack Studio | 0 | 1 |
| TC-018 | Browser back/forward after a passing admin click | 1 | 0 |

## Result Code Legend

| Code | Meaning |
| --- | --- |
| P1 | Executed safe production fetch for `/admin`; HTTP 200, `Admin denied`, `Admin access is required`, and no admin-nav leak. |
| P2 | Executed Chrome production visit for `/admin` as signed-in non-admin; page displayed active admin-user denial. |
| P3 | Executed Chrome visual check as signed-in non-admin; admin navigation was hidden and customer navigation remained visible. |
| P4 | Executed authenticated owner/admin Chrome page load; admin shell and expected route content were visible without permission error. |
| P5 | Executed trusted production browser click; route changed to the expected admin page and admin shell stayed visible. |
| P6 | Executed read-only control/field inspection; required selectors, dropdown options, images, disabled states, or search fields were visible without saving. |
| F1 | Failed trusted production browser click; click reached the intended anchor, but the route did not change after Next.js default-prevented the link action. |
| B1 | Blocked: authenticated session exists, but the case still needs a matching precondition such as pending test record, alternate non-owner role, explicit validation attempt, or safe manual state. |
| B2 | Blocked: needs an authenticated admin session, RUN_ID manifest, and approved reversible test-data mutation window. |
| B3 | Blocked: needs authenticated owner session plus explicit approval for owner-only or destructive production state. |
| B4 | Blocked: needs authenticated admin session plus real pending RUN_ID test records; no money/order mutation attempted. |
| S1 | Safety skip: fake slip approval is intentionally not executed in production. |

## Admin Journey Summary

| Admin journey/page | Cases | Results |
| --- | ---: | --- |
| `/admin` | 4 | PASS: 4 |
| Header/nav | 1 | PASS: 1 |
| Admin nav | 12 | PASS: 6; FAIL: 6 |
| Admin shell | 1 | PASS: 1 |
| Dashboard | 10 | PASS: 5; FAIL: 5 |
| Categories | 10 | PASS: 1; FAIL: 1; BLOCKED-PRECONDITION: 3; BLOCKED-TEST-DATA-MUTATION: 5 |
| Prizes | 12 | PASS: 6; BLOCKED-PRECONDITION: 1; BLOCKED-TEST-DATA-MUTATION: 5 |
| Prize pool | 8 | BLOCKED-PRECONDITION: 3; BLOCKED-TEST-DATA-MUTATION: 3; BLOCKED-OWNER-GATE: 2 |
| Catalog stock | 5 | PASS: 1; BLOCKED-TEST-DATA-MUTATION: 3; BLOCKED-PRECONDITION: 1 |
| Campaigns | 25 | BLOCKED-PRECONDITION: 6; BLOCKED-TEST-DATA-MUTATION: 19 |
| Owner review | 16 | BLOCKED-PRECONDITION: 5; BLOCKED-OWNER-GATE: 11 |
| Users | 7 | PASS: 1; BLOCKED-PRECONDITION: 2; BLOCKED-OWNER-GATE: 3; BLOCKED-TEST-DATA-MUTATION: 1 |
| Users merge | 2 | BLOCKED-FINANCIAL-DATA: 2 |
| Top-ups | 6 | PASS: 1; BLOCKED-PRECONDITION: 1; BLOCKED-FINANCIAL-DATA: 3; SAFETY-SKIPPED: 1 |
| Exchange | 5 | PASS: 1; BLOCKED-PRECONDITION: 1; BLOCKED-FINANCIAL-DATA: 3 |
| Shipping | 8 | PASS: 1; BLOCKED-PRECONDITION: 3; BLOCKED-FINANCIAL-DATA: 4 |
| Settings | 6 | BLOCKED-PRECONDITION: 3; BLOCKED-TEST-DATA-MUTATION: 3 |
| Reveal Videos | 8 | PASS: 1; BLOCKED-PRECONDITION: 4; BLOCKED-TEST-DATA-MUTATION: 3 |
| Rankings | 2 | PASS: 1; BLOCKED-PRECONDITION: 1 |
| Audit | 2 | PASS: 1; BLOCKED-PRECONDITION: 1 |
| Health | 2 | PASS: 1; BLOCKED-PRECONDITION: 1 |
| Cross-page | 6 | BLOCKED-PRECONDITION: 6 |
| Cleanup | 6 | BLOCKED-TEST-DATA-MUTATION: 3; BLOCKED-OWNER-GATE: 2; BLOCKED-PRECONDITION: 1 |

## Detailed Test Results

| ID | Admin journey | Safety | Scenario | Result | Evidence code |
| --- | --- | --- | --- | --- | --- |
| TC-001 | `/admin` | RO | Admin root requires login/admin gate | PASS | P1 |
| TC-002 | `/admin` | RO | Non-admin cannot enter admin | PASS | P2 |
| TC-003 | Header/nav | RO | Admin nav hidden for non-admin | PASS | P3 |
| TC-004 | `/admin` | RO | Admin can open dashboard | PASS | P4 |
| TC-005 | `/admin` | RO | Owner can open dashboard | PASS | P4 |
| TC-006 | Admin nav | RO | Navigation to Random Packs | FAIL | F1 |
| TC-007 | Admin nav | RO | Navigation to Categories | FAIL | F1 |
| TC-008 | Admin nav | RO | Navigation to Prizes | FAIL | F1 |
| TC-009 | Admin nav | RO | Navigation to Users | FAIL | F1 |
| TC-010 | Admin nav | RO | Navigation to Top-ups | PASS | P5 |
| TC-011 | Admin nav | RO | Navigation to Rankings | FAIL | F1 |
| TC-012 | Admin nav | RO | Navigation to Shipping | PASS | P5 |
| TC-013 | Admin nav | RO | Navigation to Exchange | PASS | P5 |
| TC-014 | Admin nav | RO | Navigation to Settings | PASS | P5 |
| TC-015 | Admin nav | RO | Navigation to Reveal Videos | PASS | P5 |
| TC-016 | Admin nav | RO | Navigation to Audit | PASS | P5 |
| TC-017 | Admin nav | RO | Navigation to Health | FAIL | F1 |
| TC-018 | Admin shell | RO | Browser back/forward keeps admin shell stable | PASS | P5 |
| TC-019 | Dashboard | RO | Open dashboard quick action: Random Packs | FAIL | F1 |
| TC-020 | Dashboard | RO | Open dashboard quick action: Prizes | FAIL | F1 |
| TC-021 | Dashboard | RO | Open dashboard quick action: Categories | FAIL | F1 |
| TC-022 | Dashboard | RO | Open dashboard quick action: Top-ups | PASS | P5 |
| TC-023 | Dashboard | RO | Open dashboard quick action: Users | FAIL | F1 |
| TC-024 | Dashboard | RO | Open dashboard quick action: Exchange | PASS | P5 |
| TC-025 | Dashboard | RO | Open dashboard quick action: Shipping | PASS | P5 |
| TC-026 | Dashboard | RO | Open dashboard quick action: Settings | PASS | P5 |
| TC-027 | Dashboard | RO | Open dashboard quick action: Health | FAIL | F1 |
| TC-028 | Dashboard | RO | Dashboard card disabled/empty states | PASS | P4 |
| TC-029 | Categories | RO | Required field validation for new category | BLOCKED-PRECONDITION | B1 |
| TC-030 | Categories | TD | Create normal hidden test category | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-031 | Categories | TD | Create test-only visible-to-test category | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-032 | Categories | TD | Update selected category display name | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-033 | Categories | TD | Toggle category active/hidden state | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-034 | Categories | TD | Toggle category test-only/normal | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-035 | Categories | RO | Duplicate slug validation | BLOCKED-PRECONDITION | B1 |
| TC-036 | Categories | RO | Existing category dropdown loads options | PASS | P6 |
| TC-037 | Categories | RO | Open Random Pack Studio from category page | FAIL | F1 |
| TC-038 | Categories | RO | Preview storefront category link | BLOCKED-PRECONDITION | B1 |
| TC-039 | Prizes | RO | Card form required fields validation | PASS | P6 |
| TC-040 | Prizes | TD | Create test card with safe asset | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-041 | Prizes | TD | Create test card with category selected | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-042 | Prizes | TD | Edit existing test card by code/name | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-043 | Prizes | RO | Unsafe external test asset rejection | BLOCKED-PRECONDITION | B1 |
| TC-044 | Prizes | TD | Test prize toggle reveals extra fields | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-045 | Prizes | RO | Card tier selection accepts supported tiers | PASS | P6 |
| TC-046 | Prizes | RO | Card category selector shows categories | PASS | P6 |
| TC-047 | Prizes | TD | Save card with quantity or stock metadata if present | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-048 | Prizes | RO | Search card catalog by name | PASS | P6 |
| TC-049 | Prizes | RO | Search card catalog by code | PASS | P6 |
| TC-050 | Prizes | RO | Catalog image preview is visible | PASS | P6 |
| TC-051 | Prize pool | RO | Prize slot required fields validation | BLOCKED-PRECONDITION | B1 |
| TC-052 | Prize pool | TD | Add test card to test campaign prize slot | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-053 | Prize pool | TD | Change selected prize category | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-054 | Prize pool | TD | Change tier and rank | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-055 | Prize pool | RO | Quantity zero validation | BLOCKED-PRECONDITION | B1 |
| TC-056 | Prize pool | OG | Owner-only weight field saves | BLOCKED-OWNER-GATE | B3 |
| TC-057 | Prize pool | OG | Owner-only unlock percent saves | BLOCKED-OWNER-GATE | B3 |
| TC-058 | Prize pool | RO | Invalid unlock percent rejected | BLOCKED-PRECONDITION | B1 |
| TC-059 | Catalog stock | TD | Add one stock unit | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-060 | Catalog stock | TD | Cancel stock add draft | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-061 | Catalog stock | TD | Remove one available stock unit | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-062 | Catalog stock | RO | Reject remove more than available | BLOCKED-PRECONDITION | B1 |
| TC-063 | Catalog stock | RO | Stock action disabled for unavailable state | PASS | P6 |
| TC-064 | Campaigns | RO | Draft form required title validation | BLOCKED-PRECONDITION | B1 |
| TC-065 | Campaigns | TD | Create minimal test-only draft pack | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-066 | Campaigns | TD | Choose category in campaign builder | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-067 | Campaigns | TD | Set customer tags | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-068 | Campaigns | TD | Toggle available open quantity: single | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-069 | Campaigns | TD | Toggle available open quantity: multi | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-070 | Campaigns | TD | Remove an open quantity | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-071 | Campaigns | TD | Toggle tier availability on | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-072 | Campaigns | TD | Toggle tier availability off | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-073 | Campaigns | TD | Add tier count row | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-074 | Campaigns | TD | Remove tier count row | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-075 | Campaigns | TD | Set quantity to 1 helper | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-076 | Campaigns | TD | Fill remainder helper | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-077 | Campaigns | RO | Tier total mismatch blocker | BLOCKED-PRECONDITION | B1 |
| TC-078 | Campaigns | TD | Choose prize in campaign builder | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-079 | Campaigns | TD | Change selected prize | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-080 | Campaigns | TD | Change prize category | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-081 | Campaigns | TD | Change prize quantity | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-082 | Campaigns | TD | Remove prize row | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-083 | Campaigns | RO | Missing prize readiness blocker | BLOCKED-PRECONDITION | B1 |
| TC-084 | Campaigns | RO | Missing image/card readiness blocker | BLOCKED-PRECONDITION | B1 |
| TC-085 | Campaigns | TD | Edit existing draft settings | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-086 | Campaigns | RO | Direct live/public save blocked | BLOCKED-PRECONDITION | B1 |
| TC-087 | Campaigns | TD | Submit owner review | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-088 | Campaigns | RO | Submit owner review disabled with blockers | BLOCKED-PRECONDITION | B1 |
| TC-089 | Owner review | RO | Owner queue displays pending pack | BLOCKED-PRECONDITION | B1 |
| TC-090 | Owner review | RO | Non-owner cannot approve owner review | BLOCKED-PRECONDITION | B1 |
| TC-091 | Owner review | OG | Choose normal random logic | BLOCKED-OWNER-GATE | B3 |
| TC-092 | Owner review | OG | Choose weight logic | BLOCKED-OWNER-GATE | B3 |
| TC-093 | Owner review | OG | Choose unlock logic | BLOCKED-OWNER-GATE | B3 |
| TC-094 | Owner review | OG | Choose weight and unlock logic | BLOCKED-OWNER-GATE | B3 |
| TC-095 | Owner review | RO | Invalid owner weight rejected | BLOCKED-PRECONDITION | B1 |
| TC-096 | Owner review | OG | Request changes | BLOCKED-OWNER-GATE | B3 |
| TC-097 | Owner review | OG | Reject review | BLOCKED-OWNER-GATE | B3 |
| TC-098 | Owner review | OG | Approve campaign inventory | BLOCKED-OWNER-GATE | B3 |
| TC-099 | Owner review | OG | Publish approved test pack | BLOCKED-OWNER-GATE | B3 |
| TC-100 | Owner review | OG | Close private | BLOCKED-OWNER-GATE | B3 |
| TC-101 | Owner review | OG | Archive private | BLOCKED-OWNER-GATE | B3 |
| TC-102 | Owner review | OG | Remove pack | BLOCKED-OWNER-GATE | B3 |
| TC-103 | Owner review | RO | Delete blocked when dependencies exist | BLOCKED-PRECONDITION | B1 |
| TC-104 | Owner review | RO | Publish blocked without approval | BLOCKED-PRECONDITION | B1 |
| TC-105 | Users | RO | User search/list loads | PASS | P4 |
| TC-106 | Users | OG | Grant staff role to test user | BLOCKED-OWNER-GATE | B3 |
| TC-107 | Users | OG | Grant admin role to test user | BLOCKED-OWNER-GATE | B3 |
| TC-108 | Users | OG | Owner role grant requires owner actor | BLOCKED-OWNER-GATE | B3 |
| TC-109 | Users | RO | Non-owner cannot grant owner | BLOCKED-PRECONDITION | B1 |
| TC-110 | Users | RO | Cannot deactivate own admin access | BLOCKED-PRECONDITION | B1 |
| TC-111 | Users | TD | Deactivate test admin role | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-112 | Users merge | FIN | Approve merge request | BLOCKED-FINANCIAL-DATA | B4 |
| TC-113 | Users merge | FIN | Reject merge request | BLOCKED-FINANCIAL-DATA | B4 |
| TC-114 | Top-ups | RO | Top-up list empty state | PASS | P4 |
| TC-115 | Top-ups | RO | Top-up note input accepts text | BLOCKED-PRECONDITION | B1 |
| TC-116 | Top-ups | FIN | Reject test top-up | BLOCKED-FINANCIAL-DATA | B4 |
| TC-117 | Top-ups | FIN | Approve real test top-up | BLOCKED-FINANCIAL-DATA | B4 |
| TC-118 | Top-ups | FIN | Duplicate approve is idempotent | BLOCKED-FINANCIAL-DATA | B4 |
| TC-119 | Top-ups | RO | Approve fake slip is not allowed | SAFETY-SKIPPED | S1 |
| TC-120 | Exchange | RO | Exchange list empty state | PASS | P4 |
| TC-121 | Exchange | RO | Coin value validation | BLOCKED-PRECONDITION | B1 |
| TC-122 | Exchange | FIN | Approve test exchange | BLOCKED-FINANCIAL-DATA | B4 |
| TC-123 | Exchange | FIN | Reject test exchange | BLOCKED-FINANCIAL-DATA | B4 |
| TC-124 | Exchange | FIN | Duplicate exchange action blocked | BLOCKED-FINANCIAL-DATA | B4 |
| TC-125 | Shipping | RO | Shipping list empty state | PASS | P4 |
| TC-126 | Shipping | RO | Required status validation | BLOCKED-PRECONDITION | B1 |
| TC-127 | Shipping | FIN | Set status packing | BLOCKED-FINANCIAL-DATA | B4 |
| TC-128 | Shipping | FIN | Set status shipped with carrier/tracking | BLOCKED-FINANCIAL-DATA | B4 |
| TC-129 | Shipping | FIN | Set status delivered | BLOCKED-FINANCIAL-DATA | B4 |
| TC-130 | Shipping | FIN | Cancel test shipping request | BLOCKED-FINANCIAL-DATA | B4 |
| TC-131 | Shipping | RO | Tracking optional before shipped | BLOCKED-PRECONDITION | B1 |
| TC-132 | Shipping | RO | Duplicate final update blocked or stable | BLOCKED-PRECONDITION | B1 |
| TC-133 | Settings | RO | Payment method required fields | BLOCKED-PRECONDITION | B1 |
| TC-134 | Settings | TD | Create PromptPay payment method | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-135 | Settings | TD | Update payment instructions | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-136 | Settings | TD | Create bank transfer payment method | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-137 | Settings | RO | Wallet preview read-only | BLOCKED-PRECONDITION | B1 |
| TC-138 | Settings | RO | Duplicate payment code upsert behavior | BLOCKED-PRECONDITION | B1 |
| TC-139 | Reveal Videos | RO | Tier animation page loads all tiers | PASS | P4 |
| TC-140 | Reveal Videos | RO | Save with no changes | BLOCKED-PRECONDITION | B1 |
| TC-141 | Reveal Videos | TD | Upload valid tier video/image | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-142 | Reveal Videos | RO | Reject unsupported file type | BLOCKED-PRECONDITION | B1 |
| TC-143 | Reveal Videos | RO | Reject oversized media | BLOCKED-PRECONDITION | B1 |
| TC-144 | Reveal Videos | TD | Toggle active off | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-145 | Reveal Videos | TD | Toggle active on | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-146 | Reveal Videos | RO | Duration validation | BLOCKED-PRECONDITION | B1 |
| TC-147 | Rankings | RO | Rankings page loads | PASS | P4 |
| TC-148 | Rankings | RO | Ranking tab/status controls if visible | BLOCKED-PRECONDITION | B1 |
| TC-149 | Audit | RO | Audit page loads | PASS | P4 |
| TC-150 | Audit | RO | Audit includes mutation evidence | BLOCKED-PRECONDITION | B1 |
| TC-151 | Health | RO | Health page loads | PASS | P4 |
| TC-152 | Health | RO | Health links/actions are read-only | BLOCKED-PRECONDITION | B1 |
| TC-153 | Cross-page | RO | Session expiry during admin action | BLOCKED-PRECONDITION | B1 |
| TC-154 | Cross-page | RO | Browser refresh preserves form-safe state | BLOCKED-PRECONDITION | B1 |
| TC-155 | Cross-page | RO | Double-click submit idempotency | BLOCKED-PRECONDITION | B1 |
| TC-156 | Cross-page | RO | Rate limit or spam guard | BLOCKED-PRECONDITION | B1 |
| TC-157 | Cross-page | RO | Mobile admin navigation | BLOCKED-PRECONDITION | B1 |
| TC-158 | Cross-page | RO | Desktop layout scan | BLOCKED-PRECONDITION | B1 |
| TC-159 | Cleanup | TD | Hide test category/pack after run | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-160 | Cleanup | OG | Archive or delete eligible test draft | BLOCKED-OWNER-GATE | B3 |
| TC-161 | Cleanup | TD | Revert test payment method | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-162 | Cleanup | TD | Revert test stock adjustments | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-163 | Cleanup | OG | Revert test admin role grants | BLOCKED-OWNER-GATE | B3 |
| TC-164 | Cleanup | RO | Final audit evidence review | BLOCKED-PRECONDITION | B1 |

## What Is Needed To Complete The Remaining Cases

1. Completed in Chrome rerun: real signed-in non-admin browser session for TC-002 and TC-003.
2. Completed in Chrome rerun: real authenticated owner/admin session for admin shell, direct page loads, safe control inspection, and trusted-click navigation cases.
3. Fix or investigate failed admin `Link` click routes where trusted clicks are default-prevented but do not navigate: TC-006, TC-007, TC-008, TC-009, TC-011, TC-017, TC-019, TC-020, TC-021, TC-023, TC-027, and TC-037.
4. Create an owner-approved RUN_ID manifest before TD cases create or update test categories, cards, packs, stock, settings, or reveal media.
5. Prepare real pending RUN_ID top-up, exchange, merge, and shipping records before FIN cases. Do not approve fake slips.
6. Use a non-owner admin/staff browser session for non-owner negative cases and get explicit owner approval before OG cases such as owner odds, approval, publish, archive, delete, and role grants.

## Rerun Validation Evidence

- Chrome visit to `https://www.ynottcg.com/admin`: PASS for signed-in non-admin denial and no admin-nav leak.
- Chrome authenticated owner/admin page loads: PASS for all 13 main admin routes listed in the authenticated page-load evidence table.
- Trusted click probes: PASS 11 and FAIL 12 across admin side navigation, dashboard actions, category link, and back/forward shell stability.
- Read-only controls: PASS for category dropdown options, prize required disabled save state, tier/category selectors, catalog search, image previews, removable-stock disabled state, and listed empty-state pages.
- Detailed result rows: 164 present.
- Detailed result count check: PASS 33; FAIL 12; BLOCKED-PRECONDITION 43; BLOCKED-TEST-DATA-MUTATION 45; BLOCKED-OWNER-GATE 18; BLOCKED-FINANCIAL-DATA 12; SAFETY-SKIPPED 1.
- Production mutation check: no approve/reject/save/publish/delete/role/payment/stock/shipping/exchange mutation was executed.
- `git diff --check`: pass.
- `npm run typecheck`: pass.
- `npm run verify:production-test`: pass, 53 readiness checks.

## Ralph Architect Verification

Verdict: APPROVED WITH EXECUTION BOUNDARY, UPDATED AFTER AUTHENTICATED RERUN. The report now distinguishes authenticated page-load passes, trusted-click passes, trusted-click failures, precondition-blocked read-only cases, and mutation-gated cases. The execution boundary remains conservative: production admin data, money, inventory, fulfillment, and owner permissions were not mutated without RUN_ID setup and explicit action-time approval.

## Scoped Deslop Review

- Scope: `Website/docs/qa/admin-production-click-run-report-20260515.md`
- Cleanup finding: repeated long blocker text made the detailed matrix noisy.
- Cleanup action: replaced repeated blocker text with result codes and a legend while preserving all 164 per-test results.
- Fallback-like findings: none.

## Follow-up Execution Prompt

Use this after the click-navigation bug is fixed or when a RUN_ID mutation window is explicitly approved:

```text
$ralph "continue Website/docs/qa/admin-production-click-run-report-20260515.md; retest failed trusted-click routes first, then execute remaining RO precondition cases; stop before TD/FIN/OG mutations unless a RUN_ID manifest and owner approval are present"
```
