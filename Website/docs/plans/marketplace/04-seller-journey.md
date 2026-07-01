# Marketplace Seller Journey - Architecture Plan

Status: MVP decision lock draft.
Updated: 2026-06-26

## Goal

Let a user become a seller without creating a second account, submit physical cards/items for YNOTT middleman consignment, and see clear Marketplace Fee plus Seller Payout expectations.

Gacha rewards from Customer Bag cannot be listed in marketplace. Existing Reward Conversion may still use wording like "sell for coins" in the product today, but that is not a Marketplace Listing.

## Document Role

This document owns the user-seller consignment journey: seller onboarding, draft submission, intake, inspection, listing activation, sold-item history, and payout visibility. It must keep mandatory physical-item inspection separate from optional risk-based listing activation review.

## MVP Seller Decision Locks

- MVP seller item types are cards, sealed boxes, and sealed packs. Later expansions may include other physical products such as shoes or clothes.
- Seller can create a draft before sending the card to YNOTT.
- Public listing can go live only after YNOTT receives and approves the physical card.
- Seller ships/sends the card to YNOTT store first. Seller-direct shipping to buyer is not part of MVP.
- Required submission fields: card/item reference, variant, condition, asking price, photos, and seller notes; grade, language, and cert are required when relevant.
- User-seller listings do not need a separate listing-review queue after every successful intake inspection. Intake, receipt, and inspection are mandatory; extra listing activation review can be risk-based.
- Seller-side marketplace fee defaults to 10 percent and is admin-configurable from the marketplace dashboard.
- Buyer-side service fee is separate from seller payout math.
- Seller payout excludes buyer shipping fee and buyer-side service fee.
- Seller payout setup is required before money release, not before item submission.
- Owner releases seller payout for MVP.

## Current Runtime Gate

Current runtime implements this as an owner-only MVP seller slice:

- `/marketplace` and `/marketplace/seller` are owner-only during prelaunch.
- Seller terms, seller session, submission draft creation, submit/cancel, photo metadata attachment, handoff confirmation, and admin intake transitions are implemented through server-only Marketplace routes and RPCs.
- Admin listing activation for inspected consignment items is implemented behind the listing-activation feature flag.
- Seller payout preview, seller sales, payout release, and paid markers are implemented behind owner/admin routes and payout release controls.
- Current Customer Bag copy such as `Sell only` or `Sell for coins` means Reward Conversion to wallet coins, not marketplace selling.

Do not expose seller entry points to normal customers until owner-only verification passes for seller submission, intake, inspection, listing activation, buyer checkout, fulfilment, refund, and payout release.

## Seller Entry Points

- Implemented now: owner-only marketplace shell, seller dashboard, physical-item submission, submission status, seller payout/sales reads, and Customer Bag `Marketplace` section.
- Planned for public launch polish: dedicated My Listings, My Seller Submissions, and My Payouts pages if the owner-only dashboard becomes too dense.

Do not add a Customer Bag reward `sell in marketplace` action for MVP.

## Seller Architecture Seam

The Seller Journey Module should be deep enough that UI callers send seller intents, not role checks, payout math, inspection rules, or inventory writes.

Interface:

- `startSellerSession`
- `acceptSellerTerms`
- `submitConsignmentDraft`
- `requestConsignmentIntake`
- `refreshSellerStatus`
- `previewSellerPayout`
- `cancelSellerSubmission`

Implementation:

- Marketplace Account Bridge verifies the current YNOTT profile and seller status.
- Consignment Intake Adapter owns intake instruction, received, inspection, approval, reject, return, and cancellation transitions.
- Reference Adapter validates card/variant metadata for snapshots.
- Marketplace Money Module calculates fee and payout preview.
- Admin Workflow Module applies admin-only transitions and audit events.

Seam:

```text
Seller route/page
  -> Marketplace Account Bridge
  -> Seller Journey Module
  -> Consignment Intake Adapter
  -> Marketplace Inventory Module
  -> Listing Draft Module
```

