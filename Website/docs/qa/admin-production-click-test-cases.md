# Admin Production Click Test Cases

Created: 2026-05-15
Plan: `Website/docs/plans/ralplan-admin-production-click-test-cases.md`
Target: `https://www.ynottcg.com/admin`

## Scope

This suite is for real browser clicks against production admin pages. It covers current admin navigation, buttons, sub-buttons, form fields, disabled states, and major scenarios visible in the YNOTT admin UI.

Do not execute state-changing production cases without a run manifest and role-appropriate approval. This document creates the test plan only; it does not authorize destructive production changes by itself.

## Safety Lanes

- **RO**: read-only check. Safe to execute.
- **TD**: reversible test-data mutation. Use only `[E2E]` names and run-id labels.
- **FIN**: financial/order mutation. Use only real pending test-owned records. Do not approve fake slips.
- **OG**: owner-gated or destructive action. Requires explicit owner approval at execution time.

## Standard Run Data

Use one run id for all test data in one execution:

```text
RUN_ID=E2E-YYYYMMDD-admin-prod-01
TEST_CATEGORY_NAME=[E2E] RUN_ID Category
TEST_CATEGORY_SLUG=e2e-run-id-category
TEST_CARD_CODE=E2E-RUN-ID-CARD-01
TEST_CARD_NAME=[E2E] RUN_ID Prize Card
TEST_PACK_TITLE=[E2E] RUN_ID Random Pack
TEST_PACK_SLUG=e2e-run-id-random-pack
TEST_TAGS=PSA10, New Exclusive, E2E
TEST_PAYMENT_CODE=e2e-run-id-promptpay
TEST_PAYMENT_NAME=[E2E] RUN_ID PromptPay
TEST_NOTE=E2E production admin click test RUN_ID
```

Record for every case:

- actor account and role;
- route;
- screenshot or note;
- pass/fail/skip;
- skip reason if no matching production record exists;
- cleanup action if data was changed.

## Cases

