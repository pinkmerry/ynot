# Admin Middleman Journey - Architecture Plan

Status: MVP decision lock draft.
Updated: 2026-06-26

## Goal

Give YNOTT staff a control center to safely operate marketplace sales as the middleman.

Admin must be able to protect buyers, sellers, inventory, payout, and shipping without each admin page knowing the full marketplace rule set.

MVP middleman means YNOTT controls the sellable item before it is active:

- Official shop: YNOTT already owns the item.
- User seller: YNOTT receives and inspects the physical item before listing.

No MVP path lets a seller list a Customer Bag reward, list a gacha reward, or ship directly to the buyer.

## Document Role

This document owns the owner/admin/staff operations plan: intake, inspection, listing activation, order fulfilment, shipping, refunds, seller payout release, reconciliation, and audit. It must distinguish owner-only prelaunch controls from later delegated operator/admin roles.

## MVP Admin Decision Locks

- Prelaunch marketplace access and admin operations are owner-only for testing.
- MVP includes official shop and user-seller consignment, but public release stays gated until admin queues and reconciliation pass.
- YNOTT must receive and inspect user-seller cards before they become public listings.
- User-seller listings do not need a separate listing-review queue after every successful intake inspection; risk rules can trigger extra listing activation review.
- Seller payout release is owner-only for MVP.
- All refunds are handled by admin workflow with no amount threshold; manual overrides require owner approval.
- Admin dashboard must control seller-side marketplace fee default/rules. Default seller fee is 10 percent.
- Admin dashboard must control buyer-side service fee rules. Default buyer service fee is 10 percent for MVP.
- Official shop orders do not create seller payout liability, but admin needs completion/revenue visibility for official orders.
- Marketplace audit lives in Marketplace Supabase first; a summary mirror to existing YNOTT audit can come later.

## Current Runtime And Launch Gate

Current YNOTT runtime evidence:

- `Website/src/features/ynot/components.tsx` already has admin navigation and admin queue patterns for shipping, top-ups, prizes, stock, audit, and settings.
- `Website/src/app/api/ynot/admin/shipping/route.ts` uses `resolveAdminSession`, `enforceSameOriginMutation`, `enforceRateLimit`, and a transaction-safe status transition RPC.
- `Website/src/app/api/ynot/admin/top-ups/route.ts` uses admin review guards, risk alerts, provider evidence checks, and manual review actions.
- `Website/src/lib/auth/admin-role-guard.ts` already gives a role-check Adapter for `owner`, `admin`, and `staff`.
- `Website/src/app/admin/marketplace/page.tsx` now provides an owner-gated marketplace admin console with official order, seller payout, queue, reconciliation, and audit reads.
- Marketplace admin mutation routes now cover seller intake transitions, seller listing activation, official payment/fulfilment/refund, payout release/paid markers, reconciliation resolution, and audit timeline reads.
- The customer marketplace surface remains owner-only during prelaunch, but it is no longer only a Phase 0 placeholder.

Launch rule:

- Do not add public seller/buyer marketplace operations until the Admin Workflow Module can receive, inspect, publish, ship, refund, hold, and reconcile marketplace records.
- Official shop and user-seller consignment can be tested together by owner accounts only when admin shipping, refund, payout, and reconciliation queues are ready.

## Admin Architecture Seam

The admin seam should be one deep Admin Workflow Module, not one rule set per page.

```text
Admin page
  -> Admin Workflow Module
      -> Admin Role Adapter
      -> Marketplace State Transition Adapter
      -> Marketplace Audit Adapter
      -> Payment Evidence Adapter
      -> Shipping Evidence Adapter
      -> Queue Projection Adapter
```

Depth target:

- The admin page knows the command name, target ID, note, and idempotency key.
- The Admin Workflow Module knows the allowed transition, required role, money invariant, audit shape, and reconciliation fallback.
- Marketplace Supabase owns transaction-safe state movement.

Leverage:

- One Interface can protect official shop, consignment, shipping, refund, payout, and reconciliation flows.
- New queue screens can be added without duplicating state rules.

Locality:

