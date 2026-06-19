# Pull All Bulk Open Final Decision Plan

This document is the final consolidated plan for Pull All after the June 18, 2026 decision session. It supersedes the earlier pasted plan for huge-pack Pull All and folds in the answers already confirmed by product.

The goal is to let a customer buy all remaining eligible spots after the pack reaches the 60 percent sold unlock point, without changing normal 1, 10, or 100 opens, without leaking house/private draw information, and without creating huge Cloudflare, Supabase, or browser workloads.

## Decisions Already Locked

- Pull All unlocks after 60 percent sold. That means the customer can Pull All when up to 40 percent of spots remain.
- Pull All is a guaranteed full purchase. After confirmation, the customer is charged the full remaining eligible target immediately.
- Pull All cannot be cancelled after confirmation. There is no cancel state and no customer/admin cancellation action.
- The target pack becomes Customer Sold Out immediately after Pull All starts, so other customers cannot open it while processing continues.
- The pack should be treated as sold out through the active Bulk Open Session, not by rewriting every remaining slot before processing.
- The campaign may remain internally processable until the Bulk Open Session finishes, but customers see it as unavailable.
- The same customer cannot open any gacha pack while their Bulk Open Session is active. This prevents another tab or page from creating overlapping spend/open work.
- Other customers are blocked only from the target sold-out pack, not from unrelated packs.
- Active Bulk Open blocks admin live edits to that pack until completed. Admin may monitor and retry, but cannot edit cost, rewards, inventory, visibility, opening options, or Last Prize.
- Normal 1, 10, and 100 opens must keep the same customer behavior and reward logic.
- Pull All must not depend on the admin enabling the 100-open option. Normal open quantities and Pull All internal processing are separate controls.
- Pull All must not call the paid normal-open path repeatedly. That risks double debit and expensive request fanout.
- Normal opens and Pull All should share one private Bulk Award Engine so Last Prize and reward rules stay consistent.
- Bulk processing is server-owned and continues even if the customer closes the browser.
- Cloudflare Queue is the primary continuation mechanism. Automatic retry, delayed session sentinels, fallback watchdog, and admin retry only re-enqueue the same safe idempotent processor.
- Internal processing budget is 1000 spots per queue/process job at launch.
- 1000 is a maximum per queue/process job, not a promise to always process exactly 1000. The processor may stop early when time budget, Supabase latency, lock waits, or error risk rises, then persist progress and enqueue continuation. Admin/env settings may lower the budget without changing the customer-facing flow.
- The user should not notice backend batching. The UI shows a polished reveal and Customer Bag progress, not chunk terminology.
- Highlight Rewards are capped at 100 and should prioritize Last Prize and best public-facing wins.
- Pull All skips the visual/opening animation for non-highlight rewards, not the actual reward settlement. Every purchased eligible spot must still become an owned/settling reward record that can land in Customer Bag.
- Item-level ownership remains the launch source of truth. Every purchased reward becomes an individual owned/settling item row so Bag, exchange, shipping, inventory, support, and audit keep working. Bulk Open Session counters, highlights, and cursor pages are the summary layer; do not replace real rewards with aggregate quantity-only rows unless a separate stackable-inventory model is designed later.
- Highlight Reveal can start after the first safe processing batch produces highlights. It does not need to wait for the whole Pull All to finish.
- Closing Highlight Reveal lands the customer in Customer Bag, not a new bulk status page.
- Customer Bag is the place to show Pull All progress, settling, highlights, and paged rewards.
- Rewards from an active Bulk Open may be visible as settling, but exchange and shipping are locked until the session is complete.
- Bulk Open reward item rows use `collection_items.status = 'locked'` while the session is active. Customer DTO/UI maps those rows to "settling." When the Bulk Open Session completes, the finalizer bulk-updates that session's item rows to `owned`, which makes existing exchange, shipping, and conversion eligibility work without a new public status enum.
- Completion happens through one service-role finalizer transaction. It verifies `processed_slots = target_slots` and no unprocessed target work remains, bulk-updates the session's `locked` item rows to `owned`, marks the Bulk Open Session `completed`, releases same-user/admin locks, and clears only the temporary Customer Sold Out override. If finalization fails, the session stays active or retry-required and exchange/shipping do not partially unlock.
- Failed or interrupted processing becomes Retry-Required Bulk Open. It is not cancelled, refunded, or rerolled.
- Retry must be idempotent and must not change target, reward outcome, spend, or private draw logic.
- Each Pull All target result has durable private per-session idempotency, anchored by fields such as `bulk_open_session_id`, `draw_slot_id`, and/or `bulk_open_sequence`, with unique constraints. Retries must no-op or continue from unprocessed work and must never duplicate collection items, open items, Last Prize, counters, or highlights. Customer/admin DTOs never expose raw slot IDs, private sequence internals, or constraint details.
- Chunk reservation and reward creation must commit atomically inside the private processor transaction. Public `picked`/`opened` slot status alone is not the recovery source. If the transaction rolls back, the chunk is available for the same session to retry; if it commits, retry/admin resume reads committed progress and continues only unprocessed work.
- Retry-Required Bulk Open uses exponential backoff with capped automatic queue attempts. Manual admin retry only re-enqueues when no active retry is already scheduled. Repeated failures keep the session retry-required, visible to admin monitor/User 360, and described with sanitized errors only. Admin may pause processing globally, by campaign, or by session, then trigger one safe retry after fixing the cause.
- Each Pull All queue job calls one private bulk processor RPC/transaction for its current process budget, not one API/RPC call per spot. Queue payloads carry only Bulk Open Session identity and safe attempt metadata; the processor reads immutable session snapshots from the database.
- Each private bulk processor RPC uses set-based database work for its process budget. It should reserve/select eligible slots and bulk insert/update reward, ownership, history, counter, and highlight rows inside the database transaction. Cloudflare must not loop one Supabase call per reward, and Supabase must not use one transaction per reward.
- Pull All start is successful only after one database transaction commits the active Bulk Open Session, full wallet debit, spend ledger, immutable target/cost snapshots, and Customer Sold Out state. Queue enqueue happens after that commit and is retriable.
- Pull All target is exactly the available spots at confirmation time after the start transaction takes the pack/session lock. It excludes opened, picked, void, already-owned, or otherwise unavailable spots.
- Pull All start must not create or update a full per-slot manifest for huge packs. Start snapshots the target count, debits once, creates the session, and marks Customer Sold Out; queue processing reserves/processes eligible `draw_slots` in bounded chunks under service-role locks and private idempotency links.
- Pull All must never charge more than the customer-confirmed quote. If final total is higher, cost per spot changed, or protected pack config changed, start aborts before debit and the customer must refresh/reconfirm.
- Pull All confirmation uses a private Pack Open Contract snapshot/hash. Changes to openable state, visibility, cost, target, opening options, reward inventory, Last Prize, or private opening config force refresh/reconfirmation before debit; cosmetic display edits do not.
- Customer Bag shows safe, paged Settling Rewards as they are created, plus Highlight Rewards and aggregate progress. Settling Rewards are visible but locked for exchange/shipping until the Bulk Open Session completes.
- Customer-facing Pull All progress shows only safe progress fields: total purchased reward count, landed/settling count, percent complete, up to 100 Highlight Rewards, and simple status labels such as starting, landing, finishing, or complete. It must not show queue jobs, chunk number, watchdog/sentinel state, retry attempts, raw slot IDs, internal batch IDs, exact backend timing, or private mechanics.
- Customer Bag refresh uses only a small summary endpoint while visible, pauses polling when the tab is hidden or closed, and loads reward pages only by cursor on user action.
- Customer Bag uses adaptive visible-only summary polling for active Pull All sessions: every 10 seconds for the first 2 minutes after reveal close/page load, then every 30 seconds. It pauses when hidden, offline, or complete, and performs one immediate summary fetch on focus/reload.
- Closing the browser never stops reward processing. Rewards continue landing through server-owned queue processing with no browser polling; when the customer returns, Customer Bag fetches one summary and cursor-loads visible rewards.
- Each Bulk Open Session has only one active queue processor at a time. The same session never runs two processors in parallel; different sessions may process concurrently only under a global/admin-configured cap.
- Launch global Bulk Open processing cap is 2 active processors across the site, with per-session cap 1. Excess sessions remain queued, with kill switch/backoff when Supabase latency, lock waits, or error rates rise.
- Add session-scoped delayed recovery sentinels triggered by Bulk Pull start/processor commits, plus a 15-minute low-frequency service-role watchdog/sweeper for paid Bulk Open Sessions that become stale, queued without continuation, retry-due, or stuck after a worker crash. Both paths scan only safe summary state, respect pause/backoff/per-session/global locks, and re-enqueue the same idempotent processor.
- Customer UI must not show a manual Pull All retry button, and there should be no customer retry mutation at launch. Backend recovery and admin tools own retry; Customer Bag shows calm settling/progress and safe no-action-needed messaging.
- Admin/User 360 Pull All views expose only operational-safe fields: session status, customer, pack, target slots, processed slots, reward rows created, collection rows created, upfront spend, public Highlight Rewards, next retry time, last safe update time, sanitized error code, authorized pause/resume/admin retry controls, and paged open/history/Bag rows. They must not expose raw queue payloads, queue job IDs, raw slot IDs, private slot order, internal batch IDs, private idempotency keys, reward weights/private filters, or raw Pack Open Contract internals.
- Bulk Open admin role boundaries follow least privilege: owner/admin/staff may view operational-safe summaries and User 360 paged rows; owner/admin may manually retry a retry-required session; only owner may pause/resume globally, by campaign, or by session, and change processor budget or kill-switch settings at launch. Staff sees support-safe status/history only, with no retry/pause/resume controls. Every admin action audits actor admin id, role, timestamp, action, sanitized reason, and target session/campaign.
- Bulk Open admin audit is append-only and required for every retry, pause/resume, kill-switch change, processor budget change, and protected-pack edit block override attempt. Store only safe metadata: actor admin id, role, action, target type/id, previous safe status, next safe status, sanitized reason, request id, timestamp, and coarse source surface. Keep rows at least 180 days with owner-only export and paged admin viewing. Do not store raw queue payloads, raw slot IDs, private config, reward weights/private filters, idempotency keys, or raw Pack Open Contract internals.
- Bulk Open admin audit reuses the existing `audit_events` pattern at launch. Add only the minimal nullable reference/index support needed for `bulk_open_session_id`, `draw_round_id`, actor admin, event type, and created time. Store role/status/reason/request/source metadata inside sanitized `metadata`. Do not create a second audit table unless performance testing proves the shared audit table is a bottleneck.
- Completed Bulk Open retention keeps customer ownership rows, wallet/spend ledger, open/history rows, and completed Bulk Open Session summaries indefinitely because they are customer/support records. Only transient processor-attempt, sentinel, stale-lock, and queue retry metadata may be pruned or compacted after the session is completed and older than 30 days. Sanitized admin audit rows stay at least 180 days. Never prune unsettled, retry-required, queued, processing, or incomplete sessions.
- Bulk Open cleanup runs as low-frequency bounded maintenance: one daily off-peak service-role scheduled run plus owner-only manual trigger for emergencies. It is not a per-minute job and never runs inside customer/admin request paths. Each run takes an advisory lock, uses indexed completed-session lookup, processes a capped batch, records sanitized cleanup metrics, stops before timeout risk, and skips queued, processing, retry-required, unsettled, or incomplete sessions.
- Bulk Open owner alerts and operational metrics are required but low-volume. Alert owners only for retry-required sessions past threshold, repeated processor failures, sentinel/watchdog recovery failure, queue backlog/cap saturation, Supabase latency or lock-wait pressure, kill-switch/pause/resume changes, and cleanup failures. Use existing alert/audit channels where possible, with dedupe/cooldown. Alerts and metrics expose only safe fields: public session code, pack/customer support identifiers, status, processed/target counts, sanitized error code, last safe update, and next retry time. Never include queue job IDs, raw slot IDs, private slot order, idempotency keys, reward weights/private filters, raw contract internals, or house logic.
- Bulk Open launches behind an owner-controlled feature flag plus pack allowlist. Default is disabled. First enablement is for one owner-tested internal/testing pack only; real packs stay disabled until the owner confirms healthy metrics, no duplicate rewards, no stuck paid sessions, and Cloudflare/Supabase load within budget. The flag controls customer Pull All CTA and start API, while normal 1/10/100 opens remain unchanged. Owner kill switch blocks new Pull All starts but lets already-paid Bulk Open Sessions finish/retry.
- Test-pack launch preflight is mandatory before enabling the first testing pack. It must verify migration applied, feature flag default disabled, exactly one testing pack allowlisted, owner test balance ready, non-allowlisted packs hidden/blocked, normal 1/10/100 opens still passing, start API blocks non-allowlisted packs, owner metrics/alerts visible, kill switch works, Admin User 360 shows safe details, Customer Bag shows settling rewards, exchange/shipping reject unsettled rewards, and no API/DTO leaks queue IDs, raw slot IDs, private order, idempotency keys, reward/private config, contract internals, or house logic.
- First owner test pack should use about 1,200 to 2,500 total spots and trigger Pull All after 60 percent sold, so the remaining Pull All crosses the 1000-process-budget boundary and requires at least two processor jobs. This proves start/debit, Customer Sold Out, queue continuation, idempotent multi-job processing, Highlight Rewards, Bag settling, completion finalizer, Admin User 360, and owner metrics without the cost of a 100,000+ spot stress test. One larger synthetic test is still required before any real pack rollout.
- After the first owner test pack passes, run one larger synthetic/internal test before any real pack. Use about 10,000 to 25,000 total spots, trigger Pull All after 60 percent sold, and verify 4,000 to 10,000 remaining rewards settle through 4 to 10 processor jobs at the 1000 budget. This validates queue continuation, owner metrics, Bag pagination, no huge render, no duplicate rows, watchdog/sentinel behavior over more chunks, and bounded Cloudflare/Supabase load without the cost of a 100,000+ spot stress test.
- Open All/Pull All must be fully functional before any real customer launch. Testing packs, synthetic packs, feature flags, allowlists, kill switches, and staged exposure are rollout controls only; they are not a partial/demo feature mode. The production build must already support huge-pack Pull All end to end: 60 percent unlock, full upfront debit, immediate Customer Sold Out, same-user gacha lock, private queue processing, 100 Highlight Rewards, Customer Bag settling/progress, exchange/shipping only for settled rewards, Admin User 360, owner metrics/alerts, recovery, cleanup, and safe DTOs with no house/private data leak.
- After full-function readiness passes, real exposure starts through owner-selected pack or campaign allowlists, not site-wide automatic enablement. Every enabled real pack uses the same fully functional Pull All path as testing and synthetic packs. Keep global processor cap, kill switch, owner metrics, and no-leak DTO checks active; broaden only after the first real enabled pack completes cleanly.
- Pull All real-pack activation is fully integrated into the existing admin pack owner-review flow so owner/admin work stays familiar and light. Admins may request Pull All enablement from the same Pack Studio create/edit flow. The owner sees Pull All readiness inline in the existing owner approval queue/review page. When Pull All is requested and readiness passes, the normal owner approve/publish or republish action can enable Pull All in the same flow; no separate Pull All approval page or second workflow is required. The system reuses existing owner review notes where possible and writes sanitized audit automatically. Staff/admin support views may show safe status only; they cannot enable Pull All.
- When Pull All is requested for a pack or campaign, the integrated owner approve/publish or republish action must require Pull All readiness to pass. Do not publish or republish a Pull-All-requested pack as partial, demo, live-lite, normal-only fallback, or with Pull All silently disabled. The owner review page must show clear safe fix items and keep the pack held until Pull All is fully ready and properly working.
- Pull All selection is a normal enable/disable control in Pack Studio and owner review, default disabled for every new pack, draft, and live revision. Admin or owner can select enabled/disabled. Disabled means the pack follows the normal pack publish flow and never shows the Pull All CTA/start API. Enabled means Pull All is requested and the integrated owner approve/publish or republish action must block until Pull All readiness passes.
- Owner final Pull All toggle selection wins during owner review. Owner can leave Pull All disabled and publish as a normal pack, or turn it enabled when readiness passes. If the owner changes the admin's selection, the UI shows a small confirmation line and writes sanitized audit metadata with actor, previous selection, next selection, and pack/campaign id.
- After a pack is live, owner/admin may disable Pull All immediately for new starts, with sanitized audit, because this only reduces exposure and cost. Already-paid Bulk Open Sessions still finish/retry. Enabling or re-enabling Pull All on a live pack must use the existing live edit owner-review path, pass readiness, and apply through owner republish.
- Pull All start API is server-authoritative against stale customer pages. Before quote/debit/session creation, it re-checks latest Pull All enabled state, kill switch, allowlist, readiness, pack status, sold percentage, and available target inside the server transaction. If a stale CTA or confirmation modal reaches start after Pull All was disabled or no longer eligible, the response is a safe "Pull All is no longer available" state, with no debit, no Bulk Open Session, and refreshed pack state for the UI.
- Pull All start may continue when the server-confirmed final target/cost is lower than or equal to the customer-confirmed quote, only if cost per spot is unchanged, protected pack config hash is unchanged, Pull All remains enabled/ready, and final target is non-zero. Debit the lower server-confirmed total, snapshot the lower final target/cost, and show the customer the final purchased count after start. If final target is zero, cost per spot changed, protected config changed, or total is higher than the quote, abort before debit and ask the customer to refresh/reconfirm.
- Pull All start transaction must lock the customer wallet row and require available balance to cover the final server-confirmed total. If balance is enough, debit exactly that final total once. If balance is not enough, abort before Bulk Open Session creation, Customer Sold Out state, and any debit; return a friendly "wallet balance changed, please refresh or top up" state. Do not create partial sessions, partial Pull All, or background debt.
- Pull All start must be idempotent and must never double charge. The confirmation step creates a short-lived opaque server start token tied to customer, pack, quote snapshot, protected config hash, and intended Pull All action. Start requires that token and enforces one successful paid Bulk Open Session per token/session boundary. If the same valid start repeats after success, return the existing Bulk Open Session summary with no second debit and no second session. If a different, stale, or expired token arrives, block before debit and ask the customer to refresh/reconfirm. Customer/admin DTOs must never expose raw idempotency keys, constraint details, or private token internals.
- If Pull All start commits but the browser does not receive the success response, the committed paid Bulk Open Session is the source of truth. Because the wallet debit already happened, backend processing must continue or retry rewards into Customer Bag through the normal queue, sentinel, watchdog, and admin retry paths. The client must call the current-session endpoint before showing a payment error or allowing a new Pull All start. If an active paid Bulk Open Session exists, resume it and route the customer to Highlight Reveal or Customer Bag. Do not automatically refund, cancel, or create a second start because the browser missed the response.
- Resume routing for an active paid Bulk Open Session depends on safe public state. If Highlight Rewards are ready and the customer has not seen the reveal, route to Highlight Reveal capped at 100. If highlights are not ready yet, route to Customer Bag with settling/progress and safe no-action-needed messaging. Do not block on a long loading reveal, refire Pull All start, or show backend queue details. Customer Bag is the reliable landing place for active paid sessions.
- Highlight Reveal is one-time per paid Bulk Open Session. After the safe seen marker exists, every resume/reload/device return goes to Customer Bag, not the full reveal animation. Customer Bag may still show the same 100 Highlight Rewards as a summary section. The one-time marker and routing state must be safe public session metadata only, with no raw slot IDs, private sequence, reward internals, or house logic.
- Mark Highlight Reveal seen after the client confirms the first successful visible render of the safe highlight payload, not only after the close/continue button. If the reveal never successfully renders, do not write the seen marker and allow resume to try the reveal again. The mark-seen mutation is idempotent, customer-owned, and writes only safe public session metadata; it must not expose raw highlight internals, raw slot IDs, private sequence, reward internals, or house logic.
- If the mark-seen mutation fails after the highlight payload visibly rendered, do not block Customer Bag navigation. In the current tab, local UI can route to Customer Bag and retry the mark-seen mutation quietly with short bounded retry and again on focus/reload. Across devices or fresh sessions, the server marker remains the source of truth; if it never persisted, the reveal may show once more, but this must never affect rewards, wallet, processing, highlight selection, Bag contents, or house/private data.