Depth target: one YNOTT profile can be buyer and seller, but seller capability, intake state, payout readiness, and listing activation stay local to marketplace Modules.

Leverage: buyer, seller, and admin flows reuse the same Marketplace Account Bridge.

Locality: all state and payout validation lives behind marketplace Interfaces, not in seller dashboard UI.

## Seller Frontend Design Direction

The seller surface should feel like a guided consignment workspace, not a free-form listing builder.

- Purpose: help a user submit a physical item, understand the YNOTT middleman process, and track status/payout.
- Audience: customers who may be new sellers and need confidence about what happens after submission.
- Tone: clear, procedural, trustworthy, and low-drama.
- Memorable detail: a persistent consignment timeline that shows `Submit -> Intake instruction -> Received -> Inspection -> Listed -> Sold -> Payout`.
- Constraints: no marketplace sell button on gacha rewards, mobile-friendly forms, private photo upload, no dense admin terminology in seller UI.

Seller UI principles:

- Show `Submit to marketplace` as a consignment action, not `Sell reward`.
- Make `YNOTT must receive and inspect the item before listing` visible near the submission action and in the status timeline.
- Separate seller onboarding, active submissions, active listings, sold items, and payout history into clear dashboard sections.
- Keep payout preview close to price entry, but label it as an estimate until checkout/order snapshot freezes.
- Use status chips and timeline labels with text, not color-only indicators.
- Do not expose admin private notes, internal inspection policy, payment provider state, or buyer details on seller pages.

## Seller Dashboard UX Contract

Seller dashboard first viewport should prioritize operational status:

- Seller status strip: terms state, submission eligibility, payout readiness.
- Primary action: `Submit item`.
- Work summary: drafts, submitted items, items awaiting YNOTT, active listings, sold items, payout attention.
- Alert area: blocked/restricted/payout-hold messages with exact next action.

Dashboard sections:

| Section | Purpose | UX rule |
| --- | --- | --- |
| `Drafts` | Continue unfinished submissions. | Show missing required fields and last edited time. |
| `Submitted` | Track items before listing. | Show timeline state and required seller/admin next step. |
| `Active listings` | Monitor listed items. | Show price, source, listing status, and buyer pending-payment/sold state. |
| `Sold items` | Track post-sale fulfilment and payout. | Show order milestone and payout state separately. |
| `Payouts` | Understand held/eligible/paid payout. | Exclude shipping from payout lines and show evidence requirements. |

Mobile rules:

- Seller dashboard cards should not nest inside other cards.
- Use compact status rows and a single primary action per section.
- Long item names, cert numbers, and notes must wrap without pushing action buttons off-screen.

## Seller API Contract

Seller routes may be mounted under the Website worker for user-facing URLs, but mutating seller commands should call the Marketplace Worker/backend modules through the internal service boundary. They should not expose direct Supabase table writes to the browser.

| Route | Method | Owner | Purpose |
| --- | --- | --- | --- |
| `/api/marketplace/seller/session` | `GET` | Marketplace Account Bridge | Return seller account status, terms state, payout readiness, and dashboard counters. |
| `/api/marketplace/seller/terms` | `POST` | Seller Journey Module | Accept current seller terms version for the current Marketplace Account. |
| `/api/marketplace/seller/submissions` | `GET` | Seller Submission Module | Return seller-owned submissions by cursor and status. |
| `/api/marketplace/seller/submissions` | `POST` | Seller Submission Module | Create a draft or submitted consignment item. |
| `/api/marketplace/seller/submissions/:submissionId` | `GET` | Seller Submission Module | Return one seller-owned submission detail. |
| `/api/marketplace/seller/submissions/:submissionId` | `PATCH` | Seller Submission Module | Edit a draft before intake submission. |
| `/api/marketplace/seller/submissions/:submissionId/submit` | `POST` | Seller Submission Module | Submit a draft for intake review. |
| `/api/marketplace/seller/submissions/:submissionId/cancel` | `POST` | Seller Submission Module | Cancel before the state becomes admin-owned or sold. |
| `/api/marketplace/seller/submissions/:submissionId/handoff` | `POST` | Consignment Intake Module | Seller confirms shipped/bring-in after admin instruction. |
| `/api/marketplace/seller/submissions/:submissionId/photos` | `POST` | Seller Submission Module | Create a signed upload intent or attach uploaded photo metadata. |
| `/api/marketplace/seller/payout-preview` | `POST` | Marketplace Money Module | Return fee and payout preview for a proposed asking price. |

