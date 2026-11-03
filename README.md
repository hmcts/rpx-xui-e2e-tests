# EXUI Assurance Harness

Central assurance for EXUI configuration, role, definition and data-integrity behaviour. Ordinary product API, integration and E2E regression belongs in [rpx-xui-webapp](https://github.com/hmcts/rpx-xui-webapp). The [retirement ledger](docs/harness-retirement.md) records duplicate removals, explicit product-scope withdrawals and rollback commits.

## Install and check the Harness

For development and validation, use the Node version pinned in `.nvmrc` and the Yarn version declared by `packageManager` in package.json.

```bash
yarn setup
yarn lint
yarn harness:support
yarn harness:diagnostic
```

Bare `yarn playwright test` also selects portable model diagnostics. Setup installs project dependencies and Chromium; it does not fetch AAT credentials. `lint` checks Harness runtime/evidence code, CI contracts, TypeScript and ESLint. `harness:support` explicitly selects retained support tests, without global session warmup. Its generated-DOM report check needs Chromium. `harness:diagnostic` defaults to portable model checks.

## Candidate-bound fixed job

The native runner starts the built Angular/Node candidate with isolated synthetic personas and declared downstream seams. Fixed policies cover WA family selection, organisation/case location scope, and real CCD nested persistence/access integrity. Every policy requires its baseline and intended failing mutations. The postal extension adds two-recipient validation/CYA/edit/readback plus loss of one optional child.

Prepare a clean committed Harness checkout, sealed candidate manifest, matching Linux/arm64 browser cache and cached pinned Docker images. The current native build uses Node 24.22.1 / Debian 12; the host controller verifies actual candidate, dependency, browser and source bytes. Missing inputs, wrong platforms, dirty source, retries, undeclared destinations, incomplete reports or cleanup block admission.

Create a fresh job JSON using exactly these keys:

```json
{
  "schemaVersion": 1,
  "candidateManifest": "/absolute/candidate/candidate-artifact.json",
  "expectedArtifactDigest": "sha256:<independently-declared-artifact-digest>",
  "browserCache": "/absolute/linux-arm64-browser-cache",
  "output": "/absolute/fresh-job-output"
}
```

```bash
yarn harness:candidate:ci --input /absolute/job.json
```

The job runs family baseline/fault, derives the scope mutant, runs IA/Civil scope, then starts fresh CCD for nested/access/integrity/postal baselines and faults. It owns cleanup and captures independent expectations before consuming receipts. The strict job input cannot supply a catalogue, proof status or selected subset.

The native API runs separately from browser/providers/evidence writing. It receives read-only sealed application/guard files and writable synthetic sessions/diagnostics. Observer credentials, reports, controller source and Docker socket are absent from its mounts. Containers receive no Docker socket; the host owns lifecycle and recovery.

The current c024fa3 postal run is BLOCKED at the mandatory-child check and receives zero catalogue execution credit. See [current assurance gaps](docs/harness-known-gaps.md) for the observed constraint and owner action.

A fixed-pilot PASS grants no full EXUI release approval. The portable source catalogue contains 112 obligations, including an unproved PCS routing shape. Adding the two routing configuration keys replaces 13 profile IDs; the other 98 obligation objects remain unchanged. Only the exact postal sequence is eligible for the receipt-to-catalogue mapping; an accepted postal phase would leave 111 runtime obligations missing. Source classification, model tests and screenshots do not discharge those gaps. Effective deployed profiles, service-owner grouping acceptance, external owner gates and promotion wiring remain incomplete.

## Focused candidate and CCD execution

```bash
yarn harness:candidate --scope exui-wa-family-pilot --candidate /absolute/candidate/candidate-artifact.json --browser /absolute/browser-cache --output /absolute/fresh-family-run
yarn harness:candidate --scope exui-decentralised-routing-pilot --candidate /absolute/candidate/candidate-artifact.json --browser /absolute/browser-cache --output /absolute/fresh-routing-run
yarn harness:candidate --scope exui-global-search-pilot --candidate /absolute/candidate/candidate-artifact.json --browser /absolute/browser-cache --output /absolute/fresh-global-search-run
node scripts/prepare-harness-hearing-mutant.mjs /absolute/candidate/candidate-artifact.json /absolute/fresh-hearing-derived
yarn harness:candidate --scope exui-hearing-publication-pilot --candidate /absolute/candidate/candidate-artifact.json --mutant /absolute/fresh-hearing-derived/candidate-artifact.json --browser /absolute/browser-cache --output /absolute/fresh-hearing-run
yarn harness:ccd:start --output /absolute/fresh-ccd-runtime
yarn harness:ccd:candidate --candidate /absolute/candidate/candidate-artifact.json --ccd-state /absolute/fresh-ccd-runtime/runtime.json --browser /absolute/browser-cache --output /absolute/fresh-ccd-run
yarn harness:ccd:start --stop --output /absolute/fresh-ccd-runtime
```

The separate native routing pilot checks rendered Create/Start redirects, local fallbacks and per-case NoC session routing across three fixed loopback origins. It requires both baselines and the two intended configuration-omission failures. It is not part of the fixed CI sequence and cannot credit the aggregate routing catalogue obligation or a full release. The clean `9586cf4` local run passed both baselines and both intended omission witnesses; see the assurance gaps for its exact limits.

The separate native Global Search pilot proves configuration composition through the actual Node services handler, rendered Services selector and submitted All-search request. It requires a valid nine-service baseline and a valid WA-seven submission followed by the intended scope failure. The clean `121f213` local run passed; synthetic reference labels, empty search results and the auxiliary jurisdiction response are declared seams. It grants no live-profile, search-result, access, cache-algorithm or full-release credit and is outside the fixed CI sequence.

The separate Hearing publication pilot checks actual Node GET `/external/config/ui`: prod enables four families while amendments enable two. The preparer creates a fresh sealed derivative by replacing only the compiled amendment-data literal with the candidate enabled map; both artifacts retain the same effective configuration. The clean `c27aa87` local run passed the baseline and detected the valid four/four response only at the intended amendment-map assertion. Its accepted receipt is `sha256:a5a07e408c84d7e5e4d206c6af6eebc58eb4a19ff4c2d015a8cf5149feafaf1a`. This is publication-only evidence, outside the fixed CI sequence: no UI, axe, role, deployed-profile, catalogue112 or full-release credit. The former frontend diagnostics and their generic predicates are explicitly retired; this later cleanup does not change the tested source identity.

The combined job owns its CCD startup/shutdown automatically. Manual CCD runs require the matching stop command and recorded ownership. SIGINT/SIGTERM invokes owned cleanup; daemon failure or SIGKILL requires recovery from the recorded owner labels. Do not delete unrelated containers.

CCD uses fresh isolated storage, source-backed synthetic definitions, real RBAC, synthetic identities and a separately authorised state/history observer. ABAC, identity-provider correctness and service business callbacks remain outside these pilots. The fixture retains original PRL revision/workbook provenance; synthetic Harness roles/case types are not credited as actual PRL authorization cells.

The OCI adapter runs an immutable image in its own Node/OS:

```bash
yarn harness:candidate:oci --candidate /absolute/image-candidate.json --browser /absolute/matching-browser-cache --output /absolute/fresh-oci-run
```

It requires registry digest, source/producer identity and sealed `/opt/app/harness-build.json` metadata. Linux/amd64 additionally needs an inspected matching `--browser-runtime-image sha256:<image-id>`. This adapter currently supports the family policy only; OCI scope/CCD and upstream producer/promotion integration remain gaps.

## Private phase evidence

The opt-in exporter preserves a finalized native phase, including raw reports, journals and lifecycle records. Its destination parent must already exist, belong to the invoking user and have no group/other permissions. Each export uses a fresh directory; it never uploads evidence or changes Jenkins archives.

```bash
yarn node scripts/export-exui-private-evidence.mjs export --phase /absolute/finalized-phase --expected /absolute/independent-expectations.json --terminal /absolute/observed-terminal.json --destination /approved-private/fresh-phase-bundle
yarn node scripts/export-exui-private-evidence.mjs verify --bundle /approved-private/fresh-phase-bundle --expected /absolute/independent-expectations.json --manifest-digest 'sha256:<independently-delivered-manifest-digest>'
```

Supply trusted supervisor observations and independent identity/receipt expectations, not values inferred from the checked bundle. Preserve the returned manifest digest through a separate trusted handoff. Export/verify exit 0 means packet integrity; the original PASS/FAIL/BLOCKED status is reported separately. Use the existing release-gate consumer for its original outcome. See the [packet contract](docs/harness-evidence-contract.md#private-native-phase-evidence-packets).

Only complete native phases are supported. Whole-job orchestration, interrupted/malformed forensic capture, OCI and durable private storage remain gaps; the exporter does not establish CI retention or release approval.

## Supporting diagnostics

| Command | Evidence boundary |
|---|---|
| `yarn harness:diagnostic` | Portable catalogue/model checks; no candidate or service execution credit |
| `yarn harness:diagnostic:environment` | Five configuration requests against an explicitly selected environment |
| `yarn harness:diagnostic:toolkit` | Contract extracted from an explicitly selected installed toolkit class |

Environment selection requires explicit `TEST_URL`, `TEST_ENV` and `IDAM_WEB_URL`; it does not default to AAT. Environment probes use UI-session authentication and reject a conflicting explicit authentication mode. Provide only their retained personas through approved secret/session management. The toolkit selection requires an absolute `XUI_WEBAPP_ROOT` containing the installed package. Portable model and extracted-class checks are separate from real Angular/CCD execution; the generated WA/CYA browser illustrations have retired.

Local diagnostics run portable models followed by five environment probes against an explicitly prepared loopback target. No legacy frontend diagnostic remains. Candidate-bound native runs use their own fixed configuration and evidence. Retained session, authentication, reporter and toolkit support tests do not establish a product suite or stronger evidence boundary.

## Source coverage and receipts

```bash
yarn harness:catalogue --webapp /absolute/rpx-xui-webapp --definitions /absolute/prl-ccd-definitions --output /absolute/source-report
RPX_XUI_WEBAPP_DIR=/absolute/rpx-xui-webapp PRL_CCD_DEFINITIONS_DIR=/absolute/prl-ccd-definitions HARNESS_MANIFEST_EXTERNAL_SOURCE_MODE=strict yarn harness:manifest
yarn harness:defect-intake -- "defect title and bounded notes"
```

External-checkout source inspection requires the actual selected source paths. The native fixed job uses committed reviewed projections and separate byte/revision/row pins; it does not silently refresh upstream sources. The legacy manifest reports source drift separately from required assurance gaps. PCS membership is required. Its Java SDK/decentralised source owner and base case type are pinned, but definition generation/import, deployed suffix and runtime assurance remain unproved. The profile stays config-backed and its required gap remains unaccepted.

The source diagnostic also reads the pinned chart metadata and base/AAT/preview values files. It reports15 selected environment keys per profile with explicit presence, source provenance and runtime gaps, including nine unreviewed preview families. Missing or changed source pins block validation. These source-only profiles neither change the112 obligation objects nor prove deployed values or profile equivalence.

The shared evaluator recomputes raw framework evidence and receipts. `harness:verify-gate` consumes a receipt with independently supplied expected identity and immutable receipt digest. Missing, mismatched, interrupted or unsupported evidence blocks. See [the evidence contract](docs/harness-evidence-contract.md) for exact identity, mutation and publication requirements.

## CI and reports

The pinned Jenkins library runs lint during Build. The later Harness stage reactivates NVM and checks actual Node against `.nvmrc` and actual Yarn against `packageManager` before browser preflight and supporting checks.

Checked-in Jenkins jobs run Harness supporting checks and portable diagnostics. They provide no native candidate/release approval. The fixed native job requires its explicit artifact/digest/browser/output inputs and a supported provisioned Docker platform; actual Jenkins native provisioning and live acceptance remain unverified.

The shared Jenkins library deletes its workspace at job completion. Job-local raw reports are not durable evidence retention; an approved private store is still required for native CI acceptance.

Raw native evidence and detailed diagnostic failures stay under `functional-output/tests/harness/private/`. Both Jenkins jobs are configured to publish two build-page links: **Harness support — Odhín (no release credit)** and **Harness models — Odhín (no release credit)**. Each uses the webapp fluid presentation from pinned master `b978cf7` (responsive cards, resizing/reordering, compact view, filters and improved test details) over the installed Odhín renderer, containing reviewed test names and actual outcomes/durations; errors, logs, steps and attachments stay private. Exact validated HTML files are also archived:

- `functional-output/tests/harness/public/odhin-support/index.html`
- `functional-output/tests/harness/public/odhin-model/index.html`

The job clears prior reports first, validates each report before publication and publishes a model report only if models ran. A support failure stops models; absence means unavailable, not passed. The existing fixed-schema `public/release-assurance-summary.json` remains BLOCKED for these supporting checks. Live Jenkins report rendering/CSP still needs acceptance; download the HTML artifact if the Jenkins wrapper prevents interactive scripts. No global Jenkins security settings are changed.

For the same local reports, run `CI=true yarn harness:support` and `yarn harness:diagnostic:ci`. These commands neither execute a native candidate nor grant release approval. Human review is required before merge or deployment.

AI-assisted implementation; audit reference: harness-plan-execution-20261102.