## Corrections To The Earlier Pasted Plan

- Change process budget from 500 to 1000.
- Remove the requirement that the 100-open option must be enabled.
- Do not decompose Pull All into public/admin-configured 100, 10, and 1 paid opens.
- Do not call the existing paid normal-open RPC repeatedly for Pull All if that path owns wallet debit.
- Extract or share the reward-awarding domain engine so normal opens and Pull All use the same reward logic with different spend orchestration.
- Remove any `cancelled` Bulk Open status.
- Replace the separate Pull All page/status page with Customer Bag progress and settling.
- Replace full reward rendering with 100 highlights plus paged Customer Bag/history APIs.
- Treat Customer Sold Out as a public/session state while preserving internal processing ability.
- Add same-user global gacha-open block while a Bulk Open Session is active.
- Add admin live-edit lock while a Bulk Open Session is active.
- Remove any requirement to create/update a full per-slot manifest during the customer start transaction.
- Add session-scoped delayed sentinels plus a 15-minute fallback watchdog so paid sessions do not depend on browser polling or manual retry to recover.

## Confirmed Batch Decisions

### Batch Review Questions And Recommended Answers

Status: confirmed by owner/product as a batch.

Q53. How long should a Pull All quote/start token live?

Recommended answer: use a short server-controlled expiry, about 2 minutes at launch. Expired tokens block before debit and ask the customer to refresh/reconfirm. The exact expiry is not shown as backend mechanics.

Q54. What if the same customer opens another device/tab during an active paid Bulk Open Session?

Recommended answer: do not allow a new Pull All or normal open. Current-session should resume the existing paid session and land the customer on Highlight Reveal or Customer Bag depending on safe routing state.

Q55. What if better public wins or Last Prize are discovered after the initial Highlight Reveal?

Recommended answer: do not replay the reveal. Highlight Reveal uses the best safe highlights available when the reveal becomes ready, capped at 100. Customer Bag can update its safe highlight summary as later public-facing wins land. Last Prize and best public wins remain priority when known, with no raw slot/order/private logic exposed.

Q56. What if processing completes before the customer sees any reveal?

Recommended answer: if highlights are ready and not seen, show the one-time Highlight Reveal. After the seen marker or if highlights are not ready, Customer Bag is the landing page and can show completed state.

Q57. Can exchange or shipping unlock while rewards are still settling?

Recommended answer: no. Exchange/shipping unlock only after the completion finalizer atomically promotes the session's locked item rows to owned. No partial unlock.

Q58. What if owner kill switch or pause happens after a paid Pull All starts?

Recommended answer: kill switch blocks new starts only. Already-paid sessions continue/retry. Owner pause may pause processing, but Customer Bag shows safe settling/no-action-needed messaging and never exposes backend queue details.

Q59. What if owner changes processor budget while a Bulk Open Session is active?

Recommended answer: apply the new budget only to future processor jobs. The paid session target, spend, reward outcomes, and highlight selection rules stay unchanged.

Q60. What should support/admin do for a stuck paid Bulk Open Session?

Recommended answer: customer has no retry button. Owner/admin can retry only retry-required sessions, only when no active retry is scheduled or processing. Staff can view support-safe status only.

Q61. How many rewards can Customer Bag load at once?

Recommended answer: use cursor pagination only. Default page size should be modest; maximum page size is 1000. Never auto-load all rewards for a huge Pull All.

Q62. How do we keep a 100,000+ or 400,000+ Pull All from costing too much?

Recommended answer: one start transaction, no giant manifest write, queue processing in 1000-spot budgets, set-based database writes, small summary polling, cursor-loaded Bag pages, and no huge reward JSON/render.

Q63. What can customer/admin APIs show about Bulk Open?

Recommended answer: only safe DTOs: public session state, counts, progress, safe status labels, and public reward/card data. Never expose raw slot IDs, private order, queue IDs, private idempotency keys, reward weights/private filters, contract internals, or house logic.

Q64. What is the final launch gate before real packs?

