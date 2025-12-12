# PRL Playwright Migration Plan

This plan outlines how to rebuild the `prl-e2e-tests` suite inside `rpx-xui-e2e-tests`, following the same conventions adopted from `tcoe-playwright-example`, `@hmcts/playwright-common`, and the Playwright Skeleton Framework.

## Current PRL Coverage (source: `prl-e2e-tests/e2e/tests`)

- **Manage Cases** – extensive coverage for case tabs, progression (case flags, confidentiality, notices, restricted access, Welsh language, service of applications, hearings, bundles, documents, gatekeeper flows, orders, payments, Courtnav, etc.).
- **Citizen journeys** – C100/FL401 creation flows, MIAM, emergency, mediator journeys, solicitor creation, edge cases.
- **Fixtures & utilities** – `e2e/fixtures`, `common`, `journeys`, and `pageObjects` folders contain the existing POMs, retry/table helpers, user/session config, and data builders.
- **CI tooling** – Jenkinsfiles, Docker compose, scripts already exist but rely on the older repo wiring.

## Reuse Opportunities

- **Page Objects** – translate `e2e/pageObjects/**` into `page-objects/pages/prl/**`, using Skeleton’s components → pages → journeys structure.
- **Utilities** – port `common/retry`, `table checks`, data builders, and journey helpers into `utils/prl/**`. These can extend the base helpers we’ve already established (e.g., shared retry, API clients).
- **Fixtures** – mirror the `e2e/fixtures.ts` pattern by creating PRL-specific fixtures (e.g., `prlUser`, `manageCasesJourney`) built on `fixtures/test.ts`. Wire them to `@hmcts/playwright-common` for consistent logging and API attachments.
- **Docker/Wiremock** – adopt Playwright Skeleton’s approach for optional services (wiremock, data generators) so PRL suites can run locally with the same reliability toggles.

## Implementation Blueprint

1. **Config Layer (Skeleton style)**
   - Create `config/prl/baseConfig.json` + `envConfig.json` describing Manage Cases + Citizen URLs, user identifiers, CCD case ids.
   - Use Skeleton’s `configManager` pattern so PRL suites resolve env vars consistently and can be overridden per environment.

2. **Fixtures & Journeys**
   - Extend `fixtures/test.ts` with PRL-specific fixtures (e.g., `prlCaseworker`, `prlCitizen`, `manageCasesJourney`). Wire them similarly to Skeleton’s `pageFixtures` and `utilsFixtures` (with worker-scoped lighthouse port, logger, API client).
   - Lift useful helpers from PRL repo (retry, table checks, case data) into typed util modules.

3. **Page Objects**
   - Port `e2e/pageObjects/manageCases/**` and `citizen/**` into `page-objects/pages/prl/…`, ensuring selectors use data-role/data-testid where possible.
   - Adopt Skeleton’s comment/lightweight approach: components (headers, summary lists) → pages (case list, case flags) → journeys (citizen creation, case progression).

4. **Suite Migration Order**
   1. **Manage Cases Smoke** – target a light flow (e.g., case tabs + case flags view) to validate the new fixtures.
   2. **Citizen Smoke** – port one C100 journey to exercise the citizen POMs.
   3. **Case progression flows** – add modular specs for key events (service of application, create bundle, hearing request) using the new journeys.
   4. **Regression suites** – migrate remaining specs after smoke parity, refactoring repetitive steps into journeys.

5. **Environment Toggles & Data**
   - Similar to `STAFF_SEARCH_ENABLED` / `CASE_FLAGS_ENABLED`, introduce feature flags for PRL suites (e.g., `PRL_MANAGE_CASES_ENABLED`, `PRL_CITIZEN_ENABLED`).
   - Document data dependencies (CCD case ids, user roles, Courtnav documents) in this file so env refreshes are painless. Manage Cases smoke specs should remain data-independent by creating or discovering cases dynamically via the Testing Support API rather than relying on hard-coded references.

6. **CI/CD Integration**
   - Reuse Jenkinsfiles from `tcoe-playwright-example` but add build stages for PRL-specific tags (e.g., `@prl-manage-cases`, `@prl-citizen`).
   - Ensure `PLAYWRIGHT_REPORTERS`/`PLAYWRIGHT_JUNIT_OUTPUT` env vars mirror the pattern we already use, so reports land in a consistent location.

## Immediate Next Steps

1. **Inventory Prioritisation** – finalise a list of PRL smoke candidates (one Manage Cases + one Citizen flow) and add them to `docs/migration.md` with tags.
2. **POM/Fixture scaffolding** – create `page-objects/pages/prl/**` and stub journeys so the first PRL spec can compile.
3. **Port first spec** – ✅ `tests/prl/manage-cases/case-tabs.spec.ts` checks the Manage Cases tab bar using auto-provisioned dummy cases. `tests/prl/manage-cases/service-of-application.spec.ts` now exercises the Service of Application flow end-to-end, also creating fresh data via the Testing Support API.
4. **Document data setup** – record required CCD case ids, user credentials, feature flags in `.env.example` and this plan.

Tracking PRL migration alongside RPX keeps the framework cohesive while enabling cross-project reuse of Skeleton best practices.
