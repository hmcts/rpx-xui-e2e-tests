# Full Environment Journey: Manual Task Cancellation (AAT)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `rpx-xui-webapp/.agent/PLANS.md`.

## Purpose / Big Picture

We need a deterministic, end‑to‑end Playwright test in `rpx-xui-webapp` that creates a real case in AAT, completes the dummy payment using the stub, and verifies manual task cancellation from both the task list and the case details Tasks tab. The outcome is a reliable CI‑safe test that exercises the real environment (not mocks) and proves the cancellation path used by ExUI is manual and consistent across the two UI surfaces.

## Progress

- [x] (2026-02-04 11:10Z) Searched all repos in `/Users/andrew.grizhenkov/HMCTS/dev/PROJECTS` for similar journeys; identified PRL E2E flows and FPL Codecept flows.
- [x] (2026-02-04 11:10Z) Draft Secure‑by‑Design plan aligned with `SECURE.md`.
- [x] Identify the real AAT case type, create‑case event, payment event, and send‑to‑gatekeeper event IDs/labels to use in ExUI UI.
- [x] Build AAT journey helpers (create case, dummy payment) that can run in CI and locally using session cookies.
- [x] Implement E2E test for manual cancellation from task list and Tasks tab using real AAT data.
- [ ] Validate locally on AAT and document exact run instructions for Jenkins.

## Surprises & Discoveries

- PRL E2E repo includes complete real‑journey flows: `prl-e2e-tests/e2e/tests/manageCases/caseProgression/sendToGateKeeper/sendToGateKeeper.spec.ts` and dummy payment journeys for `C100` and `FL401`.
- Codecept FPL feature in `rpx-xui-webapp/test_codecept/e2e/features/app/fplCreateCase.feature` suggests FPL “Public Law / Care, supervision and EPOs / Start application” UI flow, but no Playwright equivalent exists in this repo.

## Decision Log

- Decision: Use PRL C100 flow and events as the reference for a stable AAT journey (create + payment + send to gatekeeper), because the PRL E2E repository already automates these event IDs and the “Send to gatekeeper” event is explicitly present there.
  Rationale: This provides known event IDs and proven end‑to‑end sequences, reducing guesswork and instability. FPL has UI flows in Codecept only and lacks established Playwright steps here.
  Date/Author: 2026-02-04 / Codex

## Outcomes & Retrospective

To be completed after implementation.

## Context and Orientation

The Playwright E2E tests live in `rpx-xui-webapp/playwright_tests_new/E2E/test`. Session cookies are managed by `rpx-xui-webapp/playwright_tests_new/common/sessionCapture.ts`, which stores `.sessions/{email}.storage.json` for reuse. We must use existing user identifiers from `rpx-xui-webapp/playwright_tests_new/common/appTestConfig.ts` for:

- Solicitor: `PRL_AAT_SOLICITOR` (`prl_aat_solicitor@mailinator.com`)
- CTSC leader: `PRL_CTSC_LEADER` (`prl_ctscleader11_stoke@justice.gov.uk`)
- FPL admin (fallback): `FPL_CTSC_ADMIN` (`fpl-ctsc-admin@justice.gov.uk`)

“Full environment journey” means real AAT endpoints and UI, not mocks. We must rely on actual AAT case creation, dummy payment stub, and the presence of a “Send to gatekeeper” task in the case Tasks tab. The PRL E2E repo shows event IDs for C100 flows:

- Create case: “C100” case type with multiple sub‑events and `submitAndPay`.
- Payment callback: `testingSupportPaymentSuccessCallback`.
- Send to gatekeeper: `sendToGateKeeper`.

These will be mapped to ExUI UI steps or API submissions in this repo.

## Plan of Work

We will implement a real‑journey test in `rpx-xui-webapp/playwright_tests_new/E2E/test/manageTasks/taskCancellationProcess.fullJourney.spec.ts` and supporting helpers in `rpx-xui-webapp/playwright_tests_new/E2E/utils/` to reduce UI flakiness.

First, we will extract event IDs and minimal data payloads from the PRL E2E repository. The goal is to perform minimal UI steps to create a C100 case and reach the “Continue to payment”/dummy payment stub. If UI is too brittle for CI, we will submit events via API using the solicitor’s session cookies. We will implement this as a helper that can do either:

- Primary: UI flow for create case + submit + payment stub
- Fallback: API event submission for create case + payment success callback

Then, we will log in as the CTSC user and verify that “Send to gatekeeper” is visible under Tasks, cancel it from both the My Work task list and the case details Tasks tab, and assert the cancellation request hits the backend.

We will keep the cancellation actions purely manual (no `actionByEvent`), consistent with the updated EXUI-3662 requirement.

## Concrete Steps

1. Gather event IDs and UI text for C100 creation, payment, and send‑to‑gatekeeper.
   - Inspect PRL E2E repo for `submitAndPay`, `testingSupportPaymentSuccessCallback`, `sendToGateKeeper`.
   - Confirm visible labels in UI for “Send to gatekeeper”.

2. Implement helper to create a C100 case in AAT.
   - Use `ensureSessionCookies('PRL_AAT_SOLICITOR')`.
   - Navigate to Create Case UI and progress through minimal required screens to submit.
   - Use payment stub page to complete payment (paid).
   - Capture and return case reference.

3. Implement helper to open case as CTSC user and validate Tasks tab.
   - Use `ensureSessionCookies('PRL_CTSC_LEADER')`.
   - Open `/cases/case-details/{jurisdiction}/{caseType}/{caseId}` and select Tasks tab.
   - Verify “Send to gatekeeper” appears.

4. Implement cancellation flow from both UI surfaces.
   - My Work task list: open Manage for the task and click Cancel.
   - Case details Tasks tab: click “Cancel task” for the same task.
   - Assert each cancel action results in backend request to `/workallocation/task/{taskId}/cancel`.

5. Add tags/notes for CI stability.
   - Use explicit waits for network idle and task list rendering.
   - Add retries if needed (via Playwright config, not within the test).

## Validation and Acceptance

Run locally:

cd /Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/rpx-xui-webapp
npx playwright test --config=playwright.e2e.config.ts playwright_tests_new/E2E/test/manageTasks/taskCancellationProcess.fullJourney.spec.ts

Expected outcome:

- A case is created in AAT as PRL solicitor.
- Dummy payment stub is completed successfully.
- CTSC user sees “Send to gatekeeper” in Tasks.
- Cancel works from task list and Tasks tab.
- Test passes consistently locally and in Jenkins.

## Idempotence and Recovery

The test creates new cases on each run; it is safe to re‑run. If a run fails mid‑way, re‑run the test and the new case will be created. No destructive operations are performed.

## Artifacts and Notes

Include a short log snippet in the test output showing the created case reference and the task ID cancelled. This will help verify the journey in Jenkins logs.

## Interfaces and Dependencies

- Use Playwright’s `Page` API and existing fixtures from `playwright_tests_new/E2E/fixtures.ts`.
- Use `ensureSessionCookies` from `playwright_tests_new/common/sessionCapture.ts` to avoid re‑auth.
- Add small helper utilities in `playwright_tests_new/E2E/utils/` for case creation and payment completion.

Plan change note: initial draft created after repo scan; will be updated as event IDs and UI steps are confirmed.
