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
  - Search and Welsh parity need route orchestration helpers, but this slice does not justify another shared support refactor.
  - No `_helpers` folder is introduced.

## D5: Keep existing nested `src/tests/e2e/integration` tests unchanged
- Status: Accepted
- Reason:
  - Moving legacy master tests into the new folder would add churn without increasing parity coverage.
  - This branch adds the new `src/tests/integration` tree incrementally.

## D6: Use existing credential identifiers for this slice
- Status: Accepted
- Reason:
  - clean master already provisions `SOLICITOR` and `CASEWORKER_R1` in repo config and Jenkins
  - the closed branch's `FPL_GLOBAL_SEARCH` identifier is not present on clean master
  - this keeps the first parity slice runnable without bundling extra secret-contract churn

## D7: Skip integration specs when local credentials are absent
- Status: Accepted
- Reason:
  - local validation in this worktree is currently blocked by missing UI secrets and an Azure Key Vault issuer mismatch
  - explicit skip gating keeps the suite honest locally while still allowing CI or a credentialed rerun to execute the full pack
