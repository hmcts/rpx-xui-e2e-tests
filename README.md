# EXUI Assurance Harness

Central assurance for EXUI configuration, role, definition and data-integrity behaviour. Ordinary product API, integration and E2E regression belongs in [rpx-xui-webapp](https://github.com/hmcts/rpx-xui-webapp). The [retirement ledger](docs/harness-retirement.md) records duplicate removals, explicit product-scope withdrawals and rollback commits.

## Install and check the Harness

Use the Node/Yarn versions declared in package.json.

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

A fixed-pilot PASS grants no full EXUI release approval. The portable source catalogue contains 111 obligations; only the exact postal sequence is eligible for the new receipt-to-catalogue mapping. An accepted postal phase leaves the original 110 runtime obligations missing. Source classification, model tests and screenshots do not discharge those gaps. Effective deployed profiles, service-owner grouping acceptance, external owner gates and promotion wiring remain incomplete.

## Focused candidate and CCD execution

```bash
yarn harness:candidate --scope exui-wa-family-pilot --candidate /absolute/candidate/candidate-artifact.json --browser /absolute/browser-cache --output /absolute/fresh-family-run
yarn harness:ccd:start --output /absolute/fresh-ccd-runtime
yarn harness:ccd:candidate --candidate /absolute/candidate/candidate-artifact.json --ccd-state /absolute/fresh-ccd-runtime/runtime.json --browser /absolute/browser-cache --output /absolute/fresh-ccd-run
yarn harness:ccd:start --stop --output /absolute/fresh-ccd-runtime
```

The combined job owns its CCD startup/shutdown automatically. Manual CCD runs require the matching stop command and recorded ownership. SIGINT/SIGTERM invokes owned cleanup; daemon failure or SIGKILL requires recovery from the recorded owner labels. Do not delete unrelated containers.

CCD uses fresh isolated storage, source-backed synthetic definitions, real RBAC, synthetic identities and a separately authorised state/history observer. ABAC, identity-provider correctness and service business callbacks remain outside these pilots. The fixture retains original PRL revision/workbook provenance; synthetic Harness roles/case types are not credited as actual PRL authorization cells.

The OCI adapter runs an immutable image in its own Node/OS:

```bash
yarn harness:candidate:oci --candidate /absolute/image-candidate.json --browser /absolute/matching-browser-cache --output /absolute/fresh-oci-run
```

It requires registry digest, source/producer identity and sealed `/opt/app/harness-build.json` metadata. Linux/amd64 additionally needs an inspected matching `--browser-runtime-image sha256:<image-id>`. This adapter currently supports the family policy only; OCI scope/CCD and upstream producer/promotion integration remain gaps.

## Supporting diagnostics

| Command | Evidence boundary |
|---|---|
| `yarn harness:diagnostic` | Portable catalogue/model checks; no candidate or service execution credit |
| `yarn harness:diagnostic:model-browser` | Generated WA HTML and accessibility illustration |
| `yarn harness:diagnostic:frontend` | Actual frontend routes with mocked providers and explicit session setup |
| `yarn harness:diagnostic:environment` | Five configuration requests against an explicitly selected environment |
| `yarn harness:diagnostic:toolkit` | Contract extracted from an explicitly selected installed toolkit class |
| `yarn harness:diagnostic:toolkit-browser` | Generated CYA illustration based on that toolkit contract |

Frontend/environment selections require explicit `TEST_URL`, `TEST_ENV` and `IDAM_WEB_URL`; they do not default to AAT. Environment probes use UI-session authentication and reject a conflicting explicit authentication mode. Provide only their retained personas through approved secret/session management. Toolkit selections require an absolute `XUI_WEBAPP_ROOT` containing the installed package. Model/generated HTML and extracted-class checks are separate from real Angular/CCD execution.

Local frontend diagnostics require an explicitly prepared loopback target. Candidate-bound native runs use their own fixed configuration and evidence, independent of these diagnostics. The remaining legacy source paths hold retained Harness diagnostics/support; their names do not establish a product suite or stronger evidence boundary.

## Source coverage and receipts

```bash
yarn harness:catalogue --webapp /absolute/rpx-xui-webapp --definitions /absolute/prl-ccd-definitions --output /absolute/source-report
RPX_XUI_WEBAPP_DIR=/absolute/rpx-xui-webapp PRL_CCD_DEFINITIONS_DIR=/absolute/prl-ccd-definitions HARNESS_MANIFEST_EXTERNAL_SOURCE_MODE=strict yarn harness:manifest
yarn harness:defect-intake -- "defect title and bounded notes"
```

External-checkout source inspection requires the actual selected source paths. The native fixed job uses committed reviewed projections and separate byte/revision/row pins; it does not silently refresh upstream sources. The legacy manifest reports source drift separately from required assurance gaps. PCS membership is required. Its Java SDK/decentralised source owner and base case type are pinned, but definition generation/import, deployed suffix and runtime assurance remain unproved. The profile stays config-backed and its required gap remains unaccepted.

The shared evaluator recomputes raw framework evidence and receipts. `harness:verify-gate` consumes a receipt with independently supplied expected identity and immutable receipt digest. Missing, mismatched, interrupted or unsupported evidence blocks. See [the evidence contract](docs/harness-evidence-contract.md) for exact identity, mutation and publication requirements.

## CI and reports

Checked-in Jenkins jobs run Harness supporting checks and portable diagnostics. They provide no native candidate/release approval. The fixed native job requires its explicit artifact/digest/browser/output inputs and a supported provisioned Docker platform; actual Jenkins native provisioning and live acceptance remain unverified.

Raw native evidence stays beneath the job's private output. Diagnostic/support reports remain under `functional-output/tests/harness/private/`. Only the validated fixed-schema `public/release-assurance-summary.json` is eligible for general publication. Missing reports, placeholders or passing model checks cannot be presented as candidate PASS. Human review is required before merge or deployment.

AI-assisted implementation; audit reference: harness-plan-execution-20261102.