Route rules:

- Every seller mutation requires resolved YNOTT profile, Marketplace Account, same-origin validation, per-profile rate limiting, and an idempotency key.
- Seller routes must derive `seller_marketplace_account_id` on the server. Request bodies must reject caller-supplied seller, buyer, admin, payout, or workflow owner IDs.
- Seller route bodies must be allowlisted by action. Unknown fields should fail closed so payout or inventory fields cannot be smuggled into a draft.
- Seller submission requests must reject Customer Bag reward IDs, gacha reward IDs, reward conversion IDs, wallet transaction IDs, and collection item IDs.
- Seller reads return seller-visible state only. They must not expose admin private notes, buyer identity, payment provider metadata, or payout release internals.
- Admin transitions are not accepted on seller routes, even if the caller is also an admin. Admin workflow routes own admin commands.

## Seller Database Contract

Seller-side tables are marketplace-owned and reference YNOTT profile/account IDs by snapshot or stable external ID. They should not foreign-key across separate Supabase projects.

Recommended tables:

| Table | Purpose |
| --- | --- |
| `marketplace_seller_terms_acceptances` | Records seller terms version accepted by a Marketplace Account. |
| `marketplace_seller_submissions` | Seller-created consignment item draft and lifecycle state. |
| `marketplace_seller_submission_photos` | Private upload metadata and approved public derivatives. |
| `marketplace_seller_submission_events` | Append-only seller/admin state transition audit trail. |
| `marketplace_seller_handoff_confirmations` | Seller shipping or bring-in confirmation snapshots. |
| `marketplace_seller_payout_profile_refs` | Tokenized payout provider reference and readiness status, if MVP requires payout setup before release. |

`marketplace_seller_submissions` core fields:

- `id uuid primary key`
- `marketplace_account_id uuid not null`
- `ynot_profile_id uuid not null`
- `submission_number text unique not null`
- `status text not null`
- `category text not null`
- `reference_source text null`
- `reference_card_id text null`
- `reference_variant_id text null`
- `title_snapshot text not null`
- `condition_code text not null`
- `condition_notes text null`
- `variant_snapshot jsonb not null default '{}'::jsonb`
- `grade_label text null`
- `language text null`
- `cert_number text null`
- `asking_price_satang integer not null check (asking_price_satang > 0)`
- `currency text not null check (currency = 'THB')`
- `seller_marketplace_fee_bps integer not null check (seller_marketplace_fee_bps between 0 and 10000)`
- `payout_preview_satang integer not null check (payout_preview_satang >= 0)`
- `source_kind text not null check (source_kind = 'seller_physical_intake')`
- `intake_instruction_id uuid null`
- `approved_inventory_id uuid null`
- `listing_id uuid null`
- `seller_note text null`
- `admin_visible_note text null`
- `version bigint not null default 1`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Important constraints:

- `source_kind` for user seller submissions is always `seller_physical_intake`.
- `approved_inventory_id` can be set only after admin inspection approval.
- `listing_id` can be set only after Marketplace Inventory exists and listing activation guards pass.
- Use a state check constraint for known submission states.
- Use optimistic concurrency with `version` on seller edits and admin transitions.

Indexes:

- `(marketplace_account_id, status, created_at desc)` for seller dashboard.
- `(submission_number)` unique for support/admin lookup.
- `(status, updated_at desc)` for admin intake queues.
- `(approved_inventory_id)` and `(listing_id)` partial indexes where not null.

## Seller RPC Contract

Seller mutations should be narrow RPCs or service-layer transactions; either way, each command has one owner and one transaction boundary.

| RPC / Command | Owner | Responsibility |
| --- | --- | --- |
| `marketplace_accept_seller_terms` | Marketplace Account Bridge | Record terms version and move seller status toward active when requirements pass. |
| `marketplace_create_seller_submission` | Seller Submission Module | Create draft/submitted consignment row, fee preview snapshot, and audit event. |
| `marketplace_update_seller_submission_draft` | Seller Submission Module | Edit draft fields with version check and required-field validation. |
| `marketplace_submit_seller_submission` | Seller Submission Module | Move draft to `submitted` after validating fields, photos, terms, and seller status. |
| `marketplace_cancel_seller_submission` | Seller Submission Module | Cancel only seller-cancellable states and write event. |
| `marketplace_seller_confirm_intake_handoff` | Consignment Intake Module | Record seller shipped/bring-in confirmation after admin instruction exists. |
| `marketplace_quote_seller_payout_preview` | Marketplace Money Module | Calculate fee and payout preview from asking price and active fee rule. |

RPC rules:

- Every RPC accepts `p_request_id`, `p_idempotency_key`, `p_ynot_profile_id`, and `p_marketplace_account_id` when it mutates seller state.
- RPCs validate the Marketplace Account owns the submission before any update.
- RPCs validate current status and target status. UI state is never trusted for transition permission.
- RPCs write `marketplace_seller_submission_events` inside the same transaction as status changes.
- Fee preview is copied from the active fee rule into submission/listing snapshots. Do not recalculate old submissions silently when the global fee changes.
- Seller RPCs must not create an active listing. Listing activation stays admin-owned after received/inspection approval.

## Seller Upload And Storage Contract

Seller photos are evidence for intake and should use private storage first.

- Upload route creates a short-lived signed upload intent for the current seller and submission.
- Uploaded object path includes `marketplace_account_id` and `submission_id` so ownership can be checked without trusting the filename.
- Attach route verifies object metadata, file size, extension, MIME type, and magic bytes before storing the photo row.
- Original uploads stay private. Public listing images are generated only after inspection approval and listing activation guards pass.
- Photo rows include `status in ('uploaded', 'seller_attached', 'admin_approved', 'rejected', 'public_derivative_ready')`.
- Seller can delete or replace photos only while submission is `draft`.
- Storage policy should not allow public list/read of original seller uploads.
- Uploads should be quarantined until validation and scan status pass. Public derivatives must strip EXIF/GPS metadata and be generated by trusted backend processing, not by trusting browser-supplied thumbnails.
- Seller notes, condition notes, cert numbers, and free-text descriptions are stored and rendered as plain text. Any future rich text support requires explicit sanitization and a restricted tag/attribute allowlist.
- Signed upload/read URLs must be short-lived, scoped to one account/submission/action, and never logged in full.

## Seller RLS, Grants, And Security Contract

