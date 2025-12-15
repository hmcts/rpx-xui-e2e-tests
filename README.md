# RPX XUI Playwright E2E Tests

Standalone Playwright + TypeScript test suite for RPX XUI (UI and API). This replaces the deprecated `rpx-xui-webapp/playwright_tests_new` folder.

## Prerequisites
- Node.js >= 20.11
- Yarn 4 (Berry) – `corepack enable`

## Setup
```bash
yarn install
yarn setup
cp .env.example .env  # then fill with real values
```

Key env vars (see `.env.example`):
- `TEST_URL` / `API_URL`: base URLs for UI/API.
- API auth: `API_BEARER_TOKEN` or `API_USERNAME` + `API_PASSWORD` (or IDAM vars).
- UI auth: `TEST_USERS_JSON` or `UI_USERNAME` + `UI_PASSWORD`; optional `UI_USER_KEY` to select a user.
- Optional Playwright tuning: `PLAYWRIGHT_WORKERS`, `PLAYWRIGHT_RETRIES`, `PLAYWRIGHT_TIMEOUT`, `PLAYWRIGHT_EXPECT_TIMEOUT`, `SKIP_HEALTHCHECK`.
- Optional data: `API_USERS_JSON` for role-based API users, `EM_DOC_ID` for evidence-manager download smoke.
- Optional: S2S (`S2S_MICROSERVICE_NAME`, `S2S_SECRET`, `S2S_URL`) and IDAM bootstrap vars.

## Running tests
- API smoke: `PLAYWRIGHT_REPORTERS=list yarn test:api`
- UI smoke: `PLAYWRIGHT_REPORTERS=list yarn test:smoke`
- Lint: `yarn lint`

Reporters honor `PLAYWRIGHT_REPORTERS` (e.g. `list,html` or `list,junit`). Defaults: local -> `list` + `html`; CI -> `list`, `junit`, `html`, `blob`; fallback to `PLAYWRIGHT_DEFAULT_REPORTER` when set.

## Structure
- `config/` – config manager merges base/env JSON with env vars (TRI, accessibility, wiremock, reporting).
- `src/hooks/` – global setup/teardown (logs config, optional health checks).
- `src/fixtures/` – base fixtures (config/logger), API fixtures (`index.ts`), and UI fixtures (`ui.ts` with storage-state + axe autoscan).
- `src/page-objects/` – shared components/pages (EXUI).
- `src/utils/api/` – auth headers for API tests.
- `src/utils/ui/` – UI config, auth (storage state), cookies, validators, users.
- `src/tests/api/` – API specs.
- `src/tests/ui/` – UI specs (e2e/accessibility/functional) plus `auth.setup.ts` for storage-state warmup.
- `playwright.config.ts` – projects split by domain: API runs only in `api` project; UI runs in browser projects.

## Notes
- Tests skip gracefully if required credentials are not provided; global setup health checks can be disabled with `SKIP_HEALTHCHECK=1`.
- Do not commit secrets; use env vars/Key Vault in CI.
- Legacy UI suites under `src/tests/ui/E2E` and `src/tests/ui/functional-integration` are temporarily excluded from lint/ts and Playwright runs (via `testIgnore`) while they are migrated to the skeleton harness; migrate and re-enable coverage before relying on them in CI. Legacy API specs are lint-excluded until conditional assertions/`any` usage are refactored.
