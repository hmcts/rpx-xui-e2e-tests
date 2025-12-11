# Port case-flag creation/update journeys into standalone repo

This ExecPlan is a living document. Maintain it in line with `.agent/PLANS.md` and apply Secure-by-Design guidance from `.agent/SECURE.md`.

## Purpose / Big Picture

Enable full case-flags coverage in `rpx-xui-e2e-tests` by adding create/update/regression flows (beyond the existing view-only smoke). After implementation, testers can run a tagged suite that seeds or locates a case with flags, adds new flags, updates statuses, and asserts parity between UI and API responses without relying on the legacy webapp suites.

## Progress

- [x] (2025-12-10 19:30Z) Drafted plan and scope for case-flag creation/update migration.
- [x] (2025-12-10 19:46Z) Added env placeholders to `.env.example` for case ID, user, flag text/type/status.
- [x] (2025-12-10 19:46Z) Implemented helper (`tests/helpers/case-flags.ts`) and initial regression spec `tests/regression/case-flags-create.spec.ts` with env/data guards.
- [ ] Inventory legacy helpers/steps for flag creation/update and map required selectors to POM/component approach (beyond best-effort wizard entry).
- [ ] Add helpers for flag table assertions and API parity (reuse TableUtils where possible).
- [ ] Run targeted suite (`yarn test:regression --grep @case-flags`) and capture evidence; harden against flaky data.
- [x] (2025-12-10 19:46Z) Updated migration tracker and porting plan with current status.

## Surprises & Discoveries

- (populate as work proceeds)

## Decision Log

- (populate as decisions are made)

## Outcomes & Retrospective

- (fill at milestones/completion)

## Context and Orientation

Target repo: `rpx-xui-e2e-tests`. Current coverage: `tests/smoke/case-flags.spec.ts` checks banner/table parity for an existing flagged case (`CASE_FLAGS_CASE_ID`, user `USER_WITH_FLAGS`). Legacy source: `rpx-xui-webapp/playwright_tests/E2E/tests/case-flags.test.ts` and `createFlag-scenario.test.ts` include create/update flows with hard-coded credentials and data. Existing helpers: `@hmcts/playwright-common` TableUtils, header/navigation components, login fixtures (`fixtures/auth.fixtures.ts`). Config/env: `.env.example` already includes `CASE_FLAGS_ENABLED` and `CASE_FLAGS_CASE_ID` placeholders.

Goal: add regression-grade specs that (1) create a flag for a specified party, (2) update or deactivate an existing flag, and (3) verify UI vs API consistency (banner count, table contents). Must remain data-safe: skip when `CASE_FLAGS_ENABLED=false` or required env/data missing.

## Plan of Work

Describe key edits in repository-relative paths:

1. Extend `.env.example` with optional data hints for creation (e.g., `CASE_FLAGS_CREATE_CASE_ID`, `CASE_FLAGS_PARTY_LABEL`, `CASE_FLAGS_FLAG_TEXT`, `CASE_FLAGS_FLAG_STATUS`).
2. Add helper(s) under `tests/helpers/case-flags.ts` to:
   - Navigate to a case, open Case flags tab, and optionally target a specific party table.
   - Create a flag by driving the wizard (label, description, status, date inputs).
   - Update a flag’s status or end date.
   - Map banner count and table rows using TableUtils for assertions.
3. Create `tests/regression/case-flags-create.spec.ts` (tags `@regression @case-flags`) that:
   - Logs in as `USER_WITH_FLAGS` (or configurable user).
   - Navigates to `CASE_FLAGS_CREATE_CASE_ID` (falls back to view case if not provided).
   - Creates a new flag with env-provided text/status and asserts banner/table increments.
   - Optionally updates an existing flag’s status and asserts table reflects change.
   - Uses `test.skip` guards tied to `CASE_FLAGS_ENABLED` and missing env values.
4. Add minimal API parity checks by capturing the flags endpoint response if available (e.g., `/internal/cases/<id>` flag data) and comparing counts/labels.
5. Update docs: `docs/migration.md` to mark creation/update as ported; `porting-paln.md` follow-up backlog; include any new env keys.

## Concrete Steps

Run from `rpx-xui-e2e-tests`:
1. Edit `.env.example` to add optional case-flag creation variables.
2. Implement `tests/helpers/case-flags.ts` with navigation, creation, update, and parsing helpers.
3. Add `tests/regression/case-flags-create.spec.ts` with guarded tests and clear skip reasons.
4. Run `yarn test:regression --grep @case-flags --project=chromium` (set `CASE_FLAGS_ENABLED=true` and populate case/user values).
5. Record outcomes in this plan’s Progress/Surprises sections; update migration docs and porting plan.

Expected outputs: regression spec passes or skips with explicit messages when data unavailable; banner/table counts align after creation/update; no secrets logged.

## Validation and Acceptance

Acceptance: With valid env data and `CASE_FLAGS_ENABLED=true`, running `yarn test:regression --grep @case-flags --project=chromium` succeeds, showing a new flag in the Case flags tab, banner count increments, and table row reflects provided label/status. When required env/data are missing, tests skip with informative reasons instead of failing.

## Idempotence and Recovery

Creating flags alters case state; prefer using a dedicated test case ID and configurable flag text to avoid collisions. Reuse the same case cautiously; if collisions occur, update env values to target a fresh case or delete previous flags via UI before rerun. Skips protect unavailable environments. No destructive actions beyond creating/updating flags.

## Artifacts and Notes

- Capture short logs of banner/table counts before/after creation.
- Note any API response shapes used for parity checks.
- Keep evidence redacted (no credentials/PII).

## Interfaces and Dependencies

- Playwright fixtures from `fixtures/test.ts` and login via `loginAs`.
- `@hmcts/playwright-common` TableUtils for parsing flag tables; existing components for navigation.
- Env vars: `CASE_FLAGS_ENABLED`, `CASE_FLAGS_CASE_ID` (view), new creation-specific keys (to be added), `USER_WITH_FLAGS` creds must exist. Ensure APP_BASE_URL points to target environment with case flags feature enabled.
