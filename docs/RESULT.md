# EXUI-3788 Result

## Status
- Implemented on branch `test/EXUI-3788_search-welsh-parity`

## Delivered
- Added dedicated `integration` and `integration-nightly` Playwright projects.
- Added integration scripts to `package.json`.
- Added search-case integration parity coverage:
  - quick header search
  - find case filters
  - global search menu
- Added Welsh language integration parity coverage:
  - mocked translation success
  - mocked translation failure
  - backend smoke tagged `@nightly`
- Added focused route helpers, mock payload builders, and test data for this slice.
- Split extracted search route-selection logic into direct fake-driven API coverage.
- Extended current master page objects only where the new parity assertions needed support.
- Removed permissive search fallbacks:
  - header quick-search no longer falls back to direct `/search`
  - global search no longer falls back to direct `/search`
- Restored dedicated `FPL_GLOBAL_SEARCH` identity at the repo contract level, with fallback to `CASEWORKER_R1_*` env vars for current repo compatibility.
- Changed UI-session gating so missing credentials fail by default and only skip locally when `PW_ALLOW_MISSING_UI_CREDS_SKIP=1`.

## Validation
- `yarn install --immutable`
- `yarn lint`
  - result: pass with pre-existing warnings in unrelated legacy tests
- `yarn playwright test --project=api src/tests/api/coverage-search-case.api.ts`
  - result: `6 passed`
- `env PW_ALLOW_MISSING_UI_CREDS_SKIP=1 yarn playwright test --project=integration src/tests/integration/searchCase src/tests/integration/welshLanguage --workers=1`
  - result: `26 skipped`
  - reason: local worktree does not currently have `FPL_GLOBAL_SEARCH_*`/`CASEWORKER_R1_*` or `SOLICITOR_*` credentials, and skip now requires explicit local opt-in
- `env PW_ALLOW_MISSING_UI_CREDS_SKIP=1 yarn playwright test --project=integration-nightly src/tests/integration/welshLanguage/welshLanguage.backend.smoke.spec.ts --workers=1`
  - result: `1 skipped`
  - reason: local worktree does not currently have `SOLICITOR_*` credentials, and skip now requires explicit local opt-in
- `yarn get-secrets rpx-aat`
  - result: failed
  - reason: Azure Key Vault issuer mismatch in the current `az` context (`AKV10032`)
- `git diff --check`
  - result: pass

## Residual Gap
- Additional parity slices are still required after search and Welsh coverage lands.
- Live browser proof for the new specs still needs either:
  - a credentialed local rerun, or
  - CI evidence from an environment with the required UI secrets
- Local validation without credentials now proves skip behavior only when the operator opts in explicitly; it no longer proves the happy-path browser journeys themselves.