- Seller dashboard, submission, photo upload, payout setup, and seller order APIs are HTTPS-only in production. HTTP requests redirect or fail closed, signed upload/read URLs use HTTPS, and public derivatives must not introduce mixed content.
- Seller state-changing routes require same-origin validation and the current YNOTT CSRF/session-cookie protection pattern.
- Seller RBAC is resolved server-side from the current YNOTT session, Marketplace Account, seller status, and owner/admin review state. Browser-submitted seller ID, role, payout readiness, inspection state, or listing state is ignored or rejected.
- Seller journey does not store marketplace passwords. Existing YNOTT/Supabase Auth owns password hashing, password reset, login throttling, and primary session issuance.
- Seller submission, condition, variant, grade, language, cert, note, payout setup, and photo attach inputs use schema allowlists. Unknown fields, malformed form-data, forbidden gacha/Customer Bag references, and caller-supplied payout/status fields fail closed.
- Seller database access uses Supabase query builders, parameterized RPCs, or prepared statements only. No seller note, cert number, filename, submission ID, or filter input is concatenated into SQL.
- Seller routes follow the YNOTT session timeout policy. Seller terms acceptance, payout setup, submission submit/cancel, photo attach, and payout destination changes reject expired sessions and require fresh session checks when stale.
- Enable RLS on every seller table, including event and photo tables.
- Prefer Website API routes that call the Marketplace backend service for mutations. Do not expose service-role keys or secret payout/provider credentials to browser code.
- Revoke direct mutation grants from `anon` and `authenticated` on seller tables if the browser never writes them directly.
- If any seller read model is exposed through Supabase client access, policies must scope rows to the current Marketplace Account and never use caller-supplied account IDs.
- Server-only RPCs should revoke `execute` from `public`, `anon`, and `authenticated`, then grant only to the Marketplace backend service role.
- Any `security definer` function must set a fixed `search_path`, validate actor IDs inside the function, and remain unavailable to browser roles.
- Terms acceptance, submission create, submit, cancel, handoff, and photo attach routes are rate-limited separately from browse.
- Log seller mutations with `request_id`, `marketplace_account_id`, `submission_id`, and action. Do not log full payout details, full addresses, provider tokens, or private cert images.
- Seller payout setup and payout destination references must stay tokenized/redacted. Seller pages can show payout readiness, not raw bank or provider account fields.

Security architecture and performance impact:

- Seller dashboard reads should use indexed counters and submission/listing projections. They should not load original private images, payout records, or full audit history for every row.
- Photo uploads should write private pending objects first, then process validation, scan/quarantine, EXIF stripping, and public derivative generation asynchronously.
- Draft saves and photo attach routes should be idempotent and bounded by submission/account indexes so retries do not duplicate photos or slow the seller editor.
- Seller payout setup requires stronger session freshness, but normal seller dashboard/listing reads should use current session validation and redacted readiness flags.
- Admin inspection should use generated thumbnails and evidence counters in queue rows; private originals load only on detail to keep queues fast and avoid overexposure.

## Seller Account Flow

```text
Seller opens marketplace seller dashboard
  -> Marketplace Account Bridge
  -> seller terms accepted
  -> seller contact/payout readiness check
  -> seller can submit consignment item
```

Seller and buyer modes are on the same Marketplace Account. Seller status can be `not_started`, `pending_terms`, `active`, `restricted`, or `blocked`.

Seller session failure reasons:

- `login_required`
- `marketplace_account_blocked`
- `seller_terms_required`
- `seller_restricted`
- `payout_profile_missing`

## Consignment Submission Flow

```text
Seller dashboard
  -> submit physical item
  -> choose category/card reference when available
  -> condition and variant form
  -> photos/notes
  -> price entry
  -> fee/payout preview
  -> submit for intake
  -> admin gives intake instruction
  -> seller ships/brings item to YNOTT store
  -> admin receives and inspects
  -> Marketplace Inventory created or approved
  -> listing becomes active after inspection approval and any risk-based activation check
```

This creates a seller submission first, not an active listing. Active listing requires approved Marketplace Inventory.

## Condition And Variant Form

Seller must fill or confirm:

- Condition.
- Card/item category.
- Variant.
- Grade.
- Language.
- Cert number if applicable.
- Notes/photos if needed.
- Asking price.
- Optional minimum acceptable price if product wants negotiation later.

Where possible, prefill from existing gacha stock/card detail.

Prefill means reference lookup only. It does not copy Customer Bag reward ownership into Marketplace Inventory.

### Submission Form UX

The submission form should be progressive, but not mysterious:

