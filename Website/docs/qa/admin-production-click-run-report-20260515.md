# Admin Production Click Run Report

- Run id: `RALPH-20260515T082158Z`
- Created: 2026-05-15T08:21:58Z
- Target: `https://www.ynottcg.com/admin`
- Source test suite: `Website/docs/qa/admin-production-click-test-cases.md`
- Mode: `$ralph` execution pass

## Executive Result

Ralph reran the production admin suite in the user's Chrome session after the user completed browser-mediated login. Chrome now reaches the production admin shell as an owner/admin account. A follow-up master-account pass created isolated `E2E-20260515-admin-prod-03` preconditions through the production admin UI, reran the blocked category, prize, stock, campaign, audit, and cleanup paths, and left the test pack closed/private with zero available test stock.

- Total test cases in suite: 164
- Result counts: PASS: 70; FAIL: 20; BLOCKED-PRECONDITION: 31; BLOCKED-TEST-DATA-MUTATION: 14; BLOCKED-OWNER-GATE: 16; BLOCKED-FINANCIAL-DATA: 12; SAFETY-SKIPPED: 1
- Production mutation performed: RUN_ID-tagged category, card, test pack, stock, and cleanup actions only
- Production admin credentials used: none
- Financial/order approvals performed: none
- Primary finding: several production admin `Link` clicks still receive trusted browser click events, but Next.js prevents the default link action and the route does not change. The owner-review submit path also returns `Request failed` for the isolated test pack even after adding and removing sufficient E2E test stock.

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

## Master-Account Unblock Rerun Addendum

- Rerun timestamp: 2026-05-15T10:05:17Z to 2026-05-15T10:31:00Z
- RUN_ID: `E2E-20260515-admin-prod-03`
- Browser target: user's Chrome master/admin session via Chrome DevTools Protocol at `127.0.0.1:9222`
- Precondition setup performed through production admin UI: two E2E categories, two E2E test prize items using `/test-assets/...`, one E2E test random-pack draft, and E2E stock add/remove operations on the test card only.
- Cleanup performed: E2E test category hidden; E2E pack closed/private; E2E stock available count returned to `0/102` with `102 archived` on the test card audit trail.
- Owner-review boundary: submit owner review was retried after adding 100 E2E stock units, but the UI still returned `Request failed`; no approve, publish, reject, real-user role, payment, shipping, or exchange action was executed.
- Audit evidence: `/admin/audit` showed `category_saved`, `category_updated`, `card_saved`, `card_stock_adjusted`, `campaign_created`, `campaign_updated`, and `campaign_close` entries for the RUN_ID.

## Master-Account Clicked Preconditions

