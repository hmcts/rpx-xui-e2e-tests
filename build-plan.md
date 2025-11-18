# Build Plan – `rpx-xui-e2e-tests`

This document outlines the steps to rebuild `rpx-xui-e2e-tests` from scratch using Playwright, taking proven patterns from `tcoe-playwright-example`, shared utilities from `playwright-common`, and structural ideas from `Playwright-Skeleton-Framework`. The target system under test is `rpx-xui-webapp`.

## Goals & Success Criteria
- Provide a dedicated, maintainable UI/E2E test repository for RPX Expert UI.
- Reuse HMCTS-wide Playwright conventions (`@hmcts/playwright-common`, Jenkins pipelines, tagging, reporting).
- Keep the framework modular so features from `Playwright-Skeleton-Framework` (config layering, Wiremock-ready fixtures, Docker services) can be enabled as needed.
- Migrate high-value scenarios currently stored in `rpx-xui-webapp/playwright_tests` and `playwright_tests_new` without repeated boilerplate.
- Deliver developer ergonomics: TypeScript, linting, formatting, debugging primitives, and runnable docs.

## Key References
| Repo | How it will be used |
| ---- | ------------------- |
| `tcoe-playwright-example` | Canonical HMCTS Playwright template (POM layering, fixtures, env toggles, Jenkinsfiles, logging strategy, a11y/perf add-ons). |
| `@hmcts/playwright-common` | Shared API client, logging, S2S/IdAM utilities, observability attachments. |
| `Playwright-Skeleton-Framework` | Config manager pattern (`baseConfig` + `envConfig`), Wiremock helper + Docker tooling, accessibility/performance hooks. |
| `rpx-xui-webapp` | Source of legacy Playwright specs + knowledge of RPX-specific flows, env variables, Azure resources. |

## Phase 0 – Discovery & Governance
- **Confirm requirements**: agree browser list, priority scenarios (smoke, regression, accessibility) with RPX product owners.
- **Decide toolchain**: Node 20.x + Yarn Berry, TypeScript strict mode, Playwright 1.43+, ESLint/Prettier stack from `tcoe-playwright-example`.
- **Repo hygiene**: enable branch protection, Renovate, CODEOWNERS, and GitHub templates before first commit.
- **Infrastructure contacts**: capture Key Vault names, IDAM app IDs, S2S microservice IDs, test users (draw from `rpx-xui-webapp` `.env` usage).

