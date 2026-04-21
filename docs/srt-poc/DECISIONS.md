# DECISIONS

## 2026-04-20

1. Use `rpx-xui-e2e-tests` as the first implementation home for the initial POC.
Reason: it already has separate API, integration, and E2E layers, existing mock-route helpers for `manageTasks`, `searchCase`, and `hearings`, and audit/report outputs that fit an evidence-first POC.

2. Reject `docs-only` as the initial POC option.
Reason: it improves communication but does not generate delivery-ready proof that central EXUI assurance can replace repeated config-related SRT.

3. Reject `API contract-only` as the initial POC option.
Reason: contract checks can catch endpoint drift, but they do not prove visible EXUI behaviour, tab gating, or route-level outcomes.

4. Reject `integration-only` as the initial POC option.
Reason: integration journeys alone can overfit mocked UI behaviour and miss exact drift in service-list and bootstrap contracts that feed those journeys.

5. Reject `live-canary-heavy` as the initial POC option.
Reason: it recreates the cost pattern the POC is trying to reduce and makes the proof dependent on downstream service availability rather than central EXUI-owned behaviour.

6. Choose the initial POC shape as `hybrid scenario catalogue + exact config contract checks + thin integration slice`.
Reason: this is the smallest option that can prove both the contract seams and the rendered EXUI behaviour without expanding back into service-by-service SRT.

7. Keep the first implementation slice constrained to `Lane 1: Superservice Configuration`.
Reason: the historical back-test shows Lane 2 and Lane 3 are real EXUI-owned risks, but trying to prove all three lanes in the first implementation would broaden the POC too far.

8. Use one normalized scenario catalogue as the source of truth.
Reason: EXUI config is already expressed as overlapping service-family, case-type, role, and environment seams rather than one file per business service. A shared scenario model matches that shape better than hand-built test rows.

9. Place the scenario catalogue in `src/data/exui-central-assurance.ts`.
Reason: the catalogue is shared test data and helper logic, not a spec-local concern and not an integration-only helper.

10. Add a dedicated focused API proof file instead of expanding an unrelated broad contract suite.
Reason: the MVP needs one auditable, low-noise proof file for exact service-family assertions and guard-helper coverage.

11. Reuse the existing `manageTasks`, `searchCase`, and `hearings` helper seams.
Reason: the repo already has credible mock-route seams for the exact configuration surfaces the POC needs, so new `_helpers` folders or duplicate route setup would be avoidable debt.

12. Keep targeted API proof independent from the repo's default UI global warmup by using `PW_UI_STORAGE=0` and a cookie-backed `request.newContext()`.
Reason: the API lane should not fail just because the UI storage warmup or remote shell is unstable.

13. Place the UI-shell availability probe in `src/utils/ui/uiHostAvailability.ts`.
Reason: both the integration lane and the internal API coverage need the same utility, so it should live in a neutral shared layer rather than under integration helpers.

14. Skip the new mocked UI proofs when the shared EXUI shell returns `502`, `503`, `504`, or equivalent connectivity failures.
Reason: these tests are meant to prove centrally owned mocked UI behaviour. When the shared shell itself is unavailable, a hard failure is environmental noise rather than useful product signal.

15. Keep the result conservative until the branch is committed or pushed.
Reason: a validated local worktree is useful, but it is not the same as a reviewable published branch state.

16. Force-add the ignored traceability files under `docs/srt-poc/`.
Reason: the repo `.gitignore` excludes `PLAN.md`, `TODO.md`, `DECISIONS.md`, and `RESULT.md` by basename, but the orchestrated HMCTS SDET workflow requires those artefacts to live in the actual branch diff for auditability.

17. Rebuild `test/srt-poc` from `origin/master` and replay only the MVP commits.
Reason: the original branch name was attached to a large stacked diff. A clean reviewable branch was required before any PR-style quality verdict could be trusted.

18. Rebase the API proof onto the current `master` fixture model and keep exact assertions on `200` responses.
Reason: the stacked-branch version depended on utilities that do not exist on `master`, and the contract proof was too permissive if a `200` returned the wrong shape.

19. Reduce the UI proof to one current-master-compatible manage-tasks journey and remove the dead search/hearings specs.
Reason: the previous three mocked UI specs depended on harness files and page objects that are not present on `master`. Keeping them would have left non-runnable code in the clean branch.

20. Use authenticated API storage from `ensureStorageState("solicitor")` for the exact-contract checks instead of reading UI cookies.
Reason: the repo already maintains API storage state under `test-results/storage-states/api/`, while the previous proof was reading a missing UI cookie file and could pass on `401` without proving the contract.

21. Treat non-`200` exact-contract responses as `skip`, not `pass`.
Reason: the POC contract tests should stay honest. A guarded `401`/`403`/`502`/`504` is acceptable environmental noise for the wider suite, but it is not evidence that the exact service-family catalogue was proved.

22. Use `COURT_ADMIN` for the manage-tasks UI proof and skip when no cached UI session exists.
Reason: this checkout already carries a cached `COURT_ADMIN` UI session, while the earlier `STAFF_ADMIN` choice did not. The thin mocked UI proof should run with a real cached task-list identity or skip explicitly.

23. Add direct fake-driven coverage for the extracted helper modules in the same POC file.
Reason: `uiHostAvailability.ts` and `taskListRoutes.ts` are shared support modules introduced by the MVP. Review-clean quality requires direct deterministic coverage rather than relying only on a skipped browser proof.

24. Prove WA and staff-supported service families through the explicit `/get` node endpoints, not the base route path.
Reason: live AAT returned the EXUI HTML shell for the base paths, while the repo-backed `rpx-xui-webapp` routes show that the exact config list contract lives on `/get`.

25. Treat global-search as a normalized must-run-family proof, not an exact full-family equality proof.
Reason: the endpoint is generated from config plus live ref-data and can legitimately include additional service families or different service-id casing in the environment. The honest stable contract for this POC is shape plus presence of the central must-run set, with canaries excluded.

26. Refresh the manage-tasks UI session through `ensureUiStorageStateForUser(..., { strict: true })` and skip if navigation still lands on login or authorization barriers.
Reason: cached cookies alone were not enough to make the current proof credible. The repo already has a strict UI-session bootstrap path, and the MVP should degrade honestly when shared auth/session state is unstable.

27. Mock `api/user/details` for the manage-tasks UI proof with organisation role assignments that match the central WA family set.
Reason: the available-tasks service filter is the intersection of WA-supported services and the current user's organisation jurisdictions. Proving the central config lane against a live cached user alone would make the result drift with that user's service entitlements instead of the EXUI-owned configuration we are trying to validate.

28. Repair the repo `lint` script so `yarn lint` executes the local ESLint binary directly.
Reason: the existing script used `yarn eslint .`, which is not a valid Yarn 4 invocation in this checkout and prevented the requested baseline validation command from running to completion after TypeScript succeeded.
