# RALPLAN: Admin Production Click Test Cases

Status: Final consensus-approved
Mode: RALPLAN-DR deliberate mode
Created: 2026-05-15
Context snapshot: `.omx/context/admin-production-click-test-cases-20260515T074550Z.md`
Canonical test suite: `Website/docs/qa/admin-production-click-test-cases.md`

## Outcome

Create a production real-click admin test suite that an operator can execute page by page against `https://www.ynottcg.com/admin`. The suite covers every current admin page, visible button/control, required form field, primary success path, disabled/negative path, owner-only path, and cleanup expectation.

This is documentation and planning only. It does not execute production mutations.

## Evidence Baseline

- Admin route pages are under `Website/src/app/admin/*`.
- Shared admin shell, navigation, dashboard cards, and `AdminGate` live in `Website/src/features/ynot/components.tsx`.
- Interactive admin forms and mutation buttons live in `Website/src/features/ynot/client.tsx`.
- Reveal-video upload form lives in `Website/src/app/admin/tier-animations/AdminTierAnimationForm.tsx`.
- Production safety sequencing is documented in `Website/docs/runbooks/production-admin-test-data.md`.
- `.omx/` is excluded from git in this checkout, so pushable artifacts are kept in `Website/docs/`.

## Decision Record

### Decision

Use a manual production-click test suite with explicit safety lanes:

- **RO**: read-only navigation, visibility, disabled-state, and audit checks.
- **TD**: reversible test-data actions that must use `[E2E]` names and a run manifest.
- **OG**: owner-gated or destructive actions that require explicit owner authorization at execution time.
- **FIN**: financial or customer-order actions that may only operate on real pending test records. Fake slips must not be approved.

### Rationale

The admin surface manages money, inventory, user roles, campaign publish state, and customer fulfillment. A click-by-click manual suite is safer than directly automating production mutations first. It gives the operator an exact route through the UI, names which fields to fill, and defines evidence to collect before any production action is considered passed.

### Rejected Alternatives

- **Automated production mutation first**: rejected because top-up approvals, owner role changes, publishing, inventory edits, and shipping updates can mutate real customer state.
- **Only high-level smoke checklist**: rejected because the user asked for every button/sub-button and field progression.
- **Direct DB test instead of UI clicks**: rejected because the target result is a real production click journey through the admin UI.

### Constraints

- Do not approve fake payment slips in production.
- Do not run destructive cleanup or owner role changes without owner authorization.
- Do not apply production Supabase migrations as part of this task.
- Test data must be clearly labeled with a run id and cleaned up by the approved runbook.

### Confidence

High for current UI coverage based on route and component inspection. Medium for production execution completeness because some buttons only appear when production has matching pending records.

## Planner Pass

The test suite is organized by admin page in the same order as the left navigation:

1. Access, role, and navigation baseline.
2. Dashboard quick actions and status cards.
3. Random Packs draft builder, prize/category selection, owner review, lifecycle actions.
4. Categories create/update/filter/status paths.
5. Prizes, prize pool, image-backed card selection, and stock adjustments.
6. Users, admin roles, and merge requests.
7. Top-ups, Exchange, Shipping, Settings, Reveal Videos.
8. Read-only Rankings, Audit, Health.
9. Cross-page negative, permission, stale-data, and cleanup scenarios.

Each case includes route, actor, click steps, data to fill, acceptance criteria, and safety lane.

## Architect Review

The suite separates state-changing actions from read-only checks and uses production run identifiers. That keeps the real-click requirement without treating production as a disposable test database.

Key architecture guardrails:

- Owner-only actions are tested as owner permission and disabled-state checks first.
- Publishing and delete/archive flows are documented but gated as OG.
- Top-up, exchange, and shipping actions require pre-existing test-owned records.
- Campaign builder tests exercise UI field progression before publish.
- Cleanup is a test artifact requirement, not an optional afterthought.

## Critic Review

Main risks:

- Production data may not contain all pending states, so tests with pending top-ups, exchanges, shipping, merge requests, or reveal-video assets can be skipped only with evidence.
- Some labels can drift with UI copy changes; operators should use visible control purpose plus page context, not only exact text.
- A successful click is not enough. Acceptance criteria require toast/page refresh, DB-visible result where safe, audit event where applicable, or a blocked/disabled reason.

Verdict: APPROVE with the requirement that execution uses a manifest and captures screenshots or notes for every skipped case.

## Test Execution Protocol

Before executing in production:

1. Confirm the operator has the intended role: owner, admin/staff, or non-admin.
2. Create a run id such as `E2E-20260515-admin-prod-01`.
3. Record browser, account, timestamp, and starting route in a run manifest.
4. Run RO cases first.
5. Run TD cases only with `[E2E]` names and test-only toggles where available.
6. Run FIN cases only against real pending test records created for this run.
7. Run OG cases only after explicit owner approval.
8. Clean up or hide test artifacts using `Website/docs/runbooks/production-admin-test-data.md`.

## Acceptance Standard

A test case passes only when:

- the click path matches the documented route and controls;
- required fields were filled with the listed run-data pattern;
- success, disabled, validation, or permission behavior matches acceptance criteria;
- production evidence is captured in the run manifest;
- no unrelated production customer/admin data is changed.

## Available-Agent Roster

- `explore`: repo mapping and current admin-control lookup.
- `planner`: test sequencing and manifest design.
- `architect`: production safety, role boundary, and state-transition review.
- `critic`: coverage challenge and failure-mode review.
- `executor`: future implementation if these tests become Playwright or runbook scripts.
- `verifier`: execution evidence review after manual production run.

## Staffing Guidance

For `$ralph`: assign one owner to turn this manual suite into a checked-off execution report. Stop after each FIN/OG branch and require evidence before continuing.

For `$team`: split lanes by page group:

- Lane 1: access, nav, dashboard, read-only pages.
- Lane 2: categories, prizes, catalog stock.
- Lane 3: random packs and owner review.
- Lane 4: money/order flows: top-ups, exchange, shipping.
- Lane 5: settings, reveal videos, users, audit evidence.

## Launch Hints

- Production URL: `https://www.ynottcg.com`.
- Admin root: `https://www.ynottcg.com/admin`.
- Keep browser devtools console open during execution and record uncaught errors.
- Capture screenshots for every failed, skipped, or destructive-gated case.
- Use only production test records with `[E2E]` or run-id labels.

## Verification Path

Documentation-level verification for this planning task:

- `git diff --check`
- confirm both plan and test-suite files are tracked in `Website/docs/`
- commit with Lore protocol
- push `main`

Execution-level verification for a later production test run:

- completed run manifest
- screenshots or notes for every case
- audit log entries for mutation cases
- cleanup evidence for all `[E2E]` records
