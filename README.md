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
- Optional: S2S (`S2S_MICROSERVICE_NAME`, `S2S_SECRET`, `S2S_URL`) and IDAM bootstrap vars.

## Running tests
- API smoke: `PLAYWRIGHT_REPORTERS=list yarn test:api`
- UI smoke: `PLAYWRIGHT_REPORTERS=list yarn test:smoke`
- Lint: `yarn lint`

Reporters honor `PLAYWRIGHT_REPORTERS` (e.g. `list,html` or `list,junit`); defaults to `PLAYWRIGHT_DEFAULT_REPORTER` or `list`.

## Structure
- `config/` – config manager merges base/env JSON with env vars.
- `src/fixtures/` – shared fixtures for API (`index.ts`) and UI (`ui.ts`).
- `src/utils/api/` – auth headers for API tests.
- `src/utils/ui/` – UI config, auth (storage state), cookies, validators, users.
- `src/tests/api/` – API specs.
- `src/tests/ui/` – UI specs (e2e/accessibility/functional).
- `playwright.config.ts` – projects split by domain: API runs only in `api` project; UI runs in browser projects.

## Notes
- Tests skip gracefully if required credentials are not provided.
- Do not commit secrets; use env vars/Key Vault in CI.
