# Harness migration: retired product duplication

The repository is moving to central configuration, role, definition and data-integrity assurance. Product regressions belong in rpx-xui-webapp. Harness support tests remain while their implementations are used. This migration is incomplete; conventional suite commands and CI stages still have remaining consumers.

| Retirement commit | Removed runnable cases | Preserved coverage |
|---|---:|---|
| c07c078 | 1 | Identical external-config request/assertion survives in the same API file and scope. Empty comment-only spec also removed. |
| 0bbef87 | 2 | Unused cookie wrappers and their sole fake-call-count checks removed. Actual expired-session checks and all surviving helper checks remain. |
| f4b5b2e | 2 | Hearings functional assertions execute in retained accessibility tests with identical fixtures/tags and all screenshots preserved. |
| e18b4b4 | 6 | Lifecycle statuses/actions/summary routes retained in canonical webapp. Five callback templates expand to six cases. |
| 08d241a | 7 | Edit labels, pre-CR84 action, validation/error and create navigation retained in canonical webapp. Sole-use SHV fixture also removed. |
| 9e85589 | 4 | Actuals summaries, submitted values, completion and error behavior retained in canonical webapp. Unused navigation wrapper removed; reporter parser check preserved. |

Twenty-two runnable cases are retired. Test declarations, parameterized cases and assertion counts are different measures.

## Canonical product coverage

The product comparisons use committed webapp76bf7a840fa71af466961de87294973023b2f0f3, excluding dirty worktree contents. Relevant callbacks, scenarios, roles, consumed responses, page-object assertions and executable selection were reviewed.

- [hearingLifecycle.statusRouting.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingLifecycle.statusRouting.positive.spec.ts)
- [hearingViewEdit.manualUpdateLabels.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingViewEdit.manualUpdateLabels.positive.spec.ts)
- [hearingViewEdit.preCr84Actions.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingViewEdit.preCr84Actions.positive.spec.ts)
- [hearingViewEdit.summaryValidations.negative.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingViewEdit.summaryValidations.negative.spec.ts)
- [hearingViewEdit.updateLabels.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingViewEdit.updateLabels.positive.spec.ts)
- [hearingCreate.requestJourney.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingCreate.requestJourney.positive.spec.ts)

Lifecycle checks compared20 payload/outcome projections. Edit/create checks compared63 relevant responses and19 locator/assertion definitions. Canonical tag resolution selects all these cases in default and Hearings modes; the Chromium integration configuration and preview/AAT Jenkins commands include them. These are source/helper comparisons, not a newly observed canonical browser or CI run.

Known setup differences were assessed rather than hidden: canonical click navigation is stronger than the retired direct-navigation fallback; actuals mocks include extra unasserted data; navigation-header configuration differs while the direct Hearings journeys assert no header behavior. Shared fixtures/helpers remain where other tests use them.

Actuals retirement compared40 relevant responses and preserved35 direct assertion expressions. Canonical also retains additional Back-navigation regression tests; those extra cases were not used to obscure any missing counterpart. The reporter filename substitution passed its existing path-parser unit test.

## Useful central scenarios

The actual-candidate scope slice now verifies scoped service/location requests, the exact rendered suggestion list and selection/add behavior. Its IA/Civil browser baselines passed and its broadened-organisation-scope fault was detected. A separate diagnostic returned no venue suggestions with HTTP200 and unchanged valid queries; both personas failed exactly at location-search-results. That altered-source diagnostic remained BLOCKED and receives no production mutation credit. The legacy work-filter file remains because its persistence setup and other variants are not yet certified redundant. Generated/model diagnostics receive no candidate or real-CCD release credit.

## Rollback and remaining work

Each batch has its own retirement commit; revert only the affected batch to restore its tests and fixture. Keep useful unique configuration assertions until ported. Remove commands, stages and shared support only when their remaining consumers have retired or moved. Full-release promotion, effective environment coverage, external owners and live CI acceptance remain open.

AI-assisted implementation; human review pending. Audit reference:harness-plan-execution-20261102. Detailed synthetic comparison scripts/results are retained in the workspace retirement evidence bundle.