- Role policy, transition policy, and audit policy stay in one implementation area.
- Marketplace failures are easier to test because every risky operation goes through the same command envelope.

## Admin Frontend Design Direction

The admin marketplace surface should be an operations console: dense, quiet, scannable, and explicit about risk.

- Purpose: let staff process queues, inspect evidence, and execute safe state transitions.
- Audience: YNOTT operators, admins, and owners doing repeated marketplace work.
- Tone: utilitarian, precise, low decoration, high confidence.
- Memorable detail: every work item detail has a right-side command panel with allowed actions, required evidence, role requirement, and audit note.
- Constraints: reuse existing YNOTT admin navigation/table patterns, avoid card-heavy marketing layouts, keep mobile usable for urgent checks but optimize desktop/tablet for operations.

Admin UI principles:

- First viewport should show queue counts and the active queue, not an explanation page.
- Use tables/lists for repeat work; use detail panels for evidence and commands.
- Show role-locked actions as unavailable with role requirement, not hidden when the absence would be confusing.
- Risky commands require confirmation, note/evidence fields, and a visible summary of before/after state.
- Use badges with text labels for status, priority, source, seller type, and payout/refund risk.
- Do not show private buyer address, bank/payout data, or original private images in queue rows.

## Admin Command Envelope

Every admin mutation should use the same Interface shape:

```ts
type MarketplaceAdminCommand = {
  command:
    | "official_inventory_create"
    | "official_listing_publish"
    | "consignment_intake_instruction_send"
    | "consignment_item_receive"
    | "inspection_record"
    | "listing_activate"
    | "listing_reject"
    | "listing_hide"
    | "order_mark_packing"
    | "order_mark_shipped"
    | "order_mark_delivered"
    | "refund_approve"
    | "refund_record_result"
    | "payout_hold"
    | "payout_release"
    | "payout_mark_paid"
    | "reconciliation_open"
    | "reconciliation_resolve";
  target_type: "inventory" | "listing" | "order" | "payment" | "shipment" | "payout" | "reconciliation";
  target_id: string;
  actor_admin_id: string;
  actor_profile_id: string;
  idempotency_key: string;
  note: string;
  payload: Record<string, unknown>;
};
```

Required guard order:

1. Check Supabase configuration.
2. Enforce same-origin mutation check.
3. Resolve current admin session from existing YNOTT auth.
4. Enforce rate limit scoped to command and admin profile.
5. Validate request shape and UUIDs.
6. Use Admin Role Adapter for current role proof.
7. Apply transition in Marketplace Supabase transaction.
8. Write append-only audit event in the same transaction when possible.
9. Return normalized result and next queue state.

This mirrors existing YNOTT admin Modules and keeps marketplace admin security familiar.

## Admin Command UI Contract

Admin detail pages should render commands from backend-provided allowed actions.

Command panel fields:

- Command label.
- Required role.
- Current state.
- Resulting state.
- Required evidence.
- Risk flags.
- Idempotency/retry status when a prior command is replayed.
- Note field when policy requires it.

UX rules:

- Confirmation copy should name the target and state change, for example `Mark order YMO-123 as shipped`.
- If evidence is missing, keep the command disabled and list missing evidence beside the button.
- If role is insufficient, show `Owner required` or `Admin required` near the action.
- After success, update the detail state and queue membership without losing the operator's place.
- After conflict/version error, show the current state and prompt refresh/review.
- Reconciliation-opening commands should explain why the normal transition cannot safely continue.

## Admin API Contract

Admin pages should talk to a small set of workflow routes. The routes accept commands and queue filters; they do not expose raw table mutation.

