# Playwright API tests

Migrated API coverage from `rpx-xui-webapp/playwright_tests_new` using the shared fixtures/config in this repo.

## Prerequisites

- Node 24+ and Yarn 4 (repo defaults).
- Environment: `APP_API_BASE_URL` (or `APP_BASE_URL`), `TEST_ENV` (`aat`/`demo`/`local`), `IDAM_WEB_URL`, `IDAM_TESTING_SUPPORT_URL`, `IDAM_CLIENT_ID`, `IDAM_SECRET`, `IDAM_RETURN_URL`, `S2S_URL`, `S2S_MICROSERVICE_NAME` (`S2S_SECRET` optional).
- Users: `SOLICITOR_USERNAME`/`SOLICITOR_PASSWORD` required for most endpoints; optional `USER_CASEOFFICER_R1_USERNAME`/`USER_CASEOFFICER_R1_PASSWORD` for role-access checks.
- Optional data helpers: `WA_SAMPLE_TASK_ID`, `WA_SAMPLE_ASSIGNED_TASK_ID`, `ROLE_ACCESS_CASE_ID`, `EM_DOC_ID`, `API_AUTO_XSRF=1` (auto inject XSRF header from cookies).
- Reporting overrides: `PLAYWRIGHT_JUNIT_OUTPUT`, `PLAYWRIGHT_HTML`/`PLAYWRIGHT_HTML_OUTPUT`, `PLAYWRIGHT_JSON_OUTPUT`, `PLAYWRIGHT_ODHIN`.

## Running

- Full API suite: `yarn test tests/api --grep @api`
- Debugging: add `PLAYWRIGHT_DEBUG_API=1` to capture raw bodies; set `API_AUTH_MODE=form` to force UI login instead of token bootstrap.
- Coverage: `yarn test:api:coverage` runs the API project under c8, writes coverage to `coverage/api`, copies `coverage-summary.json` into the Odhin output folder (`$PW_ODHIN_OUTPUT` or `test-results/odhin-report` by default), injects a Coverage tab into the Odhin HTML report, and forces `PW_ODHIN_START_SERVER=0` / `PLAYWRIGHT_HTML=0` to avoid blocking servers.

## Authentication model

- `auth.ts` first attempts token + S2S bootstrap via `IdamUtils` and `ServiceAuthUtils` when secrets are present; otherwise falls back to `/auth/login` form flow.
- Storage state cached under `test-results/api/storage-states/<TEST_ENV>/<role>.json` and reused by `ApiClient` fixtures.
- XSRF headers are injected when `API_AUTO_XSRF=1` or via `withXsrf`.

## Artifacts

- API calls are attached per test as `api-calls.json` plus a pretty text variant.
- Reporter outputs respect `PLAYWRIGHT_*` env variables; HTML/JUnit/JSON destinations default to values in `config/configManager.ts` when not overridden.
