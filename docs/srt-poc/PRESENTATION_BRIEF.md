# Presentation Brief

## Message

We have a working EXUI superservice POC that turns repeated downstream SRT risk into a central configuration-assurance test model.

Instead of asking each service to retest the same EXUI behaviour after every EXUI change, we model the meaningful EXUI configuration permutations once and run a focused central proof.

## What Is Tangible Now

- Machine-readable scenario manifest: `src/data/exui-central-assurance.ts`
- Source snapshot and drift gate: `src/data/exui-central-assurance-source.json`, `yarn supertest:manifest`
- API proof: `src/tests/api/exui-central-assurance.api.ts`
- Manage-tasks UI proof: `src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts`
- Hearings UI proof: `src/tests/integration/hearings/superServiceFamilies.positive.spec.ts`
- Jenkins CNP/nightly non-blocking central-assurance lane: `yarn supertest:ci`
- Local demo runner: `yarn supertest:local:shell`
- Local proof runner: `yarn supertest:local:prove`
- Odhin report runner: `yarn supertest:local:odhin`
- Full local validation: `yarn supertest:local:validate`
- Demo runbook: `docs/srt-poc/LOCAL_SUPERTEST_DEMO.md`

## Latest Evidence

- `yarn supertest:manifest`: source snapshot matches current `rpx-xui-webapp` config; PRL representative case type, hearing role, and ABA5 HMC subscription anchors present.
- `COREPACK_HOME=/private/tmp/corepack-cache yarn lint`: passed with 0 errors and existing baseline warnings only.
- Focused central-assurance API internal proof: 8 passed.
- `API_AUTH_MODE=form COREPACK_HOME=/private/tmp/corepack-cache ./node_modules/.bin/playwright test --project=api src/tests/api/auth-coverage-storage.api.ts src/tests/api/auth-coverage-bootstrap.api.ts --workers=1`: 10 passed.
- `COREPACK_HOME=/private/tmp/corepack-cache yarn supertest:local:odhin`: local runtime preflight passed, combined API/UI/integration Odhin proof 16 passed, 0 failed, 0 skipped, 0 flaky.
- Odhin report: `test-results/supertester-poc-odhin-report/supertester-poc-odhin.html`.

## The Current Matrix

| Lane | Proof | Status |
| --- | --- | --- |
| Configuration | `/external/config/ui`, `/api/configuration` | Implemented |
| Global search | `/api/globalSearch/services` | Implemented |
| Work allocation API | `/api/wa-supported-jurisdiction/get` | Implemented |
| Work allocation UI | Manage-tasks service-family filter | Implemented |
| Staff ref data | `/api/staff-supported-jurisdiction/get` | Implemented |
| Canary families | `CMC`, `HRS` excluded from release-blocking sets | Implemented |
| Hearings | supported and unsupported family pair | Implemented |
| Drift gate | Config snapshot and representative PRL source anchors | Implemented |

## Demo Flow

1. Show the manifest and explain that it is the contract for the central assurance matrix.
2. Start the shell with `yarn supertest:local:shell`.
3. Run `yarn supertest:local:odhin`.
4. Show the Odhin dashboard: 16 tests, 0 failed/skipped/flaky.
5. Explain that the UI proofs own entitlement/downstream seams by mocking `api/user/details`, WA downstream routes, and hearings downstream contracts.
6. Show `yarn supertest:manifest` as the control that stops new service-family config from silently escaping classification.

## Developer Questions To Expect

**Are we testing real EXUI or a mock?**

The shell and Node API are local EXUI. The downstreams that are not part of the first proof are synthetic or route-mocked. That is intentional because the POC is about EXUI-owned configuration behaviour, not proving WA/HMC/PRD end to end.

**Why not run every service?**

Because most repeated SRT risk here is the same EXUI config path exercised with different service-family values. The superservice matrix groups equivalent permutations and keeps weak-evidence services as canaries.

**What stops this becoming a false confidence exercise?**

The manifest records source refs back to `rpx-xui-webapp` and representative CCD definitions. Any grouped or mocked seam is documented. New service-family config fails the manifest gate until it is classified.

**What does a service team still need to test?**

Service-specific business journeys, service-specific CCD definition behaviour, and true downstream integration defects. The central proof targets EXUI-shared behaviour that services should not have to retest repeatedly.

**Why is the UI proof thin?**

It targets seams where EXUI config reaches visible behaviour: manage-task service-family filters and hearings support/hidden behaviour. Deeper downstream journey behaviour still belongs to the owning service.

**Does this mean no more SRT?**

No. It means EXUI-owned shared configuration behaviour can move to a central gate. We retire repeated SRT only lane by lane, once the CI job is stable and service owners agree the grouping is representative.

**What is next?**

Stabilise the Jenkins POC lane, agree service-family grouping with owners, and promote the first API lanes from non-blocking evidence to release-blocking gate.
