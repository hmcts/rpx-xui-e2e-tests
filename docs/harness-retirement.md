# Harness migration: retired product duplication

The repository now focuses on central configuration, role, definition and data-integrity assurance. Ordinary product regression belongs in rpx-xui-webapp; conventional product commands and CI stages are retired. Meaningful Harness/support tests remain. Full runtime coverage and release integration are incomplete.

Each comparison below describes its recorded batch and source pin. Later reviewed closures can retire previously retained support; the final state and remaining gaps are described at the end.

| Retirement commit | Removed Playwright cases | Preserved coverage |
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
| ea2b985 | 6 | Unused access-request PO/fixture, route/mock/decoder helpers and their six dedicated self-tests removed. Shared authentication, WA access and reporter support remain. |
| 12c57c2 | 17 | Verified generic Find/header/menu search outcomes retained canonically; seven unresolved cases and central service-family slice remain. |
| 7f0f2e4 | 6 | Find rendering/empty outcomes and four global-search HTTP errors consolidate canonically; exact DOM-count and local PO diagnostic-wording predicates deliberately retired. Mocked View→summary remains. |
| df538e1 | 1 | Orphan Find handler/self-test, builders, wrappers and constants removed; eight used support callbacks remain. |
| 8793250 | 21 | Ordinary create/list field, page/filter, request and error outcomes retained canonically; incidental row-order/hidden-DOM/diagnostic differences explicitly retired. |
| 237ba33 | 11 | Completion, unassign, reassign and cancellation-error outcomes retained canonically. Sole-use assertion utility and helper declarations removed. |
| 3885a76 | 6 | Case-file hierarchy/date/sort/empty/viewer outcomes retained canonically. Unsupported pretranslated-URL fixture and unasserted OFF-account distinctions explicitly retired. |
| 1517991 | 1 | Positive Go-to-task route, observed task response and displayed fields retained canonically. Two negative cases initially held for a blocked canonical owner; later explicitly withdrawn in b6c1b55. |
| 42d4e44 | 4 | Unreachable integration case-file helpers/mocks and their four dedicated fake checks removed. |
| 3e25039 | 1 | Real Employment case/PDF upload, saved file-tree and viewer text retained canonically; setup transport/lease differences disclosed. |
| c03448f | 1 | Final unused case-file PDF, page object, generated-DOM test/fixture and sole unused HTML export removed after caller review. |
| db78082 | 8 | Task cancellation transitions, request inputs, warnings and returned routes retained canonically; two exclusive utilities removed. |

| 81ea322 | 16 | Generic search/refdata and role-access status/payload outcomes retained canonically; six unresolved product callbacks initially held and13 meaningful helper checks preserved; the former were explicitly withdrawn later in824116b. |

| f4b27c5 | 3 | Generic session/feature-flag/stale-cookie callbacks retained canonically; eight used Node helper checks preserved. |
| 2ad5f78 | 3 | Old E2E direct-submit/list outcomes consolidate canonically; exclusive E2E list mock removed, positional row predicate withdrawn. |
| 824116b | 7 | Remaining generic Node/refdata product scope withdrawn with timeout/status/persona/count endpoint limits explicit; all21 helper checks preserved. |
| 35730bd | 7 | Generic E2E search outcomes consolidate; menu-link requirement and automatic initial detail-view predicates deliberately withdrawn. |
| a86a295 | 2 | Canonical interactive IDAM smoke owns cookie/auth/header outcomes; generic case-list readiness smoke retired. |
| 21dce10 | 6 | Ordinary work-filter mandatory-service/recovery/isolation outcomes consolidate; extra My cases DOM-visibility predicate withdrawn. |
| b6c1b55 | 3 | Generic Go-to error navigation and mocked View→summary checks withdrawn; blocked/different canonical browser contracts are not claimed equivalent. |

| bdc7c22 | 84 | One anonymous GET template expands82 canonically duplicated rows plus two obsolete inventory withdrawals; exclusive inventory/re-export removed. |

