# rpx-xui-e2e-tests

Playwright-based smoke/regression suite for RPX Expert UI. This repository mirrors HMCTS TCoE guidance, reuses `@hmcts/playwright-common`, and will eventually replace the Playwright suites that still live inside `rpx-xui-webapp`.

## Prerequisites

- Node.js 24.9+ (`nvm use` will pick up `.nvmrc`)
- Yarn Berry 4.x (`corepack enable` is enough on a fresh workstation)
- Browsers installed through Playwright (`yarn playwright install chromium chrome msedge firefox webkit`)
- Access to the existing RPX automation secrets stored for `rpx-xui-webapp`

## Getting Started

```bash
corepack enable
cd rpx-xui-e2e-tests
yarn install --immutable  # populates node_modules from yarn.lock
yarn playwright install chromium chrome msedge firefox webkit
cp .env.example .env      # copy values from the webapp repo / Azure Key Vault
```

All configuration keys mirror the `.env` in `rpx-xui-webapp`, so migrating secrets only requires copy/paste. Mandatory values:

- `APP_BASE_URL`, `APP_HEALTH_ENDPOINT`, `APP_API_BASE_URL`
- `IDAM_WEB_URL`, `IDAM_TESTING_SUPPORT_URL`, `IDAM_CLIENT_ID`, `IDAM_SECRET`, `IDAM_RETURN_URL`
- `S2S_URL`, `S2S_SECRET`, `S2S_MICROSERVICE_NAME`
- User credentials for case manager + judge roles

## Scripts

| Command | Purpose |
| ------- | ------- |
| `yarn lint` | Type-aware ESLint with Playwright plugin + import ordering. |
| `yarn lint:fix` | Auto-fix lint errors where safe. |
| `yarn format` / `format:check` | Prettier helpers. |
| `yarn test` | Full Playwright run across all configured browsers. |
| `yarn test:smoke` | Run specs tagged with `@smoke`. |
| `yarn test:headed` | Launches Chrome headed with the Inspector for debugging. |
| `yarn test:ui` | Playwright UI mode for filtering & debugging. |
| `yarn verify` | Convenience command: lint + formatting check + tests. |

## Project Layout

```
config/          # environment loader (aligns with rpx-xui-webapp secrets)
fixtures/        # shared Playwright fixtures + logger/API wiring
page-objects/    # placeholder POM structure (components/elements/pages)
tests/smoke/     # smoke suite (currently a health-check placeholder)
utils/           # helpers (IDAM login, data seeding, etc.)
```

## Browser & Reporter Configuration

`playwright.config.ts` registers Chromium, Chrome, Edge, Firefox, and WebKit projects. Locally we default to the `list` reporter; CI gets `dot + junit`. Override via:

```bash
PLAYWRIGHT_REPORTERS=list,html yarn test
PLAYWRIGHT_DEFAULT_REPORTER=dot yarn test
PLAYWRIGHT_JUNIT_OUTPUT=test-results/junit/results.xml yarn test --grep @smoke
```

Traces are captured on the first retry and Playwright videos are disabled unless you set `PLAYWRIGHT_VIDEO_MODE`.

## Next Steps

- Port fixtures/page objects from `rpx-xui-webapp` so we can cover login and navigation flows.
- Migrate the smoke specs (e.g. work allocation, staff search) into `tests/` and tag appropriately.
- Wire Jenkins pipelines from `tcoe-playwright-example` (build, nightly, BrowserStack/Edge installation helpers).
- Extend `config/environment.ts` with CCD + data-setup helpers used by RPX migration scripts.
