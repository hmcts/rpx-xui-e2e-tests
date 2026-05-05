# Result

## Status

Implemented on `test/srt-poc-local-ccd`.

## Implemented

- Added `local` test environment support.
- Added EXUI superservice scenario manifest.
- Added executable source-truth snapshot and drift gate:
  - `src/data/exui-central-assurance-source.json`
  - `yarn supertest:manifest`
- Added API proof for configuration, global search, WA-supported families, staff-supported families, canary handling, coverage classification, and hearings config.
- Added manage-tasks UI proof for available-task service-family filters.
- Added hearings UI proof for:
  - supported Private Law `PRLAPPS` hearing-manager surface
  - unsupported Divorce hearing surface hidden
- Added POC process and execution-matrix documentation.
- Added wiki-style source references to the scenario manifest so the POC can be refreshed from repo evidence.
- Added `docs/srt-poc/KNOWLEDGE_MAP.md` as the local knowledge map for future Codex/reviewer runs.
- Added a repeatable local demo shell and proof runner:
  - `yarn supertest:local:shell`
  - `yarn supertest:local:prove`
  - `yarn supertest:local:odhin`
  - `yarn supertest:local:validate`
- Added a CI-oriented runner:
  - `yarn supertest:ci`
  - CNP and nightly Jenkins stages publish Odhin and JUnit evidence as a non-blocking POC lane.
- Added a reusable workspace skill:
  - `/Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/.agents/skills/exui-central-assurance-supertester/SKILL.md`
- Added `docs/srt-poc/LOCAL_SUPERTEST_DEMO.md` and `docs/srt-poc/PRESENTATION_BRIEF.md`.
- Added repeatable Odhin reporter env support for local runs so `.env` blanks do not override report output settings.

## Validation

Current change validation:

```bash
yarn supertest:manifest
# pass: rpx-xui-webapp config matches src/data/exui-central-assurance-source.json
# pass: PRL representative case type, hearing role, and ABA5 HMC subscription anchors present

COREPACK_HOME=/private/tmp/corepack-cache yarn lint
# pass: 0 errors, existing baseline Playwright conditional-test warnings only

COREPACK_HOME=/private/tmp/corepack-cache ./node_modules/.bin/playwright test --project=api src/tests/api/exui-central-assurance.api.ts --grep "scenario manifest|source-truth snapshot|coverage decisions|hearings seam|service-family sets|shared UI route helpers|UI availability probe" --workers=1
# 8 passed

API_AUTH_MODE=form COREPACK_HOME=/private/tmp/corepack-cache ./node_modules/.bin/playwright test --project=api src/tests/api/auth-coverage-storage.api.ts src/tests/api/auth-coverage-bootstrap.api.ts --workers=1
# 10 passed

git diff --check
# pass
```

Current full local runtime evidence:

```bash
COREPACK_HOME=/private/tmp/corepack-cache yarn supertest:local:odhin
# EXUI shell, EXUI API, synthetic SRT shim, and role-assignment preflight all returned 200
# combined API/UI/integration Odhin proof: 16 passed
# flake-gate failed=0, flaky=0, skipped=0
# report: test-results/supertester-poc-odhin-report/supertester-poc-odhin.html

curl -fsS http://localhost:3001/health
curl -fsS http://localhost:8091/health
curl -fsS http://localhost:4096/health
curl -fsSI http://localhost:3455/work/my-work/available
# all healthy / 200
```

## Residual Risk

Angular `ng serve` is still blocked on this Mac by a native Node startup crash. The local demo uses the repo-owned static/proxy shell as the repeatable workaround.

The Jenkins lane is deliberately non-blocking for the POC. It should become release-blocking only after the owning EXUI/service teams agree the grouped family classifications and the CI runtime is stable.

This POC does not retire all SRT. It gives a central EXUI-owned gate for shared configuration permutations. Service teams still own service-specific CCD definitions, downstream business workflows, and true integration defects.
