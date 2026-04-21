# RESULT

## Loop 1 Summary

- Loaded the HMCTS SDET orchestrator rules and kept the MVP constrained to `Lane 1: Superservice Configuration`.
- Added one shared EXUI service-family scenario catalogue in `src/data/exui-central-assurance.ts`.
- Added focused exact-contract coverage in `src/tests/api/exui-central-assurance.api.ts`.
- Added one thin mocked manage-tasks UI proof in `src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts`.
- Added shared support for the UI-shell availability probe and manage-tasks route registration.
- Reused existing seams and introduced no new `_helpers` folders.

## Loop 2 Summary

- Performed a critical review against `origin/master` and confirmed the original `test/srt-poc` branch name was attached to a stacked diff outside the MVP scope.
- Rebuilt `test/srt-poc` from `origin/master` and replayed only the MVP commits.
- Removed the dead search and hearings UI specs that depended on non-master harness files.
- Reduced the UI slice to one current-master-compatible manage-tasks proof.

## Loop 3 Summary

- Re-ran the branch review and found two substantive review gaps:
  - the new API proof was reading a missing UI cookie file and could pass on unauthenticated guarded statuses without proving the exact `200` contract
  - the new shared helper modules still had no direct deterministic coverage
- Fixed the API proof to use authenticated API storage via `ensureStorageState("solicitor")`.
- Changed the exact-contract tests so non-`200` responses now skip explicitly instead of passing as guarded noise.
- Changed the manage-tasks UI proof to use `COURT_ADMIN`, which has a real cached UI session in this checkout.
- Added direct fake-driven coverage for:
  - `probeUiRouteAvailability`
  - `setupAvailableTaskListRoutes`
- Updated the traceability pack so it matches the actual clean-branch MVP instead of the earlier wider draft.

## Loop 4 Summary

- Investigated the last failing UI proof against the real EXUI manage-tasks component instead of guessing from the rendered page.
- Confirmed the available-tasks service filter is built from the intersection of:
  - WA-supported service families
  - the current user's `ORGANISATION` role assignments
- Confirmed the live cached `COURT_ADMIN` session was only entitled to `PRIVATELAW`, so the earlier full-family assertion was invalid against a live user context.
- Added a dedicated `api/user/details` route mock plus seeded `sessionStorage.userDetails` so the thin UI proof now owns the entitlement seam and validates the central WA family set deterministically.
- Re-ran the focused API proof and the Chrome-backed UI proof successfully on the repaired harness.
- Fixed the repo `lint` script in `package.json` so `yarn lint` runs the local ESLint binary instead of failing on an invalid Yarn 4 script invocation.

## Deliberation And Review Outcome

### Planner
- Kept the MVP constrained to:
  - one scenario catalogue
  - one exact config-contract layer
  - one current-master-compatible mocked UI journey
- Treated search and hearings as planned follow-on rows rather than pretending they were already implemented on `master`.

### Builder
- Implemented exact service-family list assertions for:
  - global search
  - work allocation
  - staff-supported services
- Added execution-status metadata to the scenario catalogue so implemented and planned rows are explicit.
- Added direct helper coverage for the extracted support modules.
- Aligned the manage-tasks UI proof to a real cached UI session user.
- Added deterministic mocked user-details role assignments so the service filter reflects the central WA family set rather than live user-specific entitlement drift.

### Critical-Reviewer
- Rejected the previous API proof shape because it could pass on `401` with no authenticated evidence.
- Rejected the previous traceability pack because it still described removed search/hearings UI proofs and stale scope.
- Required direct coverage for the extracted shared support instead of relying only on a skipped browser spec.
- Rejected the live-user-only UI assertion because the service filter is entitlement-sensitive and therefore not a pure central-config proof unless the user-details seam is controlled.

### Tester
- Confirmed the focused API proof now uses the repo API-auth path.
- Confirmed the focused manage-tasks UI proof now uses a cached `COURT_ADMIN` session plus mocked EXUI user-details role assignments.
- Confirmed the focused Chrome-backed UI proof passes once the entitlement seam is controlled.

## Implemented Files

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
- `docs/srt-poc/CONFLUENCE_UPDATE.md`

## Validation Commands

- `./node_modules/.bin/eslint src/tests/api/exui-central-assurance.api.ts src/data/exui-central-assurance.ts src/utils/ui/uiHostAvailability.ts src/tests/e2e/integration/utils/taskListRoutes.ts src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts`
- `PW_UI_STORAGE=0 ./node_modules/.bin/playwright test --project=api src/tests/api/exui-central-assurance.api.ts`
- `PW_UI_STORAGE=0 PW_CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npx playwright test --project=ui src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts --timeout=60000 --global-timeout=90000`
- `curl -I --max-time 15 https://manage-case.aat.platform.hmcts.net/api/globalSearch/services`
- `curl -I --max-time 15 https://manage-case.aat.platform.hmcts.net/api/wa-supported-jurisdiction`
- `curl -I --max-time 15 https://manage-case.aat.platform.hmcts.net/api/staff-supported-jurisdiction`
- `curl -I --max-time 15 https://manage-case.aat.platform.hmcts.net/work/my-work/list`
- `git -C /Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/rpx-xui-e2e-tests diff --check`

## Validation Outcome

- focused `yarn lint`: passed with existing repo warnings only (`0 errors`, `8 warnings`)
- focused API proof: passed (`5 passed`)
- focused manage-tasks UI proof: passed (`1 passed`) with Chrome override outside the sandbox
- unauthenticated API probes:
  - `api/globalSearch/services` returned `401`
  - `api/wa-supported-jurisdiction` returned `401`
  - `api/staff-supported-jurisdiction` returned `401`
- authenticated live API evidence:
  - `api/wa-supported-jurisdiction/get` returned `200` with must-run families plus environment extras `SSCS`, `ST_CIC`, and `PROBATE`
  - `api/staff-supported-jurisdiction/get` returned `200` and matched the exact central staff-supported set
  - `api/globalSearch/services` returned `200` with must-run families plus environment extras and mixed-case `Civil`
- live shell probe:
  - `/work/my-work/list` returned `HTTP/2 504` when probed directly, but the mocked UI proof still passed once run with a valid cached session and deterministic page-level route mocks

## Residual Risks

- The manage-tasks UI proof still depends on the shared EXUI shell being reachable enough to render the route before the page-level mocks take over, even though the focused Chrome-backed run passed in this environment.
- Search and hearings remain planned follow-on UI rows; they are represented in the scenario catalogue, but not yet implemented on current `master`.
- `CMC` and `HRS` remain canary-only by design and are intentionally excluded from the exact must-run family sets.
- The repo root still contains unrelated untracked artifacts outside `docs/srt-poc/` and `src/`, so branch/worktree cleanliness must still be stated carefully even if the committed diff is reviewable.

## Next Instructions

1. Freeze the branch diff and run a fresh critical review on the final repaired result.
2. Keep search and hearings as explicit next-slice targets only if current-master-compatible harness arrives or is added deliberately.
3. If the UI lane is extended again, keep the entitlement seam mocked whenever the rendered surface is filtered by user role assignments.

## Current Status

- `Ship recommendation`: ready for final critical review
- `PR review expectation`: expected clean for the MVP slice if no new scope is introduced
- `Branch-state statement`: reviewable branch diff plus unrelated untracked root artifacts