1. Item reference: category, card/item lookup, variant.
2. Physical details: condition, grade, language, cert number, notes.
3. Photos: required evidence and optional extra images.
4. Asking price: THB price entry and payout preview.
5. Review: seller confirms the item is physical and must be sent/received by YNOTT.

Field rules:

- Required fields show inline validation before submission.
- Condition and variant controls should use selects/segmented choices where possible, not free text first.
- Card/reference lookup should clearly say it is only metadata lookup, not proof that a gacha reward can be listed.
- Price input accepts THB display but stores satang through the backend.
- Payout preview updates after valid price input and active fee rule response.
- Review step should list what the seller is sending and what YNOTT will inspect.

Photo upload UX:

- Show upload progress per image.
- Show thumbnail grid with fixed aspect ratio.
- Let sellers remove/replace photos only in `draft`.
- Explain private originals vs public listing photos in plain seller-facing copy.
- Image errors should say file too large, unsupported type, upload failed, or review required without exposing storage internals.

## Copy Guard: Conversion Is Not Marketplace Selling

Current YNOTT Customer Bag may use:

- `Sell only`
- `Sell for X coins`
- `Ship or sell`

In marketplace work, these phrases must not be reused for seller listing controls. They mean Reward Conversion to wallet coins inside Customer Bag.

Marketplace seller copy should use terms like:

- `Submit to marketplace`
- `Consign with YNOTT`
- `Create marketplace submission`
- `Marketplace payout estimate`

This protects the seam between Reward Conversion and Marketplace Listing.

## Eligibility Rules

Cannot list an item if it is:

- A Customer Bag reward from pack opening.
- A Reward Conversion target.
- A reward shipping target.
- Not physically received or inspected by YNOTT for MVP user-seller listings.
- Missing required condition, category, card, variant, or photo evidence.
- Blocked by admin policy.
- Submitted by a blocked Marketplace Account.
- Already represented by active Marketplace Inventory or active Marketplace Listing.

Cannot activate a listing until:

- Seller status allows selling.
- Seller accepted terms.
- Admin received the physical item.
- Admin inspection passed or approved with notes.
- Marketplace Inventory exists.
- Listing price and snapshots are frozen.

These are guard rules, not UI hints. Listing Draft Module should reject activation if any guard fails.

## Official Shop Separation

Official shop and seller consignment share Marketplace Inventory only after separate source adapters create inventory.

- Official shop uses Official Shop Ingestion Adapter.
- Seller listings use Consignment Intake Adapter.
- Official shop listings cannot source from Consignment Intake Module.
- Seller consignment cannot source from official stock.
- Neither adapter can source from Customer Bag, Reward Conversion, wallet, or gacha reward records.

## Seller Price And Fee Preview

Seller sees:

- Listing price.
- YNOTT fee percent.
- Estimated fee amount.
- Estimated seller payout.
- Payout timing rule.

Example:

```text
Price: 10,000 THB
YNOTT seller fee: 10 percent = 1,000 THB
Estimated payout: 9,000 THB
```

Shipping charged to buyer is not seller revenue and is excluded from payout.

The fee percent should be configurable in Marketplace Supabase and copied to the listing/order snapshot when checkout starts.

Seller payout preview fields:

- `listing_price_satang`
- `seller_marketplace_fee_bps`
- `seller_marketplace_fee_satang`
- `shipping_charged_to_buyer_satang`
- `buyer_service_fee_satang`
- `seller_payout_satang`
- `currency`
- `calculation_version`

Rules:

- Use integer satang fields for THB.
- Round only inside Marketplace Money Module.
- Shipping charged to buyer and buyer-side service fee must stay out of `seller_payout_satang`.
- Preview is not final payout; final payout freezes on Marketplace Order after checkout/payment.

### Seller Payout Preview UX

The payout preview should be a compact calculation panel:

- `Asking price`
- `YNOTT marketplace fee`
- `Estimated payout`
- `Shipping paid by buyer`: shown as excluded from payout, not added to seller revenue.
- `Final payout freezes after sale`: short explanatory note.

