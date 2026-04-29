# rpx-xui-e2e-tests

Expert UI E2E test suite

## Secrets and .env generation (Key Vault + get-secrets)

This repo uses the `get-secrets` helper shipped with `@hmcts/playwright-common` to populate `.env` from Azure Key Vault. The root `.env.example` is the source of truth for the env contract that gets written into `.env`.

How tagging works:
- In Key Vault, tag each secret you want in `.env` with `e2e=<ENV_VAR_NAME>`.
- The secret name does not matter; the `e2e` tag value becomes the env var name. The secret value becomes the env var value.

Recommended local flow (after `az login`):

```bash
cd /Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/rpx-xui-e2e-tests
yarn env:populate:playwright:aat
# or
yarn env:populate:playwright:demo
```

Manual equivalent:

```bash
yarn env:populate:playwright aat .env
# or
node ./node_modules/@hmcts/playwright-common/dist/scripts/get-secrets.js "rpx-aat" .env.example .env
```

What the helper does:
- Lists secrets in each vault: `az keyvault secret list --vault-name <vault> --query "[].{id:id, tags:tags}" -o json`.
- For secrets tagged with `e2e`, it fetches their values and maps `tags.e2e` → env var name.
- Reads `.env.example` and replaces any `KEY=` lines where `KEY` matches a tagged env var, then writes `.env`.

If a value stays blank in `.env`, add the `e2e=<ENV_VAR_NAME>` tag to the corresponding Key Vault secret and rerun `yarn env:populate:<env>`.

Key env vars to tag:
- `TEST_URL`, `TEST_ENV`
- `IDAM_SECRET`, `IDAM_WEB_URL`, `IDAM_TESTING_SUPPORT_URL`, `IDAM_TESTING_SUPPORT_USERS_URL`, `S2S_URL`, `S2S_MICROSERVICE_NAME`
- Dynamic-user bootstrap: `IDAM_SOLICITOR_USER_PASSWORD`, `IDAM_CASEWORKER_DIVORCE_PASSWORD`, `ORG_USER_ASSIGNMENT_*`, `TEST_SOLICITOR_ORGANISATION_ID`, `MANAGE_ORG_API_PATH`, `RD_PROFESSIONAL_API_PATH`
- Search and session users: `SOLICITOR_*`, `DIVORCE_SOLICITOR_*`, `PRL_SOLICITOR_*`, `FPL_GLOBAL_SEARCH_*`, `CASEWORKER_GLOBALSEARCH_*`, `WA2_GLOBAL_SEARCH_*`, `CASEWORKER_R1_*`, `CASEWORKER_R2_*`, `STAFF_ADMIN_*`, `COURT_ADMIN_*`, `JUDGE_*`
- Feature/parity users: `SEARCH_EMPLOYMENT_CASE_*`, `USER_WITH_FLAGS_*`, `RESTRICTED_CASE_FILE_VIEW_V1_1_ON_*`, `RESTRICTED_CASE_FILE_VIEW_V1_1_OFF_*`, `ORG_USER_ASSIGNMENT_*`
- Optional sample IDs: `WA_SAMPLE_TASK_ID`, `WA_SAMPLE_ASSIGNED_TASK_ID`, `ROLE_ACCESS_CASE_ID`, `EM_DOC_ID`, `WA_LOCATION_ID`
- The template also accepts source-style aliases such as `RESTRICTED_CASE_FILE_VIEW_V1_1_ON_USERNAME`; runtime user mapping will resolve these for `RESTRICTED_CASE_FILE_VIEW_ON` / `RESTRICTED_CASE_FILE_VIEW_OFF`
- Script wrapper: `scripts/populate-playwright-env-from-keyvault.sh`

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

HTML and JUnit report defaults remain:

- HTML: `playwright-report/` (override with `PLAYWRIGHT_HTML_OUTPUT`)
- JUnit: `playwright-junit.xml` (override with `PLAYWRIGHT_JUNIT_OUTPUT`)

Coverage and endpoint artifacts:

- Coverage: `coverage/` (includes `coverage-summary.txt` and `coverage-summary-rows.json`)
- Endpoint scan output: `coverage/api-endpoints.json`

## Notes on API attachments

API attachments are redacted by default; set `PLAYWRIGHT_DEBUG_API=1` locally to include raw payloads in attachments.

## UI storage state controls

UI tests use pre-authenticated storage state files under `test-results/storage-states/ui/`.
You can control which users are created and whether missing/failed sessions should fail the run.

- `PW_UI_USERS` / `PW_UI_USER`: comma-separated list of UI users to pre-auth (e.g., `COURT_ADMIN`).
- `PW_UI_STORAGE`: enable/disable storage state usage (default: on).
- `PW_UI_STORAGE_STRICT=1`: fail early if storage state cannot be created (e.g., bad credentials or login error).
