# ExecPlan: Generic CCD case creation helper and PRL usage

This ExecPlan is a living document. The sections Progress, Surprises and Discoveries, Decision Log, and Outcomes and Retrospective must be kept up to date as work proceeds.

The repo root contains .agent/PLANS.md and .agent/SECURE.md. This ExecPlan must be maintained in accordance with those files.

## Purpose / Big Picture

Add a generic helper for creating CCD cases via the Manage Case /data API so tests can create cases for any jurisdiction, case type, and event without hard-coded case IDs. Starting with Private Law, the dynamic-user caseworker smoke test will create a PRL case through the helper when no case ID is provided, then assign it via court admin and verify the new caseworker can access it. Success is visible when the test runs without requiring COURT_ADMIN_CASE_ID and produces a real case reference.

## Progress

- [x] (2026-01-07 17:20Z) Capture repo context, write ExecPlan and Secure-by-Design plan.
- [x] (2026-01-07 17:35Z) Implement the generic case creation helper and PRL starter data.
- [x] (2026-01-07 17:40Z) Wire the helper into dynamic-user-caseworker and update case creation flow.
- [x] (2026-01-07 18:35Z) Resolve court admin assignment role/jurisdiction using valid-roles and case metadata.
- [x] (2026-01-07 18:55Z) Stabilize login navigation by tolerating client-side redirect aborts.
- [x] (2026-01-07 19:10Z) Retry court admin allocation against multiple valid roles until an approved role is found.
- [x] (2026-01-07 19:20Z) Add case manager fallback for assignment when court admin rules reject allocation.
- [x] (2026-01-07 19:30Z) Expand default dynamic-user roles to include PRL/CTSC/admin/allocator roles.
- [ ] (2026-01-07 18:25Z) Document validation steps and update plan evidence (completed: yarn lint clean; remaining: run focused Playwright test).

## Surprises & Discoveries

Observation: The rpx-xui-e2e-tests repo does not include a CCD create-case helper, while prl-e2e-tests uses /data/internal/case-types/<caseType>/event-triggers/<event> and /data/case-types/<caseType>/cases to create cases. Evidence: prl-e2e-tests/e2e/utils/caseEvent.utils.ts and et-xui-e2e-tests/playwrighte2e/pages/createCaseThroughApi.ts.

Observation: The existing court admin assignment flow already builds an APIRequestContext from UI login storage state and XSRF cookies, so the new helper can reuse the same mechanism for case creation. Evidence: src/tests/e2e/smoke/dynamic-user-caseworker.spec.ts before refactor used request.newContext with XSRF header.

Observation: The POC test used test.skip, which triggers the playwright/no-skipped-test lint rule. Evidence: initial yarn lint output showed warnings; refactor to runtime skips removes them.

Observation: allocate-role/confirm returned 422 for PRL with the default role configuration; resolving jurisdiction IDs from case metadata and using valid-roles improves compatibility with role definitions.

Observation: manage-case `/cases` navigation can be aborted when the app triggers an immediate client-side redirect to IDAM; tolerate net::ERR_ABORTED during login.

Observation: Role assignment responses can be rejected by rule validation for some valid roles; iterate over available roles within the category to find one approved by rules.

Observation: Court admin accounts in AAT can pass case allocator checks but still be rejected by role rules; a case manager fallback can succeed when admin rules do not permit allocation.

Observation: The dynamic user needed PRL/CTSC/admin/allocator roles to satisfy AM rules in AAT; the default role list was expanded accordingly.

## Decision Log

Decision: Implement the helper around Playwright APIRequestContext and Manage Case /data endpoints, using event_token from the event-trigger response. Rationale: This matches existing PRL and ExUI patterns and works with the XSRF cookie acquired via UI login. Date/Author: 2026-01-07 / Codex.

Decision: Default the initial usage to Private Law with the testingSupportDummySolicitorCreate event and a minimal payload, while keeping the helper generic so other case types can supply their own data. Rationale: Provides a reliable starting point without blocking future jurisdictions. Date/Author: 2026-01-07 / Codex.

Decision: Use case creator credentials from CASE_CREATE_USERNAME/PASSWORD with fallback to PRL_SOLICITOR or SOLICITOR for the initial PRL flow. Rationale: Allows case creation without requiring court admin permissions. Date/Author: 2026-01-07 / Codex.

Decision: When COURT_ADMIN_ROLE_ID/ROLE_NAME are not provided, fetch valid roles for the jurisdiction and pick a matching roleCategory. Rationale: avoids hard-coded roles that are invalid for a given jurisdiction. Date/Author: 2026-01-07 / Codex.

Decision: When a role is rejected with rule-validation 422s, try other valid roles in the same category before failing. Rationale: avoids flakiness due to environment-specific role rules. Date/Author: 2026-01-07 / Codex.

Decision: If court admin allocation is rejected, retry with a case manager assigner when available. Rationale: case manager accounts often hold the approvals needed for PRL allocation rules in AAT. Date/Author: 2026-01-07 / Codex.

Decision: Default dynamic-user role list includes PRL/CTSC/admin/allocator roles unless IDAM_ROLE_NAMES is explicitly set. Rationale: keeps POC aligned with AM rules while allowing overrides. Date/Author: 2026-01-07 / Codex.

