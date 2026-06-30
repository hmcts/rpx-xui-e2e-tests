# rpx-xui-e2e-tests

Expert UI E2E test suite

## XUI Assurance Harness POC

The repo also contains the XUI Assurance Harness POC for central EXUI configuration assurance.

The purpose is to prove shared EXUI behaviour centrally instead of asking every onboarded service to rerun the same broad regression pack for every EXUI change. The harness does not replace all service-owned testing. It targets the reusable EXUI contract: configured service families, Work Allocation visibility, Hearings visibility, CCD metadata shapes, accessibility baselines, and controlled red proofs.

Start with the self-contained visual explainer:

- [XUI Assurance Harness visual explainer](docs/xui-assurance-harness-visual-explainer.html)
- GitHub view after merge: [xui-assurance-harness-visual-explainer.html](https://github.com/hmcts/rpx-xui-e2e-tests/blob/master/docs/xui-assurance-harness-visual-explainer.html)

The explainer is a single HTML file. It embeds its own diagram, so it can be opened directly from the checkout, saved, or shared without a separate SVG asset.

### What the harness currently proves

- `api` lane: central EXUI configuration, supported service-family lists, historic replay packs, CCD search/workbasket metadata contracts, and mutation checks.
- `ui` lane: visible EXUI behaviour where the central contract needs screen evidence.
- `integration` lane: Manage Tasks and Hearings representative slices against the local harness runtime.
- `accessibility` lane: axe-based accessibility baseline checks on representative EXUI screens. Existing known violations are recorded explicitly; future runs fail if a change introduces unexpected violations or increases the accepted baseline.

### Local repository layout

For the local demo, keep the related HMCTS repos checked out next to each other:

```text
<workspace>/
  rpx-xui-e2e-tests/
  rpx-xui-webapp/
  ccd-docker/
  prl-ccd-definitions/        # recommended for CCD-definition evidence review
```

`rpx-xui-e2e-tests` owns the harness tests and reports. `rpx-xui-webapp` remains the EXUI source of truth. `ccd-docker` provides the local CCD stack where the local proof needs it. Service CCD definition repos, starting with PRL, provide evidence for the representative slices.

### Install

```bash
cd rpx-xui-e2e-tests
COREPACK_HOME=/private/tmp/corepack-cache yarn install
```

### Run the local demo stack

Start or reuse the local harness runtime:

```bash
COREPACK_HOME=/private/tmp/corepack-cache yarn harness:demo:keep
```

Keep that terminal open. The runtime serves the local EXUI shell, the Node API path used by the harness, and the controlled downstream seams needed for the POC.

Open the local shell if you want to show the UI target:

```bash
open http://localhost:3455/work/my-work/available
```

### Run the green proof

In a second terminal:

```bash
COREPACK_HOME=/private/tmp/corepack-cache TEST_ENV=local TEST_URL=http://localhost:3455 yarn harness:local:odhin
open test-results/harness-poc-odhin-report/harness-poc-odhin.html
```

This is the main happy-path proof. The local and CI Odhín harness runs include `API`, `UI`, `Integration`, and embedded `Accessibility` checks, plus service/jurisdiction slice badges and a dashboard slice table so reviewers can see which services, jurisdictions, and case types each harness proof covers.

### Run the EXUI-4493 installed-toolkit proof

The harness also has a focused proof for the nested complex CYA rendering defect class. This is deliberately not just a static JSON/config check. It reads the `@hmcts/ccd-case-ui-toolkit` package installed by the selected `rpx-xui-webapp` checkout, executes the relevant `ReadFieldsFilterPipe` contract, and proves that PRL-style nested complex fields with `FieldShowCondition` values still render on the CYA projection.

Run it against the default neighbouring webapp checkout:

```bash
COREPACK_HOME=/private/tmp/corepack-cache yarn harness:demo:exui4493
open test-results/exui-4493-toolkit-odhin-report/exui-4493-toolkit.html
```

Run it against a specific old or candidate webapp checkout:

```bash
XUI_WEBAPP_ROOT=/path/to/rpx-xui-webapp \
COREPACK_HOME=/private/tmp/corepack-cache \
yarn harness:demo:exui4493

open test-results/exui-4493-toolkit-odhin-report/exui-4493-toolkit.html
```

This proof does not need the full local webapp to boot. The selected webapp checkout only needs dependencies installed, because the harness is validating the toolkit dependency and CYA rendering contract that EXUI consumes.

### Run the controlled red proofs

Work Allocation service-family mutation:

```bash
COREPACK_HOME=/private/tmp/corepack-cache TEST_ENV=local TEST_URL=http://localhost:3455 yarn harness:mutation:wa
open functional-output/tests/harness/mutation-proof/odhin-report/harness-mutation-proof.html
```

Special Tribunals WA service-family mutation:

```bash
COREPACK_HOME=/private/tmp/corepack-cache TEST_ENV=local TEST_URL=http://localhost:3455 yarn harness:mutation:st-cic
open functional-output/tests/harness/mutation-proof/odhin-report/harness-mutation-proof.html
```

CCD metadata mutation:

```bash
COREPACK_HOME=/private/tmp/corepack-cache TEST_ENV=local TEST_URL=http://localhost:3455 yarn harness:mutation:ccd
open functional-output/tests/harness/ccd-mutation-proof/odhin-report/harness-ccd-mutation-proof.html
```

These commands deliberately inject a controlled fault into the observed contract. The point is to show the harness going red for the right reason, with a failure message that names the missing shared configuration or CCD metadata.

### Useful focused checks

```bash
COREPACK_HOME=/private/tmp/corepack-cache yarn harness:manifest
COREPACK_HOME=/private/tmp/corepack-cache yarn harness:release-summary
COREPACK_HOME=/private/tmp/corepack-cache yarn harness:defect-intake -- "Dropped service code BHA1 is no longer caught"
COREPACK_HOME=/private/tmp/corepack-cache yarn lint
COREPACK_HOME=/private/tmp/corepack-cache yarn playwright test --project=api src/tests/api/unit/odhin-report-enhancer.unit.api.ts
COREPACK_HOME=/private/tmp/corepack-cache yarn playwright test --project=api src/tests/api/unit/exui-toolkit-cya-contract.unit.api.ts
```

`harness:release-summary` writes `functional-output/tests/harness/release-assurance-summary.json`. It shows the current release gate status, explicit fail and warning reasons, mutation evidence status, harness proof lanes (API, UI, integration, and accessibility), and the owner slice catalogue for each service family. `harness:defect-intake` is the deterministic intake router for new defects; paste the defect title or notes after `--` and it returns the route, target harness action, and required evidence.

### Accessibility baseline approach

The harness uses `@axe-core/playwright` to attach HTML accessibility reports to the relevant Playwright test evidence. The first accessibility run found real existing issues on representative screens. Those are not hidden by disabling axe. They are modelled as a baseline:

- known existing violations are listed with a maximum accepted node count
- the test still attaches the axe report as evidence
- the test fails if a future EXUI change introduces a new violation
- the test fails if an existing violation expands beyond the accepted baseline

That gives test leads a practical way to centralise accessibility confidence for shared EXUI screens without pretending the current product has zero issues.

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
- Search and session users: `SOLICITOR_*`, `PRL_SOLICITOR_*`, `FPL_GLOBAL_SEARCH_*`, `CASEWORKER_GLOBALSEARCH_*`, `WA2_GLOBAL_SEARCH_*`, `CASEWORKER_R1_*`, `CASEWORKER_R2_*`, `STAFF_ADMIN_*`, `COURT_ADMIN_*`, `JUDGE_*`
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

The wrapped Playwright commands mirror the XUI webapp execution pattern: each suite has a raw command, a wrapped command that records a load profile, and stable Odhin output paths for local and Jenkins evidence.

Core commands:

```bash
yarn test:api
yarn test:playwright:integration
yarn test:playwrightE2E
yarn test:integration:nightly
yarn test:crossbrowser
```

Use the `:raw` variants only when you deliberately want to bypass load-profile wrapping, for example `yarn test:api:raw`.

Odhin reports are split for Jenkins publishing. You can override paths using `PLAYWRIGHT_REPORT_FOLDER` (output folder), `PW_ODHIN_TARGET` (copy target), and `PW_ODHIN_INDEX` / `PLAYWRIGHT_REPORT_INDEX_FILENAME` (index filename).

- API Odhin output (raw): `functional-output/tests/playwright-api/odhin-report`
- API Odhin publish target: `functional-output/tests/api_functional/odhin-report`
- Integration Odhin output/publish: `functional-output/tests/playwright-integration/odhin-report`
- Integration nightly Odhin output/publish: `functional-output/tests/playwright-integration-nightly/odhin-report`
- E2E Odhin output/publish: `functional-output/tests/playwright-e2e/odhin-report`

HTML and JUnit report defaults remain:

- HTML: `playwright-report/` (override with `PLAYWRIGHT_HTML_OUTPUT`)
- JUnit: `playwright-junit.xml` (override with `PLAYWRIGHT_JUNIT_OUTPUT`)

Coverage, endpoint, and load-profile artifacts:

- Coverage: `coverage/` (includes `coverage-summary.txt` and `coverage-summary-rows.json`)
- Static endpoint inventory: `coverage/api-endpoints.json`
- API runtime endpoint log: per-test `node-api-calls.json`, copied into the API Odhin endpoint tab when available
- API load profile: `functional-output/tests/api_functional/odhin-report/load-profile/load-profile.html`
- Integration load profile: `functional-output/tests/playwright-integration/odhin-report/load-profile/load-profile.html`
- E2E load profile: `functional-output/tests/playwright-e2e/odhin-report/load-profile/load-profile.html`

## Tag filters and global exclusions

The suite filters follow the webapp-style contract:

- `API_PW_INCLUDE_TAGS` / `API_PW_EXCLUDED_TAGS_OVERRIDE`
- `E2E_PW_INCLUDE_TAGS` / `E2E_PW_EXCLUDED_TAGS_OVERRIDE`
- `INTEGRATION_PW_INCLUDE_TAGS` / `INTEGRATION_PW_EXCLUDED_TAGS_OVERRIDE`
- `PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS`
- `PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES`

Use `@none` when a suite needs an explicit empty exclude set. Nightly wrappers default to `@nightly` include tags and `@none` excludes.

## Notes on API attachments

API attachments are redacted by default; set `PLAYWRIGHT_DEBUG_API=1` locally to include raw payloads in attachments.

## UI storage state controls

UI tests use pre-authenticated storage state files under `test-results/storage-states/ui/`.
You can control which users are created and whether missing/failed sessions should fail the run.

- `PW_UI_USERS` / `PW_UI_USER`: comma-separated list of UI users to pre-auth (e.g., `COURT_ADMIN`).
- `PW_UI_STORAGE`: enable/disable storage state usage (default: on).
- `PW_UI_STORAGE_STRICT=1`: fail early if storage state cannot be created (e.g., bad credentials or login error).
