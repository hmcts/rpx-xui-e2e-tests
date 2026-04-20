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

12. Keep targeted API proof independent from the repo's default UI global warmup by using `PW_SKIP_UI_GLOBAL_SETUP` and a prewarmed session-based `request.newContext()`.
Reason: the API lane should not fail just because the UI login warmup or remote shell is unstable.

13. Place the UI-shell availability probe in `src/utils/ui/uiHostAvailability.ts`.
Reason: both the integration lane and the internal API coverage need the same utility, so it should live in a neutral shared layer rather than under integration helpers.

14. Skip the new mocked UI proofs when the shared EXUI shell returns `502`, `503`, `504`, or equivalent connectivity failures.
Reason: these tests are meant to prove centrally owned mocked UI behaviour. When the shared shell itself is unavailable, a hard failure is environmental noise rather than useful product signal.

15. Keep the result conservative until the branch is committed or pushed.
Reason: a validated local worktree is useful, but it is not the same as a reviewable published branch state.

16. Force-add the ignored traceability files under `docs/srt-poc/`.
Reason: the repo `.gitignore` excludes `PLAN.md`, `TODO.md`, `DECISIONS.md`, and `RESULT.md` by basename, but the orchestrated HMCTS SDET workflow requires those artefacts to live in the actual branch diff for auditability.
