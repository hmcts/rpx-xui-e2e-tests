# rpx-xui-e2e-tests

EXUI configuration assurance Harness, with conventional suites retained during the evidence-led migration.

## Candidate-bound Harness pilots

The dedicated Harness runs the built EXUI Angular and Node application with isolated synthetic personas and declared downstream seams. Three separate pilot policies cover WA family selection, organisation/case location scope, and nested CCD persistence/access integrity. Each requires a passing baseline and its intended failing mutation. A pilot receipt cannot authorize a full EXUI release.

Native archive runs now launch the API separately from the browser, providers and evidence writer. The API receives only the sealed application and network guard read-only, plus writable synthetic sessions and diagnostics. Observer credentials, reports, controller source and the Docker socket are absent from its mounts. Earlier same-container native observations remain diagnostic; they do not gain stronger authority retrospectively. Source review and adversarial support checks cover the replacement boundary; composed runtime acceptance is recorded separately.

The archive runtime requires Docker with the pinned Linux/arm64 images, an immutable candidate artifact, and the matching Linux/arm64 Chromium cache. Build from an exact committed webapp revision; dirty primary source and existing `dist` output are not build inputs:

```bash
yarn harness:candidate:prepare --source /path/to/rpx-xui-webapp --commit <40-character-sha> --output /path/to/fresh-candidate
yarn harness:candidate --candidate /path/to/fresh-candidate/candidate-artifact.json --browser /path/to/linux-arm64-browser-cache --output /path/to/fresh-wa-run
node scripts/prepare-harness-scope-mutant.mjs /path/to/fresh-candidate/candidate-artifact.json /path/to/fresh-scope-mutant
yarn harness:candidate --scope exui-wa-scope-pilot --candidate /path/to/fresh-candidate/candidate-artifact.json --mutant /path/to/fresh-scope-mutant/candidate-artifact.json --browser /path/to/linux-arm64-browser-cache --output /path/to/fresh-scope-run
```

Candidate preparation uses pinned Node 24.22.1 on Debian 12 and validates the source Node engine and committed Yarn release. It needs a seeded immutable Yarn cache, including Linux/arm64 optional packages. It installs/builds without network access and seals the UI, Node bundle, dependency tree, configuration, lock and Node binary. The runner verifies those bytes, reviewed configuration sources, the test dependencies and browser before execution. Uncommitted Harness inputs, unexpected destinations, missing reports, retries and unrelated teardown errors block approval. Logs and raw artifacts stay private; only the fixed-schema public summary is eligible for general publication.

The opt-in fixed-pilot job runs family baseline/fault, derives the production scope mutant, runs IA/Civil scope, then starts fresh CCD for nested/access/integrity baselines and faults:

```bash
yarn harness:candidate:ci --input /absolute/path/job.json
```

Its strict input is:

```json
{
  "schemaVersion": 1,
  "candidateManifest": "/absolute/candidate/candidate-artifact.json",
  "expectedArtifactDigest": "sha256:<independently-supplied-64-hex-digest>",
  "browserCache": "/absolute/linux-arm64-browser-cache",
  "output": "/absolute/fresh-job-output"
}
```

Use a clean committed Harness checkout and a Linux/arm64 Docker engine with the pinned native, browser and seven CCD images cached. The host controller owns Docker; containers receive no Docker socket. Missing caches, wrong platforms, dirty source, overlapping inputs/output and incomplete cleanup block. The job chooses all three fixed policies and captures independent phase expectations before gate consumption. Exit0 means those pilots passed; it grants no full EXUI release approval. Existing Jenkins/default commands remain diagnostic during cutover. Raw outputs stay under the private job directory; only the validated fixed-schema summary is public.

The OCI adapter runs an immutable registry image in its own Node/OS runtime, with the browser and provider seams in a separate container sharing an owned network namespace:

