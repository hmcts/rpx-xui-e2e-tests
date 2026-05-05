# Local Superservice Demo

This is the repeatable local demo path for the EXUI "supertest" POC. It proves the central-assurance idea with local CCD, local EXUI, and deterministic UI integration slices.

## What This Demonstrates

- EXUI configuration can be tested centrally as a set of service-family permutations.
- We do not need to run every downstream service journey to catch EXUI-owned config regressions.
- The first useful proof is API-first, with thin UI proofs for entitlement-sensitive manage tasks and the hearings supported/unsupported family seam.

## Runtime Shape

| Port | Process | Purpose |
| --- | --- | --- |
| `3455` | EXUI static/proxy shell | Serves the built Angular shell and proxies API calls to `3001` |
| `3001` | EXUI Node API | Local EXUI API configured with `NODE_CONFIG_ENV=local-ccd-srt` |
| `8091` | Synthetic SRT shim | Local downstream seams for WA, hearings, PRD/location, T&C, and OIDC discovery |
| `4096` | Role assignment | Local CCD role-assignment service |
| `3453`, `4451`, `4452`, `4453`, `4455`, `4502`, `4506`, `5000` | CCD Docker | CCD gateway, stores, IDAM sim, S2S, DM/case-document services |

## Start The Demo Shell

Run this from `rpx-xui-e2e-tests` after CCD, the EXUI API, and the synthetic SRT shim are already running:

```bash
yarn supertest:local:shell
```

This serves `../rpx-xui-webapp/dist/rpx-exui/browser` and proxies EXUI API calls to `http://localhost:3001`.

Use this shell while Angular `ng serve` is blocked by the current local native Node startup crash. The workaround keeps the same split a developer cares about for the POC: browser shell on `3455`, Node API on `3001`, CCD and synthetic downstreams on their own local ports.

## Prove The POC

In a second terminal:

```bash
yarn supertest:local:prove
```

For a presentation-ready Odhin report:

```bash
yarn supertest:local:odhin
```

For a full validation run including lint:

```bash
yarn supertest:local:validate
```

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
- Hearings UI proof: `src/tests/integration/hearings/superServiceFamilies.positive.spec.ts`
- Lint, when running `supertest:local:validate`
- Odhin HTML, when running `supertest:local:odhin`: `test-results/supertester-poc-odhin-report/supertester-poc-odhin.html`

The API proof checks configuration, global search, WA-supported families, staff-supported families, hearings config, canary exclusions, coverage classification, and manifest/source-reference hygiene.

The manage-tasks proof checks that the available-tasks service filter exposes exactly the central WA-supported family list and excludes canary families.

The hearings proof checks one supported family (`PRIVATELAW` / `PRLAPPS`) and one unsupported hidden surface (`DIVORCE`), using deterministic route mocks until local HMC is justified.

The latest local Odhin run produced 16 passing tests with 0 failed, 0 skipped, and 0 flaky.

## Talking Point

This is not a replacement for every service's journey tests. It is a release-candidate confidence gate for EXUI-owned behaviour. Services still own true service-specific flows, but EXUI should centrally cover the shared configuration permutations it exposes to all services.
