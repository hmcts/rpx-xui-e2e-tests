# RESULT

## Loop 1 Summary

- Loaded the HMCTS SDET orchestrator rules and reused the previously agreed POC shape.
- Implemented the first local-worktree MVP for `Lane 1: Superservice Configuration`.
- Added one shared EXUI service-family scenario catalogue in `src/data/exui-central-assurance.ts`.
- Added focused API proof in `src/tests/api/exui-central-assurance.api.ts`.
- Added thin mocked UI proofs in the first local implementation slice.
- Added a shared UI-shell availability probe in `src/utils/ui/uiHostAvailability.ts`.
- Reused existing helper seams and introduced no new `_helpers` folders.
- Kept targeted API proof independent from the repo's default UI session warmup.

## Loop 2 Summary

- Performed a critical review of the branch against `origin/master` and found the original `test/srt-poc` branch name was attached to a large stacked diff outside the MVP scope.
- Rebuilt `test/srt-poc` cleanly from `origin/master` and replayed only the POC commits.
- Rebased the API proof onto current `master` utilities:
  - exact `200` assertions remain in place
  - cookie-backed request contexts now use `src/config/api.ts` and `src/tests/e2e/integration/utils/session.utils.ts`
- Removed the dead search and hearings UI specs that relied on non-master harness code.
- Replaced them with one current-master-compatible manage-tasks UI proof in `src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts`.

## Deliberation And Review Outcome

### Planner
- Kept the MVP constrained to the previously chosen hybrid shape:
  - one scenario catalogue
  - one exact config-contract layer
  - one thin mocked integration layer
- Confirmed that the correct MVP target remains `Lane 1` only.

### Builder
- Implemented exact service-family lists for:
  - global search
  - work allocation
  - staff-supported services
- Added internal guard coverage for:
  - scenario classification
  - canary-family exclusion
  - global setup skip semantics
  - UI-host availability status handling
- Added mocked UI journeys for:
  - available tasks family filter
  - global search services dropdown
  - hearings supported vs unsupported family behaviour

### Critical-Reviewer
- Found a packaging blocker: `test/srt-poc` was not review-clean against `origin/master` because it contained a large unrelated stacked diff.
- Found an implementation blocker on the clean rebase: the stacked-branch UI specs depended on helpers, mocks, and page objects that do not exist on current `master`.
- Found a contract-quality issue: the API proof should fail if a `200` response returns the wrong shape instead of silently doing nothing.

### Tester
- Confirmed the focused API proof passes on the clean branch.
- Confirmed the focused manage-tasks UI proof skips cleanly when the EXUI shell is unavailable instead of failing with misleading browser errors.
- Confirmed the live AAT shell returned `HTTP/2 504` for `/work/my-work/list` on `2026-04-20`.

## Implemented Files

- `src/data/exui-central-assurance.ts`
- `src/tests/api/exui-central-assurance.api.ts`
- `src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts`
- `src/tests/e2e/integration/utils/taskListRoutes.ts`
- `src/utils/ui/uiHostAvailability.ts`
- `docs/srt-poc/PLAN.md`
- `docs/srt-poc/TODO.md`
- `docs/srt-poc/DECISIONS.md`
- `docs/srt-poc/RESULT.md`

## Validation Commands

- `./node_modules/.bin/eslint src/tests/api/exui-central-assurance.api.ts src/data/exui-central-assurance.ts src/utils/ui/uiHostAvailability.ts src/tests/e2e/integration/utils/taskListRoutes.ts src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts`
- `PW_UI_STORAGE=0 ./node_modules/.bin/playwright test --project=api src/tests/api/exui-central-assurance.api.ts`
- `PW_UI_STORAGE=0 ./node_modules/.bin/playwright test --project=ui src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts`
- `curl -I --max-time 15 https://manage-case.aat.platform.hmcts.net/work/my-work/list`
- `git -C /Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/rpx-xui-e2e-tests diff --check`

## Validation Outcome

- focused eslint on changed files: passed with `0` errors and only one fixable import-order warning before the final import-order tidy-up
- focused API proof: `4 passed`
- focused manage-tasks UI proof: `1 skipped`
- live shell probe: `HTTP/2 504` for `https://manage-case.aat.platform.hmcts.net/work/my-work/list`
- `git diff --check`: passed

## Evidence

- API run outcome:
  - `4 passed (14.2s)`
- UI run outcome:
  - `1 skipped`
- live shell probe:
  - `HTTP/2 504`
  - timestamp from response: `Mon, 20 Apr 2026 22:49:19 GMT`

## Residual Risks

- The mocked UI lane is now represented by one clean-branch manage-tasks proof. Search and hearings UI proofs still need current-master-compatible harness before they can be added back honestly.
- The manage-tasks UI proof still needs one rerun against a healthy EXUI shell to produce executed browser evidence.
- The current MVP still covers only `Lane 1`. Historical workflow-state and specialist-component risks remain outside this implementation slice.
- Weak-evidence families such as `CMC` and `HRS` remain canary-only and are intentionally not promoted into the must-run central set.

## Next Instructions

1. Rerun the manage-tasks UI proof when the shared EXUI shell stops returning `502`/`503`/`504`.
2. Decide whether search and hearings should be added by extending current `master` harness or by landing prerequisite harness work first.
3. After the Configuration Lane is stable, design the smallest viable `Lane 2` follow-on around shared event-engine semantics.

## Current Status

- `Ship recommendation`: Ship the clean-branch MVP with medium confidence for the Configuration Lane API layer and low-medium confidence for the current UI layer until the skipped browser proof is rerun on a healthy shell.
- `PR review expectation`: Clean for the current master-based diff after staging the review-fix updates from Loop 2.
- `Branch-state statement`: current worktree contains Loop 2 review-fix edits plus unrelated untracked root artifacts outside `docs/srt-poc/` and `src/`.

Reason:
- the implementation is now based on a clean master diff, the exact API proof is passing, the UI lane no longer contains dead non-master specs, and the remaining browser gap is a documented external `504` shell outage rather than an unresolved product defect.