Recommended answer: full production path must pass owner test pack, larger synthetic/internal test, normal 1/10/100 regression, Last Prize check, Bag/exchange/shipping checks, User 360/admin monitor, owner metrics/alerts, recovery, cleanup, and no-leak DTO checks before owner-selected real pack/campaign allowlist.

## Architect Implementation Plan

This section turns the locked product decisions into the implementation architecture. It is grounded in the current repo shape:

- The current normal-open API is `Website/src/app/api/ynot/gacha/open/route.ts`.
- Normal opens call one service-role RPC, `open_gacha_campaign`, and then sanitize the RPC payload before returning customer-facing data.
- The existing wallet/gacha database shape already uses `wallet_accounts`, `coin_ledger`, `gacha_opens`, `gacha_open_items`, and `collection_items`.
- The existing wallet rule is to create the wallet row when missing, lock `wallet_accounts` with `for update`, insert an idempotent `coin_ledger` entry, then update the balance inside the same transaction.
- Existing owner review, live-revision, Last Prize, User 360, exchange, shipping, and audit surfaces are already in the YNOTT admin stack and should be extended instead of bypassed.

### Principles

- Database transaction owns money, inventory reservation, session state, and idempotency. Cloudflare should orchestrate, not become the source of truth.
- Pull All is additive beside normal 1, 10, and 100 opens. Normal opens keep the current route and public behavior except for active-session and sold-out guards.
- The customer and admin surfaces receive allowlisted DTOs only. Raw slot identity, private reward parameters, idempotency internals, queue internals, and Pack Open Contract internals stay service-only.
- Huge-pack cost is bounded by one paid start transaction, queue continuation, 1000-spot maximum processor jobs, set-based database writes, small summaries, and cursor pagination.
- Recovery is idempotent and paid-session first. Once debit commits, backend queue/sentinel/watchdog/admin retry must continue settlement into Customer Bag without a second charge.

### Decision

Build a new Bulk Open pipeline that shares the private reward-award engine with normal opens, but separates spend orchestration from reward settlement.

The start path creates one paid Bulk Open Session, debits the wallet once, writes the spend ledger, snapshots the safe contract, marks the pack customer-sold-out, and enqueues processing only after that transaction commits. Processor jobs then settle rewards in private 1000-spot maximum chunks with one service-role RPC/transaction per job budget. Customer UI sees up to 100 Highlight Rewards and Customer Bag progress; it never receives a huge reward response or backend processing details.

### Why This Option

- It preserves the current wallet safety pattern: row lock, single debit, ledger idempotency, and replay-safe behavior.
- It avoids calling the normal paid open route hundreds or thousands of times, so there is no repeated debit path and no 100,000-request Cloudflare/Supabase fanout.
- It keeps Last Prize and reward assignment in one shared private award path, reducing drift between normal opens and Pull All.
- It makes huge packs practical: 400,000 remaining spots at a 1000 budget means about 400 processor jobs/RPC transactions, not 400,000 public opens or 400,000 Supabase calls.
- It integrates with existing owner review, live edit, audit, User 360, exchange, shipping, and Customer Bag instead of creating a second admin workflow.

### Alternatives Considered

- Reuse the normal paid open route repeatedly. Rejected because it would fan out Cloudflare requests, repeatedly exercise debit/idempotency paths, increase duplicate-spend risk, and make huge packs expensive.
- Make one long HTTP request process all remaining spots. Rejected because it would risk Cloudflare timeouts, giant responses, browser crashes, and poor recovery after a committed debit.
- Store only aggregate reward counts for Pull All. Rejected because Bag, exchange, shipping, support, audit, and ownership already depend on item-level `collection_items`.
- Create a separate Pull All status/admin workflow. Rejected because the user explicitly wants Customer Bag landing and existing owner/admin flows to stay friendly.
- Recommended path: additive Bulk Open Session plus queue processor plus shared private award engine, with current normal-open behavior locked by regression tests.

### Architecture

Customer-facing request flow:

1. Quote/confirm creates a short-lived opaque start token tied to customer, pack, quote, protected config hash, and Pull All action.
2. Start API verifies same-origin, auth, verified profile, global feature flag, allowlist, pack Pull All enabled state, kill switch, sold percentage, readiness, and token validity.
3. Start calls one service-role RPC/transaction that locks the pack/session boundary, computes the final target from available eligible spots, locks the customer wallet row, debits once, writes `coin_ledger`, creates the Bulk Open Session, snapshots the contract/cost, and marks Customer Sold Out.
4. After commit, the Worker enqueues the first queue job and schedules the session sentinel.
5. Queue worker calls one private processor RPC per job budget. The RPC reserves/processes eligible slots, creates open/history rows, creates `collection_items` as `locked`, advances counters, and updates safe highlights in set-based work.
6. Processor re-enqueues continuation when work remains, or calls the finalizer when target work is complete.
7. Finalizer verifies processed target equals purchased target, promotes session `collection_items` from `locked` to `owned`, completes the session, releases same-user/admin locks, and clears the temporary Customer Sold Out override.
8. Customer resumes through Highlight Reveal or Customer Bag using safe current-session state.

Admin-facing flow:

- Pack Studio and owner review get a default-disabled Pull All toggle.
- Owner review must block publish/republish when Pull All is requested and readiness fails.
- Owner/admin may disable Pull All for new starts on a live pack; already-paid sessions still finish/retry.
- Owner-only controls manage feature flag, allowlist, kill switch, pause/resume, processor budget, and rollout stage.
- Owner/admin can retry retry-required sessions only when no retry is already active or scheduled.
- User 360 and pack monitor show safe summaries, paged history, public highlights, upfront spend, progress, and sanitized errors.

### Data And API Model

Additive database candidates:

- `gacha_bulk_open_sessions`: authoritative paid Pull All session, public code, profile, draw round, status, target, cost snapshots, contract hash, ledger reference, progress counters, highlight-safe summary, retry fields, pause fields, heartbeat, and timestamps.
- Start-token storage or token columns/table: short-lived opaque token, profile, draw round, quote snapshot, protected hash, expiry, consumed/succeeded session reference.
- Private processor/result identity: service-role-only fields or rows that make `(bulk_open_session_id, draw_slot_id)` and/or `(bulk_open_session_id, bulk_open_sequence)` unique and retry-safe.
- Minimal nullable `audit_events` references/indexes for `bulk_open_session_id`, draw round, event type, actor, and created time.
- Pack/config columns or config rows for Pull All enabled state, owner allowlist/readiness state, global flag, kill switch, pause, rollout stage, and processor budget.

Existing tables touched:

- `wallet_accounts` and `coin_ledger` for the one upfront spend.
- `draw_rounds`, `draw_slots`, prize/unit tables, and Last Prize state for private target and award selection.
- `gacha_opens` and `gacha_open_items` for customer history/open result rows, with optional Bulk Open session linkage.
- `collection_items` for item-level ownership, using `locked` during active settlement and `owned` after completion.
- `audit_events` for sanitized admin/user operational history.
- Existing exchange/shipping tables must reject Bulk Open `locked` items until finalizer promotes them.

Required constraints and indexes:

- Unique active Bulk Open Session per customer while status is `queued`, `processing`, or `retry_required`.
- Active session lookup by `draw_round_id` for Customer Sold Out and admin live-edit lock.
- Idempotent start token/session uniqueness so double-click, retry, or lost response cannot double debit.
- Ledger reference uniqueness for the Bulk Open spend effect.
- Private result uniqueness per session target identity so processor retry cannot duplicate open items, collection items, counters, Last Prize, or highlights.
- Cursor indexes for Customer Bag/history by profile, session, created/acquired time, and id.
- Retry/watchdog indexes by status, next retry time, stale heartbeat, and pause state.
- Audit indexes for session, draw round, actor admin, event type, and created time.

API/RPC plan:

- Keep `POST /api/ynot/gacha/open` for normal 1, 10, and 100 opens.
- Add normal-open guards for active same-user Bulk Open Session and Customer Sold Out target pack.
- Add customer Bulk Open APIs for quote/token, start, current session, session summary, cursor results, and highlights-seen.
- Add service-role-only RPCs/functions for start, processor chunk, finalizer, sentinel/watchdog scan, and admin retry/pause operations.
- Add admin APIs for owner rollout config, Pull All readiness in owner review, monitor/User 360 summaries, retry, pause/resume, kill switch, budget, and sanitized audit.

All public APIs must transform database rows into explicit DTOs. Do not return raw database rows for Bulk Open.

### Implementation Sequence

1. Add regression tests around current normal open, idempotent replay, wallet debit, reveal DTO, Last Prize, Bag ownership, exchange, and shipping.
2. Add additive migrations for Bulk Open Session, indexes, grants/RLS, start token/idempotency, session links, audit references, and Pull All config flags. Do not apply production migrations until backup/PITR/restore-drill gates are satisfied.
3. Extract or formalize the private award engine boundary so normal open and Pull All share reward assignment, slot/stock handling, Last Prize, open item creation, collection item creation, and counters, while spend policy remains separate.
4. Build the Pull All quote/start API and start RPC/transaction using the current wallet row-lock plus ledger pattern.
5. Add queue worker and private processor RPC with 1000 maximum budget, set-based reservation/award writes, idempotent result constraints, safe highlights, and continuation enqueue.
6. Add finalizer, session sentinel, 15-minute fallback watchdog, admin retry, pause/resume, and daily cleanup maintenance.
7. Add customer current-session, summary, cursor results, highlights-seen APIs, Highlight Reveal routing, Customer Bag settling/progress, and exchange/shipping locks.
8. Add Pack Studio/owner-review toggle, readiness gate, owner rollout controls, monitor/User 360 summaries, safe audit view, metrics, and alerts.
9. Run first owner testing pack, larger synthetic/internal pack, privacy/DTO checks, normal-open regression, Last Prize regression, and load/cost verification before any real pack allowlist.

### Verification Plan

- Database/concurrency: double-click start, retry same token, lost response after commit, insufficient wallet, stale quote, lower final cost, higher final cost abort, active-session uniqueness, same-user lock, pack sold-out lock, admin edit lock.
- Processor/idempotency: rollback before commit, crash after commit, repeated queue job, repeated admin retry, duplicate sentinel/watchdog enqueue, Last Prize final-slot path, duplicate result constraints, finalizer atomic promotion.
- Privacy/security: customer DTOs, admin DTOs, audit rows, alerts, metrics, logs, queue payloads, and errors must not expose raw slot IDs, private order, private reward parameters, queue IDs, idempotency internals, contract internals, or house logic.
- Performance/cost: huge start response stays small, highlight payload capped at 100, Customer Bag cursor page max 1000, visible-only summary polling, one processor RPC per 1000 maximum budget, no per-spot Worker/Supabase loop, global processor cap starts at 2.
- UI/admin: stale CTA, reload/resume, cross-tab/device resume, Highlight Reveal one-time seen marker, Customer Bag progress, exchange/shipping locked until completion, owner review readiness block, owner/admin/staff role boundaries.
- Rollout: feature flag default disabled, one testing pack allowlisted first, larger synthetic/internal run next, no real-pack enablement until full-function readiness passes.

### Pre-Mortem

- Failure scenario: customer double-clicks, refreshes, or retries start and gets charged twice. Prevention: short-lived start token, session uniqueness, wallet row lock, ledger reference uniqueness, and replay returning the existing Bulk Open Session.
- Failure scenario: queue retry duplicates rewards or Last Prize. Prevention: private result uniqueness, set-based transaction boundaries, committed progress as recovery source, shared award engine, and finalizer verification.
- Failure scenario: huge Pull All overwhelms Cloudflare, Supabase, or the browser. Prevention: no giant start manifest, 1000 maximum process budget, global processor cap, set-based RPC work, capped highlights, cursor Bag pages, visible-only polling, backoff, and watchdog summary scans only.

### Internal Critic And Revisions

