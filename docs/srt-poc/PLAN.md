# PLAN

## Objective
Implement the first repo-local MVP for `Lane 1: Superservice Configuration` in `rpx-xui-e2e-tests`, proving that EXUI-owned service-family configuration can be covered through one shared scenario catalogue, exact config-contract checks, and a thin mocked integration slice.

## Project Profile
- Profile A: Playwright-first E2E repo
- Target repository: `rpx-xui-e2e-tests`
- Related evidence source: `rpx-xui-webapp` and `ccd-case-ui-toolkit`

## Risk
- `Medium`

Reason:
- this turn changes Playwright tests and shared test support, not production runtime code
- the MVP introduces new API and UI proof points that must stay review-clean
- the UI lane still depends on shared EXUI host availability, so the implementation must degrade honestly when the shell is down

## Scope
- `src/data/exui-central-assurance.ts`
- `src/tests/api/exui-central-assurance.api.ts`
- `src/tests/integration/manageTasks/availableTasks/serviceFamilies.positive.spec.ts`
- `src/tests/integration/searchCase/serviceFamilies.positive.spec.ts`
- `src/tests/integration/hearings/serviceFamilies.positive.spec.ts`
- `src/utils/ui/uiHostAvailability.ts`
- `src/global/ui.global.setup.ts`
- `docs/srt-poc/PLAN.md`
- `docs/srt-poc/TODO.md`
- `docs/srt-poc/DECISIONS.md`
- `docs/srt-poc/RESULT.md`

## Non-scope
- implementing `Lane 2: Shared Workflow/Event Engine`
- implementing `Lane 3: Specialist Components`
- broad replacement of existing service-specific E2E coverage
- fixing the live AAT or demo EXUI shell outage
- creating or pushing a PR in this turn

## Acceptance Criteria
1. A shared service-family scenario catalogue exists for the initial POC slice.
2. API proof asserts the exact EXUI-owned family lists for:
   - global search
   - work allocation
   - staff-supported services
3. Thin mocked UI proofs exist for:
   - manage tasks
   - search case
   - hearings
4. The new UI proofs skip cleanly when the shared EXUI shell is unavailable with `502`, `503`, `504`, or equivalent route-level connectivity failure.
5. Traceability artefacts record:
   - what was implemented
   - what passed
   - what skipped and why
   - what remains for the next loop

## Loop Plan
1. Planner: lock the MVP shape around one catalogue, one exact API layer, and three thin mocked UI journeys.
2. Builder: implement the catalogue, API proofs, UI proofs, and minimal shared support needed to keep the lane review-clean.
3. Critical-Reviewer: remove avoidable coupling and warning noise, especially around test-layer boundaries and environment handling.
4. Tester: run lint, the focused API proof, the focused UI proof, live shell probes, and diff hygiene checks.

## Target Outcome
Land a credible local-worktree MVP for the Configuration Lane that:
- proves the exact family lists EXUI exposes today
- proves the intended mocked UI journeys are wired and runnable
- avoids false-red failures when the shared shell is down
- leaves a clear follow-up to rerun the UI journeys against a healthy environment
