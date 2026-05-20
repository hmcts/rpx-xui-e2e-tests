# Local XUI Assurance Harness Demo

This is the repeatable local demo path for the EXUI harness POC. It proves the central-assurance idea with local EXUI and deterministic UI integration slices. Full local CCD is still available for richer slices, but the stable demo does not require the whole CCD estate.

## Fresh Checkout Path

Use the sibling repo layout expected by the scripts:

```bash
mkdir -p ~/HMCTS/dev/PROJECTS
cd ~/HMCTS/dev/PROJECTS

git clone git@github.com-hmcts:hmcts/rpx-xui-e2e-tests.git
git clone git@github.com-hmcts:hmcts/rpx-xui-webapp.git

# Optional for full CCD-backed slices and source-definition analysis
git clone git@github.com-hmcts:hmcts/ccd-docker.git
git clone git@github.com-hmcts:hmcts/prl-ccd-definitions.git
```

Install the harness repo:

```bash
cd ~/HMCTS/dev/PROJECTS/rpx-xui-e2e-tests
corepack enable
COREPACK_HOME=/private/tmp/corepack-cache yarn install --immutable
COREPACK_HOME=/private/tmp/corepack-cache yarn test:setup:playwright-install-chromium
```

Install and build local EXUI:

```bash
cd ~/HMCTS/dev/PROJECTS/rpx-xui-webapp
corepack enable
yarn install --immutable
yarn build
```

If the demo fails with `EXUI Angular build is missing`, rerun `yarn build` in `rpx-xui-webapp`.

## Optional Shared Skill

If the developer wants Codex to guide local startup and future slice work, install the shared skill from `rpx-xui-agent-skills`:

```bash
cd ~/HMCTS/dev/PROJECTS
git clone git@github.com-hmcts:hmcts/rpx-xui-agent-skills.git

cd ~/HMCTS/dev/PROJECTS/rpx-xui-agent-skills
npm link
xui-skills install --global -p codex testing xui-harness-demo
xui-skills install --global -p codex testing exui-central-assurance-harness
```

Then use:

```text
Use `xui-harness-demo`.
Spin up the XUI Assurance Harness POC locally, build anything missing, run the green Odhín proof and red mutation proof, keep the demo shell running, and return the URL and report paths.
```

## What This Demonstrates

- EXUI configuration can be tested centrally as a set of service-family permutations.
- We do not need to run every downstream service journey to catch EXUI-owned config regressions.
- The first useful proof is API-first, with thin UI proofs for entitlement-sensitive manage tasks and the hearings supported/unsupported family seam.
- Developers can now ask for a specific CCD configuration shape to be covered. The worked example is a PRL-style `serviceOfDocuments` shape with nested complex `emailInformation`, child `FieldShowCondition`, and CYA retention.

## Runtime Shape

| Port | Process | Purpose |
| --- | --- | --- |
| `3455` | EXUI static/proxy shell | Serves the built Angular shell and proxies API calls to `3001` |
| `3001` | EXUI Node API | Local EXUI API started by the demo runner, with deterministic local overrides for the POC |
| `8091` | Synthetic SRT shim | Local downstream seams for WA, hearings, PRD/location, T&C, and OIDC discovery |
| `4096` | Role assignment | Existing local role-assignment service or synthetic seam |
| `3453`, `4451`, `4452`, `4453`, `4455`, `4502`, `4506`, `5000` | CCD Docker | Optional full CCD-backed shape: gateway, stores, IDAM sim, S2S, DM/case-document services |

## Start The Demo Shell

For the normal demo, start the whole stable POC stack:

```bash
COREPACK_HOME=/private/tmp/corepack-cache yarn harness:demo:keep
```

That starts the local EXUI shell/API and deterministic local seams. Use `harness:local:shell` only when those dependencies are already running and you want to start just the static shell:

```bash
yarn harness:local:shell
```

This serves `../rpx-xui-webapp/dist/rpx-exui/browser` and proxies EXUI API calls to `http://localhost:3001`.

Use this shell while Angular `ng serve` is blocked by the current local native Node startup crash. The workaround keeps the same split a developer cares about for the POC: browser shell on `3455`, Node API on `3001`, CCD and synthetic downstreams on their own local ports.