UX rules:

- Do not show buyer shipping fee as seller income.
- Do not call preview `guaranteed payout`.
- Use THB formatting with enough precision for satang-backed values.
- If fee policy is unavailable, disable submit and show `Payout estimate unavailable, try again`.
- If seller payout setup is missing, allow item submission, but show payout setup as required before money release.

## Seller Submission States

First pass:

- `draft`
- `submitted`
- `intake_instruction_sent`
- `in_transit_to_ynott`
- `received`
- `inspection_pending`
- `approved_for_listing`
- `rejected`
- `returned_to_seller`
- `cancelled`

## Seller Submission State Machine

| From | Event | To | Actor | Required evidence |
| --- | --- | --- | --- | --- |
| `draft` | submit | `submitted` | seller | required item fields, photos/notes, asking price |
| `submitted` | intake instruction sent | `intake_instruction_sent` | admin | instruction text, destination, deadline |
| `intake_instruction_sent` | seller confirms shipped/bring-in | `in_transit_to_ynott` | seller | handoff note or tracking if available |
| `in_transit_to_ynott` | item received | `received` | admin | received timestamp, actor, photo optional |
| `received` | inspection starts | `inspection_pending` | admin | assigned inspector |
| `inspection_pending` | inspection passed | `approved_for_listing` | admin | condition, variant, inspection note, audit event |
| `inspection_pending` | inspection failed | `rejected` | admin | rejection reason, return decision |
| `submitted` | seller cancels before intake | `cancelled` | seller | cancellation note optional |
| `intake_instruction_sent` | seller cancels before item sent | `cancelled` | seller | cancellation note optional |
| `received` | return arranged | `returned_to_seller` | admin | return tracking or pickup note |
| `rejected` | return arranged | `returned_to_seller` | admin | return tracking or pickup note |

Invalid transitions:

- Seller cannot move any item to `received`, `inspection_pending`, or `approved_for_listing`.
- Admin cannot approve listing without inspection evidence.
- Seller cannot cancel after item is sold; admin refund/dispute path must handle it.
- Marketplace cannot create active listing from `draft`, `submitted`, or `intake_instruction_sent`.

## Seller Listing States

First pass:

- `draft`
- `pending_review`
- `active`
- `pending_payment`
- `sold`
- `cancelled`
- `hidden`
- `rejected`

## Seller Payout States

First pass:

- `not_ready`
- `pending_sale`
- `held`
- `approved`
- `paid`
- `cancelled`
- `disputed`

Seller payout is held until the order and admin workflow reach the required release milestone.

## Listing Activation Guards

Listing Draft Module may activate a user-seller listing only when:

- Source is approved Marketplace Inventory.
- Source adapter is Consignment Intake Adapter.
- Seller Marketplace Account is `active`.
- Submission state is `approved_for_listing`.
- Inspection result is attached.
- Public listing snapshot is frozen.
- `listing_price_satang` is valid and non-zero.
- Marketplace Fee preview exists.
- Inspection approval event exists, plus risk-based listing activation approval when required.

Failure reasons:

- `seller_not_active`
- `terms_required`
- `inventory_not_approved`
- `inspection_missing`
- `price_invalid`
- `snapshot_missing`
- `source_adapter_invalid`

## Required Modules

### Seller Submission Module

Interface:

- Start draft.
- Validate required item details.
- Submit for intake.
- Track seller-visible status.

Implementation:

- Stores seller submission details and images.
- Creates no active listing until inspection approval and listing activation guards pass.
- Emits seller-visible status changes.

### Consignment Intake Module

Interface:

- Issue intake instruction.
- Mark received.
- Record inspection result.
- Approve Marketplace Inventory.

Implementation:

- Admin-only state transitions.
- Audit event for every step.
- Can create or update Marketplace Inventory after inspection.
- Rejects Customer Bag, Reward Conversion, wallet, and gacha reward sources.