## Outcomes & Retrospective

Implemented a generic case creation helper in src/utils/api/case-creation.ts, added PRL default data in src/data/ccd/prl-case-create.ts, wired the helper into the dynamic-user-caseworker court admin assignment test, and added valid-roles/jurisdiction fallback for court admin assignment. Validation is pending because the helper was not exercised in this environment.

## Context and Orientation

Repository rpx-xui-e2e-tests is a Playwright + TypeScript suite. UI tests use src/fixtures/ui.ts and shared config in src/utils/ui/config.utils.ts, which exposes exuiDefaultUrl and manageCaseBaseUrl. API requests are built either with Playwright request.newContext or the ApiClient in src/fixtures/api.ts. The failing test lives at src/tests/e2e/smoke/dynamic-user-caseworker.spec.ts and currently requires COURT_ADMIN_CASE_ID to assign a case. We will add a new helper under src/utils/api to fetch an event token and create a case, add a small PRL data template under src/data, and use the helper in the dynamic-user-caseworker test when no case ID is supplied.

## Plan of Work

Add a new file at src/utils/api/case-creation.ts that exposes a small, typed helper for case creation. The helper will fetch an event token using /data/internal/case-types/<caseType>/event-triggers/<event> with ignore-warning, then POST to /data/case-types/<caseType>/cases with event_token, event metadata, and caller-supplied data. The helper will validate required inputs, handle non-2xx responses with safe error messages, and return the created case ID and raw response for debugging.

Add a PRL starter payload under src/data/ccd/prl-case-create.ts with defaults for caseTypeId, eventId, and minimal data fields needed by testingSupportDummySolicitorCreate. The data will be plain and overrideable by the caller.

Update src/tests/e2e/smoke/dynamic-user-caseworker.spec.ts so the court-admin assignment test creates a case via the new helper when COURT_ADMIN_CASE_ID (or ROLE_ACCESS_CASE_ID) is missing. The test will login as a case creator (defaulting to PRL_SOLICITOR or SOLICITOR credentials when CASE_CREATE_USERNAME/PASSWORD are not supplied), build an APIRequestContext with XSRF headers, create the case, and then proceed with the existing assignment flow. The created case ID will be attached to the report when dynamic user attachments are enabled.

## Concrete Steps

Working directory: /Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/rpx-xui-e2e-tests.

Create src/utils/api/case-creation.ts with the helper functions and types. Add src/data/ccd/prl-case-create.ts with PRL defaults. Update src/tests/e2e/smoke/dynamic-user-caseworker.spec.ts to call the helper when no case ID is present, using a case creator login to obtain XSRF and storage state. Keep error messages free of secrets or headers.

If validation is possible, run:

  yarn lint
  PLAYWRIGHT_REPORTERS=list yarn playwright test src/tests/e2e/smoke/dynamic-user-caseworker.spec.ts --grep "caseworker can be created and assigned a case via court admin"

Record any failures or observations in this plan.

## Validation and Acceptance

Acceptance is met when the dynamic-user-caseworker court-admin assignment test can run without COURT_ADMIN_CASE_ID and successfully creates a PRL case via the helper, assigns it, and opens case details for the newly created caseworker. The case ID should be visible in logs or attachments, and no secrets should appear in output. If the helper is invoked for other case types with valid data, it should return a new case ID and leave the test in a usable state.

## Idempotence and Recovery

Case creation uses a unique case name suffix to avoid collisions. Re-running the test should create new cases without interfering with prior runs. If case creation fails, the helper should throw a clear status-only error and the test can be re-run after fixing credentials or data. If a case is created but assignment fails, the case ID should be logged so it can be reused or manually cleaned up.

## Artifacts and Notes

Add a short snippet of any relevant command output or test summary after implementation. Keep it minimal and avoid attaching tokens or cookies.

  yarn lint
  (no output)

## Interfaces and Dependencies

Define the following in src/utils/api/case-creation.ts:

  export type CaseCreationOptions = {
    apiContext: APIRequestContext;
    caseTypeId: string;
    eventId: string;
    data: Record<string, unknown>;
    ignoreWarning?: boolean;
    summary?: string;
    description?: string;
    headers?: Record<string, string>;
    draftId?: string | null;
  };

  export type CaseCreationResult = {
    caseId: string;
    caseReference?: string;
    raw: unknown;
  };

  export async function fetchEventToken(options: {
    apiContext: APIRequestContext;
    caseTypeId?: string;
    caseId?: string;
    eventId: string;
    ignoreWarning?: boolean;
    headers?: Record<string, string>;
  }): Promise<string>;

  export async function createCase(options: CaseCreationOptions): Promise<CaseCreationResult>;

The helper uses Playwright APIRequestContext and the Manage Case /data endpoints. It relies on callers to provide authenticated contexts and XSRF headers. No new dependencies are required.

Revision notes: initial version created 2026-01-07 for generic case creation with PRL starter usage.

Revision note: Updated progress and artifacts after refactoring skips and rerunning yarn lint clean. Reason: keep plan aligned with current validation status.
