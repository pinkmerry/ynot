# Reward Conversion Bulk Job Decision Notes

This document captures the June 19, 2026 product decisions for improving reward-to-coin conversion when a customer has a very large Customer Bag. It is a planning note, not an implementation record.

## Confirmed Decisions

- Customer-facing language should use "reward" instead of "card" for this flow. The database may still use `collection_items`, but UI copy should say rewards.
- The customer must make an explicit Conversion Selection before converting. If nothing is selected, nothing is converted.
- Manual selection stays. A customer may choose one reward, a few rewards, or any visible/manual subset and convert only those selected rewards.
- Add an explicit "Select all eligible rewards" action for large bags. This always means every eligible reward in the customer's whole Customer Bag, not only the current search/filter result. It counts as a real selection, but the browser should not send every reward ID when the selection is huge.
- Keep one customer-facing "Convert to coins" button. The button works for small and large selections through one conversion flow.
- Build the new conversion pipeline as the future single source of truth for every conversion size, including 1, 2, 10, 100, 1,000, 10,000, and larger selections.
- Keep the existing 50-item `submit_card_conversion` path only as a temporary rollout fallback while the new pipeline is tested. It should not become a permanent second product path.
- The rollout fallback is feature-flag or health-gate controlled only. In normal testing, all conversions go through the new pipeline. If the new pipeline is disabled or unhealthy, 1-50 manually selected rewards may fall back to the old direct RPC; larger selections should be safely blocked with friendly retry messaging until the new pipeline is healthy.
- After testing proves the new pipeline is safe, route all customer conversion through the new pipeline and retire the old direct path from normal customer traffic.
- Large selections become a committed Bulk Conversion Job after confirmation. After confirmation, the customer cannot cancel it.
- The confirmation screen must show the server-quoted reward count and total coins before the customer confirms.
- Huge selections use a summary-only confirmation instead of a paged reward preview. Manual small selections may still show the selected reward list, but large all-eligible conversion should show only count, total coins, and the permanent/no-cancel warning.
- Quote/confirmation is non-committing. Selected rewards are not locked while the confirm screen is open. The backend locks the selected rewards only after the customer confirms, then starts conversion.
- Coins should credit progressively as backend chunks complete. Already credited chunks remain real even if later chunks require retry.
- Customer progress wording should be calm and user-facing: "Converting rewards to coins", "12,000 / 50,000 rewards converted", "300,000 / 1,250,000 coins credited", and "You can leave this page. We'll keep converting your selected rewards." Completion should say "Conversion complete", the final reward count, and the final coins added to the wallet.
- Customer UI must not mention chunks, RPCs, jobs, queues, watchdogs, retry internals, or backend timing.
- Rewards committed to a Bulk Conversion Job must not be shippable or convertible again while the job is running.
- Launch admin recovery should be retry-only plus read-only status. Admin/User 360 may show safe status, selected reward count, converted reward count, credited coin total, last update time, safe error code, and a retry button for stuck or retry-required conversions.
- Do not add customer cancel, admin cancel, pause/resume, or owner review for Reward Conversion at launch. Conversion is simpler than Pull All because it does not affect pack inventory or other customers.

## Current Code Baseline

- The active conversion API currently caps direct conversion at 50 selected action tokens.
- Both `/api/ynot/collection/convert` and legacy `/api/ynot/exchange` delegate to the same conversion handler.
- The active database RPC is `submit_card_conversion`, which auto-credits the wallet immediately and does not require admin approval.
- Current customer copy that says admin approval is required is outdated and should be corrected when the UI is updated.
- The existing Bulk Open queue pattern is the closest local precedent for server-owned, resumable background work.

## Recommended Architecture

Use one dynamic start operation for the customer action:

```text
Convert to coins button
  -> server validates explicit Conversion Selection
  -> server quotes/rechecks total
  -> new conversion pipeline decides immediate completion or background processing
```

The customer should experience one conversion flow, and the backend should converge on one authoritative conversion pipeline. During rollout, the old 50-item path may remain as a fallback, but the target state is not two customer-facing paths.

The new pipeline may return either an immediate completion result or a job summary, but it must not process 50,000 or 100,000 rewards inside one giant transaction.

Internal processing should use bounded chunks, idempotent ledger entries, and server-owned continuation. Cloudflare should orchestrate queue messages; Supabase should own row locks, wallet updates, reward status changes, idempotency, and audit records.

## Open Grill Questions

No behavior-changing product questions remain open after the June 19, 2026 grill. Implementation planning should still choose exact table/RPC names, queue binding names, chunk budget defaults, and test rollout gates.
