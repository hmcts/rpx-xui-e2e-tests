# RPX-XUI Standalone Playwright Framework (ExecPlan)

This ExecPlan is a living document and must be maintained in line with .agent/PLANS.md and .agent/SECURE.md. Follow the HMCTS Agents Manifest for governance, auditability, and reporter configuration (see agents.md).

## Purpose / Big Picture

Build a standalone Playwright + TypeScript test framework in rpx-xui-e2e-tests that replaces rpx-xui-webapp/playwright_tests_new. The outcome is a self-contained repo with a clear directory structure, reusable fixtures, and secure configuration so engineers can run UI, API, accessibility, and visual tests against RPX XUI with a single set of scripts and CI pipelines. Success means contributors can clone this repo, run yarn setup + yarn test:<suite>, see HTML/Odhín/JUnit reports, and onboard without touching the legacy test folder.

## Progress

- [x] (2025-12-12 14:45Z) Drafted initial ExecPlan after reviewing PLANS.md, SECURE.md, Playwright-Skeleton-Framework, prl-e2e-tests, tcoe-playwright-example, and the deprecated rpx-xui-webapp/playwright_tests_new.
- [x] (2025-12-12 15:00Z) Captured high-level legacy coverage mapping and target structure in the plan.
- [x] (2025-12-12 15:25Z) Bootstrapped tooling (package.json, tsconfig, eslint alignment, yarnrc, gitignore) and created initial config/playwright scaffolding with placeholder hooks and directory layout.
- [x] (2025-12-12 15:55Z) Added API auth utility with env-driven tokens, shared fixtures, and initial API health smoke test; lint passing.
- [x] (2025-12-12 16:25Z) Migrated initial UI helpers (config/user/cookie/validator), added UI fixtures, and added UI health smoke test; lint passing.
- [x] (2025-12-12 16:45Z) Added UI storage-state auth helper, wired fixtures to use it, and kept smoke tests lint-clean.
- [x] (2025-12-12 17:10Z) Scoped API project to API tests only, added env-gated API auth smoke, UI smoke guards, README and .env.example; lint clean.
- [ ] (TBD) Flesh out fixtures (auth/session), config validation, and migrate remaining legacy assets/page objects into the new src/ structure.

## Surprises & Discoveries

- None yet. Populate once spikes or migrations begin.

## Decision Log

- Decision: Target the Playwright-Skeleton-Framework directory layout (config/, src/{tests,fixtures,hooks,page-objects,utils,data,wiremock}, playwright.config.ts) as the baseline so newcomers can reuse established patterns. Rationale: It is the referenced best-practice skeleton and already proven in HMCTS contexts. Date/Author: 2025-12-12 / Codex.
- Decision: Use Yarn (Berry) with TypeScript ESM and linting via eslint + typescript-eslint, mirroring prl-e2e-tests and tcoe-playwright-example for consistent developer experience and cacheable CI installs. Rationale: Aligns with other HMCTS Playwright repos and simplifies shared scripts. Date/Author: 2025-12-12 / Codex.

## Outcomes & Retrospective

- Initial plan only; update this section after scaffolding and first test run are completed.

## Context and Orientation

The rpx-xui-e2e-tests repo currently contains only meta files (Jenkinsfiles copied from prl-e2e-tests, Dockerfile stub, eslint config). There is no package.json, tsconfig, or src directory. The deprecated suites live at rpx-xui-webapp/playwright_tests_new with API tests under api/, UI e2e under E2E/, integration tests under integration/, plus shared config with hardcoded user credentials in common/appTestConfig.ts and common/apiTestConfig.ts. Reference implementations to mirror are:
- Playwright-Skeleton-Framework (complete skeleton with config manager, fixtures, hooks, logging, wiremock support, and directory layout).
- prl-e2e-tests (HMCTS Playwright repo with Yarn 4, @hmcts/playwright-common, accessibility/visual tagging, Jenkins pipelines, and secrets pulled from Key Vault).
- tcoe-playwright-example (demonstrates odhin-reports, visual testing, secrets loading scripts, and structured scripts per device).
Agents guidance in agents.md mandates controllable reporters (PLAYWRIGHT_REPORTERS env), HTML/Odhín/JUnit artifacts, and security controls. SECURE.md requires least privilege, secret hygiene, validated inputs, and dependency scanning. The existing Jenkinsfile_CNP points at prl parameters and must be rewritten for RPX.

