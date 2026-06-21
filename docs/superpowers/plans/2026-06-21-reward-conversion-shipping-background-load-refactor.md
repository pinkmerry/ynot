# Reward Conversion And Shipping Background Load Refactor Plan

## Problem Statement

Customers should be able to convert or ship 1 to 100,000 eligible rewards with one confirmation, without making Cloudflare or Supabase do one huge request-time job. The current architecture is close: conversion and shipping use quote/start/current/background processing, active profile guards, service-role RPCs, row locks, queue continuation, and recovery. The remaining problem is that the confirmed start step can still freeze one job-item row per eligible reward before the background worker owns pacing.

From the developer perspective, this means the product shape is right but the work is still in the wrong place for very large Customer Bag actions. The confirm request must become a lightweight commit, and the worker must own all large membership claiming and processing in bounded chunks. While a background conversion or shipping job is active, customers must be blocked from starting another reward-disposition action, and intruders must be blocked at the backend even if they bypass the UI.

## Solution

Deepen the Bulk Conversion Job and shipping request job modules so their public interface is small and stable:

- Quote: return an opaque token, count, total, expiry, and selection mode.
- Start: validate the quote, create the committed job, consume the token, and enqueue background work.
- Process: claim or freeze membership in bounded chunks, mutate rewards, write ledger or shipping items, update progress, and decide whether to continue.
- Current: return only safe user-facing progress.

The all-eligible path must never send 100,000 IDs from the browser and must not store 100,000 IDs at quote time. Selected mode can keep a capped selected-ID list because that path is intentionally limited. All-eligible jobs need a stable selection fence so rewards acquired after confirmation are not swept into the job.

The Background Pacing module should hold chunk sizes, continuation delays, retry behavior, and recovery pacing for conversion and shipping. Conversion should become at least as gentle as shipping: bounded chunks plus a small continuation delay instead of a tight zero-delay loop.

Legacy conversion surfaces should be cleaned after the new path is stable: keep the old route name only as a compatibility adapter, fix misleading comments and tests, and retire the old direct conversion RPC when no active code path uses it.

## Commits

### Commit 1: Lock the target behavior in focused regression tests

Update the focused conversion and shipping flow tests so the expected behavior is explicit:

- All-eligible quote does not materialize or return every reward ID.
- Start creates only the committed job and does not freeze all membership rows.
- The worker claims or freezes membership rows in bounded chunks.
- Conversion and shipping both block each other at quote and start while an active job exists.
- The current progress routes expose only safe customer progress fields.
- Conversion worker continuation uses named pacing constants and does not immediately hammer the queue.
- Customer Bag UI disables conversion and shipping actions while either background job is active.
- The legacy conversion adapter does not call the retired direct conversion path.

Implementation rule: edit each assertion together with the smallest code change that makes it pass, so every commit remains working.

Verification after commit:

- Run the focused conversion flow test.
- Run the focused shipping flow test.

### Commit 2: Add stable all-eligible selection fences

Extend quote/job metadata for both conversion and shipping with a stable all-eligible selection fence. The fence should be based on the confirmed eligible set's ordered edge values and confirmation time, so worker chunks can avoid claiming rewards acquired after confirmation.

Selected mode keeps its capped selected list. All-eligible mode keeps only summary metadata and the fence, not the full reward list.

Verification after commit:

- Conversion quote test proves all-eligible stores summary/fence only.
- Shipping quote test proves all-eligible stores summary/fence only.
- Tests prove selected mode still stores only capped selected membership.

### Commit 3: Make Reward Conversion start lightweight

Change the Bulk Conversion Job start behavior so it validates and consumes the quote, creates the job, preserves idempotent replay, checks active shipping, checks active conversion, and returns progress metadata. It must not insert all job membership rows during the confirm request.

The start step may still re-check the quote summary before commit, but it must not do large writes. If the quote is stale, it should fail before job creation.

Verification after commit:

- Focused conversion flow test proves no start-time membership freeze.
- Test proves idempotent replay still returns the existing job.
- Test proves active shipping blocks quote and start.
- Test proves the API only enqueues background work and never processes chunks inline.

### Commit 4: Move Reward Conversion membership claiming into worker chunks

Change the conversion processing module so each worker invocation:

- Locks the job row.
- Claims at most the configured chunk size.
- Creates job-item snapshot rows for only that chunk.
- Freezes coin values for the chunk.
- Credits wallet once per chunk with an idempotent ledger entry.
- Marks only claimed rewards exchanged.
- Updates converted count and credited coin totals.
- Completes only when converted count and credited total match the quote.
- Returns retry-required, not completed, when the job cannot claim enough eligible rewards to satisfy the committed quote.

The worker should prefer existing pending snapshot rows first, then claim new eligible rows only when needed. This keeps retries idempotent after a partial failure.

Verification after commit:

- Focused conversion flow test proves chunk membership comes from the worker path.
- Test proves worker uses row locks and bounded limits.
- Test proves no over-claim beyond the quoted item count.
- Test proves incomplete/mismatched membership does not mark the job completed.
- Test proves progressive ledger credits remain idempotent.

### Commit 5: Make shipping start lightweight and worker-owned

Apply the same shape to shipping:

- Start creates the shipping request and committed shipping job only.
- Worker chunks claim eligible rewards, create shipping request items, mark rewards shipping-requested, and update prepared progress.
- Existing admin cancellation and failure rollback semantics remain intact.
- Active conversion blocks shipping quote/start, and active shipping blocks conversion quote/start.

Verification after commit:

- Focused shipping flow test proves no start-time membership freeze.
- Test proves worker claims bounded membership chunks.
- Test proves failure rollback clears claimed shipping links.
- Test proves admin cancellation of preparing jobs still clears job-linked rewards.

### Commit 6: Finish Background Pacing as the single pacing module

Use the existing queue adapter shape as the single Background Pacing module. Tune conversion to avoid a zero-delay tight loop and align it with shipping's smoother behavior.

Target launch defaults:

- Conversion process chunk size: 2,000 unless a measured local/SIT test shows 5,000 stays comfortably below limits.
- Conversion continuation delay: 1 second.
- Conversion recovery delay: 1 second.
- Shipping process chunk size: 2,000.
- Shipping continuation delay: 1 second.
- Recovery scanner continues to enqueue only a small number of due jobs per cron run.

Verification after commit:

- Worker tests prove all pacing constants are named and used.
- Worker tests prove retry-required jobs are not immediately re-enqueued.
- Queue config test proves consumer batch size and retry policy are still bounded.

### Commit 7: Lock Customer Bag action UI during active jobs

Deepen the Customer Bag action interface so both customer surfaces share the same rules:

- Active conversion disables conversion and shipping actions.
- Active shipping disables conversion and shipping actions.
- The user can still browse, view progress, refresh totals, top up, and open non-conflicting pages.
- The UI does not expose backend words like chunk, RPC, queue, or job.
- Polling stays paced while background work is active.

Verification after commit:

- UI regression tests prove buttons are disabled during active conversion/shipping.
- UI regression tests prove progress copy stays user-facing.
- Tests prove selected and all-eligible actions still send the intended payloads.

### Commit 8: Clean the legacy conversion adapter

Make the legacy route name explicitly a compatibility adapter, not a second implementation. Remove stale copy that says the route calls the retired direct conversion RPC.

After the new job pipeline is stable, add a database migration that revokes and drops the retired direct conversion RPC. Update generated types and verification tests so they no longer require that retired RPC.

Verification after commit:

- Platform verification proves the compatibility adapter delegates to the hardened conversion module.
- Search proves no active customer route calls the retired direct conversion RPC.
- Focused conversion tests prove the new route and compatibility route share the same handler.

### Commit 9: Add non-production load smoke verification

Add a load-shaped smoke test that runs only against local or isolated SIT data, never production. It should create a large synthetic owned-reward set, run quote/start/process, and assert:

- Quote returns summary only.
- Start completes quickly and creates no full membership snapshot.
- Worker chunks process the expected count over multiple invocations.
- Final wallet credit and reward statuses match the quoted totals.
- No private tokens, hashes, item arrays, service keys, or raw IDs leak to customer DTOs.

Use smaller counts by default for local CI and a manually triggered larger count for SIT.

Verification after commit:

- Run the focused flow tests.
- Run the local smoke with a modest count.
- Run typecheck.

### Commit 10: Final recheck and release gate

Before merging or deploying, run the full verification pass:

- Focused conversion flow test.
- Focused shipping flow test.
- Platform verification.
- Hardening/security regression tests if touched surfaces include auth/security utilities.
- Typecheck.
- Build.
- Supabase migration dry-run against the linked project only after backup/PITR gates are satisfied.

Do not apply production migrations just to test load. Use local or SIT for load-shaped tests.

## Decision Document

- The launch policy is one active reward-disposition job per customer profile.
- Active conversion blocks new conversion quote/start and new shipping quote/start.
- Active shipping blocks new conversion quote/start and new shipping quote/start.
- Customers may keep browsing, viewing progress, and using unrelated account features while a background job runs.
- All-eligible mode is summary-based at quote and start.
- Selected mode remains capped and can use selected membership lists.
- Start is a lightweight commit, not a bulk membership writer.
- The worker owns chunk claiming, chunk mutation, progress, retry, and completion.
- Conversion credits coins progressively by chunk.
- Shipping prepares request items progressively by chunk.
- Background pacing is a named module-level policy, not scattered magic constants.
- The legacy conversion route name may remain temporarily as a compatibility adapter.
- The retired direct conversion RPC should be removed only after tests and search prove no active customer path depends on it.

## Testing Decisions

Good tests should assert external behavior and safety contracts, not exact incidental formatting. For this refactor, useful tests prove:

- The browser never sends all eligible reward IDs.
- Quote and start do not expose internal identifiers or private metadata.
- Start does not perform full membership writes.
- Worker chunks use bounded limits and row locks.
- Active jobs block conflicting actions at both UI and backend layers.
- Idempotent replay remains safe.
- Recovery can resume queued, retry-required, and stale processing jobs.
- Final counts and totals cannot mark a partial job complete.
- Legacy adapter behavior is intentional and not a hidden second path.

Prior art already exists in the focused conversion flow test, focused shipping flow test, queue/config tests, platform verification, typecheck, and build.

## Out of Scope

- Customer cancellation of conversion jobs.
- Admin cancellation of conversion jobs.
- Owner review for conversion.
- Changing wallet ledger semantics beyond preserving idempotent progressive credits.
- Removing the compatibility route name in the same pass, unless tests and production traffic checks prove it is safe.
- Production load testing against the real Supabase project.
- Broad Customer Bag redesign unrelated to active-job locking and action payload consolidation.

## Further Notes

This refactor should be implemented before trusting 100,000 reward conversion or shipping in production. The safest implementation order is conversion first, then shipping, then UI cleanup, then legacy cleanup. The worktree already contains partial progress: all-eligible conversion quote is lighter than before, active job guards exist, and the queue worker already has an adapter-shaped pacing module. The remaining high-risk work is moving all large membership freezing from start into paced worker chunks.