| Route | Method | Owner | Purpose |
| --- | --- | --- | --- |
| `/api/marketplace/admin/queues` | `GET` | Queue Projection Adapter | Return queue counts and high-level SLA/risk counters. |
| `/api/marketplace/admin/queues/:queueKey` | `GET` | Queue Projection Adapter | Return one paginated queue with snapshot fields. |
| `/api/marketplace/admin/work-items/:targetType/:targetId` | `GET` | Admin Workflow Module | Return admin detail, safe audit timeline, and allowed commands. |
| `/api/marketplace/admin/workflow` | `POST` | Admin Workflow Module | Apply a `MarketplaceAdminCommand` through the transition RPC. |
| `/api/marketplace/admin/reconciliation` | `GET` | Reconciliation Module | Return reconciliation items by state, target, and assignee. |
| `/api/marketplace/admin/reconciliation/:itemId/resolve` | `POST` | Reconciliation Module | Resolve or reopen a reconciliation item with evidence. |
| `/api/marketplace/admin/audit/:targetType/:targetId` | `GET` | Marketplace Audit Adapter | Return paginated audit events for one target. |

Route rules:

- Every admin mutation route uses `resolveAdminSession`, same-origin validation, rate limit, request allowlisting, idempotency key validation, and structured audit context.
- Queue reads require admin session but should use read-only service methods and bounded pagination.
- Admin route bodies must reject browser-supplied `actor_admin_id`, `actor_role_at_action`, `before_state`, `after_state`, money calculation fields, and authorization booleans.
- The server derives actor identity, role, allowed commands, and target ownership from current auth plus Marketplace state.
- Command routes must return `request_id`, `command_id`, `target_type`, `target_id`, `previous_state`, `next_state`, and `next_queue_key` when a transition succeeds.

## Admin Workflow Database Contract

Admin workflow should use append-only events plus compact queue projections. Raw source tables stay owned by their domain modules.

Recommended tables:

| Table | Purpose |
| --- | --- |
| `marketplace_admin_commands` | Idempotent command ledger and request hash. |
| `marketplace_admin_audit_events` | Append-only admin action/event timeline. |
| `marketplace_admin_queue_items` | Materialized or maintained projection for queue tabs. |
| `marketplace_reconciliation_items` | Manual follow-up items for money, payment, inventory, shipping, or payout mismatch. |
| `marketplace_admin_notes` | Optional internal notes when they should not mutate domain state. |

`marketplace_admin_commands` core fields:

- `id uuid primary key`
- `request_id uuid not null`
- `idempotency_key text not null`
- `request_hash text not null`
- `command text not null`
- `target_type text not null`
- `target_id uuid not null`
- `actor_admin_id uuid not null`
- `actor_profile_id uuid not null`
- `actor_role_at_action text not null`
- `status text not null check in ('accepted', 'applied', 'replayed', 'failed')`
- `result_snapshot jsonb null`
- `created_at timestamptz not null default now()`

`marketplace_admin_audit_events` core fields:

- `id uuid primary key`
- `command_id uuid null`
- `request_id uuid not null`
- `actor_admin_id uuid not null`
- `actor_profile_id uuid not null`
- `actor_role_at_action text not null`
- `command text not null`
- `target_type text not null`
- `target_id uuid not null`
- `before_state text null`
- `after_state text null`
- `money_snapshot jsonb null`
- `evidence_refs jsonb not null default '[]'::jsonb`
- `note text null`
- `created_at timestamptz not null default now()`

Indexes:

- Unique `(actor_profile_id, idempotency_key)` on `marketplace_admin_commands`.
- `(target_type, target_id, created_at desc)` on audit events.
- `(queue_key, status, priority desc, updated_at desc)` on queue items.
- `(target_type, target_id, status)` on reconciliation items.
- `(actor_profile_id, created_at desc)` for admin activity review.

## Admin Workflow RPC Contract

One transition RPC can dispatch to narrower domain transition functions, or the service layer can route commands to specific RPCs. The contract should still be explicit.

| RPC / Command | Owner | Responsibility |
| --- | --- | --- |
| `marketplace_admin_apply_transition` | Admin Workflow Module | Validate envelope, idempotency, role, command/state policy, audit, and queue update. |
| `marketplace_record_intake_transition` | Consignment Intake Module | Send instruction, receive item, record inspection pass/fail. |
| `marketplace_admin_publish_listing` | Marketplace Listing Module | Approve/publish/hide/reject listing after source guards. |
| `marketplace_update_shipment_state` | Admin Workflow Module | Move paid order through packing, shipped, delivered states. |
| `marketplace_record_refund_transition` | Marketplace Money Module | Approve refund and record provider/manual result. |
| `marketplace_release_seller_payout` | Marketplace Money Module | Release eligible user-seller payout with owner role proof. |
| `marketplace_mark_seller_payout_paid` | Marketplace Money Module | Mark released payout paid with evidence reference. |
| `marketplace_open_reconciliation_item` | Reconciliation Module | Open one manual follow-up item for mismatched state. |
| `marketplace_resolve_reconciliation_item` | Reconciliation Module | Resolve/reopen reconciliation with audit trail. |