| Area | Normal UI journey executed | Resulting coverage |
| --- | --- | --- |
| Categories | Opened `/admin/categories`, filled English/Thai names and slug for RUN_ID categories, clicked save, selected the saved category from the existing-category dropdown, updated display name, toggled hidden/active, toggled normal/test-only, and clicked update. | TC-029 to TC-035, TC-038 |
| Prize catalog | Opened `/admin/prizes`, filled card name/code/tier/category/safe `/test-assets/...` image paths, toggled test prize fields, clicked save, selected saved card by code, updated saved card, searched by name/code, and tried an unsafe external image URL. | TC-039 to TC-050 |
| Stock | Used the catalog stock controls on the RUN_ID card, clicked add stock, canceled a draft add, added one unit, removed one unit, attempted to remove more than available, then reverted the final E2E stock setup. | TC-059 to TC-063, TC-162 |
| Campaign builder | Opened `/admin/campaigns`, filled RUN_ID slug/title/Thai title, chose the RUN_ID category, toggled customer tags, toggled and removed open quantities, added/removed tier rows, used quantity helpers, selected/changed prize rows, changed prize category/quantity, saved a private draft, and verified readiness blockers. | TC-064 to TC-088 |
| Owner review | Added enough E2E stock for the test pack, clicked submit owner review, opened the owner queue area, then verified the queue stayed empty because submit returned `Request failed`. | TC-087 to TC-089 |
| Cleanup and audit | Hid the RUN_ID test category, closed the RUN_ID pack private, attempted archive private, removed E2E stock back to zero available, opened `/admin/audit`, and verified RUN_ID mutation events. | TC-100, TC-150, TC-159 to TC-164 |

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
| P7 | Executed RUN_ID-tagged production admin UI mutation on isolated test data, then verified visible UI or audit evidence. |
| P8 | Executed safe validation/control path; expected disabled state, blocker text, rejection, or non-mutating UI state was visible. |
| F1 | Failed trusted production browser click; click reached the intended anchor, but the route did not change after Next.js default-prevented the link action. |
| F2 | Failed functional expectation after a real production UI action; the click/save ran, but the expected validation, owner-review, or blocker behavior did not occur. |
| F3 | Failed cleanup/action expectation on isolated test data; the UI returned `Request failed` or saved unchanged state. |
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
| Categories | 10 | PASS: 7; FAIL: 3 |
| Prizes | 12 | PASS: 12 |
| Prize pool | 8 | BLOCKED-PRECONDITION: 3; BLOCKED-TEST-DATA-MUTATION: 3; BLOCKED-OWNER-GATE: 2 |
| Catalog stock | 5 | PASS: 4; FAIL: 1 |
| Campaigns | 25 | PASS: 17; FAIL: 3; BLOCKED-PRECONDITION: 2; BLOCKED-TEST-DATA-MUTATION: 3 |
| Owner review | 16 | PASS: 1; FAIL: 1; BLOCKED-PRECONDITION: 4; BLOCKED-OWNER-GATE: 10 |
| Users | 7 | PASS: 1; BLOCKED-PRECONDITION: 2; BLOCKED-OWNER-GATE: 3; BLOCKED-TEST-DATA-MUTATION: 1 |
| Users merge | 2 | BLOCKED-FINANCIAL-DATA: 2 |
| Top-ups | 6 | PASS: 1; BLOCKED-PRECONDITION: 1; BLOCKED-FINANCIAL-DATA: 3; SAFETY-SKIPPED: 1 |
| Exchange | 5 | PASS: 1; BLOCKED-PRECONDITION: 1; BLOCKED-FINANCIAL-DATA: 3 |
| Shipping | 8 | PASS: 1; BLOCKED-PRECONDITION: 3; BLOCKED-FINANCIAL-DATA: 4 |
| Settings | 6 | BLOCKED-PRECONDITION: 3; BLOCKED-TEST-DATA-MUTATION: 3 |
| Reveal Videos | 8 | PASS: 1; BLOCKED-PRECONDITION: 4; BLOCKED-TEST-DATA-MUTATION: 3 |
| Rankings | 2 | PASS: 1; BLOCKED-PRECONDITION: 1 |
| Audit | 2 | PASS: 2 |
| Health | 2 | PASS: 1; BLOCKED-PRECONDITION: 1 |
| Cross-page | 6 | BLOCKED-PRECONDITION: 6 |
| Cleanup | 6 | PASS: 3; FAIL: 1; BLOCKED-TEST-DATA-MUTATION: 1; BLOCKED-OWNER-GATE: 1 |

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
| TC-029 | Categories | RO | Required field validation for new category | PASS | P8 |
| TC-030 | Categories | TD | Create normal hidden test category | PASS | P7 |
| TC-031 | Categories | TD | Create test-only visible-to-test category | PASS | P7 |
| TC-032 | Categories | TD | Update selected category display name | PASS | P7 |
| TC-033 | Categories | TD | Toggle category active/hidden state | PASS | P7 |
| TC-034 | Categories | TD | Toggle category test-only/normal | PASS | P7 |
| TC-035 | Categories | RO | Duplicate slug validation | FAIL | F2 |
| TC-036 | Categories | RO | Existing category dropdown loads options | PASS | P6 |
| TC-037 | Categories | RO | Open Random Pack Studio from category page | FAIL | F1 |
| TC-038 | Categories | RO | Preview storefront category link | FAIL | F1 |
| TC-039 | Prizes | RO | Card form required fields validation | PASS | P6 |
| TC-040 | Prizes | TD | Create test card with safe asset | PASS | P7 |
| TC-041 | Prizes | TD | Create test card with category selected | PASS | P7 |
| TC-042 | Prizes | TD | Edit existing test card by code/name | PASS | P7 |
| TC-043 | Prizes | RO | Unsafe external test asset rejection | PASS | P8 |
| TC-044 | Prizes | TD | Test prize toggle reveals extra fields | PASS | P8 |
| TC-045 | Prizes | RO | Card tier selection accepts supported tiers | PASS | P6 |
| TC-046 | Prizes | RO | Card category selector shows categories | PASS | P6 |
| TC-047 | Prizes | TD | Save card with quantity or stock metadata if present | PASS | P6 |
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
| TC-059 | Catalog stock | TD | Add one stock unit | PASS | P7 |
| TC-060 | Catalog stock | TD | Cancel stock add draft | PASS | P8 |
| TC-061 | Catalog stock | TD | Remove one available stock unit | PASS | P7 |
| TC-062 | Catalog stock | RO | Reject remove more than available | FAIL | F2 |
| TC-063 | Catalog stock | RO | Stock action disabled for unavailable state | PASS | P6 |
| TC-064 | Campaigns | RO | Draft form required title validation | FAIL | F2 |
| TC-065 | Campaigns | TD | Create minimal test-only draft pack | PASS | P7 |
| TC-066 | Campaigns | TD | Choose category in campaign builder | PASS | P7 |
| TC-067 | Campaigns | TD | Set customer tags | PASS | P7 |
| TC-068 | Campaigns | TD | Toggle available open quantity: single | PASS | P7 |
| TC-069 | Campaigns | TD | Toggle available open quantity: multi | PASS | P7 |
| TC-070 | Campaigns | TD | Remove an open quantity | PASS | P7 |
| TC-071 | Campaigns | TD | Toggle tier availability on | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-072 | Campaigns | TD | Toggle tier availability off | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-073 | Campaigns | TD | Add tier count row | PASS | P7 |
| TC-074 | Campaigns | TD | Remove tier count row | PASS | P7 |
| TC-075 | Campaigns | TD | Set quantity to 1 helper | PASS | P7 |
| TC-076 | Campaigns | TD | Fill remainder helper | PASS | P7 |
| TC-077 | Campaigns | RO | Tier total mismatch blocker | PASS | P8 |
| TC-078 | Campaigns | TD | Choose prize in campaign builder | PASS | P7 |
| TC-079 | Campaigns | TD | Change selected prize | PASS | P7 |
| TC-080 | Campaigns | TD | Change prize category | PASS | P7 |
| TC-081 | Campaigns | TD | Change prize quantity | PASS | P7 |
| TC-082 | Campaigns | TD | Remove prize row | PASS | P7 |
| TC-083 | Campaigns | RO | Missing prize readiness blocker | PASS | P8 |
| TC-084 | Campaigns | RO | Missing image/card readiness blocker | BLOCKED-PRECONDITION | B1 |
| TC-085 | Campaigns | TD | Edit existing draft settings | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-086 | Campaigns | RO | Direct live/public save blocked | BLOCKED-PRECONDITION | B1 |
| TC-087 | Campaigns | TD | Submit owner review | FAIL | F2 |
| TC-088 | Campaigns | RO | Submit owner review disabled with blockers | FAIL | F2 |
| TC-089 | Owner review | RO | Owner queue displays pending pack | FAIL | F2 |
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
| TC-100 | Owner review | OG | Close private | PASS | P7 |
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
| TC-150 | Audit | RO | Audit includes mutation evidence | PASS | P7 |
| TC-151 | Health | RO | Health page loads | PASS | P4 |
| TC-152 | Health | RO | Health links/actions are read-only | BLOCKED-PRECONDITION | B1 |
| TC-153 | Cross-page | RO | Session expiry during admin action | BLOCKED-PRECONDITION | B1 |
| TC-154 | Cross-page | RO | Browser refresh preserves form-safe state | BLOCKED-PRECONDITION | B1 |
| TC-155 | Cross-page | RO | Double-click submit idempotency | BLOCKED-PRECONDITION | B1 |
| TC-156 | Cross-page | RO | Rate limit or spam guard | BLOCKED-PRECONDITION | B1 |
| TC-157 | Cross-page | RO | Mobile admin navigation | BLOCKED-PRECONDITION | B1 |
| TC-158 | Cross-page | RO | Desktop layout scan | BLOCKED-PRECONDITION | B1 |
| TC-159 | Cleanup | TD | Hide test category/pack after run | PASS | P8 |
| TC-160 | Cleanup | OG | Archive or delete eligible test draft | FAIL | F3 |
| TC-161 | Cleanup | TD | Revert test payment method | BLOCKED-TEST-DATA-MUTATION | B2 |
| TC-162 | Cleanup | TD | Revert test stock adjustments | PASS | P7 |
| TC-163 | Cleanup | OG | Revert test admin role grants | BLOCKED-OWNER-GATE | B3 |
| TC-164 | Cleanup | RO | Final audit evidence review | PASS | P7 |

