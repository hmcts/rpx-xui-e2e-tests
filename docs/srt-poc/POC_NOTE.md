# EXUI Superservice POC Note

## Purpose

This proof treats "supertest" as a superservice configuration-assurance harness, not the npm `supertest` library.

The harness lives in `rpx-xui-e2e-tests` and validates EXUI behaviour exposed by a local `rpx-xui-webapp` instance. The source of truth for service-family values remains `rpx-xui-webapp`, especially:

- `config/default.json`
- `config/custom-environment-variables.json`
- `api/configuration/**`
- `playwright_tests_new/**`
- `test_codecept/backendMock/services/ccd/**`

Representative service-definition anchors, such as `prl-ccd-definitions`, are used only to prove that the selected family/case-type/role pair is realistic.

## Local Runtime

Minimum runtime for the first proof:

- local CCD Docker stack with IDAM sim, S2S, CCD definition/data/user-profile, role assignment, DM/case-document services
- local EXUI Node API and browser shell
- this repo configured with `TEST_ENV=local` and a `TEST_URL` that points at the local Angular shell or static/proxy shell

Full local WA, HMC, PRD, location-ref-data, payment, and document-management estates are intentionally out of scope for this slice. Playwright route mocks own those downstream-specific seams.

The currently proven local MacBook split is:

- EXUI browser shell: `http://localhost:3455`
- EXUI Node API: `http://localhost:3001`
- local SRT synthetic downstream shim: `http://localhost:8091`
- CCD role assignment: `http://localhost:4096`
- CCD Docker services on their standard local ports

Use `yarn supertest:local:shell` when Angular `ng serve` is blocked locally. It serves the built EXUI shell and proxies API calls to the local Node API.

## Implemented Slice

- A central scenario manifest: `src/data/exui-central-assurance.ts`
- A source-truth snapshot: `src/data/exui-central-assurance-source.json`
- A manifest drift gate: `scripts/check-exui-supertest-manifest.mjs`
- API proof: `src/tests/api/exui-central-assurance.api.ts`
- Manage-tasks UI proof: `src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts`
- Hearings UI proof: `src/tests/integration/hearings/superServiceFamilies.positive.spec.ts`
- Local environment support in API/UI config helpers
- Manage-tasks route helper extensions for deterministic WA family bootstrap
- Jenkins CNP/nightly non-blocking POC lane using `yarn supertest:ci`
- Wiki-style source references in the scenario manifest and `docs/srt-poc/KNOWLEDGE_MAP.md`

## Scaling Model

The harness scales by classifying EXUI-owned configuration values, not by replaying every downstream service journey.

1. Refresh the source snapshot from `rpx-xui-webapp` and representative service definitions.
2. Classify every discovered service family as release-blocking, grouped, or canary.
3. Add API assertions for config contracts first.
4. Add one thin UI proof only where the config affects a visible EXUI surface.
5. Keep downstream-specific dependencies mocked until the local estate is justified.
6. Promote a lane to release-blocking only after stable CI evidence and service-owner agreement.

This reduces repeated SRT by proving shared EXUI behaviour centrally. It does not remove service-owned tests for genuine downstream workflow, CCD definition, data, or integration behaviour.

## Recommendation

Keep the POC API-first, with one thin UI proof for each user-visible config seam. Avoid a Cartesian product of all services; use must-run families, grouped families, and canaries.