```bash
yarn harness:candidate:oci --candidate /path/to/image-candidate.json --browser /path/to/matching-linux-browser-cache --output /path/to/fresh-oci-run
```

`image-candidate.json` must identify the exact registry/repository/digest reference, source commit/tree, producer job/build/invocation, build tag, Linux platform and producer-local `observedImageId`. The image must contain `/opt/app/harness-build.json` with source/producer metadata and seals for its built UI/API, configuration, lock and build-time toolkit. Missing or mismatched metadata blocks execution. The consumer checks the actual registry digest, platform, runtime bytes and its own Docker image ID; Docker engine IDs are observations, not portable configuration-blob digests. Linux/amd64 additionally requires `--browser-runtime-image sha256:<image-id>` for an inspected matching browser runtime. Only the family pilot is supported by this adapter; scope and CCD image adapters remain explicit gaps.

The repository owns the Harness consumer and evidence checks. Producing metadata in an upstream image and enforcing receipts in another repository's release pipeline are external integration dependencies. A locally built image and loopback registry validate this consumer without granting production release approval. SIGINT/SIGTERM triggers owned-container cleanup and invalidates decision artifacts; SIGKILL or Docker daemon failure requires cleanup using the recorded owner labels.

Real CCD pilots use fresh isolated storage and source-backed synthetic definitions. The startup command records owned resources for cleanup; it refuses to overwrite an existing runtime directory:

```bash
yarn harness:ccd:start --output /path/to/fresh-ccd-runtime
yarn harness:ccd:candidate --candidate /path/to/fresh-candidate/candidate-artifact.json --ccd-state /path/to/fresh-ccd-runtime/runtime.json --browser /path/to/linux-arm64-browser-cache --output /path/to/fresh-ccd-run
yarn harness:ccd:start --stop --output /path/to/fresh-ccd-runtime
yarn harness:catalogue --webapp /path/to/rpx-xui-webapp --definitions /path/to/prl-ccd-definitions --output /path/to/source-report
```

CCD access coverage uses real RBAC with a synthetic identity provider and a separately authorised state/history observer. ABAC, identity-provider correctness and service business callbacks remain excluded. Catalogue checks report source drift, feasible pilot cells and missing runtime obligations; they do not grant release credit. See [the evidence contract](docs/harness-evidence-contract.md) for receipt and promotion checks. The [retirement ledger](docs/harness-retirement.md) records verified duplicate removals, preserved canonical outcomes and rollback boundaries. Harness support files run serially because the real network-guard and gateway probes share the fixed synthetic port3101.

Conventional suites and the existing Jenkins diagnostic command remain during migration. Retirement requires equivalent effective coverage for each consequential outcome; a missing owner gate remains a release gap. The retirement ledger records retired cases, their retained canonical outcomes, explicit compatibility limits and independent rollback commits. Useful Civil configuration coverage has been ported; still-used shared support and live expired-session assertions remain.

## XUI Assurance Harness POC

The repo also contains the XUI Assurance Harness POC for central EXUI configuration assurance.

The purpose is to prove shared EXUI behaviour centrally instead of asking every onboarded service to rerun the same broad regression pack for every EXUI change. The harness does not replace all service-owned testing. It targets the reusable EXUI contract: configured service families, Work Allocation visibility, Hearings visibility, CCD metadata shapes, accessibility baselines, and controlled red proofs.

Start with the self-contained visual explainer:

- [XUI Assurance Harness visual explainer](docs/xui-assurance-harness-visual-explainer.html)
- GitHub view after merge: [xui-assurance-harness-visual-explainer.html](https://github.com/hmcts/rpx-xui-e2e-tests/blob/master/docs/xui-assurance-harness-visual-explainer.html)

The explainer is a single HTML file. It embeds its own diagram, so it can be opened directly from the checkout, saved, or shared without a separate SVG asset.

### Existing diagnostic lanes

These legacy lanes include source/model checks and generated pages. Their reports describe diagnostic boundaries and cannot substitute for candidate/CCD pilot receipts.

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

Probate staff-supported service-family mutation:

```bash
COREPACK_HOME=/private/tmp/corepack-cache TEST_ENV=local TEST_URL=http://localhost:3455 yarn harness:mutation:probate
open functional-output/tests/harness/mutation-proof/odhin-report/harness-mutation-proof.html
```

CCD metadata mutation:

```bash
COREPACK_HOME=/private/tmp/corepack-cache TEST_ENV=local TEST_URL=http://localhost:3455 yarn harness:mutation:ccd
open functional-output/tests/harness/ccd-mutation-proof/odhin-report/harness-ccd-mutation-proof.html
```

These diagnostic commands inject faults into source/model contracts. The CCD metadata command edits definition source; it does not demonstrate persistence or denied-write integrity in a running CCD service. Their results receive no candidate release credit.

### Useful focused checks

```bash
COREPACK_HOME=/private/tmp/corepack-cache yarn harness:manifest
COREPACK_HOME=/private/tmp/corepack-cache yarn harness:unit
COREPACK_HOME=/private/tmp/corepack-cache yarn harness:release-summary # exits 2 without verified run evidence
COREPACK_HOME=/private/tmp/corepack-cache yarn harness:defect-intake -- "Dropped service code BHA1 is no longer caught"
COREPACK_HOME=/private/tmp/corepack-cache yarn lint
COREPACK_HOME=/private/tmp/corepack-cache yarn playwright test --project=api src/tests/api/unit/odhin-report-enhancer.unit.api.ts
COREPACK_HOME=/private/tmp/corepack-cache yarn playwright test --project=api src/tests/api/unit/exui-toolkit-cya-contract.unit.api.ts
```

`harness:release-summary --run <run-directory>/run.json` evaluates verified framework artifacts against the checked-in pilot policy, writes a private identity-bearing `gate.json`, and publishes only a fixed-schema summary at `functional-output/tests/harness/public/release-assurance-summary.json`. No run evidence means BLOCKED (exit 2), even when historical catalogue metadata says mutations passed. The current pilot policies cover WA family membership, organisation/case scope, and CCD nested preservation/access integrity; they cannot approve a full EXUI release. `harness:verify-gate --receipt <gate.json> --expected <deployment-expectations.json>` checks independently supplied deployment identity and the immutable receipt artifact digest. See [the evidence contract](docs/harness-evidence-contract.md) for inputs and trust boundaries. `harness:defect-intake` is the deterministic intake router for new defects; paste the defect title or notes after `--` and it returns the route, target harness action, and required evidence.

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
- API Odhin output/publish: `functional-output/tests/playwright-api/odhin-report`
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
- API load profile: `functional-output/tests/playwright-api/odhin-report/load-profile/load-profile.html`
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

### Release safeguards and current limits

The source catalogue remains available through `buildReleaseEvidenceSummary()` and the legacy `buildReleaseAssuranceVerdict()` name, but its output is explicitly `catalogue-diagnostic`, never release PASS. `releaseBlockingSourceProfiles` describes source classification; `executionGaps` records absent runtime evidence. Historic `wouldHaveCaught: null` means unverified.

The POC local/CI commands remain diagnostics. Unsupported candidate/release arguments stop before contact. CI writes raw Harness outputs into a private job-local directory and publishes only validated summary bytes. Raw HTML, traces, screenshots and JUnit are withheld from general Harness publication until sanitisation is verified. Local diagnostic reports remain available locally.

Candidate producers, real CCD persistence/access pilots and the independent denied-write observer are implemented, with evidence tied to each recorded source/run identity. Effective environment coverage, full runtime coverage of catalogue obligations, service-owner grouping acceptance and actual deployment-gate wiring remain incomplete. Catalogue labels and offline checks cannot discharge those gaps. Verified product-test retirements and their explicit limits are recorded in the retirement ledger.