## What Is Needed To Complete The Remaining Cases

1. Completed in Chrome rerun: real signed-in non-admin browser session for TC-002 and TC-003.
2. Completed in Chrome rerun: real authenticated owner/admin session for admin shell, direct page loads, safe control inspection, and trusted-click navigation cases.
3. Completed in master-account Chrome rerun: RUN_ID-scoped UI preconditions for categories, prize catalog, test stock, campaign builder, owner-review submit attempt, cleanup, and audit evidence.
4. Fix or investigate failed admin `Link` click routes where trusted clicks are default-prevented but do not navigate: TC-006, TC-007, TC-008, TC-009, TC-011, TC-017, TC-019, TC-020, TC-021, TC-023, TC-027, TC-037, and TC-038.
5. Fix or investigate failed functional expectations: duplicate category slug saved without duplicate rejection, blank campaign titles did not block save as expected, stock over-remove archived available stock instead of rejecting, owner-review submit returned `Request failed`, owner queue stayed empty, and archive-private returned `Request failed`.
6. Prepare real pending RUN_ID top-up, exchange, merge, and shipping records before FIN cases. Do not approve fake slips.
7. Use a separate non-owner admin/staff browser session for non-owner negative cases. No real-user role grants or deactivations were executed in this rerun.
8. Owner odds, approve, publish, reject, delete, remove, and role-grant cases remain blocked because no pending owner-review record could be produced and those actions would change live production state.

