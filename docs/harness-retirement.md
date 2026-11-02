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
| c73237e | 6 | Five generic navigation/resilience callbacks retained canonically; exact Continue/Back/Back and returned-row checks are preserved in Civil Harness3b9ca01. Unused dataset generator and its sole unit callback removed. |
| c057265 | 26 | Ordinary task-list, pagination, sorting, claim and error outcomes retained canonically. Central service-family slices and shared support remain. |
| 1796901 | 21 | Challenged/specific/review access-request validation, conditional fields, request values and success/error outcomes retained canonically. |

One hundred and fifteen runnable cases are retired. Test declarations, parameterized cases and assertion counts are different measures.

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

CR84 retirement compares the same configured family, flag, role and status inputs, not merely similar UI assertions. The distinct Civil linked-entry context is now retained as its own browser-tested Harness slice; generic linked submit/error flows are separately consolidated. The exact Continue/Back/Back sequence and returned-row checks are now preserved in the Civil Harness slice.

- [createCase.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/E2E/test/createCase/createCase.spec.ts)
- [updateCase.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/E2E/test/updateCase/updateCase.spec.ts)
- [hearingDetails.cr84.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingDetails.cr84.positive.spec.ts)
- [hearingDetails.cr84.negative.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingDetails.cr84.negative.spec.ts)

Linked retirement verifies both actual fixtures through the committed inclusion, selection, ordering and submit predicates. The additional canonical selected hearing still yields the same first-selected hearing per case and exact two-row order/payload. It is not misreported as unavailable. Civil capability/persona/flags are preserved in the separate real-frontend case; real Civil service-code integration and immutable-candidate release credit are not claimed.

- [hearingLinked.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingLinked.positive.spec.ts)
- [hearingLinked.negative.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingLinked.negative.spec.ts)

Navigation/resilience retirement compared35 canonical response projections plus seven Civil/input projections. Large-list35-row/count/edge labels, four null fields/no Invalid Date, empty-state message and request-entry outcomes remain in the webapp. The useful exact navigation sequence passed in the retained Civil slice against18 sealed frontend JavaScript responses with zero retries and no undeclared destinations. The activity/presence seam uses only the exact synthetic-case GET/POST contract. This is controlled frontend evidence, with no real Civil service-code or candidate/release-gate credit. The old generic cases used bucket4; the retained Civil slice uses bucket5 and is excluded by an optional bucket4-only selection. All13 surviving relevant helper checks passed; Continue/Back and shared mock/auth support remain.

- [hearingCreate.navigationControls.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingCreate.navigationControls.positive.spec.ts)
- [hearingDetails.resilience.positive.spec.ts](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/hearings/hearingDetails.resilience.positive.spec.ts)

Task-list retirement compares26 expanded cases/20 declarations, identical task-builder bytes, five date-format examples and52 actual default/explicit canonical selection checks. Compatible staff purpose is established through the exercised task actions/CLAIM/status predicates; accounts and bootstrap role arrays are not claimed identical. Shared TableUtils versions differ; this is product-outcome consolidation, with no parser implementation parity or live-CI claim.

Access-request retirement replays21 actual setup callbacks/eight option shapes with last-matching-route precedence. Actual toolkit7.4.21 role/request builders produce three strictly equal submission payloads for the effective mocked personas. All21 canonical counterparts are selected by default and explicit access-request tags. Additional Harness retries, radio/readiness checks and ancillary shell/service-label differences are disclosed; generic form, validation, payload and success/error assertions remain canonical. Reporter filename-parser coverage stays meaningful with canonical filenames. No new configuration slice is justified by these ordinary product callbacks.

Canonical directories: [manageTasks](https://github.com/hmcts/rpx-xui-webapp/tree/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/manageTasks), [accessRequests](https://github.com/hmcts/rpx-xui-webapp/tree/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/accessRequests).

## Useful central scenarios

The actual-candidate scope slice now verifies scoped service/location requests, the exact rendered suggestion list and selection/add behavior. Its IA/Civil browser baselines passed and its broadened-organisation-scope fault was detected. A separate diagnostic returned no venue suggestions with HTTP200 and unchanged valid queries; both personas failed exactly at location-search-results. That altered-source diagnostic remained BLOCKED and receives no production mutation credit. The generic work-filter file was retired after the documented outcome comparison; ownerless injected-storage compatibility is the explicit limit described above. Generated/model diagnostics receive no candidate or real-CCD release credit.

## Rollback and remaining work

Each batch has its own retirement commit; revert only the affected batch to restore its tests and fixture. Keep useful unique configuration assertions until ported. Remove commands, stages and shared support only when their remaining consumers have retired or moved. Full-release promotion, effective environment coverage, external owners and live CI acceptance remain open.

AI-assisted implementation; human review pending. Audit reference:harness-plan-execution-20261102. Detailed synthetic comparison scripts/results are retained in the workspace retirement evidence bundle.
