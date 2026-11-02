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
| 575196e | 6 | Anonymous configuration/auth/login/user-details/header/health callbacks retained in canonical webapp. All12 remaining callbacks and used support preserved; unreachable schema helper removed. |
| 17fc738 | 7 | Work-filter visibility, requests, restored state, base locations and three IA/SSCS cells retained canonically; My cases work-type visibility remains in myWorkFilters. Two unused assertion helpers removed. |
| f25fb6c | 10 | Six HTTP failures, malformed/null responses, timeout and delayed rows retained canonically. Two exclusive helpers and three constants removed. |
| 1fbc970 | 2 | Ordinary Divorce create/update saved fields, hidden field and history retained canonically. Two unused utilities and their barrel export removed. |
| 13c7f2b | 13 | Same CR84 family/flag/role/status cells retained canonically. Sole-use assertion utility removed; canonical reporter filename fixture retained. |
| 5fa29d4 | 2 | Linked submission/order and server-error flows retained canonically; the distinct Civil entry cell is preserved in the Harness. Sole-use selector removed. |

Sixty-two runnable cases are retired. Test declarations, parameterized cases and assertion counts are different measures.

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

Additional canonical counterparts:

- [hearingActuals.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingActuals.positive.spec.ts)
- [hearingActuals.negative.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingActuals.negative.spec.ts)
- [node-app-endpoints.api.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/api/node-app-endpoints.api.ts)

Anonymous endpoint retirement verifies equivalent request-client bytes, helper behavior, assertions and explicit canonical owner selection. All12 surviving callbacks are unchanged. External job filters can still omit the service tag; no current remote execution or mandatory-selection claim is made. Authenticated/refdata callbacks remain because persona and transport-error behavior differ.

Work-filter persistence is outcome-based retirement: canonical owner-bound localStorage adds reload and isolation checks. The legacy ownerless sessionStorage compatibility path still exists in production, but its injected-storage test is deliberately retired here; this is not claimed as branch-level equivalence. Shared storage/mocks/support remain. The separate central scope slice verifies real requests and visible suggestions.

Negative-resilience comparisons preserve all ten response/abort/delay inputs and empty/reload/hidden-row outcomes. Different session/readiness plumbing is documented; no new product browser or live CI run was performed for these deletions.

- [workFilters.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/manageTasks/workFilters.positive.spec.ts)
- [hearingDetails.resilience.negative.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingDetails.resilience.negative.spec.ts)

CRUD consolidation does not claim identical accounts: canonical uses an explicit Divorce solicitor pool, while retired aliases were generic/civil aliases whose tests asserted no role matrix. The additional update-specific exact date-string comparison is retired; generic list/detail equality remains in canonical create using the same history component, and update retains today/readback checks.

CR84 retirement compares the same configured family, flag, role and status inputs, not merely similar UI assertions. The distinct Civil linked-entry context is now retained as its own browser-tested Harness slice; generic linked submit/error flows are separately consolidated. Extra create-Back row assertions remain held.

- [createCase.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/E2E/test/createCase/createCase.spec.ts)
- [updateCase.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/E2E/test/updateCase/updateCase.spec.ts)
- [hearingDetails.cr84.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingDetails.cr84.positive.spec.ts)
- [hearingDetails.cr84.negative.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingDetails.cr84.negative.spec.ts)

Linked retirement verifies both actual fixtures through the committed inclusion, selection, ordering and submit predicates. The additional canonical selected hearing still yields the same first-selected hearing per case and exact two-row order/payload. It is not misreported as unavailable. Civil capability/persona/flags are preserved in the separate real-frontend case; real Civil service-code integration and immutable-candidate release credit are not claimed.

- [hearingLinked.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingLinked.positive.spec.ts)
- [hearingLinked.negative.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingLinked.negative.spec.ts)

## Useful central scenarios

The actual-candidate scope slice now verifies scoped service/location requests, the exact rendered suggestion list and selection/add behavior. Its IA/Civil browser baselines passed and its broadened-organisation-scope fault was detected. A separate diagnostic returned no venue suggestions with HTTP200 and unchanged valid queries; both personas failed exactly at location-search-results. That altered-source diagnostic remained BLOCKED and receives no production mutation credit. The legacy work-filter file remains because its persistence setup and other variants are not yet certified redundant. Generated/model diagnostics receive no candidate or real-CCD release credit.

## Rollback and remaining work

Each batch has its own retirement commit; revert only the affected batch to restore its tests and fixture. Keep useful unique configuration assertions until ported. Remove commands, stages and shared support only when their remaining consumers have retired or moved. Full-release promotion, effective environment coverage, external owners and live CI acceptance remain open.

AI-assisted implementation; human review pending. Audit reference:harness-plan-execution-20261102. Detailed synthetic comparison scripts/results are retained in the workspace retirement evidence bundle.