## Rerun Validation Evidence

- Chrome visit to `https://www.ynottcg.com/admin`: PASS for signed-in non-admin denial and no admin-nav leak.
- Chrome authenticated owner/admin page loads: PASS for all 13 main admin routes listed in the authenticated page-load evidence table.
- Trusted click probes: PASS 11 and FAIL 12 across admin side navigation, dashboard actions, category link, and back/forward shell stability.
- Read-only controls: PASS for category dropdown options, prize required disabled save state, tier/category selectors, catalog search, image previews, removable-stock disabled state, and listed empty-state pages.
- Master-account UI preconditions: PASS for RUN_ID test category creation/update/hide, safe test card creation/update, stock add/cancel/remove, test pack creation, campaign builder controls, close-private cleanup, stock cleanup, and audit evidence.
- Master-account failed assertions: FAIL for duplicate category slug validation, campaign blank-title validation, stock over-remove rejection, owner-review submit, owner queue pending item visibility, and archive-private cleanup.
- Detailed result rows: 164 present.
- Detailed result count check: PASS 70; FAIL 20; BLOCKED-PRECONDITION 31; BLOCKED-TEST-DATA-MUTATION 14; BLOCKED-OWNER-GATE 16; BLOCKED-FINANCIAL-DATA 12; SAFETY-SKIPPED 1.
- Production mutation check: all mutations were limited to RUN_ID-tagged category, card, test pack, and stock setup/cleanup. No payment, shipping, exchange, real-user role, approve, publish, reject, remove, or fake-slip action was executed.
- `git diff --check`: pass.
- `npm run typecheck`: pass.
- `npm run verify:production-test`: pass, 53 readiness checks.

