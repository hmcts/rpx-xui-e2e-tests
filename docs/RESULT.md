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
- Extended current master header and case-details page objects only where the new parity assertions needed support.

## Validation
- `yarn install --immutable`
- `yarn lint`
  - result: pass with pre-existing warnings in unrelated legacy tests
- `yarn playwright test --project=integration src/tests/integration/searchCase src/tests/integration/welshLanguage --workers=1`
  - result: `26 skipped`
  - reason: local worktree does not currently have `CASEWORKER_R1_*` or `SOLICITOR_*` credentials
- `yarn playwright test --project=integration-nightly src/tests/integration/welshLanguage/welshLanguage.backend.smoke.spec.ts --workers=1`
  - result: `1 skipped`
  - reason: local worktree does not currently have `SOLICITOR_*` credentials
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