- Strongest counterargument: this is a large feature and a new pipeline adds complexity. Revision: implement additively, keep normal open untouched except guards, lock behavior with tests first, and ship behind owner-only flag/allowlist.
- Hidden coupling: Last Prize, live revisions, stock units, collection images, exchange, and shipping all depend on current row links. Revision: the shared private award engine must be extracted before processor work, and Bulk Open rows must link into existing open/history/collection rows instead of bypassing them.
- Missed edge case: highlight readiness may happen before the best rewards are fully known. Revision: reveal uses the best safe highlights available when ready and Bag can update its safe highlight summary later without replaying the full reveal.
- Weak verification risk: happy-path browser testing will not prove no double charge or no duplicate reward. Revision: require database-level concurrency/idempotency tests and synthetic multi-job tests before real pack allowlist.
- Data risk: an admin-support view can accidentally expose private mechanics. Revision: no raw table passthrough; every Bulk Open customer/admin response uses named DTO builders and no-leak tests.

### Risks And Approval Gates

- Production migration gate: backup/PITR and restore-drill evidence must be satisfied before applying Supabase production migrations.
- Billing/load gate: owner testing pack plus larger synthetic/internal test must confirm Cloudflare CPU, queue volume, Supabase latency, lock waits, and query counts stay within budget.
- Data/privacy gate: no-leak DTO/log/audit checks must pass before owner enables any real pack.
- Product gate: normal 1, 10, and 100 opens, Last Prize, Customer Bag, exchange, shipping, owner review, and User 360 must still work before real exposure.
- Rollout gate: real packs are owner-selected allowlists only. Global/site-wide automatic enablement is not part of launch.

### Open Questions Or Plan Concerns

- No product-blocking questions remain from the Q53-Q64 decision batch.
- During implementation, choose exact table/function names to match repo conventions and generated type tooling.
- During implementation, verify whether Cloudflare Queue and scheduled watchdog wiring already exists in the project or must be added as new Worker bindings/config.
- During implementation, confirm the safest extraction boundary for the award engine by reading the latest production `open_gacha_campaign` migrations, including Last Prize and stock-unit patches.

## Customer Flow

1. Customer opens a pack page or pack modal.
2. Server computes sold percentage and an estimated remaining eligible spot count for display.
3. Pull All CTA appears only when the pack is openable and sold percentage is at least 60 percent.
4. Customer confirms the total remaining eligible cost and quote.
   Server confirmation returns a short-lived opaque start token for this exact customer, pack, quote snapshot, protected config hash, and Pull All action.
5. In one database transaction, server re-checks latest Pull All enabled state, kill switch, allowlist, readiness, pack status, sold percentage, and available target; locks the pack/session boundary; computes the final available-spot target; creates a Bulk Open Session; debits the final server-confirmed spend once; records spend ledger/snapshots; and marks the pack Customer Sold Out for everyone else. This transaction snapshots counts and contracts only; it does not create or update a huge per-slot manifest.
   Stale CTA/modal requests never bypass this server re-check. If Pull All was disabled or no longer eligible, server returns a safe "Pull All is no longer available" state, performs no debit, creates no session, and refreshes pack state for the UI.
   If the final server-confirmed cost is lower than the customer-confirmed quote, the lower final target/cost is used and shown back to the customer. If final target is zero, cost per spot changed, protected config changed, or total is higher than the quote, server aborts before debit and asks the customer to refresh/reconfirm.
   If wallet balance no longer covers the final server-confirmed total, server aborts before creating the Bulk Open Session, Customer Sold Out state, or any debit; the customer sees refresh/top-up guidance.
   Repeated start with the same valid token after success returns the existing Bulk Open Session summary; it never creates a second session or second debit.
   If the start result is unknown because the browser closed, reloaded, timed out, or lost network, the client calls the current-session endpoint before showing a payment error or allowing a new start. If an active paid Bulk Open Session exists, wallet debit has already committed, backend reward processing continues, and the customer resumes through Highlight Reveal or Customer Bag.
   If Highlight Rewards are ready and not seen, resume to Highlight Reveal capped at 100. If highlights are not ready, resume to Customer Bag with settling/progress and no-action-needed messaging.
   After the safe Highlight Reveal seen marker exists, resume always goes to Customer Bag. The full reveal animation does not replay automatically.
   After the safe highlight payload visibly renders, the client marks Highlight Reveal seen through an idempotent customer-owned mutation. If the reveal never successfully renders, no marker is written and resume may try the reveal again.
   If mark-seen fails after visible render, do not block Customer Bag navigation; retry quietly in the current tab and again on focus/reload.
6. After that transaction commits, server enqueues Bulk Open processing.
7. Queue processing reserves and processes eligible `draw_slots` in bounded private chunks. The first safe batch processes enough rewards to prepare Highlight Rewards.
8. Customer sees Highlight Reveal with up to 100 Highlight Rewards. The rest skip individual visual reveal and land through Customer Bag settlement.
9. When the customer closes the reveal, they go to Customer Bag.
10. Customer Bag shows progress and rewards settling until the Bulk Open Session completes.
11. After the completion finalizer commits, rewards become eligible for exchange and shipping.

If the customer closes the browser before completion, processing continues from the server queue with no browser polling. When the customer returns, Customer Bag fetches current summary state and cursor-loads visible rewards from the active Bulk Open Session.

## Product Contract

### Pull All CTA

Show Pull All on every relevant pack entry point where opening is possible:

- Pack detail
- Pack modal
- Campaign detail panel
- Arena or legacy pack page if still reachable
- Normal reveal follow-up if the same pack becomes eligible

The CTA must not expose private logic. It can show public-safe information such as estimated total spend, remaining spots, and that rewards will appear in Customer Bag. Customer confirmation must include the maximum quote the customer agreed to pay.

### Highlight Reveal

Highlight Reveal is a public-safe presentation layer:

- Show at most 100 reward cards.
- Prioritize Last Prize first if awarded or reserved for the session outcome.
- Then prioritize best public-facing wins using only already-public fields.
- Do not show every reward for huge Pull All sessions.
- Do not animate or render non-highlight rewards individually.
- Do not expose raw prize IDs, stock IDs, private draw parameters, private filters, or internal processing batches.
- Use user-facing text such as "More rewards are landing in your Bag" instead of backend terms.

### Customer Bag

Customer Bag becomes the canonical progress and ownership page:

- Show active Bulk Open progress summary.
- Show settling banner while processing is not complete.
- Do not show a customer retry button for Pull All; backend recovery owns retry.
- Show Highlight Rewards and recent owned rewards.
- Show only safe progress fields: total purchased reward count, landed/settling count, percent complete, and simple status labels.
- Do not show queue jobs, chunk number, watchdog/sentinel state, retry attempts, exact backend timing, slot IDs, batch IDs, or private mechanics.
- Show safe, paged Settling Rewards as they are created.
- Map Bulk Open `locked` item rows to the customer-facing label "settling."
- Poll only a small active-session summary endpoint while the page is visible: every 10 seconds for the first 2 minutes after reveal close/page load, then every 30 seconds.
- Pause polling when the tab is hidden, offline, closed, or the session is complete.
- Fetch one summary immediately on tab focus or reload.
- Fetch full results only through cursor pagination; do not auto-load all reward rows.
- Allow filtering by pack/session when useful.
- Lock exchange/shipping actions for unsettled Bulk Open rewards.

No new standalone Bulk Open status page is required.

## Backend Architecture

### Normal Opens

Normal 1, 10, and 100 opens keep their existing route and behavior. The only added guard is that normal opening must fail safely when:

- The target pack is Customer Sold Out due to another customer's active Bulk Open Session.
- The current customer has any active Bulk Open Session across gacha packs.

This guard must return a public-safe message and should not reveal private session internals.

### Bulk Open Session

Create a Bulk Open Session as the authoritative Pull All record. It owns:

- Customer/profile
- Campaign/pack
- Remaining eligible target at confirmation time
- Cost-per-spot snapshot
- Total cost snapshot
- Spend/debit reference
- Public session code
- Status
- Progress counters
- Retry/error metadata
- Highlight summary
- Created/started/completed timestamps

Recommended statuses:

- `queued`
- `processing`
- `retry_required`
- `completed`

Avoid `cancelled`.

### Audit Events

Bulk Open admin controls should reuse the existing `audit_events` pattern:

- Add a nullable `bulk_open_session_id` reference when the Bulk Open Session table is introduced.
- Reuse `draw_round_id`, `actor_admin_id`, `event_type`, `metadata`, and `created_at`.
- Add only targeted indexes for paged Bulk Open audit reads, such as `bulk_open_session_id, created_at desc`, `actor_admin_id, created_at desc`, and `draw_round_id, event_type, created_at desc`.
- Store actor role, previous safe status, next safe status, sanitized reason, request id, and source surface in sanitized `metadata`.
- Do not store raw queue payloads, raw slot IDs, private config, reward weights/private filters, idempotency keys, or raw Pack Open Contract internals.
- Do not create a dedicated Bulk Open audit table at launch unless performance tests show the shared `audit_events` table is too slow.

### Retention And Cleanup

Completed Bulk Open data is split into durable customer/support records and transient processor metadata:

- Keep customer ownership rows indefinitely.
- Keep wallet/spend ledger rows indefinitely.
- Keep open/history rows indefinitely.
- Keep completed Bulk Open Session summaries indefinitely.
- Keep sanitized Bulk Open admin audit rows for at least 180 days.
- Prune or compact only transient processor-attempt, sentinel, stale-lock, and queue retry metadata after the session is completed and older than 30 days.
- Never prune queued, processing, retry-required, unsettled, or incomplete sessions.
- Never prune rows needed by Customer Bag, exchange, shipping, conversion, wallet proof, admin User 360, or support history.

Cleanup runner rules:

- Run one daily off-peak service-role scheduled cleanup by default.
- Allow owner-only manual trigger for emergency cleanup.
- Never run cleanup inside customer/admin request paths.
- Never run cleanup every minute.
- Use an advisory lock so only one cleanup runner is active.
- Query only indexed completed-session candidates older than the retention threshold.
- Process a small capped batch per run.
- Record sanitized cleanup metrics.
- Stop before timeout risk.
- Skip queued, processing, retry-required, unsettled, and incomplete sessions.

### Spend Policy

Pull All uses Bulk Open Spend:

- Debit the full total once at start.
- Bulk Open Spend, active session creation, spend ledger, immutable target/cost snapshots, and Customer Sold Out state commit in one database transaction before queue enqueue.
- Reward processing must never debit again.
- Retry must never debit again.
- Processor must verify the spend reference exists before awarding unsettled work.
- If processor fails after debit, session becomes retry-required and must be resumed.

### Award Engine

Use a shared private Bulk Award Engine for both normal opens and Bulk Open processing.

The separation should be:

- Normal open route validates normal open request, charges normal open spend, then calls award engine.
- Pull All start validates Pull All, charges full Bulk Open Spend, creates session, then queue calls award engine without additional debit.
- Award engine owns slot selection, reward assignment, Last Prize behavior, reward-row creation, and counters.
- Award engine does not decide wallet debit policy.

This avoids duplicated reward logic and protects Last Prize behavior.

### Queue Processing

Use Cloudflare Queue as the primary processor.

Launch settings:

- Process budget: 1000 spots per queue job.
- Treat 1000 as a maximum per job, not a required exact count.
- Launch global active-processor cap: 2 across the site.
- Each job obtains an idempotent session lock before work.
- Each job calls one private bulk processor RPC/transaction for the current budget.
- Inside that private RPC/transaction, use set-based reservation, reward, ownership, history, counter, and highlight writes for the current process budget.
- Do not require a full per-slot manifest during Pull All start.
- Each processor job reserves/processes eligible `draw_slots` in bounded chunks, up to the current process budget.
- Chunk reservation must be service-role-only and must use private idempotency links to the Bulk Open Session.
- Chunk reservation, reward/ownership/open-history creation, counters, highlights, and progress advancement must commit atomically inside the private processor transaction.
- Public `picked`/`opened` slot status alone must not be the only crash-recovery signal for Bulk Open.
- If a processor transaction rolls back, the chunk remains available to the same Bulk Open Session for retry.
- If a processor transaction commits and the queue worker later crashes, retry/admin resume must read committed progress and continue only unprocessed work.
- Each target result must have private per-session idempotency, using `bulk_open_session_id`, `draw_slot_id`, and/or `bulk_open_sequence` with unique constraints.
- Retrying a processor job must no-op already processed target work and continue only unprocessed target work.
- The queue payload contains only Bulk Open Session identity and safe attempt metadata.
- The processor loads immutable session snapshots from the database, not from client or queue payloads.
- Only one job may actively process a given Bulk Open Session at a time.
- Each job processes up to 1000 unprocessed spots.
- Each job updates progress counters and public-safe highlights.
- If more spots remain, enqueue the next job.
- If no spots remain, run the completion finalizer transaction.
- After each successful start/processor commit while the session is unfinished, schedule or refresh one delayed session-scoped recovery sentinel.
- If time budget gets risky, stop early, persist progress, and enqueue continuation.
- If processing fails safely, set retry-required with a sanitized error code.
- Automatic retries use exponential backoff with capped attempts.
- Manual admin retry must not create duplicate active retry jobs when one is already processing or scheduled.
- Admin pause flags must be respected before processing starts or resumes.