## Post-Fix Production Validation Addendum

Date: 2026-05-15

Fix commit validated on production: `ecf3058`

Deployment validated: `https://ynott-website-936iall9m-yoonaevilzgmailcoms-projects.vercel.app`

Production aliases on the validated deployment: `https://www.ynottcg.com`, `https://ynottcg.com`, `https://ynott-website.vercel.app`

Chrome session: user's logged-in production Chrome session through CDP at `127.0.0.1:9222`.

RUN_ID: `E2E-20260515-FIX-ECF3058`

Result: PASS 34 / FAIL 0.

Navigation and sub-button rerun:

- Trusted admin clicks: PASS 24 / FAIL 0.
- Covered side navigation, dashboard action cards, category `Open Random Pack Studio`, and category `Preview storefront`.
- Summary evidence: `NAV_SUMMARY {"commit":"ecf3058","total":24,"passed":24,"failed":0}`.

Functional rerun:

- TC-034 hidden/test category create: PASS, category `25011881-d964-453d-b3ee-065a741e6a0f`, slug `e2e-fix-ecf3058-42raix`.
- TC-035 duplicate category slug: PASS, returned `409 CATEGORY_DUPLICATE_SLUG`.
- TC-052 test card create: PASS, card `5b38ddc3-a4f4-4780-a575-f0b41253a986`, code `E2E-FIX-42RAIX`.
- TC-061 test stock add: PASS, +2 available test units.
- TC-062 stock over-remove: PASS, returned `409 CARD_STOCK_INSUFFICIENT_AVAILABLE`.
- TC-064 blank campaign create and patch: PASS, both returned `400 CAMPAIGN_TITLE_REQUIRED` before mutation.
- TC-085 test campaign create with prize plan: PASS, campaign `b129b92d-159b-42b9-b4ca-495b3228598c`, readiness `ready=true`.
- TC-087 submit owner review: PASS, returned `approvalStatus=pending_review`.
- TC-089 owner queue pending item: PASS, admin campaigns page showed `[E2E] Admin smoke ecf3058 42RAIX`.

Cleanup evidence:

- Owner review was returned for changes through `request_changes`: PASS, `approvalStatus=changes_requested`.
- Test pack was closed private: PASS, `status=closed`, `visibility=private`.
- Test stock cleanup removed the +2 available units: PASS, `availableUnits=0`, `reservedUnits=0`, `allocatedUnits=0`, `archivedUnits=2`.
- No fake slip approval, real-user role change, real-data approval, publish, delete, or remove action was executed.

## Ralph Architect Verification

Verdict: APPROVED WITH EXECUTION BOUNDARY, UPDATED AFTER MASTER-ACCOUNT UNBLOCK RERUN. The report now distinguishes authenticated page-load passes, trusted-click passes, trusted-click failures, RUN_ID-scoped production mutations, functional failures, and remaining blocked financial/owner-gated cases. The execution boundary remains conservative: money, fulfillment, real-user roles, fake-slip approval, approve/publish/reject/remove/delete owner actions, and non-test data were not mutated.

## Scoped Deslop Review

- Scope: `Website/docs/qa/admin-production-click-run-report-20260515.md`
- Cleanup finding: repeated long blocker text made the detailed matrix noisy.
- Cleanup action: replaced repeated blocker text with result codes and a legend while preserving all 164 per-test results.
- Fallback-like findings: none.

## Follow-up Execution Prompt

Use this after the click-navigation and owner-review submit bugs are fixed, or when separate FIN/role preconditions are intentionally prepared:

```text
$ralph "continue Website/docs/qa/admin-production-click-run-report-20260515.md; retest failed trusted-click routes and failed RUN_ID admin actions first; then execute remaining FIN/role cases only with separate RUN_ID pending records and a non-owner test session; do not approve fake slips or mutate real users"
```