| ID | Page | Actor | Safety | Scenario | Real production click steps | Acceptance criteria |
| --- | --- | --- | --- | --- | --- | --- |
| TC-001 | `/admin` | Logged-out visitor | RO | Admin root requires login/admin gate | Open `https://www.ynottcg.com/admin` in a clean session. | User is not shown admin tools; login or access-required state appears; no admin data is visible. |
| TC-002 | `/admin` | Non-admin user | RO | Non-admin cannot enter admin | Log in as a normal customer; open `/admin`; click Back home if shown. | Admin tools are hidden; access-required message appears; Back home returns to storefront. |
| TC-003 | Header/nav | Non-admin user | RO | Admin nav hidden for non-admin | Log in as normal customer; inspect main navigation and account menu. | No Admin link or admin-only page link is visible. |
| TC-004 | `/admin` | Admin/staff | RO | Admin can open dashboard | Log in as admin/staff; open `/admin`. | Dashboard loads with admin shell, side navigation, and no permission error. |
| TC-005 | `/admin` | Owner | RO | Owner can open dashboard | Log in as owner; open `/admin`. | Dashboard loads; owner-only controls become available on owner pages where state allows them. |
| TC-006 | Admin nav | Admin/staff | RO | Navigation to Random Packs | From `/admin`, click `Random Packs`. | Browser route is `/admin/campaigns`; random pack studio/queue is visible. |
| TC-007 | Admin nav | Admin/staff | RO | Navigation to Categories | From `/admin`, click `Categories`. | Browser route is `/admin/categories`; category form/list is visible. |
| TC-008 | Admin nav | Admin/staff | RO | Navigation to Prizes | From `/admin`, click `Prizes`. | Browser route is `/admin/prizes`; prize/card tools are visible. |
| TC-009 | Admin nav | Admin/staff | RO | Navigation to Users | From `/admin`, click `Users`. | Browser route is `/admin/users`; user role controls or empty state appears. |
| TC-010 | Admin nav | Admin/staff | RO | Navigation to Top-ups | From `/admin`, click `Top-ups`. | Browser route is `/admin/top-ups`; top-up review list or empty state appears. |
| TC-011 | Admin nav | Admin/staff | RO | Navigation to Rankings | From `/admin`, click `Rankings`. | Browser route is `/admin/rankings`; rankings table or empty state appears. |
| TC-012 | Admin nav | Admin/staff | RO | Navigation to Shipping | From `/admin`, click `Shipping`. | Browser route is `/admin/shipping`; shipping list/actions or empty state appears. |
| TC-013 | Admin nav | Admin/staff | RO | Navigation to Exchange | From `/admin`, click `Exchange`. | Browser route is `/admin/exchange`; exchange order list/actions or empty state appears. |
| TC-014 | Admin nav | Admin/staff | RO | Navigation to Settings | From `/admin`, click `Settings`. | Browser route is `/admin/settings`; payment method form and wallet preview are visible. |
| TC-015 | Admin nav | Admin/staff | RO | Navigation to Reveal Videos | From `/admin`, click `Reveal Videos`. | Browser route is `/admin/tier-animations`; tier animation form appears. |
| TC-016 | Admin nav | Admin/staff | RO | Navigation to Audit | From `/admin`, click `Audit`. | Browser route is `/admin/audit`; audit log table or empty state appears. |
| TC-017 | Admin nav | Admin/staff | RO | Navigation to Health | From `/admin`, click `Health`. | Browser route is `/admin/health`; platform health panel appears. |
| TC-018 | Admin shell | Admin/staff | RO | Browser back/forward keeps admin shell stable | Click `Prizes`; click `Categories`; use browser Back then Forward. | Route changes correctly; admin shell remains visible; no blank page or client error. |
| TC-019 | Dashboard | Admin/staff | RO | Open dashboard quick action: Random Packs | Open `/admin`; click the Random Packs quick action/card. | `/admin/campaigns` opens. |
| TC-020 | Dashboard | Admin/staff | RO | Open dashboard quick action: Prizes | Open `/admin`; click the Prizes quick action/card. | `/admin/prizes` opens. |
| TC-021 | Dashboard | Admin/staff | RO | Open dashboard quick action: Categories | Open `/admin`; click the Categories quick action/card. | `/admin/categories` opens. |
| TC-022 | Dashboard | Admin/staff | RO | Open dashboard quick action: Top-ups | Open `/admin`; click the Top-ups quick action/card. | `/admin/top-ups` opens. |
| TC-023 | Dashboard | Admin/staff | RO | Open dashboard quick action: Users | Open `/admin`; click the Users quick action/card. | `/admin/users` opens. |
| TC-024 | Dashboard | Admin/staff | RO | Open dashboard quick action: Exchange | Open `/admin`; click the Exchange quick action/card. | `/admin/exchange` opens. |
| TC-025 | Dashboard | Admin/staff | RO | Open dashboard quick action: Shipping | Open `/admin`; click the Shipping quick action/card. | `/admin/shipping` opens. |
| TC-026 | Dashboard | Admin/staff | RO | Open dashboard quick action: Settings | Open `/admin`; click the Settings quick action/card. | `/admin/settings` opens. |
| TC-027 | Dashboard | Admin/staff | RO | Open dashboard quick action: Health | Open `/admin`; click health/system link. | `/admin/health` opens and reports current health states. |
| TC-028 | Dashboard | Admin/staff | RO | Dashboard card disabled/empty states | Open `/admin`; inspect cards with no pending records. | Empty state text is clear; no button claims success without data. |
| TC-029 | Categories | Admin/staff | RO | Required field validation for new category | Open `/admin/categories`; leave name/slug empty; click Save new category. | Form blocks save or API returns validation; no category is created. |
| TC-030 | Categories | Admin/staff | TD | Create normal hidden test category | Fill name `TEST_CATEGORY_NAME`; slug `TEST_CATEGORY_SLUG`; select hidden/inactive if available; click Save new category. | Category appears in admin list with hidden/inactive/test marker; storefront does not expose it if hidden. |
| TC-031 | Categories | Admin/staff | TD | Create test-only visible-to-test category | Fill name/slug with RUN_ID; toggle test-only; set active if needed; click Save new category. | Category saves with test-only flag and appears in admin category selector. |
| TC-032 | Categories | Admin/staff | TD | Update selected category display name | Select `TEST_CATEGORY_NAME` from existing-category dropdown; change name to `[E2E] RUN_ID Category Updated`; click Update selected. | Selected row updates; slug remains stable unless explicitly changed. |
| TC-033 | Categories | Admin/staff | TD | Toggle category active/hidden state | Select test category; toggle active/hidden control; click Update selected. | Admin list reflects new status; storefront visibility matches status. |
| TC-034 | Categories | Admin/staff | TD | Toggle category test-only/normal | Select test category; switch test-only/normal; click Update selected. | Category status changes; warning or label shows correct test-only state. |
| TC-035 | Categories | Admin/staff | RO | Duplicate slug validation | Try to create a second category with same `TEST_CATEGORY_SLUG`; click Save new category. | Duplicate slug is rejected; original category is unchanged. |
| TC-036 | Categories | Admin/staff | RO | Existing category dropdown loads options | Open category dropdown. | Existing categories render with clear names/slugs; no duplicate ambiguous blank options. |
| TC-037 | Categories | Admin/staff | RO | Open Random Pack Studio from category page | Click `Open Random Pack Studio` or equivalent link. | `/admin/campaigns` opens. |
| TC-038 | Categories | Admin/staff | RO | Preview storefront category link | Click preview/storefront link for a safe category. | Storefront opens or 404/hidden state matches category visibility; admin session is not lost. |
| TC-039 | Prizes | Admin/staff | RO | Card form required fields validation | Open `/admin/prizes`; leave card code/name empty; click Save prize item. | Validation blocks save; no card is created. |
| TC-040 | Prizes | Admin/staff | TD | Create test card with safe asset | Fill code `TEST_CARD_CODE`; name `TEST_CARD_NAME`; tier low/common; set image URL to an approved `/test-assets/...` path; toggle test prize; click Save prize item. | Card saves; appears in card catalog/picker with image/name/code. |
| TC-041 | Prizes | Admin/staff | TD | Create test card with category selected | In card form, choose `TEST_CATEGORY_NAME`; fill code/name with `-CAT`; click Save prize item. | Card saves with selected category; category appears in card metadata. |
| TC-042 | Prizes | Admin/staff | TD | Edit existing test card by code/name | Reuse `TEST_CARD_CODE`; change name to `[E2E] RUN_ID Prize Card Updated`; click Save prize item. | Existing card updates instead of creating duplicate. |
| TC-043 | Prizes | Admin/staff | RO | Unsafe external test asset rejection | Try to save a test prize image URL not under approved test assets. | Save is rejected or warning appears; unsafe asset is not stored. |
| TC-044 | Prizes | Admin/staff | TD | Test prize toggle reveals extra fields | Toggle `test prize` on and off in the card form. | Test-only fields/labels appear when enabled and hide or disable when off. |
| TC-045 | Prizes | Admin/staff | RO | Card tier selection accepts supported tiers | Change tier selector through all visible tier values without saving. | Each visible tier can be selected; no client error. |
| TC-046 | Prizes | Admin/staff | RO | Card category selector shows categories | Open category selector in card form. | Active categories show readable names; test category is identifiable. |
| TC-047 | Prizes | Admin/staff | TD | Save card with quantity or stock metadata if present | Fill optional quantity/stock metadata with `1`; click Save prize item. | Card saves; stock metadata displays consistently. |
| TC-048 | Prizes | Admin/staff | RO | Search card catalog by name | Type part of `TEST_CARD_NAME` in catalog search. | Catalog filters to matching test card. |
| TC-049 | Prizes | Admin/staff | RO | Search card catalog by code | Type `TEST_CARD_CODE` in catalog search. | Catalog filters to matching card code. |
| TC-050 | Prizes | Admin/staff | RO | Catalog image preview is visible | Locate test card in catalog. | Image thumbnail, name, code, tier, and category are visible enough to distinguish similar cards. |
| TC-051 | Prize pool | Admin/staff | RO | Prize slot required fields validation | Open `/admin/prizes`; leave campaign/card empty in prize slot form; click Save campaign prize slot. | Validation blocks save; no prize slot is created. |
| TC-052 | Prize pool | Admin/staff | TD | Add test card to test campaign prize slot | Select `TEST_PACK_TITLE`; select `TEST_CARD_NAME`; choose category `TEST_CATEGORY_NAME`; choose tier; set rank `1`; quantity `1`; click Save campaign prize slot. | Prize row saves and appears under assigned inventory. |
| TC-053 | Prize pool | Admin/staff | TD | Change selected prize category | Select same test campaign/card; change category dropdown; click Save campaign prize slot. | Prize slot updates category; inventory summary refreshes. |
| TC-054 | Prize pool | Admin/staff | TD | Change tier and rank | Select same slot; change tier and rank `2`; click Save campaign prize slot. | Saved prize shows updated tier/rank ordering. |
| TC-055 | Prize pool | Admin/staff | RO | Quantity zero validation | Select campaign/card; enter quantity `0`; click Save campaign prize slot. | Validation rejects zero quantity; existing slot unchanged. |
| TC-056 | Prize pool | Owner | OG | Owner-only weight field saves | On owner account, select test prize slot; enter weight `1000`; click Save campaign prize slot or owner odds save. | Weight saves; campaign owner-review state resets if required; audit records update. |
| TC-057 | Prize pool | Owner | OG | Owner-only unlock percent saves | Enter unlock percent `30`; save owner odds. | Unlock value saves and displays; value is within 0 to 100. |
| TC-058 | Prize pool | Owner | RO | Invalid unlock percent rejected | Enter unlock percent `101`; click save. | Validation rejects value; previous unlock value remains. |
| TC-059 | Catalog stock | Admin/staff | TD | Add one stock unit | Find `TEST_CARD_NAME`; click Add stock or plus; enter quantity `1`; confirm. | Available/total stock increases by 1; audit/stock history is visible if shown. |
| TC-060 | Catalog stock | Admin/staff | TD | Cancel stock add draft | Click Add stock; enter `1`; click Cancel. | Draft closes; stock count does not change. |
| TC-061 | Catalog stock | Admin/staff | TD | Remove one available stock unit | Find test card with available stock; click Remove stock or minus; enter quantity `1`; confirm. | Available/total stock decreases by 1 without going below awarded/reserved units. |
| TC-062 | Catalog stock | Admin/staff | RO | Reject remove more than available | Attempt to remove more stock than available; confirm. | Operation is rejected; counts remain unchanged. |
| TC-063 | Catalog stock | Admin/staff | RO | Stock action disabled for unavailable state | Inspect cards with no available removable stock. | Remove control is disabled or validation explains why. |
| TC-064 | Campaigns | Admin/staff | RO | Draft form required title validation | Open `/admin/campaigns`; leave title empty; click Save random pack draft. | Validation blocks save; no draft is created. |
| TC-065 | Campaigns | Admin/staff | TD | Create minimal test-only draft pack | Fill title `TEST_PACK_TITLE`; slug `TEST_PACK_SLUG`; price/cost as allowed test value; toggle test-only; select draft/private; click Save random pack draft. | Draft pack is created private/test-only and appears in campaign list. |
| TC-066 | Campaigns | Admin/staff | TD | Choose category in campaign builder | In test draft, open category selector; choose `TEST_CATEGORY_NAME`; click Save random pack draft. | Draft saves selected category; category label appears on campaign. |
| TC-067 | Campaigns | Admin/staff | TD | Set customer tags | Fill customer tags `TEST_TAGS`; click Save random pack draft. | Tags save and re-render as pack labels. |
| TC-068 | Campaigns | Admin/staff | TD | Toggle available open quantity: single | Click open quantity option `1`; save draft. | Quantity option `1` is enabled for pack. |
| TC-069 | Campaigns | Admin/staff | TD | Toggle available open quantity: multi | Click quantity options such as `5` and `10`; save draft. | Selected quantity buttons remain enabled after save. |
| TC-070 | Campaigns | Admin/staff | TD | Remove an open quantity | Click an enabled quantity option to disable it; save draft. | Removed option no longer appears as enabled. |
| TC-071 | Campaigns | Admin/staff | TD | Toggle tier availability on | Enable a tier toggle; save draft. | Tier is included in draft configuration. |
| TC-072 | Campaigns | Admin/staff | TD | Toggle tier availability off | Disable a tier toggle; save draft. | Tier is removed or disabled from draft configuration. |
| TC-073 | Campaigns | Admin/staff | TD | Add tier count row | Click Add row in tier counts; choose tier; enter quantity `1`; save draft. | Row appears and saves. |
| TC-074 | Campaigns | Admin/staff | TD | Remove tier count row | Click remove on a tier count row; save draft. | Row is removed and total recalculates. |
| TC-075 | Campaigns | Admin/staff | TD | Set quantity to 1 helper | Click qty `1` helper for a tier row. | Row quantity becomes 1 and does not break totals. |
| TC-076 | Campaigns | Admin/staff | TD | Fill remainder helper | Click fill remainder on a tier row after setting total slots. | Remaining quantity is filled correctly without exceeding total slots. |
| TC-077 | Campaigns | Admin/staff | RO | Tier total mismatch blocker | Configure tier counts that do not match prize/slot total; inspect readiness. | Readiness blocker explains mismatch; submit/publish is disabled. |
| TC-078 | Campaigns | Admin/staff | TD | Choose prize in campaign builder | In prize picker row, choose `TEST_CARD_NAME`; choose tier/category; quantity `1`; save draft. | Prize is attached to draft and visible with image/name/category. |
| TC-079 | Campaigns | Admin/staff | TD | Change selected prize | In prize row, replace selected card with another test card; save draft. | Prize row updates to new card; no duplicate stale card remains. |
| TC-080 | Campaigns | Admin/staff | TD | Change prize category | In prize row, choose a different category; save draft. | Prize row category updates and readiness recalculates. |
| TC-081 | Campaigns | Admin/staff | TD | Change prize quantity | In prize row, change quantity from `1` to `2`; save draft. | Quantity saves and total counts update. |
| TC-082 | Campaigns | Admin/staff | TD | Remove prize row | Click remove on prize row; save draft. | Prize row disappears and readiness shows missing prize if required. |
| TC-083 | Campaigns | Admin/staff | RO | Missing prize readiness blocker | Create/inspect draft with no prize rows. | Readiness section blocks owner review/publish with clear reason. |
| TC-084 | Campaigns | Admin/staff | RO | Missing image/card readiness blocker | Choose a card lacking required image if available. | Readiness blocks next step or clearly warns. |
| TC-085 | Campaigns | Admin/staff | TD | Edit existing draft settings | Select test draft; change description/tags/cost; click Save random pack draft. | Existing draft updates; campaign remains draft/private and approval resets if relevant. |
| TC-086 | Campaigns | Admin/staff | RO | Direct live/public save blocked | Try to set status live/public in editable controls; click Save status if visible. | UI or API blocks direct publish; owner review path is required. |
| TC-087 | Campaigns | Admin/staff | TD | Submit owner review | With readiness green on test draft, click Submit owner review. | Status changes to pending owner review; owner queue shows the pack. |
| TC-088 | Campaigns | Admin/staff | RO | Submit owner review disabled with blockers | On draft with blockers, inspect Submit owner review. | Button disabled or submission rejected with blocker reason. |
| TC-089 | Owner review | Owner | RO | Owner queue displays pending pack | Log in as owner; open `/admin/campaigns`; locate pending `TEST_PACK_TITLE`. | Owner review panel shows pack, prizes, readiness, and logic controls. |
| TC-090 | Owner review | Admin/staff | RO | Non-owner cannot approve owner review | Log in as admin/staff; locate pending pack. | Approve/reject/publish/delete owner controls are hidden or disabled. |
| TC-091 | Owner review | Owner | OG | Choose normal random logic | In owner panel, click normal/random logic choice; save if required. | Logic choice displays as selected; no weight/unlock fields required. |
| TC-092 | Owner review | Owner | OG | Choose weight logic | Click weight logic choice; set each prize weight with valid values; save owner odds. | Weights save; readiness remains valid if all prizes configured. |
| TC-093 | Owner review | Owner | OG | Choose unlock logic | Click unlock logic; set unlock percent such as `30`; save owner odds. | Unlock settings save and show in owner review. |
| TC-094 | Owner review | Owner | OG | Choose weight and unlock logic | Click combined logic; set weight `1000` and unlock `30`; save owner odds. | Both fields save for each selected prize. |
| TC-095 | Owner review | Owner | RO | Invalid owner weight rejected | Enter non-number or negative weight; click save owner odds. | Validation rejects; previous weight remains. |
| TC-096 | Owner review | Owner | OG | Request changes | Click Request changes; fill note `TEST_NOTE`; confirm. | Campaign returns to draft/change-requested state; note is visible/audit logged. |
| TC-097 | Owner review | Owner | OG | Reject review | On a pending test pack, click Reject; fill note; confirm. | Campaign is rejected/private; publish remains unavailable. |
| TC-098 | Owner review | Owner | OG | Approve campaign inventory | On ready pending test pack, click Approve. | Campaign approval state becomes approved; publish button becomes available if all readiness passes. |
| TC-099 | Owner review | Owner | OG | Publish approved test pack | On approved test-only pack with whitelist/test visibility ready, click Publish. | Pack becomes live/public only under intended test visibility; audit event records publish. |
| TC-100 | Owner review | Owner | OG | Close private | On live/private or test campaign where allowed, click Close private. | Campaign stops being publicly open; existing audit records remain. |
| TC-101 | Owner review | Owner | OG | Archive private | Click Archive private on eligible test campaign. | Campaign becomes archived/private and hidden from storefront. |
| TC-102 | Owner review | Owner | OG | Remove pack | Click Remove pack on eligible test draft; confirm if prompted. | Test pack is removed only when no awarded/transactional dependency blocks deletion. |
| TC-103 | Owner review | Owner | RO | Delete blocked when dependencies exist | Attempt Remove on campaign with awarded/opened items if available. | Delete is rejected or disabled; transactional history remains. |
| TC-104 | Owner review | Owner | RO | Publish blocked without approval | Try to publish a not-approved draft if control is visible. | Publish is disabled or server rejects with approval-required message. |
| TC-105 | Users | Owner | RO | User search/list loads | Open `/admin/users`; search a known test user if search exists. | User row appears with role/status details. |
| TC-106 | Users | Owner | OG | Grant staff role to test user | Select test user; choose role `staff`; keep active checked; click Save role. | User gains active staff/admin_users row; audit event records role change. |
| TC-107 | Users | Owner | OG | Grant admin role to test user | Select test user; choose role `admin`; click Save role. | User gains active admin role; admin access works for that user. |
| TC-108 | Users | Owner | OG | Owner role grant requires owner actor | As owner, choose role `owner` for approved test account; click Save role. | Role saves only for owner actor; audit records high-risk change. |
| TC-109 | Users | Admin/staff | RO | Non-owner cannot grant owner | As admin/staff, choose role `owner`; click Save role. | Operation is rejected; target role unchanged. |
| TC-110 | Users | Owner | RO | Cannot deactivate own admin access | Select current owner/admin self; uncheck active admin; click Save role. | Operation is rejected; user remains active admin/owner. |
| TC-111 | Users | Owner/admin | TD | Deactivate test admin role | Select test admin user; uncheck active admin; click Save role. | Test user loses admin navigation/access; audit logs deactivation. |
| TC-112 | Users merge | Admin/staff | FIN | Approve merge request | Open `/admin/users`; locate test merge request; click Approve merge. | Merge completes through approved RPC; identities consolidate; audit/event visible. |
| TC-113 | Users merge | Admin/staff | FIN | Reject merge request | Locate test merge request; click Reject merge. | Merge request becomes rejected; accounts remain separate. |
| TC-114 | Top-ups | Admin/staff | RO | Top-up list empty state | Open `/admin/top-ups` with no pending records. | Clear empty state appears; no approve/reject buttons without records. |
| TC-115 | Top-ups | Admin/staff | RO | Top-up note input accepts text | Locate a test pending top-up; type `TEST_NOTE` in admin note field. | Note remains in field before action; no mutation occurs until approve/reject click. |
| TC-116 | Top-ups | Admin/staff | FIN | Reject test top-up | Locate test pending top-up created for RUN_ID; enter note; click Reject. | Status becomes rejected; wallet is not credited; audit event records rejection. |
| TC-117 | Top-ups | Admin/staff | FIN | Approve real test top-up | Locate real pending test top-up with valid slip; enter note; click Approve. | Status becomes approved; wallet credits exactly once; audit event records approval. |
| TC-118 | Top-ups | Admin/staff | FIN | Duplicate approve is idempotent | After approving test top-up, click Approve again if still visible or refresh and retry route action. | No second wallet credit occurs; UI blocks or API rejects duplicate. |
| TC-119 | Top-ups | Admin/staff | RO | Approve fake slip is not allowed | Use a fake-slip test row only as negative data; do not click approve; record that approval is skipped. | Case is marked skipped/blocked by safety rule; no fake slip is approved. |
| TC-120 | Exchange | Admin/staff | RO | Exchange list empty state | Open `/admin/exchange` with no pending records. | Clear empty state appears; no approve/reject buttons without records. |
| TC-121 | Exchange | Admin/staff | RO | Coin value validation | Locate test pending exchange; clear coin value; click Approve. | Validation blocks or API rejects missing/invalid coin value. |
| TC-122 | Exchange | Admin/staff | FIN | Approve test exchange | Enter coin value such as `10`; note `TEST_NOTE`; click Approve. | Exchange approved; wallet/ledger reflects expected credit; collection items move to exchanged state. |
| TC-123 | Exchange | Admin/staff | FIN | Reject test exchange | Locate test pending exchange; add note; click Reject. | Exchange rejected; items remain eligible/owned as expected. |
| TC-124 | Exchange | Admin/staff | FIN | Duplicate exchange action blocked | Retry approve/reject after final state. | UI hides buttons or API rejects already-final order. |
| TC-125 | Shipping | Admin/staff | RO | Shipping list empty state | Open `/admin/shipping` with no records. | Clear empty state appears. |
| TC-126 | Shipping | Admin/staff | RO | Required status validation | Locate test shipping request; clear or leave status invalid if possible; click Update shipping. | Validation blocks invalid status. |
| TC-127 | Shipping | Admin/staff | FIN | Set status packing | Select `packing`; enter note; click Update shipping. | Request status becomes packing; customer/admin detail reflects status. |
| TC-128 | Shipping | Admin/staff | FIN | Set status shipped with carrier/tracking | Select `shipped`; fill carrier `E2E Carrier`; tracking `E2E-RUN-ID-TRACK`; note; click Update shipping. | Status becomes shipped; carrier/tracking persist. |
| TC-129 | Shipping | Admin/staff | FIN | Set status delivered | Select `delivered`; click Update shipping. | Request becomes delivered; no further packing/shipped mutation is needed. |
| TC-130 | Shipping | Admin/staff | FIN | Cancel test shipping request | Select `cancelled`; enter note; click Update shipping. | Request becomes cancelled; items follow expected eligibility rules. |
| TC-131 | Shipping | Admin/staff | RO | Tracking optional before shipped | Select `packing`; leave carrier/tracking blank; click Update shipping. | Update succeeds or validation explains required fields by status. |
| TC-132 | Shipping | Admin/staff | RO | Duplicate final update blocked or stable | After delivered/cancelled, try another update if controls remain. | UI blocks or status remains consistent; no contradictory final state. |
| TC-133 | Settings | Admin/staff | RO | Payment method required fields | Open `/admin/settings`; leave code/display name empty; click Save payment method. | Validation rejects missing required fields. |
| TC-134 | Settings | Admin/staff | TD | Create PromptPay payment method | Fill code `TEST_PAYMENT_CODE`; display name `TEST_PAYMENT_NAME`; choose PromptPay type; fill PromptPay value; instructions `TEST_NOTE`; click Save payment method. | Payment method saves and appears in wallet/top-up payment options if active. |
| TC-135 | Settings | Admin/staff | TD | Update payment instructions | Reuse same code; change instructions; click Save payment method. | Existing payment method updates instead of duplicate code. |
| TC-136 | Settings | Admin/staff | TD | Create bank transfer payment method | Fill new code with `-bank`; choose bank type; fill bank/account fields; click Save payment method. | Bank method saves with correct display metadata. |
| TC-137 | Settings | Admin/staff | RO | Wallet preview read-only | Inspect wallet preview/admin settings cards. | Preview data is visible but no unintended mutation button exists. |
| TC-138 | Settings | Admin/staff | RO | Duplicate payment code upsert behavior | Save same payment code twice with changed display name. | One method updates; no duplicate method row is shown. |
| TC-139 | Reveal Videos | Admin/staff | RO | Tier animation page loads all tiers | Open `/admin/tier-animations`. | Each supported tier has a form section or current media state. |
| TC-140 | Reveal Videos | Admin/staff | RO | Save with no changes | Click Save changes without selecting a file or changing duration/active. | API/UI reports no changes or leaves row unchanged; no crash. |
| TC-141 | Reveal Videos | Admin/staff | TD | Upload valid tier video/image | Choose a small approved test media file for one tier; set duration; active checked; click Save changes. | Media uploads and current media link/preview updates. |
| TC-142 | Reveal Videos | Admin/staff | RO | Reject unsupported file type | Choose unsupported file type; click Save changes. | Validation rejects file; current media remains unchanged. |
| TC-143 | Reveal Videos | Admin/staff | RO | Reject oversized media | Choose a file over the allowed size if safe test file exists. | Validation rejects; no storage update. |
| TC-144 | Reveal Videos | Admin/staff | TD | Toggle active off | Uncheck active for a test tier media; click Save changes. | Tier media becomes inactive and customer reveal flow should fall back. |
| TC-145 | Reveal Videos | Admin/staff | TD | Toggle active on | Check active; click Save changes. | Tier media becomes active and displays as current. |
| TC-146 | Reveal Videos | Admin/staff | RO | Duration validation | Enter invalid duration such as `0` or negative; click Save changes. | Validation rejects invalid duration. |
| TC-147 | Rankings | Admin/staff | RO | Rankings page loads | Open `/admin/rankings`. | Ranking table/tabs load; no mutation controls are present unless intentionally added. |
| TC-148 | Rankings | Admin/staff | RO | Ranking tab/status controls if visible | Click each visible ranking filter/tab. | Table changes/filter state updates without mutation. |
| TC-149 | Audit | Admin/staff | RO | Audit page loads | Open `/admin/audit`. | Audit events table or empty state appears. |
| TC-150 | Audit | Admin/staff | RO | Audit includes mutation evidence | After a TD/FIN case, refresh Audit. | Related audit event appears with actor/action metadata where expected. |
| TC-151 | Health | Admin/staff | RO | Health page loads | Open `/admin/health`. | Health panel appears with current checks and no client error. |
| TC-152 | Health | Admin/staff | RO | Health links/actions are read-only | Click any visible health detail/link. | Details expand or navigate safely; no production mutation occurs. |
| TC-153 | Cross-page | Admin/staff | RO | Session expiry during admin action | Open admin page; expire/logout in another tab; return and click a safe save button. | Action fails closed and asks for login/access; no anonymous mutation. |
| TC-154 | Cross-page | Admin/staff | RO | Browser refresh preserves form-safe state | Fill unsaved draft fields; refresh page before saving. | Saved data remains unchanged; unsaved data may reset without corrupting records. |
| TC-155 | Cross-page | Admin/staff | RO | Double-click submit idempotency | On a TD test record, double-click one safe save button. | Only one record/update is created; no duplicate rows from double click. |
| TC-156 | Cross-page | Admin/staff | RO | Rate limit or spam guard | Repeatedly click a safe validation-failing submit button. | UI/API rate limit or validation handles retries without partial mutation. |
| TC-157 | Cross-page | Admin/staff | RO | Mobile admin navigation | Open production admin on mobile viewport; use admin menu/nav to visit all pages. | All nav items are reachable; controls do not overlap or become unusable. |
| TC-158 | Cross-page | Admin/staff | RO | Desktop layout scan | Open each admin page on desktop. | Buttons/fields fit containers; no text overlap blocks clicking. |
| TC-159 | Cleanup | Admin/staff | TD | Hide test category/pack after run | Follow runbook hide/cleanup for `[E2E]` category and pack. | Storefront no longer exposes test artifacts; admin audit remains. |
| TC-160 | Cleanup | Owner | OG | Archive or delete eligible test draft | Owner archives/deletes only eligible test drafts with no customer history. | Test draft is gone/archived; no real campaign affected. |
| TC-161 | Cleanup | Admin/staff | TD | Revert test payment method | Update test payment method inactive/hidden if available. | Payment method no longer appears to customers; admin record remains auditable. |
| TC-162 | Cleanup | Admin/staff | TD | Revert test stock adjustments | Adjust test card stock back to original manifest value where safe. | Test card stock matches manifest; awarded/transactional units are not removed. |
| TC-163 | Cleanup | Owner/admin | OG | Revert test admin role grants | Restore test user role to original state. | User no longer has unexpected admin access; audit records revert. |
| TC-164 | Cleanup | Admin/staff | RO | Final audit evidence review | Open `/admin/audit`; filter/scan RUN_ID actions. | All executed mutations have matching audit evidence; skipped cases are recorded in manifest. |

## Execution Notes

- If a case depends on data that does not exist in production, mark it `SKIP - no matching RUN_ID record` and do not create unrelated data just to force the case.
- FIN cases should be executed only with test-owned customer accounts and real pending records created for this run.
- OG cases require explicit owner approval at the time of execution.
- The run is not complete until cleanup cases are executed or explicitly deferred with owner-approved reason.