RPC rules:

- The RPC receives the server-derived actor and role, then validates that role again against the command policy.
- The RPC stores the idempotency command row before applying the transition.
- Replaying the same idempotency key and request hash returns the original result and does not create another audit event.
- Reusing the same idempotency key with a different request hash fails with `marketplace_idempotency_conflict`.
- Every state transition and queue projection update happens in the same transaction as the audit event when possible.
- External provider fetches, image processing, and slow file reads must happen outside the transaction. The transition records only evidence references.
- If a transition cannot safely complete, it should open a reconciliation item instead of partially moving money, payout, shipping, or listing state.

## Admin RLS, Grants, And Security Contract

- Enable RLS on admin command, audit, queue, note, and reconciliation tables.
- Admin mutation tables are server-owned. Revoke direct mutation grants from `anon` and `authenticated`.
- Server-only RPCs revoke `execute` from `public`, `anon`, and `authenticated`; grant only to the Marketplace backend service role.
- Any `security definer` RPC must set a fixed `search_path`, validate actor and role inputs against the current server-authenticated admin context, and stay unavailable to browser roles.
- Admin queue read models should expose only staff-safe fields for the route's required role; payout/bank/provider evidence should require owner/admin detail routes.
- Never authorize from a role stored in Marketplace Supabase alone. Always resolve the current YNOTT admin role at request time.
- Audit writes should be append-only. Corrections are new events, not updates to old events.

## Work Queues

MVP queues:

| Queue | Primary owner | Source state | Main action |
| --- | --- | --- | --- |
| Official inventory | Operator/Admin | `official_inventory_status` | Create, price, image, publish, hide |
| Seller Consignment Intake | Operator | `consignment_status` | Send instruction, mark received |
| Inspection | Operator/Admin | `inspection_status` | Record condition, variant, pass/fail |
| Listing activation / risk review | Admin/Owner | `listing_status` | Activate, reject, hide |
| Paid orders | Operator | `order_status` | Pack, prepare shipment |
| Shipping | Operator | `shipment_status` | Add carrier/tracking, mark shipped/delivered |
| Refund/dispute | Admin/Owner | `refund_status` | Approve, record provider result |
| Seller payout | Owner | `payout_status` | Hold, release, mark paid |
| Reconciliation | Admin/Owner | `reconciliation_status` | Open, assign, resolve |

Queue projection rules:

- Load counts first by indexed state columns.
- Load detail rows only for the active tab or selected queue.
- Queue rows should include enough snapshot fields for review, but full audit history should load on detail.
- Image review should use processed thumbnails in queue cards and private originals only on detail.

## Admin Queue UI Contract

Recommended layout:

- Left/upper queue navigation: queue tabs with counts and attention badges.
- Main queue list: dense rows with thumbnail, title, source, state, age, amount, owner, and next recommended action.
- Detail drawer/page: evidence, item/order/customer snapshots, audit timeline, and command panel.
- Sticky command panel on desktop detail; inline command section on mobile.

Queue row fields:

- Thumbnail or source icon.
- Work item title.
- Queue/state label.
- Seller type/source.
- Buyer/seller safe display name when relevant.
- Money amount or price when relevant.
- Age/SLA indicator.
- Blocked/reconciliation flag.
- Next recommended command.

UX rules:

- Queue tabs should not shift width when counts change.
- Counts load before rows; row skeletons use stable heights.
- Filter/sort controls should be compact: queue status, seller type, age/priority, assigned/unassigned.
- Staff should be able to return to the same queue position after closing detail.
- Audit timeline should be collapsed by default in queue detail but immediately available.
- Use processed thumbnails for speed; private originals open only in detail with role-appropriate access.
- Mobile admin can complete low-risk actions, but high-risk payout/refund override should prefer desktop review unless product intentionally allows mobile.

