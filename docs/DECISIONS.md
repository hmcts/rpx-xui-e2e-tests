# EXUI-3788 Decisions

## D1: Restart from clean master
- Status: Accepted
- Reason:
  - PR #10 mixed too many concerns and was no longer a credible merge vehicle.
  - Rebuilding from `origin/master` keeps the parity work reviewable.

## D2: Deliver parity in thin slices
- Status: Accepted
- Reason:
  - The full gap to `playwright_tests_new` is too large for one branch.
  - This branch carries only `searchCase` and `welshLanguage` integration parity.

## D3: Reuse current master session model
- Status: Accepted
- Reason:
  - Current master already has `ensureUiStorageStateForUser` and storage-state helpers.
  - Reusing that flow avoids reintroducing the broader session helper churn from the closed branch.

## D4: Keep new helpers focused and local to integration
- Status: Accepted
- Reason:
  - Search and Welsh parity need route orchestration helpers, but this slice does not justify a wider shared-fixture rewrite.
  - No `_helpers` folder is introduced.
  - Extracted route-selection logic is covered directly under `src/tests/api` so the split is reviewable.

## D5: Keep existing nested `src/tests/e2e/integration` tests unchanged
- Status: Accepted
- Reason:
  - Moving legacy master tests into the new folder would add churn without increasing parity coverage.
  - This branch adds the new `src/tests/integration` tree incrementally.

## D6: Preserve the source suite's dedicated search-session identifier while keeping repo compatibility
- Status: Accepted
- Reason:
  - the source parity suite uses `FPL_GLOBAL_SEARCH` as the search-session contract, so the destination repo should keep that identifier.
  - this branch maps `FPL_GLOBAL_SEARCH_*` first and falls back to `CASEWORKER_R1_*` so current repo/Jenkins environments still work without inventing a different logical user.

## D7: Missing credentials fail by default; local skip is explicit opt-in only
- Status: Accepted
- Reason:
  - default skipping can let CI go green while executing none of the new parity coverage.
  - `PW_ALLOW_MISSING_UI_CREDS_SKIP=1` is allowed only for local convenience and is disabled when `CI` is set.

## D8: Search entrypoints must stay strict
- Status: Accepted
- Reason:
  - quick-search parity only has value if it proves the real header search affordance exists and works.
  - global-search parity only has value if it proves the primary-nav search link exists and works.
  - direct `/search` fallbacks were removed from the new page-object/spec path.
