# EXUI-3788 Parity Slice 1 Plan

## Problem
- `rpx-xui-e2e-tests` master only covers a small subset of the `rpx-xui-webapp/playwright_tests_new` suite.
- PR #10 was closed, so parity work needs to restart from clean `master` with thinner, reviewable slices.

## Scope
- Add first-class `integration` Playwright project support in this repo.
- Port the `searchCase` integration parity pack:
  - quick header search
  - find case filters
  - global search menu
- Port the `welshLanguage` integration parity pack:
  - mocked translation success
  - mocked translation failure
  - backend smoke tagged `@nightly`
- Add only the helper, mock, page-object, and config changes needed for this slice.

## Non-scope
- `documentUpload` parity
- broader page-object uplift from the closed branch
- Jenkins pipeline rewrites
- high-risk shared fixture or fallback rewrites
- full parity in a single branch

## Acceptance Criteria
- `playwright.config.ts` exposes a dedicated `integration` project and a nightly variant.
- `package.json` exposes runnable integration commands.
- Search and Welsh parity specs run from `src/tests/integration`.
- Existing master tests remain intact.
- The branch stays narrow enough to review as a parity slice instead of another migration dump.

## Risk
- Medium
- Rationale:
  - new project wiring affects test selection
  - the slice adds multiple mocks and route helpers
  - parity value is real, but the branch must avoid dragging in unrelated refactors

## Validation Plan
- `yarn lint`
- targeted `yarn playwright test --project=integration ...`
- targeted `yarn playwright test --project=integration-nightly ...`
- `git diff --check`
