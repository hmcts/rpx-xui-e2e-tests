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

All configuration keys are now validated centrally in `config/index.ts` (Zod schema). Mandatory values fail fast on startup. To run locally:

1. Duplicate `.env.example` to `.env`.
2. Populate required secrets from Key Vault / secure store (never commit `.env`).
3. Keep any unused optional values blank; validation only enforces the required core set.

### Mandatory Variables

| Category | Keys |
|----------|------|
| App | `APP_BASE_URL`, `APP_HEALTH_ENDPOINT` |
| IDAM | `IDAM_WEB_URL`, `IDAM_TESTING_SUPPORT_URL`, `IDAM_CLIENT_ID`, `IDAM_SECRET`, `IDAM_RETURN_URL` |
| S2S | `S2S_URL`, `S2S_SECRET`, `S2S_MICROSERVICE_NAME` |
| Users | `CASEMANAGER_USERNAME`, `CASEMANAGER_PASSWORD`, `JUDGE_USERNAME`, `JUDGE_PASSWORD` |

Optional: solicitor credentials (`SOLICITOR_USERNAME` / `SOLICITOR_PASSWORD`), PRL case ID overrides (`PRL_CASE_TABS_CASE_ID`), feature toggles. Missing optional values only impact the specific PRL tests that rely on them.

> Secrets must be injected by CI (Key Vault) or developer secure channel. The repo now provides a sanitized `.env.example` with placeholders and comments to reduce accidental leakage.

### Layered defaults

Non-secret defaults now live in `config/baseConfig.json`, with environment-specific overrides in `config/envConfig.json`. The config manager merges the active environment (selected via `TEST_ENV` / `TEST_ENVIRONMENT`) on top of the base file and exposes the result as `layeredConfig`. Environment variables always take precedence, but the JSON files prevent drift between developers and offer a clear place to document safe toggles/reporting paths.

## Scripts

| Command | Purpose |
| ------- | ------- |
| `yarn lint` | Type-aware ESLint with Playwright plugin + import ordering. |
| `yarn lint:fix` | Auto-fix lint errors where safe. |
| `yarn format` / `format:check` | Prettier helpers. |
| `yarn test` | Full Playwright run across all configured browsers. |
| `yarn test:smoke` | Run specs tagged with `@smoke`. |
| `yarn test:regression` | Run specs tagged with `@regression` (under `tests/regression`). |
| `yarn test:a11y` | Execute the axe-powered accessibility suite in `tests/accessibility`. |
| `yarn test:perf` | Run @performance Lighthouse checks (Chromium-only). |
| `yarn test:headed` | Launches Chrome headed with the Inspector for debugging. |
| `yarn test:ui` | Playwright UI mode for filtering & debugging. |
| `yarn verify` | Convenience command: lint + formatting check + tests. |

## Project Layout

```
config/              # Layered config manager (base + env overrides) + env validation
fixtures/            # shared Playwright fixtures + logger/API wiring
page-objects/        # placeholder POM structure (components/elements/pages)
tests/accessibility/ # dedicated axe suite tagged @a11y
tests/performance/   # Lighthouse flows tagged @performance
tests/regression/    # negative & parity checks tagged @regression
tests/smoke/         # smoke suite
utils/               # helpers (IDAM login, data seeding, etc.)
ci/                  # documentation for Jenkins/GitHub pipeline usage
```

## Browser & Reporter Configuration

`playwright.config.ts` registers Chromium, Chrome, Edge, Firefox, and WebKit projects. Locally we default to the `list` reporter; CI gets `dot + junit`. Override via environment variables (`PLAYWRIGHT_REPORTERS`, `PLAYWRIGHT_DEFAULT_REPORTER`). Examples:

```bash
PLAYWRIGHT_REPORTERS=list,html yarn test
PLAYWRIGHT_DEFAULT_REPORTER=dot yarn test
PLAYWRIGHT_JUNIT_OUTPUT=test-results/junit/results.xml yarn test --grep @smoke
```

Traces are captured on the first retry and Playwright videos are disabled unless you set `PLAYWRIGHT_VIDEO_MODE`.

## Configuration & Secrets

Central validation lives in `config/index.ts`:

```ts
import { environment, prlConfig } from './config';
// environment: core service + role credentials
// prlConfig: PRL-specific values (solicitor, case overrides)
```

The loader uses `dotenv` plus a Zod schema. It throws with a grouped error list if any mandatory values are missing or invalid. This replaces dispersed `requireEnv` helpers and prevents partial or inconsistent state.

Secret hygiene:

- `.env` is gitignored; only `.env.example` is tracked with placeholders.
- Never add real passwords, tokens, or subscription keys to example files.
- Consider adding secret scanning (Gitleaks / TruffleHog) to CI as a follow-up.
 - A lightweight pre-flight scanner is available via `yarn scan:secrets` to catch obvious leaks.

### Path Aliases

TypeScript path aliases are provided for cleaner imports:

| Alias | Resolves To |
|-------|-------------|
| `@config/*` | `config/*` |
| `@pages/*` | `page-objects/*` |
| `@utils/*` | `utils/*` |
| `@fixtures/*` | `fixtures/*` |

Example:

```ts
import { environment } from '@config';
import { CaseListPage } from '@pages/pages/exui/caseList.po';
import { config } from '@utils/config.utils';
```

Legacy modules (e.g. `utils/config.utils.ts`) have shims to the centralized config and will be removed after full migration.

### Storage State Authentication (Optional Performance Boost)

Generate authenticated storage states for faster test startup:

```bash
yarn auth:generate-storage   # creates storage/caseManager.json & storage/judge.json
USE_STORAGE_STATE=1 yarn test --project=chromium --grep @smoke
```

When `USE_STORAGE_STATE=1` is set, Playwright will reuse the saved cookies/session instead of performing a full interactive login. Regenerate states whenever credentials rotate.

### Dynamic User Provisioning (Scaffold)

`utils/dynamicUser.ts` provides a `createTempUser` stub for future integration with the IDAM testing support API. Replace the placeholder implementation with an API POST once the endpoint contract is confirmed. For now, fallback helpers (`getStaticRoleUser`) expose existing static credentials.

### Pre-Commit Guardrails

Husky enforces three quick checks before every commit:

1. `yarn scan:secrets` – runs the local secret scanner (scripts/secret-scan.js).
2. `yarn lint` – full ESLint run with max warnings set to zero.
3. `yarn format:check` – ensures Prettier formatting.

```bash
git add .
git commit -m "feat: add new tests"  # triggers .husky/pre-commit
```

For deeper scanning, layer Gitleaks/TruffleHog in Jenkins/GitHub Actions.

## CI/CD

Two Jenkins pipelines live in the repo:

- `Jenkinsfile_CNP` – PR/branch safety net that installs dependencies, lints, and runs the Chromium smoke suite (`yarn test:smoke --project=chromium`). Reports are archived via the Playwright HTML output plus JUnit results.
- `Jenkinsfile_nightly` – cron-triggered nightly (weekdays 22:00 UTC by default) with parameters for base URL, browser, tags, and worker count. By default it runs the tagged smoke suite on Chromium but can be pointed at any Playwright project and additional tag combinations.

Both pipelines load `IDAM_SECRET` / `S2S_SECRET` from Key Vault and now populate the unified set consumed by `config/index.ts`. User credentials are still sourced (temporarily) from the legacy `config/appTestConfig.js` until dynamic user provisioning is implemented.

Additionally, `.github/workflows/ci.yml` runs on pushes/PRs to provide fast feedback (lint + the public health-check spec using Chromium with safe placeholder environment variables). Extend this workflow as more suites become self-contained.

## Next Steps

- Reuse the richer fixtures/page objects from `rpx-xui-webapp/playwright_tests_new` so login/navigation helpers no longer rely on the legacy config.
- Continue migrating the remaining regression suites (case list, URL propagation, support flows) and tick them off in `docs/migration.md`.
- Replace `config/appTestConfig.js` static credentials with dynamic user creation backed by IDAM testing-support APIs.
- Expand CI (Jenkins + GitHub Actions) to run the new @regression/@a11y/@performance suites once data prerequisites are solved.
- Add Vitest/unit coverage for config helpers + utilities and document the troubleshooting/FAQ section promised in the build plan.
- Extend the consolidated config with CCD/data seeding helpers and eventually drop the compatibility shim in `utils/config.utils.ts`.