## Official Shop Middleman Flow

```text
Admin creates official Marketplace Inventory
  -> admin publishes official Marketplace Listing
  -> buyer pays
  -> admin prepares official shipment
  -> admin ships to buyer
  -> order completes
  -> official revenue/completion is visible in admin dashboard
```

Official shop invariants:

- `seller_type = official_shop`.
- No seller payout row is created; projections may use `seller_payout_state = not_applicable`.
- No Seller Payout release button is shown.
- Admin cannot attach official shop inventory to a Customer Bag reward ID or gacha reward ID.
- Admin can hide or archive official inventory without seller contact workflow.

## Seller Consignment Middleman Flow

```text
Seller submits item
  -> admin gives intake instruction
  -> seller ships/brings item to YNOTT store
  -> admin receives
  -> admin inspects condition/variant
  -> admin approves Marketplace Inventory
  -> admin publishes Marketplace Listing
  -> buyer pays
  -> admin ships to buyer
  -> admin releases Seller Payout after required milestone
```

Consignment invariants:

- Active listing is created from Marketplace Inventory, not from a Customer Bag reward or collection item.
- Inspection must pass before listing activation; a separate review step applies only when risk rules require it.
- Payout release requires required fulfilment milestone and owner role.
- Seller direct shipping is not part of MVP.

## State Transition Interfaces

### Official Inventory

| From | Command | To | Required role |
| --- | --- | --- | --- |
| `draft` | `official_inventory_create` | `draft` | `admin`, `owner` |
| `draft` | `official_listing_publish` | `listed` | `admin`, `owner` |
| `listed` | `listing_hide` | `hidden` | `admin`, `owner` |
| `hidden` | `official_listing_publish` | `listed` | `admin`, `owner` |
| any non-terminal | `reconciliation_open` | unchanged plus reconciliation item | `admin`, `owner` |

### Consignment Intake

| From | Command | To | Required role |
| --- | --- | --- | --- |
| `submitted` | `consignment_intake_instruction_send` | `intake_instruction_sent` | `staff`, `admin`, `owner` |
| `intake_instruction_sent` | `consignment_item_receive` | `received` | `staff`, `admin`, `owner` |
| `received` | `inspection_record` pass | `inventory_approved` | `admin`, `owner` |
| `received` | `inspection_record` fail | `inspection_failed` | `admin`, `owner` |
| `inventory_approved` | `listing_activate` | `listed` | `admin`, `owner` |
| any non-terminal | `listing_reject` | `rejected` | `admin`, `owner` |

### Orders, Refunds, And Shipping

| From | Command | To | Required role |
| --- | --- | --- | --- |
| `paid` | `order_mark_packing` | `packing` | `staff`, `admin`, `owner` |
| `packing` | `order_mark_shipped` | `shipped` | `staff`, `admin`, `owner` |
| `shipped` | `order_mark_delivered` | `delivered` | `staff`, `admin`, `owner` |
| `refund_requested` | `refund_approve` | `refund_approved` | `admin`, `owner` |
| `refund_approved` | `refund_record_result` | `refunded` or `reconciliation_required` | `admin`, `owner` |
| any non-terminal | `reconciliation_open` | unchanged plus reconciliation item | `admin`, `owner` |

### Seller Payout

| From | Command | To | Required role |
| --- | --- | --- | --- |
| `pending_milestone` | `payout_hold` | `held` | `admin`, `owner` |
| `eligible` | `payout_release` | `released` | `owner` |
| `released` | `payout_mark_paid` | `paid` | `owner` |
| any | `reconciliation_open` | unchanged plus reconciliation item | `admin`, `owner` |

Forbidden transitions:

- Official shop order cannot enter `payout_release` or `payout_mark_paid`.
- Failed inspection cannot enter `listed`.
- Unpaid order cannot enter shipping fulfilment.
- Refund cannot complete without payment provider or manual evidence.
- Replayed idempotency key cannot duplicate transitions, audit events, payouts, or refunds.