## Prove The POC

In a second terminal:

```bash
COREPACK_HOME=/private/tmp/corepack-cache TEST_ENV=local TEST_URL=http://localhost:3455 yarn harness:local:prove
```

For a presentation-ready Odhin report:

```bash
COREPACK_HOME=/private/tmp/corepack-cache TEST_ENV=local TEST_URL=http://localhost:3455 yarn harness:local:odhin
```

To prove the gate actually goes red for a representative shared regression, without starting the full local estate:

```bash
COREPACK_HOME=/private/tmp/corepack-cache TEST_ENV=local TEST_URL=http://localhost:3455 yarn harness:mutation:wa
```

For a full validation run including lint:

```bash
COREPACK_HOME=/private/tmp/corepack-cache TEST_ENV=local TEST_URL=http://localhost:3455 yarn harness:local:validate
```

To focus only on the nested-complex CYA replay proof:

```bash
COREPACK_HOME=/private/tmp/corepack-cache ./node_modules/.bin/playwright test --project=api src/tests/api/exui-historic-replay-packs.api.ts
```

In the test output or code walkthrough, point at the assertion that flattens the CYA rows and checks:

- `sodAdditionalRecipientsList`
- `emailInformation`
- `emailInformation.emailName`
- `emailInformation.emailAddress`
- `sodAdditionalRecipientsList.serveByPostOrEmail="email"`

The runner pins local defaults:

- `TEST_URL=http://localhost:3455`
- `TEST_ENV=local`
- `API_AUTH_MODE=ui`
- `PW_UI_STORAGE=0`
- `SOLICITOR_USERNAME=exui.local.srt@hmcts.net`
- `COURT_ADMIN_USERNAME=exui.local.srt@hmcts.net`
- `HEARING_MANAGER_CR84_ON_USERNAME=exui.local.srt@hmcts.net`
- `HEARING_MANAGER_CR84_OFF_USERNAME=exui.local.srt@hmcts.net`

`API_AUTH_MODE=ui` is deliberate. It makes local API checks reuse browser-captured EXUI session cookies, including `__auth__`, which is the same authenticated shape the UI proof uses.

The runner uses per-user storage under `test-results/storage-states/ui` by default. That avoids one API user and one UI user fighting over the same session-state file inside the combined report run. Only set `PW_UI_STORAGE_PATH` manually when you are debugging one user in isolation.

## Expected Evidence

The proof should show:

- API proof: `src/tests/api/exui-central-assurance.api.ts`
- Manage-tasks UI proof: `src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts`
- Hearings UI proof: `src/tests/integration/hearings/harnessServiceFamilies.positive.spec.ts`
- Lint, when running `harness:local:validate`
- Odhin HTML, when running `harness:local:odhin`: `test-results/harness-poc-odhin-report/harness-poc-odhin.html`

The API proof checks configuration, global search, WA-supported families, staff-supported families, hearings config, canary exclusions, coverage classification, and manifest/source-reference hygiene.

The historic replay proof now also checks the developer-requested nested-complex CYA shape. That is the concrete answer to "can a service team bring us a specific definition pattern to verify?"

The manage-tasks proof checks that the available-tasks service filter exposes exactly the central WA-supported family list and excludes canary families.

The hearings proof checks one supported family (`PRIVATELAW` / `PRLAPPS`) and one unsupported hidden surface (`DIVORCE`), using deterministic route mocks until local HMC is justified.

The latest local Odhin run produced 26 passing tests with 0 failed, 0 skipped, and 0 flaky.

The mutation proof produced a green control run, then caught the injected `drop-prl-wa-family` fault with:

```text
api/wa-supported-jurisdiction/get is missing central must-run service families: PRIVATELAW
```

## Talking Point

This is not a replacement for every service's journey tests. It is a release-candidate confidence gate for EXUI-owned behaviour. Services still own true service-specific flows, but EXUI should centrally cover the shared configuration permutations it exposes to all services.

For the nested-complex CYA addition, use this phrasing:

> A developer can now bring a concrete CCD definition shape, not a whole service regression request. We trace it to source files, decide whether it creates a new EXUI interpretation shape, and add a focused central proof. That is how the harness scales without recreating SRT.