| 9a92169 | 9 | Generic sharing/CORS/postcode product probes consolidated or withdrawn with route/origin/status differences explicit; eight helper checks preserved. |
| 3fb4d72 | 3 | Default-AAT CCD profile/work-basket smoke withdrawn in favour of stronger product ownership; five helper checks preserved. Demo would expand six, not counted again. |
| d23bade | 33 | Remaining ordinary My Cases, All Work, case-task/event-blocking and My Access outcomes retained canonically; volume/clock/persona/readiness distinctions withdrawn. |
| 7001307 | 4 | Ordinary upload V1/V2 and case/party flags retained canonically; setup/document-null/notification-timing differences explicit. |
| 6cbb215 | 1 | Ordinary Available-task action retained canonically; already-orphaned E2E task-list mock removed. |
| f611ec1 | 4 | Identical dynamic-field fixture outputs and owning defaults/conditional/retention/validation outcomes; exact too-short numeric input withdrawn. |
| 4ce60da | 2 | Live COURT_ADMIN tasks-or-empty smoke explicitly withdrawn without claiming an equivalent live counterpart; dead table readers pruned. |
| 2ed143c | 1 | Dead Find page/registrations and absent-reference generator with sole self-test removed; six support checks remain. |
| 143f8bc | 24 | Generic viewer/roles/linking/event outcomes retained canonically; synthetic role/callback/no-tabs/readiness distinctions explicitly withdrawn. |
| a50ec33 | 8 | Generic live API schema probes consolidate under product ownership; five builder checks preserved. |

| 83c29a3 | 11 | Welsh rendering and supported booking outcomes consolidate; live translation-provider smoke and unsupported legacy-menu fallback explicitly withdrawn. |
| b436695 | 18 | Restricted-case role-composition/error outcomes consolidate; unmatched live EXUI-3895 default-tab observer explicitly withdrawn, exclusive mock helper removed. |

| a1d1419 | 55 | Generic WA product catalogues/search/actions/cancellation probes consolidate; broad XSRF/fallback/status guards explicitly withdrawn,21 helpers preserved. |
| 64eda71 | 15 | Generic documents/annotations/bookmarks consolidate with status/setup differences explicit;11 helper checks preserved. |
| 207d596 | 2 | Dead search route/parser/session adapters and their two exclusive self-tests removed; six session-support checks preserved. |

| ce360bf | 220 | Atomic Harness default/config/CI switch:83 dead fixture/provisioning self-tests,105 dead API-support self-tests,31 obsolete product-config checks and one generic health callback removed; actual Harness/auth/report support preserved. |

| cff68e8 | 21 | Unreachable case-reference/retry/gateway/case-linking support and sole-use implementations removed after caller review; two useful Hearings builder checks retained and selected. |
| 16effa4 | 112 | Obsolete config/session/mock/load/report support and duplicate reporter checks removed; useful auth/session/resolver/toolkit/task-list checks retained, adaptive timeout regression moved intact and all surviving API tests explicitly selected. |
| 6ea3416 | 10 | Accepted native Global Search configuration composition replaces one mock-backed selector diagnostic; nine sole-consumer helper checks and ten unreachable files removed. Exact old labels/screenshot and live-persona parity explicitly withdrawn. |
| this batch | 7 | Retire generated WA/CYA browser illustrations, three sole-consumer task-list validator checks and one fake-route bootstrap model check; retain installed-toolkit class and real frontend/native consumers. |

Eight hundred and eighty-nine recorded Playwright registrations are retired. Node evaluator/pipeline check refactoring is counted separately in validation, not added to this total. The total includes verified duplicates, explicit generic-product scope withdrawals and dead support checks; it is not a claim of exact canonical replacement for every predicate. Test declarations, parameterized cases and assertion counts are different measures.

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

Access support pruning removes1,080 lines/eight obsolete files and two registrations after the import/export graph found no surviving consumers. The six removed self-tests exercised only the removed mock builders/decoder. Harness support still in use is preserved.

Search consolidation compares24 expanded cases,65 fixed-source hashes,15 builder evaluations and ten actual handler comparisons;17 cases have mapped product outcomes and selected canonical ownership. A later source-grounded decision retires six of the held cases: the toolkit7.4.21 table/empty notification use complementary structural branches, with one first-column link per result, and the error-rejection phrase comes from local test support. Exact future DOM-duplication or helper-wording defects are no longer independently checked here; no central configuration dimension is lost. The mocked View→details/summary case was initially held and later withdrawn in b6c1b55, without claiming equivalent automatic initial-view coverage. The unequal case-details builder belongs to that retained success flow. Session fallbacks, header403 dependency seams and differing tags are disclosed; no browser/live-CI claim is made.

