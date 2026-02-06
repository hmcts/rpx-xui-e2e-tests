# rpx-xui-e2e-tests

Expert UI E2E test suite

## Secrets and .env generation (Key Vault + get-secrets)

This repo uses the `get-secrets` helper shipped with `@hmcts/playwright-common` to populate `.env` from Azure Key Vault.

How tagging works:

- In Key Vault, tag each secret you want in `.env` with `e2e=<ENV_VAR_NAME>`.
- The secret name does not matter; the `e2e` tag value becomes the env var name. The secret value becomes the env var value.

How to fetch secrets locally (after `az login`):

```bash
cd /Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/rpx-xui-e2e-tests
# optional: clear old env
rm -f .env
# default: reads .env.example, writes .env, uses vault rpx-aat
yarn get-secrets rpx-aat
# or multiple vaults, explicit paths:
node ./node_modules/@hmcts/playwright-common/dist/scripts/get-secrets.js "rpx-aat,another-vault" .env.example .env
```

What the helper does:

- Lists secrets in each vault: `az keyvault secret list --vault-name <vault> --query "[].{id:id, tags:tags}" -o json`.
- For secrets tagged with `e2e`, it fetches their values and maps `tags.e2e` → env var name.
- Reads `.env.example` and replaces any `KEY=` lines where `KEY` matches a tagged env var, then writes `.env`.

If a value stays blank in `.env`, add the `e2e=<ENV_VAR_NAME>` tag to the corresponding Key Vault secret and rerun `yarn get-secrets <vault>`.

Key env vars to tag:

- `TEST_URL`, `TEST_ENV`
- `IDAM_SECRET`, `IDAM_WEB_URL`, `IDAM_TESTING_SUPPORT_URL`, `S2S_URL`, `S2S_MICROSERVICE_NAME`
- User creds: `SOLICITOR_USERNAME` / `SOLICITOR_PASSWORD`, `CASEOFFICER_R1_USERNAME` / `CASEOFFICER_R1_PASSWORD`, `CASEOFFICER_R2_USERNAME` / `CASEOFFICER_R2_PASSWORD`
- Optional sample IDs: `WA_SAMPLE_TASK_ID`, `WA_SAMPLE_ASSIGNED_TASK_ID`, `ROLE_ACCESS_CASE_ID`, `EM_DOC_ID`

## Playwright suite updates

- Adopted `@hmcts/playwright-common` defaults and helpers for retries/backoff, viewport defaults, safer API attachments, and coverage/endpoint reporting utilities.
- Ported Playwright API and UI suites from `rpx-xui-webapp` (coverage/contract tests, work-allocation helpers, and case flags UI).
- Case flags UI tests are gated by credentials for `SEARCH_EMPLOYMENT_CASE` and `USER_WITH_FLAGS` (tests only run when those users are available).
- Config coverage tests exercise `playwright.config.ts`, `src/config/api.ts`, and `src/utils/ui/config.utils.ts` helpers.

## Reporting outputs (API vs UI)

Odhin reports are split for Jenkins publishing. You can override paths using `PLAYWRIGHT_REPORT_FOLDER` (output folder) and `PW_ODHIN_TARGET` (copy target).

- API Odhin output (raw): `functional-output/tests/playwright-api/odhin-report`
- API Odhin publish target: `functional-output/tests/api_functional/odhin-report`
- UI Odhin output/publish: `functional-output/tests/playwright-e2e/odhin-report`
- Integration Odhin output/publish: `functional-output/tests/playwright-integration/odhin-report`

Odhin release/branch metadata:

- `release` uses `PLAYWRIGHT_REPORT_RELEASE` then `PW_ODHIN_RELEASE` if set.
- If not set, release is built as `<package.version> | branch=<resolved-branch>`.
- Branch resolution order: `CHANGE_BRANCH`, `BRANCH_NAME`, `GITHUB_HEAD_REF`, `GITHUB_REF_NAME`, `GIT_BRANCH`, `BUILD_SOURCEBRANCHNAME`, then local git (`git rev-parse --abbrev-ref HEAD`), then `local`.
- `refs/heads/` and `origin/` prefixes are stripped automatically.

HTML and JUnit report defaults remain:

- HTML: `playwright-report/` (override with `PLAYWRIGHT_HTML_OUTPUT`)
- JUnit: `playwright-junit.xml` (override with `PLAYWRIGHT_JUNIT_OUTPUT`)

Coverage and endpoint artifacts:

- Coverage: `reports/tests/coverage/api-playwright/` (includes `coverage-summary.txt` and `coverage-summary-rows.json`)
- Endpoint scan output: `coverage/api-endpoints.json`

## Notes on API attachments

API attachments are redacted by default; set `PLAYWRIGHT_DEBUG_API=1` locally to include raw payloads in attachments.

## UI storage state controls

UI tests use pre-authenticated storage state files under `test-results/storage-states/ui/`.
You can control which users are created and whether missing/failed sessions should fail the run.

- `PW_UI_USERS` / `PW_UI_USER`: comma-separated list of UI users to pre-auth (e.g., `COURT_ADMIN`).
- `PW_UI_STORAGE`: enable/disable storage state usage (default: on).
- `PW_UI_STORAGE_STRICT=1`: fail early if storage state cannot be created (e.g., bad credentials or login error).

## Test project split

- UI suite runs under project `ui`.
- Integration suite runs under project `integration` and excludes `@nightly` tests.
- Nightly-only integration smoke runs under project `integration-nightly` and includes only `@nightly` tests.
- Welsh language coverage is split into:
  - Stable mocked integration test (PR-safe):
    - `src/tests/e2e/integration/welshLanguage/welshLanguage.positive.spec.ts`
  - Real backend translation smoke (nightly-only):
    - `src/tests/e2e/integration/welshLanguage/welshLanguage.backend.smoke.spec.ts`
- API coverage/contract tests run under project `api`.
- Translation endpoint contract coverage:
  - `src/tests/api/translation-endpoint.api.ts`

## Script reference

Linting:

- `yarn lint` → `yarn lint:prettier && yarn lint:src && yarn lint:api`
- `yarn lint:src` / `yarn lint:src:fix`
- `yarn lint:api` / `yarn lint:api:fix`
- `yarn lint:test`
- `yarn lint:prettier` / `yarn lint:prettier:fix`
- `yarn lint:ng` (no-op message; no Angular workspace in this repo)

Playwright execution:

- `yarn test:ui` (project `ui`)
- `yarn test:ui:smoke` (project `ui`, `--grep @smoke`)
- `yarn test:integration` (project `integration`)
- `yarn test:integration:nightly` (project `integration-nightly`, intended for non-blocking nightly runs)
- `yarn test:api` (project `api`)
- `yarn test:api:ci`
- `yarn test:api:html`
- `yarn test:api:coverage` (alias to `yarn test:api:pw:coverage`)
- `yarn test:api:pw`
- `yarn test:api:pw:coverage`

Compatibility aliases (aligned with `rpx-xui-webapp` naming):

- `yarn test:playwrightE2E` (wraps `yarn test:ui`)
- `yarn test:playwright:integration` (wraps `yarn test:integration`)
