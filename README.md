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
- `IDAM_SECRET`, `IDAM_WEB_URL`, `IDAM_TESTING_SUPPORT_URL`, `S2S_URL`
- `S2S_MICROSERVICE_NAME` (or alias `MICROSERVICE`), optional pre-seeded `S2S_TOKEN`
- `CREATE_USER_BEARER_TOKEN`, `ORG_USER_ASSIGNMENT_BEARER_TOKEN`
- Optional assignment credential fallback: `ORG_USER_ASSIGNMENT_USERNAME` / `ORG_USER_ASSIGNMENT_PASSWORD`
- Optional assignment OAuth client override: `ORG_USER_ASSIGNMENT_CLIENT_ID` / `ORG_USER_ASSIGNMENT_CLIENT_SECRET` / `ORG_USER_ASSIGNMENT_OAUTH2_SCOPE`
- `RD_PROFESSIONAL_API_PATH` (or aliases: `RD_PROFESSIONAL_API_SERVICE`, `SERVICES_RD_PROFESSIONAL_API_PATH`)
- `TEST_SOLICITOR_ORGANISATION_ID`
- User creds: `SOLICITOR_USERNAME` / `SOLICITOR_PASSWORD`, `CASEOFFICER_R1_USERNAME` / `CASEOFFICER_R1_PASSWORD`, `CASEOFFICER_R2_USERNAME` / `CASEOFFICER_R2_PASSWORD`
- Optional sample IDs: `WA_SAMPLE_TASK_ID`, `WA_SAMPLE_ASSIGNED_TASK_ID`, `ROLE_ACCESS_CASE_ID`, `EM_DOC_ID`

## Global Token Hydration

- `src/global/ui.global.setup.ts` now hydrates missing tokens once per test run:
  - `CREATE_USER_BEARER_TOKEN` via IDAM client-credentials (`IDAM_SECRET` + IDAM URLs + client id).
  - `S2S_TOKEN` via `ServiceAuthUtils` (`S2S_URL` + `S2S_MICROSERVICE_NAME`/`MICROSERVICE`).
- For client-credentials hydration, `IDAM_OAUTH2_SCOPE` is sanitised automatically (for example `openid` is removed because it is invalid for `client_credentials` grant).
- If you already provide `S2S_TOKEN` or `CREATE_USER_BEARER_TOKEN`, setup keeps those values and skips generation.
- Optional controls:
  - `SKIP_CREATE_USER_TOKEN_SETUP=1`
  - `ALLOW_CREATE_USER_TOKEN_FAILURE=1` (defaults to allowed outside CI)
  - `SKIP_S2S_TOKEN_SETUP=1`
  - `ALLOW_S2S_TOKEN_FAILURE=1` (defaults to allowed outside CI)

## Dynamic professional user utility

- `ProfessionalUserUtils` is available via UI fixtures as `professionalUserUtils`.
- Use `createSolicitorUserForOrganisation({ organisationId })` to create an IDAM solicitor with a lean default role set and assign it to an existing organisation for test isolation.
- Names/surnames/emails are now generated with `@faker-js/faker` (still deterministic shape for existing assertions, for example `solicitor_fn_*`, `solicitor_sn_*`).
- Utility now prints parseable created-user payloads to stdout:
  - `[provisioned-user-data] {"username":"...","password":"...","roles":[...],...}`
  - This output is intended for controlled AAT debug/login usage only.
  - Default behavior: disabled.
  - Override with `PROFESSIONAL_USER_OUTPUT_CREATED_DATA=1` (force on) or `0` (force off).
  - In CI, plaintext output remains blocked unless `ALLOW_CREDENTIAL_OUTPUT_IN_CI=1` is also set.
- Default solicitor role profile is `minimal`:
  - `caseworker`
  - `caseworker-privatelaw`
  - `caseworker-privatelaw-solicitor`
  - `pui-case-manager`
- Optional role profile override: `SOLICITOR_ROLE_PROFILE=minimal|org-admin|extended` (or pass explicit `roleNames` in code).
- Optional role-context driven role resolution:
  - `SOLICITOR_TEST_TYPE=provisioning|case-create|manage-org|invite-user|finance|full-access`
  - `SOLICITOR_JURISDICTION=prl|divorce|finrem|probate|ia|publiclaw|civil|employment`
  - `SOLICITOR_CASE_TYPE=<text>` (jurisdiction can be inferred from this when possible)
  - Precedence: explicit `roleNames` -> role context (`testType` + `jurisdiction/caseType`) -> `SOLICITOR_ROLE_PROFILE`.
- User creation is executed via SIDAM/IDAM Testing Support APIs:
  - primary path: `/test/idam/users` (via `IdamUtils`)
  - fallback path: `/testing-support/accounts` on `idam-api`
- Organisation assignment bearer token resolution order:
  - `ORG_USER_ASSIGNMENT_BEARER_TOKEN`
  - generated password-grant token from `ORG_USER_ASSIGNMENT_USERNAME`/`ORG_USER_ASSIGNMENT_PASSWORD` (or existing solicitor creds), using assignment client/env overrides when present
  - `CREATE_USER_BEARER_TOKEN` fallback (last resort)
- Cleanup helper is available as `cleanupOrganisationAssignment(...)` when `userIdentifier` is returned from PRD.
- Consumer spec: `src/tests/e2e/provisioning/professionalUserProvisioning.spec.ts` (`@dynamic-user`).

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