Canonical directory: [searchCase](https://github.com/hmcts/rpx-xui-webapp/tree/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/searchCase).

Ordinary create/list retirement uses the same trigger/ACL/field/show-condition inputs and intercepted submission shapes. Canonical selected-then-hidden reason clearing is stronger. Six nonempty list callbacks now rely on canonical record/field association without retaining local positional row matching; no sorting gesture was asserted. LocalStorage/sessionStorage setup and hidden-DOM/error-surface differences remain explicit limits, not claimed equivalent. All21 mapped canonical callbacks are selected; blocked additional cases were not used as replacements. Exclusive integration case-list routes, mocks and scenario constants were separately removed in4cbf03b; the same-named E2E mock and shared dynamic-field helpers remain.

The search-support cut removes603 lines, including its sole unused handler test, while preserving restricted-access header routes. Eight surviving offline support checks pass with network access denied. Unused support removal does not authorize deleting live authentication or framework tests.

Task-action comparisons verify five request contracts and both accepted unassign payload modes at204/400/500, preserving exact transitions and messages. Account purpose, default dates and scalar role fields differ where unasserted. Go-to-task negatives were initially retained because their canonical browser suite is blocked and expects different text. Their later product-scope withdrawal is explicit in b6c1b55; enabled router/service units do not replace the full rendered contract.

Case-file source review distinguishes supported raw backend document links from the old fixture's already-translated `/documentsv2` prefix. Canonical tests cover both configured gateways from raw links. No producer contract established the mixed pretranslated fixture as a required shape, so it is retired without a new central port. The OFF-labelled content test asserts only fixture-derived document count/date; canonical supplies OFF frontend user details, and no identity-dependent permission or flag outcome was asserted. Real account/permission equivalence is not claimed.

The separate real-backend case-file E2E counterpart preserves Employment creation, upload-event body/headers, identical PDF bytes, reopened case file tree and viewer text, with a stricter filename list. Session leases, upload transports, retries and generated names differ; they are setup distinctions, not asserted configuration contracts. The final PDF/page-object caller review found no surviving consumers; those files and their sole generated-DOM self-test are removed in c03448f. Unreachable create-page methods/types and wrapper were separately pruned inaa13251, retaining dynamic-field helpers and the distinct E2E generator.

Cancellation retirement compares all eight actual callback inputs and ordered fake-provider transitions, including PRL/PRLAPPS and PUBLICLAW contexts. Failure400/409 cases assert warnings/routes, not backend state integrity. Canonical full case fixtures, role-route setup and serial selection differ; shared support remains.

Canonical directories: [task actions](https://github.com/hmcts/rpx-xui-webapp/tree/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/manageTasks/myTasks), [case-file integration](https://github.com/hmcts/rpx-xui-webapp/tree/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/integration/test/caseFileView), [case-file E2E](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/playwright_tests_new/E2E/test/caseFileView/caseFileView.spec.ts).

The search/refdata API batch compares actual request/payload traces, status acceptance, malformed bodies and transport failures for16 ordinary callbacks. Canonical ownership uses the same solicitor purpose with different account precedence and session bootstrap; this is no same-account or live authorization proof. Broad status guards are not promoted into a stronger CSRF guarantee. The later824116b withdrawal records timeout/status acceptance differences, the unmatched access-count endpoint and the different case-officer authorization cell; no exact replacement or central-coverage claim is made. All13 helper callback bodies remain unchanged.

The old E2E create/list and smoke batches consolidate ordinary product outcomes: canonical submit validation requires the refresh/modal return and no create submission; list assertions associate values by reference rather than local position. Canonical IDAM smoke checks both progressive/single-page forms, required cookies, auth200/true and header. Session/bootstrap differences are explicit; no current live identity-provider result is claimed.

E2E search retires the extra FPL menu-link requirement (canonical permits fallback) and automatic initial Case information view (canonical explicitly selects Summary). Work-filter parity retires the local My cases types-of-work hidden predicate; canonical ignores it and the corresponding unit is disabled. These are deliberate product-scope withdrawals with no newly proved replacement, not useful configuration shapes to copy into Harness.

The anonymous-route batch is one shallow template with84 endpoint rows, not84 business scenarios. It accepts200/401/403/500/502/504 and checks an Unauthorized body only for truthy401 payloads; it does not establish universal session rejection.82 rows share canonical requests/assertions/selection. Two literal-parameter GET paths have no current handlers and are withdrawn as obsolete; no equivalent new routes or successful business calls are claimed.

Further ordinary Manage Tasks consolidation preserves record/value/date/link/menu, actor-filter, task-priority/Markdown, event-blocking and access-table outcomes in enabled canonical cases. A2000-static-row fixture, random/six-hour dates, mocked judicial-account mix and some response-readiness predicates are deliberately withdrawn; canonical uses deterministic clocks and changing page responses. Neither volume fixture establishes performance acceptance.

Viewer/link/event consolidation retains conditional mandatory fields and payloads but withdraws differences in synthetic ACL role composition, mid-event callback enablement and no-tabs fallback observations. These generic examples do not establish imported service-definition assurance. The remaining generic live CCD/API schema probes likewise grant no definition/identity/release credit; canonical has different dedicated personas and stronger success contracts. The ledger uses default-AAT expansion for the dynamic work-basket loop.

## Useful central scenarios

The actual-candidate scope slice now verifies scoped service/location requests, the exact rendered suggestion list and selection/add behavior. Its IA/Civil browser baselines passed and its broadened-organisation-scope fault was detected. A separate diagnostic returned no venue suggestions with HTTP200 and unchanged valid queries; both personas failed exactly at location-search-results. That altered-source diagnostic remained BLOCKED and receives no production mutation credit. The generic work-filter file was retired after the documented outcome comparison; ownerless injected-storage compatibility is the explicit limit described above. Generated/model diagnostics receive no candidate or real-CCD release credit.

All ordinary product integration/E2E specs have now retired. Two retained frontend browser files contain central Harness diagnostic/configuration scenarios and retain historical source paths and use explicit Harness configuration. WA and evidence-manager product APIs have also retired. Explicit Harness execution and the command/config/CI cutover are implemented.17 conventional suite commands and six product CI stages are removed; environment/toolkit/frontend diagnostics remain explicitly selected and separately bounded. This does not establish current production identity-provider/translation/booking acceptance.

The Global Search batch retires one mock-backed browser diagnostic and nine sole-consumer support checks after independent acceptance of the native pilot at Harness121f2131d7ce105c40f5d8c21ebdbd669e61ae04. Receipt `sha256:eb7b95db4e58b4ab48dafc6bfa4d5c121ceca8b161e888a5a81c8f6108dbd271` binds candidate76bf7a840fa71af466961de87294973023b2f0f3 and the same sealed artifact in both invocations. The baseline completed a nine-service POST; the WA-list fault completed a seven-service POST before its named membership failure. Both observed actual browser CSRF headers, fresh sessions and32 sealed JavaScript responses in total; all four owned containers were removed. This is pilot-only acceptance with `releaseApproval:false`, no new catalogue112/model, CCD search, live profile, authorization or cache-algorithm credit.

The old literal label dictionary and standalone screenshot are explicitly withdrawn generic product diagnostics, not exact parity with the new independently authored synthetic labels. Canonical [Global Search service mapping](https://github.com/hmcts/rpx-xui-webapp/blob/76bf7a840fa71af466961de87294973023b2f0f3/api/globalSearch/index.spec.ts) owns its source reference-data label/ID contract. The native synthetic legal-operations persona does not establish solicitor identity parity. The first five mixed search support callbacks, shared authentication/session code, other four page objects, environment diagnostics and central model concerns remain. Frontend discovery decreases from six to five cases; support discovery decreases from105/23 files to96/21. The native proof is not added to the no-receipt diagnostic lane.

The generated-browser batch retires two self-authored Available Tasks HTML cases and one generated CYA heading/screenshot illustration, plus three obsolete mock-validator checks and one mock-only route-bootstrap model callback. The retained actual installed-toolkit class diagnostic still exercises the same fast CYA contract; real CCD evidence already exercises the event/CYA/edit/submit/readback path. Models decrease40→39 and support96/21→93/20; frontend5, environment5 and toolkit1 remain. All eight reporter support callbacks remain, using a retained Private Law Hearings row instead of a retired WA badge.

Generated Available Tasks checkbox layout, injected labels, court-admin persona, generic generated-markup axe baseline and screenshots are explicitly withdrawn. Native All Work membership/request evidence does not establish Available Tasks route, persona or candidate WA accessibility parity. The generated CYA heading/layout/screenshot is also withdrawn, without whole-PRL identity or application accessibility parity. Central model scenario concerns, actual frontend/axe consumers and strict postal gaps remain; no new runtime, catalogue112 or release credit follows. The historical visual explainer retains its superseded notice and a focused retirement notice.

## Active Harness support

The explicit support suite contains 93 checks in 20 files. Together with the two portable model files, every remaining API test file has an active selection. A pipeline check compares actual Playwright discovery with the source inventory; an unselected-file probe is rejected. Generic product tests are not recreated as support. Useful authentication, session/storage, persona resolution, fixture, toolkit assertion, mock validation and report behavior remain checked.

## Rollback and remaining work

Each batch has its own retirement commit; revert only the affected batch to restore its tests and fixture. Keep useful unique configuration assertions until ported. Remove commands, stages and shared support only when their remaining consumers have retired or moved. The native postal guard currently blocks on a missing mandatory postcode; see the known-gaps document. Full-release promotion, effective environment coverage, external owners and live CI acceptance remain open.

AI-assisted implementation; human review pending. Audit reference:harness-plan-execution-20261102. Detailed synthetic comparison scripts/results are retained in the workspace retirement evidence bundle.
