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
- `src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts`
- `src/tests/e2e/integration/utils/taskListRoutes.ts`
- `src/utils/ui/uiHostAvailability.ts`
- `package.json`
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
   - work allocation via `api/wa-supported-jurisdiction/get`
   - staff-supported services via `api/staff-supported-jurisdiction/get`
   - global search object shape plus presence of the central must-run family set
3. The branch includes direct helper coverage for the extracted shared support used by this MVP:
   - UI-host availability probing
   - manage-tasks route registration
4. One thin mocked UI proof exists for `manageTasks` and uses a real cached UI session plus mocked EXUI user-details role assignments so the filter is driven by the central supported-family set rather than live user entitlement drift.
5. The new UI proofs skip cleanly when the shared EXUI shell is unavailable with `502`, `503`, `504`, or equivalent route-level connectivity failure.
6. Traceability artefacts record:
   - what was implemented
   - what passed
   - what skipped and why
   - what remains for the next loop

## Loop Plan
1. Planner: lock the MVP shape around one catalogue, one exact API layer, and one current-master-compatible mocked UI journey.
2. Builder: implement the catalogue, API proofs, helper coverage, and minimal shared support needed to keep the lane review-clean.
3. Critical-Reviewer: remove avoidable coupling, stale claims, and warning noise, especially around auth/session handling and evidence quality.
4. Tester: run lint, the focused API proof, the focused UI proof, live shell probes, and diff hygiene checks.

## Target Outcome
Land a credible local-worktree MVP for the Configuration Lane that:
- proves the exact family lists EXUI exposes today
- proves the exact node-backed `/get` family lists for WA and staff-supported services
- proves the global-search endpoint contains the central must-run families without depending on live ref-data labels remaining static
- proves the manage-tasks mocked UI journey is wired and runnable
- proves the extracted helper modules have direct deterministic coverage
- avoids false-red failures when the shared shell is down
- leaves a clear follow-up to extend the UI slice to search and hearings on current-master-compatible harness