Admin retry should not process custom rewards or custom counts. It only re-enqueues the same session processor.

### Watchdog/Sweeper

The watchdog is service-owned recovery, not a second processor.

- Pull All start triggers normal processing immediately after the paid start transaction commits.
- Each Pull All start/processor commit should schedule a delayed session-scoped recovery sentinel.
- A sentinel checks one session only. If the session is complete or already processing, it exits; if stale, it re-enqueues the same idempotent processor.
- Session sentinel is the Bulk Pull-triggered recovery path and should handle the normal orphan case.
- The global watchdog is scheduled last-resort recovery, not the primary processing trigger and not a constantly running loop.
- Default global watchdog cadence should be 15 minutes, unless launch telemetry proves a shorter temporary cadence is needed.
- If there are no active/retry-due sessions, the global watchdog exits after one small indexed summary check.
- It scans only Bulk Open Session summary rows.
- It never scans all slots, rewards, collection rows, or private prize data.
- It finds sessions that are queued but not scheduled, retry-due, stale processing without a heartbeat, or missing continuation after committed progress.
- It respects pause flags, retry backoff, per-session processor lock, and global processor cap.
- It re-enqueues the same queue payload shape used by normal continuation: Bulk Open Session identity plus safe attempt metadata.
- It does not change reward outcome, target count, spend, highlight selection, or private draw logic.
- It stores sanitized operational timestamps/counters for admin support.
- Removing both sentinel and watchdog recovery does not break the happy path, but it can leave paid sessions stuck until admin/support retry.

## Database Shape

Create a Bulk Open Session table, for example `gacha_bulk_open_sessions`, with service-role write access and public reads only through safe APIs.

Keep item-level `collection_items` as the ownership source of truth at launch. Bulk Open Session rows provide summary/progress; they do not replace individual owned/settling item rows with aggregate quantity-only rewards.

Bulk Open-created `collection_items` should use `status = 'locked'` while the session is active. Customer-facing APIs translate that to "settling." The completion finalizer bulk-updates that session's item rows to `owned` only after the whole session is complete.

Completion finalization must be one service-role transaction. It verifies all target work is processed, promotes that session's item rows to `owned`, marks the session completed, releases same-user/admin locks, and clears the temporary Customer Sold Out override. It must not partially unlock exchange/shipping if any finalizer step fails.

Do not create or write a huge per-slot manifest in the Pull All start transaction. Use `draw_slots` as durable private target identity and reserve/process eligible slots in chunks while the active Bulk Open Session owns the pack.

Use a private reservation/result marker tied to the Bulk Open Session for chunk recovery. It can live in private processor/result rows or private service-role-only fields, but customer/admin APIs must expose only safe summary/progress state.

Suggested fields:

- `id`
- `public_code`
- `profile_id`
- `draw_round_id`
- `status`
- `target_slots`
- `available_slots_snapshot`
- `processed_slots`
- `open_items_awarded`
- `collection_items_created`
- `cost_per_slot_snapshot`
- `total_cost_snapshot`
- `customer_confirmed_quote_snapshot`
- `pack_open_contract_hash_snapshot`
- `wallet_transaction_id`
- `campaign_updated_at_snapshot`
- `highlight_rewards_public`
- `last_error_code`
- `attempt_count`
- `next_retry_at`
- `retry_scheduled_at`
- `last_retry_requested_at`
- `last_watchdog_checked_at`
- `last_processor_heartbeat_at`
- `watchdog_enqueue_count`
- `paused_at`
- `pause_reason_code`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

Add a session reference to open/history rows where useful:

- `bulk_open_session_id`
- `bulk_open_sequence` or cursor-friendly sequence
- `draw_slot_id` on private processor/result rows when needed for idempotency
- private reservation/result status for chunk recovery, never exposed directly

Indexes:

- Active session lookup by `profile_id`
- Active session lookup by `draw_round_id`
- Unique active session per customer where status is queued, processing, or retry-required
- Unique private idempotency indexes for Bulk Open result work, such as `(bulk_open_session_id, draw_slot_id)` and/or `(bulk_open_session_id, bulk_open_sequence)`
- Efficient private chunk-reservation lookup by `draw_round_id`, slot status, and Bulk Open Session/idempotency fields.
- Cursor pagination for collection/history by `profile_id`, `acquired_at`, and `id`
- Cursor pagination/filtering by `bulk_open_session_id`

RLS and grants:

- Customers never read raw bulk/session tables directly.
- Customer-facing APIs return allowlisted DTOs.
- Admin APIs require admin/owner authorization.
- Service role performs queue processing.
- Private bulk processor RPCs must be callable only by service role.

## API Contract

### Customer APIs

`POST /api/ynot/gacha/bulk-open/start`

- Auth required.
- Same-origin mutation guard.
- Verified profile required.
- Requires a short-lived opaque server start token created during confirmation.
- Token is bound to customer, pack, quote snapshot, protected config hash, and Pull All action.
- Repeated start with the same valid token after success returns the existing Bulk Open Session summary.
- Different, stale, or expired token blocks before debit and asks the customer to refresh/reconfirm.
- Global Bulk Open feature flag must be enabled.
- Pack must be on the owner-controlled Bulk Open allowlist.
- Pack must be public/openable.
- Pull All must be enabled for the pack.
- Sold percentage must be at least 60.
- Server re-checks latest Pull All enabled state, kill switch, allowlist, readiness, pack status, sold percentage, and available target inside the transaction before debit/session creation.
- Server computes remaining eligible target from available spots while holding the start transaction lock.
- Server computes final total cost.
- Server validates the database-confirmed total is not higher than the customer-confirmed quote.
- Server validates protected pack config has not changed before debit.
- Server stores the Pack Open Contract snapshot/hash used for confirmation.
- Server locks the customer wallet row and verifies available balance covers the final server-confirmed total.
- If balance is insufficient, aborts before debit, Bulk Open Session creation, spend ledger, snapshots, Customer Sold Out state, and queue enqueue.
- Full wallet debit happens once for the final server-confirmed total, never more than the customer-confirmed quote.
- Creates Bulk Open Session in the same database transaction as the debit, spend ledger, target/cost snapshots, and Customer Sold Out state.
- Enforces one successful paid Bulk Open Session per token/session boundary.
- Does not create or update a full per-slot manifest during the start request.
- Enqueues normal processing and schedules the first delayed session sentinel after that database transaction commits.
- Returns public session summary and initial state.

`GET /api/ynot/gacha/bulk-open/current`

- Returns the customer's active session if any.
- Used by pack pages, Customer Bag, and reload/resume.
- Used after unknown Pull All start results before showing a payment error or allowing a new start.
- If an active paid Bulk Open Session exists, returns enough public-safe summary for the UI to resume Highlight Reveal or Customer Bag while backend processing continues.
- If Highlight Rewards are ready and not seen, exposes only safe routing state to resume Highlight Reveal.
- If Highlight Rewards are not ready, exposes only safe routing state to land on Customer Bag with settling/progress.
- If Highlight Reveal has already been marked seen, exposes only safe routing state to land on Customer Bag.

`GET /api/ynot/gacha/bulk-open/session/[publicCode]`

- Returns public-safe progress summary for that customer.
- Optimized for small summary polling.
- Allows only safe fields: total purchased reward count, landed/settling count, percent complete, Highlight Rewards capped at 100, and customer-facing status labels.
- No private draw or reward internals.
- No queue job count, chunk number, watchdog/sentinel state, retry attempts, exact backend timing, raw slot IDs, private batch IDs, or private mechanics.

`GET /api/ynot/gacha/bulk-open/session/[publicCode]/results?cursor=...`

- Cursor-paged rewards/results.
- Default page size should be modest.
- Max page size must be capped at 1000.

`POST /api/ynot/gacha/bulk-open/session/[publicCode]/highlights-seen`

- Auth required.
- Same-origin mutation guard.
- Customer-owned session only.
- Idempotently records that the safe Highlight Reveal payload has visibly rendered for this paid Bulk Open Session.
- Safe to retry quietly after temporary network/API failure.
- Does not change reward ownership, processing status, wallet state, highlight selection, or Bag contents.
- Writes only safe public session metadata such as `highlights_seen_at`.
- Does not expose raw highlight internals, raw slot IDs, private sequence, reward internals, or house logic.

No customer retry mutation at launch.

- Customer-facing recovery is automatic through backend retry, delayed sentinels, and the fallback watchdog.
- Customer Bag can refresh summary/results, but cannot manually re-enqueue Pull All processing.
- If support action is needed, admin tools own the retry path.

### Existing Normal Open API

Normal open API remains the route for 1, 10, and 100 opens. Add guards:

- Block if current customer has active Bulk Open Session.
- Block if target pack is Customer Sold Out due to active Bulk Open Session.
- Return safe public errors.

Normal 1, 10, and 100 opens must not depend on the Bulk Open feature flag or pack allowlist.

### Admin APIs

Admin endpoints should support:

- Owner-controlled Bulk Open feature flag.
- Owner-controlled Bulk Open pack allowlist.
- Owner kill switch that blocks new Pull All starts while allowing already-paid sessions to finish/retry.
- View operational-safe active Bulk Open summaries by pack.
- View operational-safe active Bulk Open summaries and paged history/Bag rows by user.
- Retry a retry-required session for owner/admin only.
- Pause or resume processing globally, by campaign, or by session for owner only.
- Change processor budget or kill-switch settings for owner only.
- See progress counters, upfront spend, public Highlight Rewards, last safe update time, next retry time, and sanitized errors.
- Block edits while Bulk Open Lock exists.
- Audit every admin control action with actor admin id, role, timestamp, action, sanitized reason, target type/id, previous safe status, next safe status, request id, and source surface.
- Provide paged admin audit viewing and owner-only audit export for Bulk Open events.
- Use the existing `audit_events` pattern for Bulk Open events, with targeted references/indexes instead of a separate audit table at launch.

Admin endpoints must not expose raw queue payloads, queue job IDs, raw draw slot IDs, private slot order, internal batch IDs, private idempotency keys, reward weights/private filters, raw Pack Open Contract internals, or private reward algorithm internals beyond what admins already need for operations.

## Admin UI Contract

### Owner Rollout Controls

Show owner-only rollout controls:

- Global Bulk Open feature flag, default disabled.
- Pack or campaign allowlist for testing, synthetic, and owner-enabled real exposure.
- Current launch stage: disabled, testing pack, larger synthetic/internal test, owner-enabled real packs/campaigns, broader rollout.
- No site-wide automatic real-pack enablement at launch; owner-selected packs or campaigns are enabled first.
- Kill switch for new Pull All starts.
- Safe rollout health summary before moving to the next stage.

Admin/staff must not see or edit rollout controls. Kill switch must block only new Pull All starts; already-paid Bulk Open Sessions continue through processing/retry.

### Owner Review Integration

Pull All activation uses the same admin pack owner-review model already used by Pack Studio:

- Admin creates or edits a pack in Pack Studio.
- Pack Studio shows Pull All as an enable/disable control that defaults disabled.
- Admin or owner may select Pull All enabled/disabled from the same create/edit or owner review flow.
- Owner final Pull All toggle selection wins during owner review; if owner changes the admin's selection, show a small confirmation line and write sanitized audit metadata.
- The owner approval queue shows a safe Pull All readiness indicator on the pack row when Pull All is requested or already enabled, without adding a separate queue.
- The owner review page shows Pull All readiness inline beside the existing approve, request-changes, publish, and republish controls.
- The Pull All panel shows only safe readiness evidence: test-pack status, larger synthetic/internal status, normal open checks, Last Prize check, DTO/privacy scan, Bag/exchange/shipping checks, owner metrics, kill switch state, and Cloudflare/Supabase load health.
- When Pull All is disabled, the pack follows the normal publish flow and no Pull All CTA/start API is available.
- When Pull All is enabled and readiness passes, the existing owner approve/publish or republish action can enable Pull All in the same flow.
- When Pull All is requested and readiness fails, the existing owner approve/publish or republish action is blocked with clear safe fix items. The system must not silently publish the pack as normal-only or with Pull All disabled.
- After a pack is live, owner/admin may disable Pull All immediately for new starts, with sanitized audit; already-paid Bulk Open Sessions still finish/retry.
- Enabling or re-enabling Pull All on a live pack uses the existing live edit owner-review path, must pass readiness, and applies through owner republish.
- The system reuses existing owner review notes where possible and writes sanitized audit automatically; it does not require a separate Pull All approval page, duplicated owner reason, or second workflow.
- Staff/admin support views may show support-safe Pull All status only; they cannot access owner rollout controls or enable real exposure.

### Pack Editor

When a Bulk Open Lock exists:

- Disable edits to cost.
- Disable edits to rewards/prize pool.
- Disable edits to inventory/stock mapping.
- Disable visibility/lifecycle edits that would conflict with processing.
- Disable opening option edits.
- Disable Last Prize edits.
- Show a clear "Bulk Open processing" state with progress and retry controls if applicable.

### Pack Monitor

Show:

- Session status
- Customer
- Target slots
- Processed slots
- Reward rows created
- Collection rows created
- Upfront spend
- Public Highlight Rewards
- Retry-required state
- Next retry time
- Last safe update time
- Sanitized error code
- Safe retry controls for owner/admin when session is retry-required
- Safe pause/resume and kill-switch controls for owner only

### Admin User 360

Show:

- User Bulk Open sessions
- Upfront spend
- Progress
- Highlight/public reward summary
- Exchange and shipping readiness
- Related open/history rows through paged APIs

Pack Monitor and Admin User 360 must use paged APIs and sanitized operational DTOs. They must not show raw queue payloads, queue job IDs, raw slot IDs, private slot order, internal batch IDs, private idempotency keys, reward weights/private filters, or raw Pack Open Contract internals.

Staff users may view support-safe status and history only. Staff UI must not render retry, pause/resume, kill-switch, or processor budget controls.

### Bulk Open Audit View

Show a paged, sanitized audit trail for Bulk Open admin controls:

- Actor admin
- Actor role
- Safe event type
- Target type/id
- Previous safe status
- Next safe status
- Sanitized reason
- Request id
- Timestamp
- Coarse source surface

Owner export is allowed. Staff export is not allowed. No audit UI should show raw queue payloads, raw slot IDs, private config, reward weights/private filters, idempotency keys, or raw Pack Open Contract internals.

### Owner Operational Metrics And Alerts

Show owner-only Bulk Open operational metrics:

- Active sessions by status
- Retry-required sessions past threshold
- Queue backlog/cap saturation indicator
- Processor success/failure counts
- Sentinel/watchdog recovery outcomes
- Supabase latency or lock-wait pressure indicator
- Cleanup last run status
- Kill-switch/pause/resume state

Send low-volume owner alerts using existing alert/audit channels where possible:

- Retry-required session past threshold
- Repeated processor failures
- Sentinel or watchdog recovery failure
- Queue backlog/cap saturation
- Supabase latency or lock-wait pressure
- Kill-switch, pause, or resume change
- Cleanup failure

Alerts and metrics must use dedupe/cooldown and only show safe fields: public session code, pack/customer support identifiers, status, processed/target counts, sanitized error code, last safe update, and next retry time. Do not show queue job IDs, raw slot IDs, private slot order, idempotency keys, reward weights/private filters, raw Pack Open Contract internals, or house logic.

### Rollout Gates

Launch sequence:

1. Default disabled.
2. Enable the full production Pull All path for one owner-tested internal/testing pack.
3. Run the larger synthetic/internal test through the same full production Pull All path.
4. Enable the full production Pull All path for owner-selected real pack or campaign allowlists after both test runs are healthy.
5. Broaden only after owner confirms no duplicate rewards, no stuck paid sessions, normal opens unchanged, Last Prize unchanged, safe DTOs, and Cloudflare/Supabase load within budget.

The Pull All CTA and start API must both respect the feature flag and pack allowlist. Real packs stay disabled until the owner explicitly advances the rollout stage. When a real pack is enabled, it uses the same fully functional Pull All path as the testing packs, not a reduced live-lite mode.

Mandatory preflight before the first testing pack:

- Migration applied.
- Feature flag default disabled.
- Exactly one testing pack allowlisted.
- Owner test balance ready.
- Pull All CTA hidden on non-allowlisted packs.
- Normal 1, 10, and 100 opens still pass.
- Start API blocks non-allowlisted packs.
- Owner metrics and alert states visible.
- Kill switch blocks new Pull All starts.
- Admin User 360 can see safe Bulk Open session details.
- Customer Bag shows settling rewards.
- Exchange/shipping reject unsettled rewards.
- API/DTO responses do not leak queue IDs, raw slot IDs, private order, idempotency keys, reward/private config, contract internals, or house logic.

First owner test-pack profile:

- Use about 1,200 to 2,500 total spots.
- Trigger Pull All after 60 percent sold.
- Ensure the remaining Pull All crosses the 1000-process-budget boundary.
- Require at least two processor jobs.
- Verify start/debit, Customer Sold Out, queue continuation, idempotent multi-job processing, Highlight Rewards, Customer Bag settling, completion finalizer, Admin User 360, and owner metrics.
- Do not use a 100,000+ spot stress test as the first owner test.

Larger synthetic/internal test before real pack:

- Use about 10,000 to 25,000 total spots.
- Trigger Pull All after 60 percent sold.
- Verify 4,000 to 10,000 remaining rewards settle through 4 to 10 processor jobs at the 1000 budget.
- Verify queue continuation, owner metrics, Customer Bag pagination, no huge render, no duplicate rows, watchdog/sentinel behavior over more chunks, and bounded Cloudflare/Supabase load.
- Do not use this as permission for real-pack rollout until the owner also passes the full-function readiness gate.

Full-function readiness gate before real customer launch:

- Open All/Pull All is not partial, demo-only, test-only, or live-lite.
- The same production path works for test packs, synthetic packs, and owner-enabled real packs.
- Verify 60 percent unlock, full upfront debit, immediate Customer Sold Out, same-user gacha lock, private queue processing, 100 Highlight Rewards, Customer Bag settling/progress, exchange/shipping settled-only enforcement, Admin User 360, owner metrics/alerts, recovery, cleanup, and kill switch.
- Verify normal 1, 10, and 100 opens still behave the same.
- Verify Last Prize behavior stays correct.
- Verify customer/admin API and RPC responses expose only safe DTOs and never leak queue IDs, raw slot IDs, private order, idempotency keys, reward/private config, contract internals, or house logic.
- Owner-selected real pack or campaign allowlists control exposure after the gate passes; they do not reduce the feature.

## Security And Privacy Rules

Customer responses must not include:

- Private draw parameters or house logic
- Raw stock IDs
- Raw prize-unit IDs
- Raw draw slot IDs
- Private Bulk Open sequence IDs
- Internal stock filters
- Private logic snapshots
- Queue job IDs
- Advisory lock names
- Service-role processing details
- Full unbounded reward arrays
- Queue payload contents beyond public session state
- Raw idempotency keys, database constraint details, or private token internals

Admin responses must not include:

- Raw queue payloads or queue job IDs
- Raw draw slot IDs or private slot order
- Internal batch IDs
- Private idempotency keys or constraint details
- Reward weights or private filters
- Raw Pack Open Contract internals

Owner-level audit may confirm protected config through hashes, versions, and sanitized summaries, not raw house logic.

Every Bulk Open admin control action must write an append-only audit event with safe metadata. Retain Bulk Open audit rows for at least 180 days. Audit events must not include raw queue payloads, raw slot IDs, private config, reward weights/private filters, idempotency keys, or Pack Open Contract internals.

Owner alerts and operational metrics must use allowlisted safe fields only and dedupe/cooldown. They must not include queue job IDs, raw slot IDs, private slot order, idempotency keys, reward weights/private filters, raw Pack Open Contract internals, or house logic.

Use allowlisted DTOs for every customer and admin response. Admin responses may contain operational counters, but should still avoid exposing mechanics that are not necessary for support.

Do not use raw realtime subscriptions on collection, prize, stock, or bulk-session tables. Use safe summary APIs and cursor fetches.

## Performance And Cost Rules

This design keeps Cloudflare and Supabase costs bounded:

- One Pull All confirmation request.
- No huge per-slot manifest write during start confirmation.
- Queue-owned processing in 1000-spot jobs.
- One private bulk processor RPC/transaction per queue job budget, not one RPC per spot.
- Set-based database writes inside each processor transaction, not one database transaction per reward.
- Global active processor cap starts at 2 and is configurable.
- 1000 is a maximum process budget; jobs can stop early and continue later when latency or timeout risk rises.
- Retry backoff and capped attempts prevent retry storms from increasing Cloudflare CPU or Supabase lock pressure.
- Session-scoped delayed sentinels handle most recovery without all-day global polling.
- Global watchdog scans only indexed Bulk Open Session summaries on a low-frequency cadence and re-enqueues only under capacity.
- Customer Bag summary polling is visible-only, starts at 10 seconds briefly, slows to 30 seconds, and pauses when hidden/offline/complete.
- Reward/result rows are cursor-loaded only and never auto-loaded in bulk.
- No browser loop firing hundreds of requests.
- No repeated paid HTTP open route calls.
- No full-pack slot rewrite during the customer confirmation request.
- No giant JSON result response.
- No rendering hundreds of thousands of reward cards.
- No aggregate-only replacement for real owned reward rows at launch.
- Cursor-paged Customer Bag/history fetches.
- Progress polling uses a small summary endpoint at a slow, user-friendly interval.
- Progress polling pauses when the tab is hidden or closed; server queue processing continues without browser participation.
- Queue continuation instead of long single request loops.
- Server-side timeout guard before Cloudflare worker budget becomes risky.
- Cleanup is low-frequency bounded maintenance, not a customer/admin request side effect and not a per-minute job.
- Cleanup touches only indexed completed-session/transient-metadata candidates and stops after a capped batch.
- Cleanup has one daily off-peak scheduled run plus owner-only manual trigger, with advisory locking and sanitized metrics.

Example: for 400,000 remaining spots with 1000 spots per job, processing needs about 400 queue jobs and about 400 private bulk processor calls, not 400,000 public opens or 400,000 Supabase RPC calls. The customer does not receive 400,000 reward objects at once. The UI shows up to 100 highlights, then Customer Bag uses paged loading.

## Exchange And Shipping

Exchange and shipping must respect settling state:

- Unsettled Bulk Open rewards are visible only as pending/settling.
- Internally, unsettled Bulk Open reward rows use `collection_items.status = 'locked'`.
- Exchange cannot select unsettled rewards.
- Shipping cannot select unsettled rewards.
- Conversion cannot select unsettled rewards.
- Once the completion finalizer commits, that session's reward rows become normal `owned` rewards.
- If completion finalization fails, rewards remain `locked`/settling and exchange/shipping/conversion stay blocked.
- Item-level ownership remains required for exchange and shipping; Bulk Open summary counters are not exchangeable/shippable inventory.
- Collection, exchange, shipping, and history must use cursor pagination.

## Failure And Retry

Failure policy:

- Never cancel after confirmation.
- Never reroll.
- Never refund automatically from processor failure.
- Never let retry alter target or spend.
- Persist progress before stopping.
- Retry only unprocessed work.
- Rolled-back chunk transactions create no durable progress and must be safe to retry.
- Committed chunk transactions become the recovery source of truth for retry/admin resume.
- Finalizer failure keeps the session active or retry-required; it must not partially promote item rows to `owned`.
- Store sanitized error codes for support.
- Use exponential backoff with capped automatic attempts.
- Manual admin retry must not enqueue a duplicate job when a retry is active or already scheduled.
- Repeated failures stay retry-required and visible to admin monitor/User 360.
- Admin pause prevents processing from starting or resuming until an authorized admin resumes it.
- Session sentinels and global watchdog may re-enqueue stale safe-to-resume sessions, but only through the same idempotent processor and only when pause/backoff/lock/capacity rules allow it.
- If both sentinel and watchdog recovery are disabled, manual admin/support retry becomes the only recovery path for orphaned paid sessions.

Retry triggers:

- Queue continuation
- Delayed session sentinel
- 15-minute fallback watchdog
- Admin retry from pack/user monitor

All retry paths call the same idempotent processor.

## Test Plan

### Backend Tests

- Pull All hidden before 60 percent sold.
- Pull All visible after 60 percent sold.
- Pull All hidden when global feature flag is disabled.
- Pull All hidden when pack is not allowlisted.
- Pull All start API blocks when global feature flag is disabled.
- Pull All start API blocks when pack is not allowlisted.
- Owner kill switch blocks new Pull All starts while already-paid sessions can still finish/retry.
- Normal 1, 10, and 100 opens do not depend on Bulk Open feature flag or pack allowlist.
- Real packs remain disabled until owner advances rollout after test-pack, larger synthetic/internal, and full-function readiness evidence.
- Real exposure uses owner-selected pack or campaign allowlists first, not site-wide automatic enablement.
- Every owner-enabled real pack uses the same fully functional Pull All path as testing and synthetic packs.
- Pull All real-pack activation reuses the existing Pack Studio owner-review flow.
- Pull All enable/disable control defaults disabled for every new pack, draft, and live revision.
- Admin or owner can select Pull All enabled/disabled from the same create/edit or owner review flow.
- Owner final Pull All toggle selection wins during owner review and audits any change from the admin's selection.
- When Pull All is disabled, the pack follows the normal publish flow and the CTA/start API stay unavailable.
- When Pull All is enabled, the CTA/start API stay disabled until owner review/publish applies it after readiness passes.
- Owner review UI has integrated Pull All readiness with safe evidence and uses the existing approve/publish or republish action to apply Pull All when requested and ready.
- Pull-All-requested packs cannot publish or republish until Pull All readiness passes.
- Readiness failure blocks publish/republish with safe fix items and never silently falls back to normal-only publishing.
- Owner/admin can disable Pull All on an already-live pack immediately for new starts, with sanitized audit.
- Already-paid Bulk Open Sessions continue processing/retry after live Pull All disable.
- Live-pack Pull All enable or re-enable uses live edit owner review, readiness pass, and owner republish.
- Pull All activation reuses existing owner review notes where possible and writes sanitized audit automatically without adding a second owner workflow.
- Admin/staff cannot access owner rollout controls or enable real exposure from the owner review UI.
- Test-pack preflight is mandatory before the first testing pack can be enabled.
- Test-pack preflight verifies migration, default-disabled flag, single allowlisted testing pack, owner test balance, hidden CTA on non-allowlisted packs, normal open health, start API allowlist block, owner metrics/alerts, kill switch, User 360, Bag settling, exchange/shipping locks, and DTO privacy.
- Pull All is fully functional before real customer launch, not partial, demo-only, test-only, or live-lite.
- The same production Pull All path works for test packs, synthetic packs, and owner-enabled real packs.
- Full-function readiness verifies 60 percent unlock, full upfront debit, immediate Customer Sold Out, same-user gacha lock, private queue processing, 100 Highlight Rewards, Customer Bag settling/progress, exchange/shipping settled-only enforcement, Admin User 360, owner metrics/alerts, recovery, cleanup, and kill switch.
- Full-function readiness verifies normal 1, 10, and 100 opens still behave the same and Last Prize behavior stays correct.
- Full-function readiness verifies customer/admin API and RPC responses expose only safe DTOs and never leak house/private draw data.
- First owner test pack uses about 1,200 to 2,500 total spots and triggers Pull All after 60 percent sold.
- First owner test pack crosses the 1000-process-budget boundary and requires at least two processor jobs.
- First owner test pack verifies start/debit, Customer Sold Out, queue continuation, idempotent multi-job processing, Highlight Rewards, Bag settling, completion finalizer, Admin User 360, and owner metrics.
- First owner test pack does not use a 100,000+ spot stress profile.
- Larger synthetic/internal test uses about 10,000 to 25,000 total spots and triggers Pull All after 60 percent sold.
- Larger synthetic/internal test verifies 4,000 to 10,000 remaining rewards settle through 4 to 10 processor jobs at the 1000 budget.
- Larger synthetic/internal test verifies queue continuation, owner metrics, Bag pagination, no huge render, no duplicate rows, watchdog/sentinel behavior over more chunks, and bounded Cloudflare/Supabase load.
- Server computes target from available spots at confirmation time and ignores client-sent target count.
- Pull All target excludes opened, picked, void, already-owned, or otherwise unavailable spots.
- Pull All start API re-checks latest enabled state, kill switch, allowlist, readiness, pack status, sold percentage, and available target inside the server transaction before debit/session creation.
- Stale CTA/modal after Pull All disable returns safe unavailable state with no debit and no Bulk Open Session.
- Start may continue when database-confirmed total is lower than or equal to the customer-confirmed quote, cost per spot is unchanged, protected config hash is unchanged, Pull All remains enabled/ready, and target is non-zero.
- Start debits and snapshots the lower server-confirmed final target/cost when final total is lower than quote.
- Start aborts before debit when database-confirmed total is higher than the customer-confirmed quote.
- Start aborts before debit when final target is zero.
- Start aborts before debit when cost per spot changes before confirmation.
- Start aborts before debit when protected pack config changes before confirmation.
- Start locks the customer wallet row before debit.
- Start aborts before debit, Bulk Open Session creation, and Customer Sold Out state when wallet balance is insufficient.
- Insufficient balance start does not create partial Pull All, partial session, background debt, or queue work.
- Start requires a valid short-lived opaque server token bound to customer, pack, quote snapshot, protected config hash, and Pull All action.
- Repeated start with the same valid token after success returns the existing Bulk Open Session summary with no second debit and no second session.
- Different, stale, or expired token blocks before debit and requires refresh/reconfirm.
- Start stores the Pack Open Contract snapshot/hash for audit and retry safety.
- Full upfront debit happens exactly once.
- Pull All start commits session, debit, ledger, snapshots, and Customer Sold Out state atomically.
- If HTTP response is lost after committed start, the current-session endpoint returns the active paid Bulk Open Session and backend processing continues toward Customer Bag.
- Lost start response does not trigger automatic refund, cancellation, second debit, or second Bulk Open Session.
- Active paid session resume routes to Highlight Reveal only when Highlight Rewards are ready and not seen.
- Active paid session resume routes to Customer Bag when Highlight Rewards are not ready, without refiring start or exposing backend queue details.
- Active paid session resume routes to Customer Bag after the safe Highlight Reveal seen marker exists.
- Highlight Reveal does not automatically replay after the safe seen marker exists.
- Highlight Reveal seen marker is written after first successful visible render of the safe highlight payload.
- If the reveal never successfully renders, no seen marker is written and resume can try the reveal again.
- Mark-seen mutation is idempotent, customer-owned, and does not change rewards, wallet, processing status, highlight selection, or Bag contents.
- Mark-seen failure after visible render does not block Customer Bag navigation.
- Mark-seen retry remains bounded and quiet, including retry on next focus/reload.
- Pull All start does not create or update 100,000/400,000 per-slot manifest rows.
- Queue enqueue failure after commit leaves the session queued or retry-required, not cancelled or refunded.
- Pull All start schedules normal processing and the first delayed session sentinel only after the paid transaction commits.
- Retry does not debit again.
- Closing the customer browser does not stop server-owned reward processing.
- Normal 1, 10, and 100 opens still work the same.
- Normal opens block when current user has active Bulk Open Session.
- Other users block from the sold-out target pack.
- Other users can still open unrelated packs.
- Admin edits block during Bulk Open Lock.
- Bulk processor handles 1000-spot budget.
- Bulk processor uses one private RPC/transaction per process budget, not one API/RPC call per spot.
- Bulk processor uses set-based database writes inside the transaction instead of row-by-row Cloudflare/Supabase loops.
- Bulk processor reserves eligible `draw_slots` in bounded chunks after start.
- Chunk reservation keeps the guaranteed target because normal opens/admin edits are blocked while the active session owns the pack.
- Queue payload contains only session identity and safe attempt metadata.
- Retry of the same processor work cannot duplicate collection items, open items, Last Prize, counters, or highlights.
- Processor crash before chunk transaction commit leaves no durable partial chunk progress and retry resumes safely.
- Processor crash after chunk transaction commit does not re-award committed work.
- Bulk processor may stop before 1000 when time budget, Supabase latency, lock waits, or error risk rises, then persist progress and re-enqueue continuation.
- Admin/env lowering the process budget preserves the same customer-facing flow and idempotent session progress.
- Bulk processor enforces one active processor per Bulk Open Session.
- Global Bulk Open processor cap starts at 2 active processors.
- Processor re-enqueues when more spots remain.
- Processor schedules or refreshes a delayed session sentinel after successful unfinished work.
- Processor resumes idempotently after retry.
- Automatic retries use exponential backoff with capped attempts.
- Manual admin retry does not enqueue duplicate jobs when retry is already active or scheduled.
- Admin pause blocks queue processing and a later authorized resume/retry continues the same session.
- Delayed session sentinels re-enqueue stale safe-to-resume sessions without customer browser polling.
- Low-frequency global watchdog catches orphaned sessions missed by sentinels.
- Global watchdog default cadence is 15 minutes.
- Watchdog respects admin pause, retry backoff, per-session lock, and global processor cap.
- Repeated processor failures keep the session retry-required with sanitized error codes.
- Retry-required state is recoverable.
- No cancelled state exists.
- Last Prize final-slot behavior remains unchanged.
- Highlight Rewards cap at 100.
- Highlight selection prioritizes Last Prize and best public-facing wins.
- Non-highlight rewards are not individually animated/rendered, but still settle into Customer Bag.
- Every purchased reward becomes an individual item-level reward row; session counters/highlights do not replace ownership rows.
- Bulk Open reward rows remain `locked`/settling while the session is active and bulk-update to `owned` only when the session completes.
- Completion finalizer verifies all target work is processed before promoting item rows to `owned`.
- Completion finalizer releases same-user gacha block, admin live-edit lock, and temporary Customer Sold Out override in the same transaction as session completion.
- Completion finalizer failure does not partially unlock exchange, shipping, or conversion.
- Exchange, shipping, and conversion reject Bulk Open settling rows until they become `owned`.
- Customer DTOs do not leak private fields.
- Admin DTOs expose only required operational fields.
- Cursor pagination caps result page size at 1000.

### Database Tests

