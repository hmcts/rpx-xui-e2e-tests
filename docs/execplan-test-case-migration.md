# Port legacy “test-case” regression into standalone repo

This ExecPlan is a living document. Maintain it per `.agent/PLANS.md` and apply Secure-by-Design practices from `.agent/SECURE.md`.

## Purpose / Big Picture

Rebuild the legacy `playwright_tests/E2E/tests/test-case.test.ts` flows in `rpx-xui-e2e-tests` so we can validate case list/detail behaviour without relying on the webapp copy. After implementation a tester can run a tagged regression spec that: locates or creates a PoC case, verifies next-step options and tabs against the case API response, checks workbasket inputs versus API data, and exercises form validation errors.

## Progress

- [x] (2025-12-10 19:08Z) Drafted ExecPlan and captured scope/security constraints.
- [x] (2025-12-10 19:14Z) Scaffolded regression spec with env-driven skips and shared fixtures.
- [x] (2025-12-10 19:14Z) Added helpers to capture case/tabs/workbasket API payloads and map them to UI checks.
- [x] (2025-12-10 19:14Z) Ported next-steps, tabs, workbasket metadata, and form-validation coverage (event submit optional via env).
- [x] (2025-12-10 19:14Z) Documented new env toggles in `.env.example` and migration tracker.
- [ ] Run `yarn test:regression --grep @caselist` (or similar tag) and capture results.
- [x] (2025-12-10 19:14Z) Updated porting plan entry for test-case migration.

## Surprises & Discoveries

- (populate as work proceeds)

## Decision Log

- Decision: Made “submit event” step optional via `TEST_CASE_EVENT_OPTION` to avoid brittle form flows in environments without consistent event data; default is presence-only comparison.  
  Rationale: Legacy hard-coded event value is environment-sensitive; optional flag keeps suite stable while allowing opt-in parity.  
  Date/Author: 2025-12-10 / Codex

## Outcomes & Retrospective

- (populate at milestones/completion)

## Context and Orientation

Target repo: `rpx-xui-e2e-tests`. Legacy source: `rpx-xui-webapp/playwright_tests/E2E/tests/test-case.test.ts`. We already have:
- Page fixtures: `page-objects/pages/page.fixtures.ts` exposing `caseListPage`, `caseDetailsPage`, `createCasePage`, `idamPage`.
- Utilities: `utils/utils.fixtures.ts` (TableUtils, ValidatorUtils, AxeUtils, WaitUtils, UserUtils), login helper `fixtures/auth.fixtures.ts` with `loginAs`.
- Existing create-case regression (`tests/regression/create-case.spec.ts`) uses `createCasePage.createDivorceCase` and `CaseListPage` helpers.
- Config/env: `.env.example` defines user credentials and feature toggles; no dedicated toggles yet for this suite.

Legacy behaviours to port:
1. Next steps dropdown matches triggers returned by `data/internal/cases/<caseRef>` response.
2. Submitting an event via next-step dropdown works on PoC case.
3. Tabs visible and tab contents match API response.
4. Workbasket inputs (including complex values) match `data/internal/case-types/xuiTestCaseType_dev/` response.
5. Form validation surfaces expected errors when invalid data is entered during create-case flow.

Security/operational constraints: do not hardcode secrets; gate tests behind env toggles to avoid hitting unavailable data; keep API responses sanitised and avoid logging PII. Reuse existing login fixtures; ensure selectors use accessible roles where possible.

## Plan of Work

1. Add env-driven config for this suite (e.g., jurisdiction, case type, state) with safe defaults and ability to skip when unset. Update `.env.example`.
2. Create `tests/regression/test-case.spec.ts` tagged `@regression @caselist` with a shared `beforeEach` that logs in as `SOLICITOR` (or configurable). Include helpers inside the spec for:
   - Fetching the first case reference from the case list; if none, create a PoC case via `createCasePage.createDivorceCase`.
   - Waiting for specific API responses (`page.waitForResponse`) and parsing JSON for triggers/tabs/workbasket.
   - Comparing UI dropdown/tab labels against API payloads; use `TableUtils` for tab tables where possible.
   - Submitting a next-step event and asserting for success/summary heading.
   - Entering invalid data in the create-case wizard and asserting error banners/messages.
3. Add any small helpers to `tests/helpers` if reuse is warranted; otherwise keep scoped inside the spec for clarity.
4. Document new toggles/assumptions in `docs/migration.md` and `.env.example` (e.g., `TEST_CASE_JURISDICTION`, `TEST_CASE_TYPE`, `TEST_CASE_STATE`, `TEST_CASE_WORKBASKET_CASE_TYPE`).
5. Run the tagged regression subset and record results; skip gracefully if required env/data absent.
6. Update `porting-paln.md` and migration tracker to mark this suite as ported and note any remaining gaps (e.g., reliance on seed data).

## Concrete Steps

Run commands from `rpx-xui-e2e-tests`:
1. Edit `.env.example` to add optional test-case settings.
2. Create `tests/regression/test-case.spec.ts` with the flows above.
3. If needed, add helper modules under `tests/helpers/`.
4. Run `yarn lint` and `yarn test:regression --grep @caselist` (or the specific test file) to verify.
5. Capture notable output for `Surprises & Discoveries`.

Expected outputs:
- Lint passes or points to any missing imports.
- Regression spec either passes or skips with clear messages if env/data missing.

## Validation and Acceptance

Acceptance: Running `yarn test:regression --grep @caselist` succeeds (passes or intentional skips) using provided env values. UI checks confirm next-step dropdown options and tabs mirror the API response, workbasket inputs align with metadata, and invalid form data yields the expected error banner/messages.

## Idempotence and Recovery

Tests create a PoC case only when none exist in the filtered list; repeat runs should still pass because the helper reuses the first available case. Skips protect environments lacking the required case types. No persistent state changes beyond test case creation; rerun is safe. If data is unavailable, set env vars to valid case types/states or mark suite skipped.

## Artifacts and Notes

Add short evidence snippets (API payload shapes, key assertion outputs) to `Surprises & Discoveries` as they emerge. Keep logs redacted (no credentials or personal data).

## Interfaces and Dependencies

- Uses Playwright test runner already configured in `fixtures/test.ts`.
- Relies on `@hmcts/playwright-common` components: `ExuiCaseListComponent`, `ExuiCaseDetailsComponent`, `TableUtils`.
- New env vars (optional): `TEST_CASE_JURISDICTION`, `TEST_CASE_TYPE`, `TEST_CASE_STATE`, `TEST_CASE_WORKBASKET_CASE_TYPE`. Defaults can be `Family Divorce` and `XUI Case PoC` to mirror legacy, but must be overridable.
- Requires SOLICITOR credentials (`SOLICITOR_USERNAME`/`SOLICITOR_PASSWORD`) and access to Manage Case base URL from `.env`.