## Phase 1 – Bootstrap the Repository
1. Initialise the repo (`yarn init -2`), add `.editorconfig`, `.nvmrc`, `.gitignore`, `.gitattributes`.
2. Copy `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, and scripts from `tcoe-playwright-example`, keeping only essentials.
3. Install dependencies: `@playwright/test`, `@hmcts/playwright-common`, `axe-playwright`, `lighthouse`, `typescript`, `ts-node`, `eslint`, `prettier`, `lint-staged`, `husky`.
4. Set up Playwright via `yarn playwright install --with-deps`.
5. Add `README.md` with getting-started instructions tailored to RPX; point to `build-plan.md`.

## Phase 2 – Core Architecture
- **Directory layout** (adapted from `tcoe` + Skeleton):
  ```
  .
  ├── config/             # base + env config JSON, secrets placeholders
  ├── docs/               # playbook, onboarding, data strategy
  ├── page-objects/
  │   ├── components/
  │   ├── elements/
  │   └── pages/
  ├── fixtures/           # base fixtures extending @playwright/test
  ├── tests/
  │   ├── smoke/
  │   ├── regression/
  │   ├── accessibility/
  │   └── api/            # optional API smoke/regression
  ├── utils/              # idam helpers, data builders, feature flags
  ├── scripts/            # secret loading, pipeline helpers
  └── ci/                 # Jenkinsfiles, docker compose, BrowserStack config
  ```
- Create barrel exports per folder to keep imports tidy.
- Define tagging scheme: `@smoke`, `@regression`, `@a11y`, `@perf`, `@api`, `@wa` (work allocation), etc.

## Phase 3 – Configuration & Secrets
- Adopt Skeleton’s `configManager` idea: `config/baseConfig.json` (defaults), `config/envConfig.json` (checked-in dev baseline), and `CONFIG` builder merging env vars.
- Provide `.env.example` for secrets, map to Azure Key Vault names, and wrap `tcoe`’s `yarn load-secrets` script if relevant.
- Document required env vars: IDAM endpoints, S2S URLs, XUI base URLs, CCD case data, logging toggles.
- Enable Playwright projects for `chromium`, `firefox`, `webkit`, plus `tablet` viewport if needed.
- Expose CLI flags in scripts:
  - `yarn test:smoke` – `--grep "@smoke" --project=chromium`
  - `yarn test:a11y`, `yarn test:perf` – hooking into `axe` and `lighthouse`.

## Phase 4 – Shared Utilities Integration
- Link `@hmcts/playwright-common` locally during dev (`yarn link` or `portal:link` script) to avoid duplicate Playwright installs (mirroring `tcoe`).
- Wire fixtures similar to `tcoe/playwright-e2e/fixtures.ts`:
  - `logger`, `apiClient`, `capturedCalls`, `testUsers`, `s2sToken`.
  - Attach API call logs to Playwright report via `buildApiAttachment`.
- Implement global setup to pre-create IDAM users / CCD cases where possible. Use service-specific helper in `utils/data-setup.ts`.
- Bring over `ServiceAuthUtils` + `IdamUtils` usage template for login helpers shared by page objects.

## Phase 5 – Extended Capabilities
- **Accessibility**: copy `tests/accessibility` example from `tcoe`, use `@axe-core/playwright`. Tag as `@a11y`, capture violation attachments.
- **Performance**: replicate Lighthouse runner script (see `tcoe/scripts/run-lighthouse.ts`) to capture LCP/CLS budgets.
- **API + Wiremock readiness**: import Skeleton’s `wiremock-client` pattern and `StubmappingBuilder` if RPX requires service stubbing. Keep behind feature flag until infrastructure is ready.
- **Docker support**: create `docker-compose.yml` with optional `wiremock`, `restful-booker` etc. Keep instructions minimal but consistent with Skeleton.

## Phase 6 – CI/CD & Reporting
- Lift Jenkinsfiles from `tcoe-playwright-example`:
  - `Jenkinsfile_CNP` for PR/merge pipeline (install, run smoke, publish reports, archive traces).
  - `Jenkinsfile_nightly` to run tagged suites against AAT/Demo.
  - Update environment variable mapping to RPX secrets (Azure Key Vault, S2S, IDAM).
- Configure reporters via env vars: default `list`, CI `dot + junit`, optional HTML.
- Upload Playwright HTML + traces to build artifacts; optionally push JUnit to Azure DevOps / Jenkins Test Results.
- Add GitHub Actions lint/test job for faster feedback (optional).

> **Update**: `Jenkinsfile_CNP`, `Jenkinsfile_nightly`, and `.github/workflows/ci.yml` are in place. Jenkins currently runs lint + Chromium smoke, while GitHub Actions runs lint plus the public health-check spec. BrowserStack/Edge/perf/a11y stages will follow once those suites land in CI safely.

## Phase 7 – Test Migration Strategy
1. **Inventory** the specs under `rpx-xui-webapp/playwright_tests` and `playwright_tests_new`. Categorise by domain (work allocation, staff UI, accessibility).
2. **Prioritise** scenarios: start with smoke + user journeys critical for releases, then regression.
3. **Refactor**:
   - Extract reusable sections (login, navigation) into new page objects/components.
   - Convert imperative helper scripts into fixtures (`beforeEach` replaced by fixture-provided context).
   - Replace brittle selectors with `data-testid` / role locators; coordinate with webapp team to add test IDs.
4. **Data strategy**: align with CCD test data pipeline – either use API seeding from `rpx-xui-common-lib` or re-use existing CCD import scripts.
5. **Incremental migration**: keep legacy UI tests running in `rpx-xui-webapp` until the equivalent spec in the new repo is green in CI. Track parity via checklist in `docs/migration.md`.
6. **Delete old tests** only after the new repo owns the nightly pipeline and stakeholders sign off.

## Phase 8 – Quality Gates & Governance
- Define DoD for new tests (linted, tagged, recorded in report, fixtures only, no `page.waitForTimeout`).
- Add lint rules from `eslint-plugin-playwright` (`no-conditional-in-test`, `no-commented-tests`, etc.).
- Set up `vitest`/`ts-jest` for unit testing utilities and config builders.
- Document troubleshooting steps in `docs/faq.md` (secrets, tracing, debugging).
- Review plan quarterly to align with TCoE updates.

## Deliverables Checklist
- [ ] Repo initialised with configs, docs, Husky hooks.
- [ ] Playwright config aligned to HMCTS defaults.
- [ ] Fixtures + utils wired to `@hmcts/playwright-common`.
- [ ] CI pipelines in place and passing.
- [ ] Smoke + critical regression suites migrated and tagged.
- [ ] Accessibility + performance scripts ready (even if optional).
- [ ] Migration tracker documenting remaining legacy specs.
- [ ] Knowledge base / onboarding docs published.

Once the above phases are completed the RPX team will have a standalone, supportable Playwright framework that mirrors HMCTS best practice and is ready to evolve as `playwright-common` and TCoE guidance advance.

## Progress Checkpoint
| Phase | Status | Notes |
| ----- | ------ | ----- |
| 0. Discovery & Governance | ✅ Completed | Priorities + browser list agreed (desktop Chromium/Chrome/Edge/Firefox/WebKit) and repo ownership clarified. |
| 1. Bootstrap | ✅ Completed | Yarn/Node toolchain, lint/format/test scripts, Playwright config and README landed. |
| 2. Core Architecture | 🟡 In progress | Base folder structure + health smoke spec exist; page objects and tagging matrix still to flesh out. |
| 3. Configuration & Secrets | ✅ Completed | Layered config manager (`config/baseConfig.json` + `envConfig.json`) + Zod validation keep defaults + env overrides aligned. |
| 4. Shared Utilities | 🟡 In progress | `fixtures/baseTest.ts` wires logger/API client; still need login/data fixtures. |
| 5. Extended Capabilities | 🟡 In progress | Initial `tests/accessibility` (axe) + `tests/performance` (Lighthouse) suites added; need Wiremock/Docker + richer coverage. |
| 6. CI/CD & Reporting | 🟡 In progress | Jenkinsfiles + GitHub Actions added; need Jenkins wiring + BrowserStack/Edge/a11y lanes. |
| 7. Test Migration Strategy | 🟡 In progress | Inventory started in `docs/migration.md`; next step is to port high-value smoke flows. |
| 8. Quality Gates & Governance | 🟡 In progress | Husky pre-commit + doc updates landed; Vitest + expanded FAQ still pending. |

**Immediate next steps**
- Reuse the `playwright_tests_new` page objects from `rpx-xui-webapp` (or rebuild equivalent) and implement shared login/navigation helpers.
- Continue migrating the remaining legacy suites tracked in `docs/migration.md` (case list regression, URL propagation, support journeys) and tick them off as they land.
- Hook the new Jenkins + GitHub Action jobs into the RPX environments and expand them with BrowserStack/Edge/accessibility/performance coverage once those suites stabilize.