### Listing Draft Module

Interface:

- Convert approved Marketplace Inventory to draft/active listing.
- Freeze public snapshots.
- Enforce price and fee preview.

Implementation:

- Uses marketplace-local inventory and listing tables.
- Uses card/variant Reference Adapter only for snapshot validation.

### Seller Payout Preview Module

Interface:

- Calculate seller preview from asking price and fee rule.
- Return fee, payout, currency, and calculation version.
- Explain payout timing rule.

Implementation:

- Delegates money math to Marketplace Money Module.
- Does not include buyer shipping charge in seller payout.
- Does not create payout liability until Marketplace Order is paid.

## Seller Backend Error Contract

Seller APIs return stable codes and avoid exposing internal admin/payment details.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `marketplace_login_required` | `401` | Seller action needs a resolved YNOTT profile. |
| `marketplace_account_blocked` | `403` | Marketplace account cannot sell. |
| `marketplace_seller_terms_required` | `403` | Current seller terms version is not accepted. |
| `marketplace_seller_restricted` | `403` | Seller status blocks new submissions or edits. |
| `marketplace_payout_profile_missing` | `409` | Payout setup is required for this action or payout release. |
| `marketplace_submission_not_found` | `404` | Submission does not exist or is not owned by the caller. |
| `marketplace_submission_state_invalid` | `409` | Current submission state does not allow the requested transition. |
| `marketplace_submission_version_conflict` | `409` | Client edited an old version of the draft. |
| `marketplace_required_fields_missing` | `422` | Condition, category, variant, price, or photo evidence is incomplete. |
| `marketplace_invalid_inventory_source` | `422` | Request attempted to source from Customer Bag, gacha, wallet, or reward conversion data. |
| `marketplace_price_invalid` | `422` | Asking price is outside configured marketplace bounds. |
| `marketplace_upload_invalid` | `422` | Photo upload failed type, size, ownership, or scan validation. |
| `marketplace_idempotency_conflict` | `409` | Same idempotency key was reused with a different request hash. |
| `marketplace_rate_limited` | `429` | Seller mutation exceeded allowed retry rate. |

Every error response should include `request_id`, `code`, and a seller-safe `message`. Optional fields may include `current_status`, `current_version`, and `missing_fields`.

## Seller Query Performance Contract

- Seller dashboard lists use cursor pagination by `(created_at, id)` or `(updated_at, id)`.
- Seller counters should come from a compact dashboard projection or grouped query, not one query per status card.
- Submission detail should load photos and events in bounded pages; do not return full audit history by default after the item is sold or disputed.
- Admin intake queues reuse the same status indexes but must query through admin-specific APIs, not seller dashboard routes.
- Payout preview is cheap and deterministic; cache only the active fee rule, not seller-specific preview responses.
- Seller reads must not join to payment provider event tables, buyer address snapshots, or bank/payout provider secrets.
- Photo derivative generation can run asynchronously after inspection approval and listing activation guards pass; seller submission creation should not wait for public image processing.
- Add a scheduled cleanup for abandoned drafts and unattached uploads, but preserve submitted/intake evidence.

## What Is Not MVP

- Listing directly from Customer Bag.
- Gacha reward resale.
- Seller-direct shipping to buyer.
- Automatic payout before owner release.
- Live offers or buyer-seller chat.
- Seller editing condition after active listing without admin review.
- Seller-managed stock quantities for user listings.

## Accepted Deep Design Decisions

- Seller photo requirements: front, back, close-up flaw/corner photo, and optional cert photo.
- Seller cannot directly edit condition after a listing goes active. Seller must request an admin change.
- Physical item receipt by YNOTT is the MVP proof of ownership. Seller photo proof before shipping is optional.
- Extra listing activation review is triggered by high value, suspicious photos, condition mismatch, repeat seller issues, or manual admin flag.