- Active session uniqueness by customer.
- Active session lookup by pack.
- Target slot count is computed from available spots under the start transaction lock.
- Start transaction does not create/update a full per-slot manifest for huge packs.
- Private bulk processor RPC is service-role only.
- Private bulk processor reserves/selects eligible slots and writes rewards/ownership/progress in set-based operations for its process budget.
- Chunk reservation remains idempotent under retry.
- Chunk reservation/reward/progress changes commit atomically or roll back together.
- Public slot status alone is not the Bulk Open crash-recovery source of truth.
- Private unique constraints enforce one result per Bulk Open target identity.
- Re-running the same processor job is idempotent and does not create duplicate ownership/reward rows.
- Bulk Open Session summary counters do not replace individual item ownership rows.
- Bulk Open-created item rows use `locked` while active and bulk-update to `owned` at completion.
- Completion finalizer is atomic and leaves no partially completed/unlocked state on failure.
- Service-role-only write access to bulk session internals.
- Customer cannot directly read raw bulk/session/private tables.
- Customer/admin DTOs do not expose raw draw slot IDs, private sequence internals, or idempotency constraint details.
- Admin/User 360 DTOs expose only operational-safe Bulk Open fields.
- Admin/User 360 DTOs do not expose raw queue payloads, queue job IDs, raw draw slot IDs, private slot order, internal batch IDs, private idempotency keys, reward weights/private filters, or raw Pack Open Contract internals.
- Owner audit DTOs expose protected config hashes/versions/sanitized summaries only, not raw contract internals.
- Admin control RPC/routes enforce owner/admin for retry and owner-only for pause/resume, kill switch, and processor budget changes.
- Admin control actions insert append-only audit events with safe metadata only.
- Staff role cannot call retry, pause/resume, kill-switch, or processor budget mutations.
- Bulk Open admin audit rows are append-only and retained for at least 180 days.
- Bulk Open admin audit rows include actor admin id, role, action, target type/id, previous safe status, next safe status, sanitized reason, request id, timestamp, and source surface.
- Bulk Open admin audit rows never include raw queue payloads, raw slot IDs, private config, reward weights/private filters, idempotency keys, or raw Pack Open Contract internals.
- Bulk Open admin audit rows use `audit_events` with minimal added nullable references/indexes, not a separate audit table at launch.
- Bulk Open audit queries use indexes for session, campaign, actor admin, event type, and created time.
- Completed Bulk Open customer ownership, wallet/spend ledger, open/history rows, and session summaries are retained.
- Cleanup only prunes/compacts transient processor-attempt, sentinel, stale-lock, and queue retry metadata for completed sessions older than 30 days.
- Cleanup never prunes queued, processing, retry-required, unsettled, or incomplete sessions.
- Sanitized admin audit rows are retained for at least 180 days.
- Cleanup uses indexed candidate lookup, advisory lock, and capped batches.
- Cleanup scheduled run is daily/off-peak, service-role only, and does not run from customer/admin request paths.
- Owner-only manual cleanup trigger respects the same locks, caps, retention gates, and sanitized metrics.
- Owner alerts are deduped/cooled down and fire only on actionable Bulk Open operational thresholds.
- Owner operational metrics are summary/counter based and use indexed session state, not raw slot/reward scans.
- Cursor indexes support Customer Bag/history queries.
- Open/history rows link back to Bulk Open Session where needed.
- Session sentinel checks one session and never scans every slot/reward row.
- Global watchdog candidate lookup uses indexed session summary fields and never scans every slot/reward row.

### UI Tests

- Pull All CTA appears only after 60 percent sold.
- Pull All confirmation shows full spend.
- Highlight Reveal shows at most 100 rewards.
- Non-highlight Pull All rewards skip individual reveal and appear through Customer Bag settlement.
- Closing Highlight Reveal lands on Customer Bag.
- Customer Bag shows settling progress.
- Customer Bag progress shows only total purchased reward count, landed/settling count, percent complete, capped highlights, and simple customer-facing status labels.
- Customer Bag progress does not show queue jobs, chunks, watchdog/sentinel state, retry attempts, backend timing, slot IDs, batch IDs, or private mechanics.
- Customer Bag polls summary every 10 seconds for the first 2 visible minutes, then every 30 seconds.
- Customer Bag pauses summary polling when hidden, offline, or complete, and fetches one summary on focus/reload.
- Customer Bag shows safe paged Settling Rewards while exchange/shipping stays locked.
- Customer Bag can show item-level settling rewards through safe DTOs without loading all rows at once.
- Customer DTO maps Bulk Open `locked` rows to "settling" without exposing internal status mechanics.
- After completion finalizer commits, Customer Bag shows the session complete and those item rows as normal owned rewards.
- Exchange and shipping lock unsettled rewards.
- Customer returning after tab close resumes active state after rewards continued server-side.
- Same user second tab sees blocked/waiting state.
- Admin pack editor disables protected edits during active session.
- Pack Studio shows Pull All enable/disable control default disabled.
- Admin/owner can select Pull All enabled or disabled from the normal pack flow.
- Owner final Pull All toggle selection wins during owner review.
- Owner change from admin Pull All selection shows a small confirmation line and writes sanitized audit metadata.
- Pull All disabled means no Pull All CTA/start API is available and normal pack publish can proceed.
- Stale Pull All CTA/modal after live disable shows safe "Pull All is no longer available" state and refreshes pack state.
- Stale Pull All CTA/modal after live disable does not show a failed payment/debit state.
- When final server-confirmed Pull All target/cost is lower than quote, customer sees the final purchased count/cost after start.
- When final target is zero, cost changed, protected config changed, or total is higher than quote, customer sees refresh/reconfirm guidance with no failed payment/debit state.
- When wallet balance changes before start and is no longer enough, customer sees refresh/top-up guidance with no failed payment/debit state.
- Double-click, refresh-submit, or network retry on the same valid Pull All start returns the existing Bulk Open Session summary and never charges twice.
- Expired, stale, or different Pull All start token shows refresh/reconfirm guidance with no failed payment/debit state.
- Unknown Pull All start result calls current-session before showing payment error or allowing another start.
- If current-session returns an active paid Bulk Open Session, customer resumes Highlight Reveal or Customer Bag and reward processing continues.
- Active paid session resumes to Highlight Reveal only when Highlight Rewards are ready and not seen.
- Active paid session resumes to Customer Bag when Highlight Rewards are not ready, with settling/progress and no backend queue details.
- After the Highlight Reveal seen marker exists, reload/return/change device lands on Customer Bag and does not replay the full reveal.
- Customer Bag can still show the 100 Highlight Rewards as a summary section after the reveal is seen.
- Highlight Reveal marks seen after first successful visible render, not only after close/continue.
- If Highlight Reveal never successfully renders, resume can try the reveal again.
- Mark-seen mutation is idempotent and does not change reward, wallet, processing, highlight selection, or Bag state.
- Mark-seen failure after visible render still lets current tab navigate to Customer Bag.
- Mark-seen retry is quiet and bounded, and may retry on focus/reload.
- Owner approval queue shows a safe Pull All readiness indicator when Pull All is requested or enabled without creating a separate queue.
- Owner review page shows integrated Pull All readiness beside existing approve, request-changes, publish, and republish controls.
- Existing owner approve/publish or republish action can apply Pull All when requested and ready.
- Existing owner approve/publish or republish action blocks when Pull All is requested but readiness fails.
- Pull All readiness failure shows clear safe fix items and does not silently publish the pack as normal-only.
- Live Pull All disable immediately hides/blocks new starts while already-paid Bulk Open Sessions continue.
- Live Pull All enable/re-enable requires live edit owner review, readiness pass, and owner republish.
- Pull All activation reuses existing owner review notes where possible and writes sanitized audit automatically.
- Admin/staff support views show safe Pull All status but cannot access owner rollout controls or enable Pull All.
- Admin retry appears only for retry-required sessions.
- Admin monitor shows next retry time and sanitized retry-required state.
- Admin/User 360 shows operational-safe Bulk Open fields, upfront spend, public highlights, and paged open/history/Bag rows.
- Admin/User 360 does not render raw queue payloads, queue job IDs, raw slot IDs, private slot order, internal batch IDs, private idempotency keys, reward weights/private filters, or raw Pack Open Contract internals.
- Owner/admin can see retry controls for retry-required sessions; staff cannot.
- Owner can see pause/resume, kill-switch, and processor budget controls; admin/staff cannot.
- Admin action audit view is paged and sanitized.
- Owner can export Bulk Open audit rows; admin/staff cannot.
- Audit UI shows only safe metadata and never renders raw queue payloads, raw slot IDs, private config, reward weights/private filters, idempotency keys, or raw Pack Open Contract internals.
- Owner sees safe Bulk Open operational metrics and alert states.
- Owner alerts/metrics do not render queue job IDs, raw slot IDs, private slot order, idempotency keys, reward weights/private filters, raw Pack Open Contract internals, or house logic.
- Owner alert cooldown/dedupe prevents repeated spam for the same session/cause.
- Owner rollout controls show feature flag, pack allowlist, launch stage, kill switch, and safe health summary.
- Admin/staff cannot see or edit owner rollout controls.
- Pull All CTA appears only on allowlisted packs when the global feature flag is enabled.
- Pull All CTA stays hidden on real packs until owner advances rollout.
- Test-pack preflight checklist must show pass/fail before owner can enable the first testing pack.
- Test-pack preflight UI/summary must not expose queue IDs, raw slot IDs, private order, idempotency keys, reward/private config, contract internals, or house logic.
- Customer retry button never appears for Pull All at launch; backend recovery/admin tools own retry.
- Customer waiting state does not expose queue internals or private mechanics.

### Performance Tests

- Huge Pull All start response is small.
- Highlight response is capped.
- Results endpoint uses cursor pagination.
- Customer Bag does not fetch all owned rows at once.
- Customer Bag summary polling follows the adaptive visible-only cadence and does not poll while hidden/offline/complete.
- Pull All processor call count scales by queue job budget, not by individual reward count.
- Sentinel checks scale by active Bulk Open sessions, not by reward count or pack size.
- Fallback global watchdog runs on a 15-minute default cadence, not every minute.
- Global watchdog scan count scales by active/retry-due session summaries, not by reward count or pack size.
- Bulk Open audit view/export uses indexed paged queries and never full-scans or loads all audit rows.
- Cleanup runner is daily/off-peak or owner-triggered, bounded, indexed, and never part of customer/admin request latency.
- Owner operational metrics and alert checks are bounded summary reads and do not scan raw slot/reward tables.
- Feature flag and pack allowlist checks are cheap indexed/config reads and do not add heavy per-render work.
- First owner test pack proves at least two processor jobs without large-pack stress cost.
- Larger synthetic/internal test proves 4 to 10 processor jobs and bounded load before any real pack rollout.
- Private processor database work is set-based for each process budget.
- Worker processor stops before timeout risk.
- Browser does not render huge reward arrays.

## Implementation Order

1. Lock current normal-open behavior with targeted tests.
2. Add database migration for Bulk Open Session, indexes, grants, session links, and `audit_events` Bulk Open references/indexes.
3. Extract or formalize the shared private award engine.
4. Add Bulk Open Spend and session creation.
5. Add queue processor with 1000-spot budget and idempotent retry.
6. Add service-role watchdog/sweeper recovery.
7. Add retention and cleanup maintenance gates.
8. Add owner-controlled feature flag, pack allowlist, rollout stage, kill switch, and mandatory test-pack preflight.
9. Add Pack Studio owner-review integration for the default-disabled Pull All enable/disable control, safe queue indicator, inline readiness, existing approve/publish application, existing owner note reuse, and sanitized audit.
10. Add normal-open active-session and sold-out guards.
11. Add customer Bulk Open APIs and DTO allowlists.
12. Add Customer Bag progress and cursor-paged results.
13. Add Pull All CTAs and Highlight Reveal.
14. Add exchange/shipping settling locks.
15. Add admin monitor/User 360 support.
16. Add owner operational metrics and alerting.
17. Add admin role-gated controls and sanitized audit trail.
18. Add admin edit lock for active Bulk Open.
19. Run backend, database, UI, privacy, and performance verification.

## Explicit Non-Goals

- No separate Bulk Open status page.
- No cancel action after confirmation.
- No refund/cancel fallback for processor failure.
- No repeated paid normal-open calls for Pull All.
- No Pull All dependency on the 100-open option.
- No giant reward JSON response.
- No rendering every reward in the reveal.
- No raw realtime subscriptions to private/high-volume tables.
- No admin live edit while a Bulk Open Session is active.
- No cleanup of active, retry-required, unsettled, or incomplete Bulk Open Sessions.
- No real-pack Bulk Open rollout until the owner validates the testing pack, larger synthetic/internal, and full-function readiness evidence.
- No site-wide automatic real-pack enablement at launch.

## Final Success Definition

The feature is ready when a customer can Pull All after 60 percent sold, pay once, immediately make the pack unavailable to other customers, see up to 100 safe highlights, leave or close the browser while processing continues, land in Customer Bag for progress, and later exchange or ship settled rewards.

Normal 1, 10, and 100 opens must still behave the same, Last Prize must remain correct, all APIs/RPCs must use safe public DTOs, and huge packs must stay bounded by queue jobs, cursor pages, and capped UI rendering.