## Admin Role Rules

MVP role mapping should reuse existing YNOTT role names:

| Existing role | Marketplace capability |
| --- | --- |
| `staff` | Receive consignment items, record low-risk shipping events, add notes |
| `admin` | Approve listings, fail inspection, handle refunds, open reconciliation |
| `owner` | Release payout, perform manual override, close high-risk reconciliation |

Role rules:

- Check role at action time through the Admin Role Adapter.
- Never trust a stale role snapshot stored in Marketplace Supabase as the only authorization proof.
- Store actor role in audit metadata for evidence, but do not use old audit role metadata to authorize a new action.

## Audit Requirement

Every admin action should write an append-only event:

- `actor_admin_id`.
- `actor_profile_id`.
- `actor_role_at_action`.
- `command`.
- `target_type`.
- `target_id`.
- Before/after state when state changes.
- Money fields when refund or payout changes.
- Note/reason.
- Idempotency key.
- Request/source context where safe.
- Provider evidence reference when relevant.
- Timestamp.

Audit event locality:

- Prefer one Marketplace Audit Adapter that writes marketplace audit rows.
- If YNOTT wants a unified admin audit view, mirror a summary into the existing `audit_events` pattern without making the gacha database own marketplace state.

## Security And Failure Rules

- Admin queue, inspection, refund, override, shipping, reconciliation, and payout-release APIs are HTTPS-only in production. HTTP requests redirect or fail closed, secure admin cookies require HTTPS, and admin evidence links must not use mixed content.
- Every admin mutation requires same-origin validation and the current YNOTT CSRF/session-cookie protection pattern.
- Payout release requires owner-level permission in MVP.
- Refund approval requires admin or owner permission with no amount threshold.
- Manual override requires owner permission and note.
- Admin RBAC is enforced server-side from YNOTT `admin_users` and owner permission checks at action time. Browser-submitted actor IDs, roles, permission grants, queue ownership, or command authority are rejected.
- Admin journey does not store marketplace passwords. Existing YNOTT/Supabase Auth owns password hashing, credential reset, login throttling, and primary session issuance for admins and owners.
- Admin command inputs use per-command schema allowlists. Unknown fields, malformed payloads, caller-supplied money calculations, role/state/evidence trust flags, and arbitrary evidence URLs fail closed.
- Admin database access uses Supabase query builders, parameterized RPCs, or prepared statements only. No queue filter, note, status, evidence reference, or command field is concatenated into SQL.
- Admin routes follow the YNOTT session timeout policy. Payout release, refund result override, manual status override, reconciliation close, and permission-sensitive actions require a fresh owner/admin session check when stale.
- Admin cannot activate listing for inventory that failed inspection.
- Admin cannot release payout for official shop order.
- Admin cannot release payout before required fulfilment milestone.
- Admin cannot attach marketplace listing to Customer Bag reward ID.
- Admin cannot attach marketplace listing to gacha reward ID.
- Repeated admin action with same idempotency key must not duplicate state transitions.
- Webhook/provider evidence can update payment/shipping state, but admin manual override must be audited separately.
- Cross-origin mutation requests must be rejected.
- High-risk commands need tighter rate limits than read-only queue loading.
- Marketplace Supabase RLS should block browser clients from mutating admin states directly.
- High-risk commands such as payout release, manual override, refund result override, and reconciliation close require a fresh owner/admin session check, explicit note, evidence reference, and command summary confirmation.
- Admin command bodies must be schema-validated with per-command allowlists; unknown fields and browser-submitted money calculations, role grants, state snapshots, or evidence trust flags fail closed.
- Evidence references must point to already validated private objects or provider/manual evidence rows. Admin routes must not accept arbitrary URLs, raw base64 files, or unscanned uploads as final evidence.
- Queue rows must stay redacted by default. Full buyer address, bank/payout details, raw provider payloads, and private original images load only through detail routes with role checks and structured audit logging.
- Admin notes and inspection text render as plain text. If rich text is ever added, it needs a sanitizer allowlist and a CSP review before launch.