Legacy coverage to port into the new structure:
- UI E2E flows: rpx-xui-webapp/playwright_tests_new/E2E/test (smoke, createCase) with supporting page-objects and fixtures.
- Integration tests: rpx-xui-webapp/playwright_tests_new/integration/test with mocks and setup/teardown utilities.
- API specs: rpx-xui-webapp/playwright_tests_new/api/*.api.ts using shared auth/utils.
- Shared utilities: E2E/utils and integration/utils (user/config/cookie/validator), api/utils and api/auth.ts, plus common/appTestConfig.ts and common/apiTestConfig.ts (to be refactored to env-driven config without hardcoded credentials).

## Plan of Work

Start with a secure inventory: list what must be ported from rpx-xui-webapp/playwright_tests_new (API auth helpers, fixtures, page objects, E2E scenarios, integration helpers). Identify secrets and replace them with environment variables or Key Vault lookups; remove plaintext credentials from source. Capture coverage gaps and desired suites (smoke, regression, accessibility, visual, API) in this plan and/or porting-paln.md.
Design the target skeleton: adopt Playwright-Skeleton-Framework layout and config manager. Define baseConfig.json for shared defaults (timeouts, reporters, base URLs placeholders) and envConfig.json for environment-specific overrides. Provide CONFIG merging logic in config/configManager.ts and lock values as readonly. Document environment variables to keep secrets out of git; include .env.example with dummy values only.
Bootstrap repository tooling: add package.json with Yarn Berry, Node engine (>=20.x to match HMCTS repos), scripts (lint, lint:fix, test:smoke, test:regression, test:api, test:a11y, test:visual, setup), and git hooks if needed (husky optional). Add tsconfig.json aligned to TypeScript ESM strictness, eslint config aligned to eslint.config.mjs (reuse prl/tcoe rules), prettier or formatting strategy, and .gitignore/.yarnrc.yml for reproducible installs. Integrate @hmcts/playwright-common, @playwright/test, @axe-core/playwright, odhin-reports-playwright (optional), and logging (winston) similar to the skeleton.
Author Playwright config: create playwright.config.ts with projects for chromium/firefox/webkit (+ device variants if required), API project, tagged grep defaults, retries, worker counts, reporter resolution honoring PLAYWRIGHT_REPORTERS or PLAYWRIGHT_DEFAULT_REPORTER from agents.md. Wire in global setup/teardown hooks for auth state creation and cleanup. Include trace/screenshot/video configuration with secure retention guidance.
Create fixtures, hooks, and utilities: in src/fixtures build test fixtures for authenticated UI contexts (browser-context and session-storage variants), API client fixture using @hmcts/playwright-common IdAM/S2S utilities, and feature toggles. Hooks under src/hooks should manage global setup (loading env, creating auth states) and teardown (cleanup wiremock, traces). Utilities under src/utils/ui and src/utils/api should replace legacy helpers (user.utils, config.utils, api/auth.ts) with typed, test-idempotent functions that read from CONFIG and never hardcode secrets.
Structure tests and page objects: map legacy E2E/test cases to src/tests/ui/e2e (split desktop/mobile/multidevice), integration flows to src/tests/ui/functional-integration, accessibility specs to src/tests/ui/accessibility, and API specs to src/tests/api. Recreate page objects from E2E/page-objects into src/page-objects/pages and components, improving selectors and adding accessibility-friendly locators. Introduce data builders/models under src/data to replace inline fixtures. Ensure tagging (@smoke, @regression, @accessibility, @visual, @api) matches prl/tcoe conventions for suite selection.
Reporting and evidence: configure HTML and Odhín reporters with output paths documented in agents.md; add JUnit XML output for CI. Add sample commands for generating reports locally (PLAYWRIGHT_REPORTERS=list,html yarn test:smoke) and ensure reports are published in CI artifacts. Use src/log-config.ts style logger for consistent log formatting.
CI/CD and security hardening: rewrite Jenkinsfile_CNP and Jenkinsfile_nightly to reference the RPX repo, new scripts, and secrets names in Azure Key Vault. Add dependency scanning and lint/test stages. Enforce SECURE.md items: no secrets in repo, validate inputs in helpers, limit wiremock usage to non-prod, sanitize logs, and document threat mitigations in README. Consider adding security checks (npm audit or snyk) as optional pipeline stages.
Developer onboarding and docs: update README.md with setup steps, environment variable requirements, test tagging conventions, reporter guidance, and how to run against AAT/demo URLs. Add CONTRIBUTING.md if needed with coding standards and how to request secrets. Keep this plan updated with progress, discoveries, and decisions as implementation proceeds.

## Concrete Steps

Working directory: /Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/rpx-xui-e2e-tests
Enable Yarn Berry and bootstrap package metadata:
    corepack enable
    yarn set version stable
    yarn init -2 -p rpx-xui-e2e-tests
Install core dependencies (adjust versions to match playbook and lock them):
    yarn add -D @playwright/test playwright @axe-core/playwright @hmcts/playwright-common typescript typescript-eslint eslint @eslint/js eslint-plugin-playwright prettier odhin-reports-playwright winston dotenv uuid @types/node
    yarn playwright install --with-deps
Scaffold configs and linting:
    create tsconfig.json aligned to strict ESM
    create eslint.config.mjs mirroring prl-e2e-tests/tcoe-playwright-example rules
    add .gitignore, .npmrc/.yarnrc.yml as needed to avoid node_modules in git
Add framework structure:
    mkdir -p config src/{tests/ui/{e2e,functional-integration,accessibility},tests/api,fixtures,hooks,page-objects/{components,pages},utils/{ui,api},data/{builders,models},wiremock}
    create config/baseConfig.json and config/envConfig.json with safe placeholders
    implement config/configManager.ts to merge and freeze CONFIG
Playwright configuration and fixtures:
    create playwright.config.ts with projects, reporters honoring PLAYWRIGHT_REPORTERS, retries, and timeouts
    add src/hooks/global-setup.ts and global-teardown.ts for auth state and cleanup
    add src/tests/auth.setup.ts if pre-auth contexts are needed
Port legacy assets securely:
    map E2E/page-objects to src/page-objects, refactor selectors and remove flaky waits
    move E2E/utils, integration/utils, api/utils into src/utils/ui or src/utils/api with typing
    recreate tests under src/tests with proper tags; replace hardcoded credentials with env-driven fixtures using @hmcts/playwright-common IdAM/S2S helpers
Documentation and CI:
    update README.md with setup and command matrix
    rewrite Jenkinsfile_CNP and Jenkinsfile_nightly to call new yarn scripts, publish reports, and pull secrets from Key Vault (no plaintext values)

## Validation and Acceptance

After scaffolding and migration, the framework is acceptable when:
- yarn lint and yarn tsc complete with no errors.
- PLAYWRIGHT_REPORTERS=list,html yarn test:smoke runs a small tagged suite (e.g., a trivial healthcheck spec) against the target environment and produces playwright-report/index.html.
- PLAYWRIGHT_REPORTERS=list,junit yarn test:api executes representative API specs with stored auth state and saves playwright-junit.xml.
- Odhín report generation works when PW_ODHIN_START_SERVER=true PLAYWRIGHT_REPORTERS=list,odhin yarn test:smoke and produces test-results/odhin-report/playwright-odhin.html.
- Jenkins pipelines run the smoke/nightly suites, archive HTML/JUnit/Odhín reports, and pull secrets exclusively from Key Vault with no secrets present in git.
- A secret scan (e.g., trufflehog or manual rg for passwords) finds no credential material in config files or tests.

## Idempotence and Recovery

Yarn installs are deterministic under Berry; rerunning yarn install or yarn playwright install is safe. Config merges should be additive and resilient: missing env vars should fall back to baseConfig defaults without failing tests silently. Auth state generation should regenerate storage on corruption. If a test migration fails, keep the legacy copy in place while reworking the new file to avoid losing coverage. Pipelines should be rerunnable without manual cleanup; ensure teardown deletes temporary auth states and wiremock stubs.

## Artifacts and Notes

Capture mapping tables between legacy tests and new paths, sample reporter outputs, and any spikes (e.g., auth bootstrap) in this section as they are produced. Add links to report locations (playwright-report, test-results/odhin-report, playwright-junit.xml) after first runs.

## Interfaces and Dependencies

Create CONFIG in config/configManager.ts exporting a frozen object with environment, test (timeouts, reporters, wiremock flags), users, and endpoints fields. Provide fixtures in src/fixtures that extend the Playwright test with authenticatedPage, apiClient, and featureToggle helpers. Implement hooks in src/hooks/global-setup.ts and src/hooks/global-teardown.ts to prepare auth states and clean mocks. Define page objects under src/page-objects/pages/<PageName>.ts with methods returning locators and actions, plus shared components in src/page-objects/components. Utilities in src/utils/api should wrap @hmcts/playwright-common auth/token helpers and standardise HTTP clients; src/utils/ui should include session storage helpers and accessibility utilities. Tests under src/tests/** must import these fixtures and use tags (@smoke, @regression, @accessibility, @visual, @api) for suite selection. Reporting configuration must respect PLAYWRIGHT_REPORTERS and PLAYWRIGHT_DEFAULT_REPORTER per agents.md.

Revision note: 2025-12-12 – Initial ExecPlan added for RPX-XUI standalone Playwright framework.