Security architecture and performance impact:

- Admin queues should be projection-backed, not assembled by joining every domain table on each request. Queue rows expose redacted state, SLA, priority, and next action only.
- Detail routes perform the heavier RBAC, evidence, private image, address, provider, payout, and audit loads after the admin selects one item.
- Use one admin command envelope and transaction-safe RPC path for state changes. This centralizes RBAC, fresh-session checks, idempotency, audit, and queue update while keeping command code predictable.
- Fresh owner/admin session checks apply to high-risk commands, not every queue refresh. Queue reads still require admin session and role-scoped projections.
- Append-only audit and queue updates should happen in the same transaction where possible, with indexes on `queue_key`, `status`, `priority`, `updated_at`, actor, target, and idempotency key.

## Performance Rules

- Admin queues should query indexed state columns.
- Queue pages should load counts first, then detail rows.
- Large audit history should paginate by timestamp and target ID.
- Image review should use processed thumbnails in queue cards and private originals only on detail.
- Reconciliation jobs should run outside normal page render.
- Queue Projection Adapter should return snapshot fields so admin pages do not join across many marketplace tables on every render.
- State transition writes should avoid long locks around image or provider fetches; external evidence should be fetched before or after the transaction, then recorded by reference.

## Admin Backend Error Contract

Admin APIs return stable codes so pages can show exact blocked-action reasons.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `marketplace_admin_required` | `403` | Caller is not a marketplace-capable staff/admin/owner. |
| `marketplace_admin_role_insufficient` | `403` | Current role cannot run this command. |
| `marketplace_command_unknown` | `400` | Command is not registered in the workflow policy. |
| `marketplace_command_target_invalid` | `422` | Target type or ID is malformed or not supported by the command. |
| `marketplace_target_not_found` | `404` | Target does not exist or is outside admin-visible marketplace scope. |
| `marketplace_transition_invalid` | `409` | Current state cannot move through the requested command. |
| `marketplace_transition_version_conflict` | `409` | Target changed after the admin page loaded. |
| `marketplace_evidence_required` | `422` | Command requires tracking, inspection, refund, payout, or provider evidence. |
| `marketplace_money_invariant_failed` | `409` | Refund, payout, or payment state would violate a money invariant. |
| `marketplace_official_payout_forbidden` | `409` | Admin attempted payout action on official shop order. |
| `marketplace_reconciliation_required` | `409` | Command cannot finish safely and needs reconciliation workflow. |
| `marketplace_idempotency_conflict` | `409` | Same idempotency key was reused with a different request hash. |
| `marketplace_rate_limited` | `429` | Admin command exceeded allowed retry rate. |

Error responses include `request_id`, `code`, `message`, `command`, `target_type`, `target_id`, and optional `current_state`, `required_role`, or `missing_evidence`. They must not include provider secrets, full payout account data, or private buyer address snapshots.

## Admin Queue Response Contract

Queue responses should be stable and small:

- `queue_key`
- `cursor`
- `items[]`
- `counts_by_status`
- `sla_summary`
- `risk_summary`

Queue item fields:

- `target_type`
- `target_id`
- `display_title`
- `seller_type`
- `source_kind`
- `current_state`
- `next_recommended_command`
- `price_or_amount_satang`
- `currency`
- `thumbnail_url`
- `age_seconds`
- `priority`
- `blocked_reason`

Queue cards should not include full audit history, full payment events, bank/payout details, private original images, or full address snapshots. Detail routes load those fields only when the role and command need them.

## Accepted Deep Design Decisions For Doc 06

- All refunds are handled by admin workflow with no amount threshold; manual overrides require owner approval.
- `staff` can receive items and upload inspection evidence; admin or owner approves inventory.
- Mandatory inspection fields before `inventory_approved`: received condition, photo evidence, authenticity/variant check, mismatch note, and approve/reject decision.
- The `Boo Boo` owner account must be mapped by stable `profile_id` or admin row, not display name.
- First admin queue order for owner-only testing: payment review, fulfilment, reconciliation, intake, payout.
