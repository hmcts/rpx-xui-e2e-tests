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

The native runner starts the built Angular/Node candidate with isolated synthetic personas and declared downstream seams. Fixed policies cover WA family selection, organisation/case location scope, real CCD nested persistence/access integrity, and source-defined event permissions. Every policy requires its baseline and intended failing mutations. The postal extension adds two-recipient validation/CYA/edit/readback plus loss of one optional child.

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

To execute these application checks together with Harness diagnostics and publish one Odhín report:

```bash
yarn harness:assurance --input /absolute/job.json
# Include the five live AAT configuration probes:
yarn harness:assurance --input /absolute/job.json --aat
```

Each invocation needs a fresh native output directory in its job file. The combined command runs the native job first, validates its captured identities, raw reports, receipts and cleanup, then collects 116 local checks (121 with AAT). It writes the single report to `functional-output/tests/harness/public/odhin/index.html`. Native baselines and deliberate fault checks have separate counts and source identities; a blocked native result remains exit code 2 even when diagnostics pass. Incomplete native evidence stops collection instead of publishing a passing report. AAT requires the existing approved local credentials; the default command does not.

The 112 catalogue requirements are coverage obligations, not an already implemented 112-test suite. This command executes the implemented native policies; it cannot grant coverage to missing service/profile proofs. Jenkins still needs the supported native agent, sealed candidate inputs and approved durable evidence storage before this command can become a required release gate.

The default job has five fixed phases: WA family → IA/Civil scope → CCD nested/access/role-removal/postal → CCD source event capability → PCS routing. Its required inventory is eleven baseline proofs and ten deliberate fault checks, not a claim that they passed. The strict job input cannot supply a catalogue, proof status or selected subset.

The new `exui-ccd-event-capability-pilot` uses the pinned PRL courtadmin/judge permissions in the normalized `HARNESS/HarnessNestedPRL` definition. It requires a courtadmin to enter one email recipient through form → CYA → Change → submit/readback, while a judge can read the case but cannot start or submit the event with event permission `R`. Its sole definition fault changes that judge event permission from `R` to `CR`; the test must observe the enabled write before failing the denial assertion. The accepted clean `6895660` run passed both baselines and detected the intended `R` → `CR` fault at `event-capability-isolation`, after observing the real persisted judge write. Independent observer checks confirmed exactly one edited courtadmin recipient and unchanged case state/history after the baseline judge denial.

The parent verifies baseline API/Tools and CCD removal, imports the fault into a fresh owned namespace, and captures its expected identity before acknowledging fault startup. An old CCD postal BLOCKED result permits the fourth phase only when raw evidence confirms the exact known `postal-required-fields` cause and all other required proofs/faults are valid. The overall job retains the worst phase status; continuation cannot turn that BLOCKED result into PASS.

The native API runs separately from browser/providers/evidence writing. It receives read-only sealed application/guard files and writable synthetic sessions/diagnostics. Observer credentials, reports, controller source and Docker socket are absent from its mounts. Containers receive no Docker socket; the host owns lifecycle and recovery.

The historical c024fa3 postal run is BLOCKED at the mandatory-child check and receives zero catalogue execution credit. See [current assurance gaps](docs/harness-known-gaps.md) for the observed constraint and owner action.

A fixed-pilot PASS grants no full EXUI release approval. The portable source catalogue contains 112 obligations. Adding the two routing configuration keys replaces 13 profile IDs; the other 98 obligation objects remain unchanged. The receipt-to-catalogue mapping admits the exact postal sequence and source courtadmin/email/one-recipient cell, plus the reviewed PCS routing obligation only after all four route proofs and the sealed-interpreter/source bindings validate. The judge proof adds no catalogue cell.

The accepted `6895660` job accounts for **1 of 112 obligations**: only the exact courtadmin cell `a6d5e842…e313`, with 111 still missing. Its overall result remains **BLOCKED (exit 2)** at `postal-required-fields`; the postal fault earns no credit. All 47 owned containers were independently confirmed removed. The [evidence contract](docs/harness-evidence-contract.md#source-event-capability-phase) records the source and event receipt binding. Source classification, model tests and screenshots do not discharge those gaps. Effective deployed profiles, service-owner grouping acceptance, external owner gates and promotion wiring remain incomplete.

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

CCD uses fresh isolated storage, source-backed synthetic definitions, real RBAC, synthetic identities and a separately authorised state/history observer. ABAC, identity-provider correctness and service business callbacks remain outside these pilots. The fixtures retain original PRL revision/workbook provenance. The event scope uses literal source roles in a normalized case type; its bounded cell mapping does not prove production PRL authorization, AM/ABAC, OIDC login, CSRF enforcement, service-owner acceptance or broad persona permissions. This acceptance adds no test retirements.

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
yarn harness:catalogue --webapp /absolute/rpx-xui-webapp --definitions /absolute/prl-ccd-definitions --output /absolute/private-source-reports/fresh-run
RPX_XUI_WEBAPP_DIR=/absolute/rpx-xui-webapp PRL_CCD_DEFINITIONS_DIR=/absolute/prl-ccd-definitions HARNESS_MANIFEST_EXTERNAL_SOURCE_MODE=strict yarn harness:manifest
yarn harness:defect-intake -- "defect title and bounded notes"
```

The catalogue output must be fresh, beneath an existing owned parent with `0700` permissions, and outside Harness, source and review inputs. It cannot use public report directories.

External-checkout source inspection requires the actual selected source paths. The native fixed job uses committed reviewed projections and separate byte/revision/row pins; it does not silently refresh upstream sources. The legacy manifest reports source drift separately from required assurance gaps. PCS membership is required. Its Java SDK/decentralised source owner and base case type are pinned, but definition generation/import, deployed suffix and runtime assurance remain unproved. The profile stays config-backed and its required gap remains unaccepted.

The source diagnostic inventories the complete pinned PRL definition root and resolves typed references beyond the reviewed nine-file projection. It writes private `definition-file-inventory.json` and `definition-reference-graph.json` alongside the catalogue, selection and source-validation report; the latter binds both artifact digests. Added, removed or changed source files block validation. Unsupported schemas, expressions, external types and ambiguous variants remain named gaps and keep impact selection broad. Committed compact summaries contain no live graph and cannot authorize narrowing or release credit. The existing 112 obligation objects remain unchanged.

The source diagnostic also reads the pinned chart metadata and base/AAT/preview values files. It reports15 selected environment keys per profile with explicit presence, source provenance and runtime gaps, including nine unreviewed preview families. Missing or changed source pins block validation. These source-only profiles neither change the112 obligation objects nor prove deployed values or profile equivalence.

The shared evaluator recomputes raw framework evidence and receipts. `harness:verify-gate` consumes a receipt with independently supplied expected identity and immutable receipt digest. Missing, mismatched, interrupted or unsupported evidence blocks. See [the evidence contract](docs/harness-evidence-contract.md) for exact identity, mutation and publication requirements.

## CI and reports

The pinned Jenkins library runs lint during Build. The later Harness stage reactivates NVM and checks actual Node against `.nvmrc` and actual Yarn against `packageManager` before browser preflight and supporting checks.

Checked-in Jenkins jobs attempt the bounded native candidate/CCD pilots on the existing worker, then collect supporting diagnostics in the same report. Native preparation requires an observed Linux ARM64 Docker server before webapp fetch or candidate build. This platform check grants no runtime or release credit; actual Jenkins native provisioning and live acceptance remain unverified.

The shared Jenkins library deletes its workspace at job completion. Job-local raw reports are not durable evidence retention; an approved private store is still required for native CI acceptance.

The native Jenkins wrapper preserves each job directory under `functional-output/tests/harness/private/native-ci/harness-native-ci-*`, including failed preparation and execution evidence. Private roots and job directories must be owned by the invoking user with mode0700; aliases and broader existing permissions block execution. These files are excluded from public artifact publication. They remain available during the job for private inspection or an approved export; workspace cleanup still removes them, so this is not durable retention.

Raw native evidence and detailed diagnostic failures stay under `functional-output/tests/harness/private/`. Both Jenkins jobs publish one **EXUI Assurance Harness** Odhín report at `functional-output/tests/harness/public/odhin/index.html`.

Run `yarn harness:ci` for a diagnostic-only report locally, or `yarn harness:assurance --input /absolute/job.json` to include independently validated native evidence. One Playwright runner executes the retained framework checks and portable models once. The first screen explains what ran, why it matters, and what remains untested: configuration/service catalogue models, cross-service historical defect replays, and Harness framework checks. Group counts and outcomes come from actual records; Build-time Node/pipeline/TypeScript/lint checks are explained separately, not invented as Playwright rows.

In a diagnostic-only collection, the service/capability view uses reviewed source metadata and has no accepted candidate/CCD evidence, so it credits **0 of 112 required runtime obligations**. The combined native collection reports its separately validated execution and catalogue credit alongside these diagnostics, retaining distinct source/run identities. The 112 are a bounded inventory; deployment-profile/key gaps, unreviewed preview-family cells, discovery and owner acceptance remain additional gaps. Historical native receipts and retired mock UI are not results of this build.

The dashboard groups unique tests by evidence lane, named feature/slice, service or shared component, declared jurisdiction label and case type. Expand a slice to see each check, scope, result and evidence link. A test can belong to several labels, so dimension totals are non-additive. Current jurisdiction labels mirror service-family codes in reviewed test metadata; they do not establish deployed jurisdiction coverage. Native/CCD proofs and catalogue gaps stay separately counted and visible.

The report uses the pinned webapp fluid presentation (`b978cf7`) over genuine Odhín, with responsive cards, filters and improved modal details. Reviewed test names and actual outcomes/durations are public; errors, logs, raw steps and attachments remain private. The job resets previous output, validates its private digest record and archives/publishes only the one self-contained HTML file. Incomplete or unreviewed records prevent publication. A diagnostic-only `public/release-assurance-summary.json` remains BLOCKED. A native PASS is a bounded pilot verdict; release approval remains unavailable.

For the explicitly authorized live AAT configuration slice, `yarn harness:aat` runs offline116 in a credential-free child, then the five retained read-only environment probes in a separate AAT/auth child. Supply the approved AAT/IDAM origins and configured solicitor credentials through the local environment; never commit or publish them. This produces one121-record report, with endpoint response passes distinguished from login/setup blocks and unclassified failures. The deployed AAT version is unknown, and these response probes do not discharge the112 candidate-bound obligations or prove UI/CCD behaviour. Each collection uses fresh private JSON/output/session paths; raw data stays private. CI remains offline116 and does not run AAT.

Focused `yarn harness:support` and `yarn harness:diagnostic` commands remain available locally. Live Jenkins rendering/CSP still requires acceptance; download the HTML if the wrapper blocks its scripts. No global Jenkins security setting changes. Human review is required before merge or deployment.


### Existing Jenkins worker observation

The current PR and nightly jobs still run supporting checks with `harness:ci`. Before those checks, `scripts/observe-harness-worker.mjs` records sanitized host/Docker platforms, pinned-image availability and declared native-input presence in `functional-output/tests/harness/public/native-ci-capabilities.json`, using the existing Jenkins artifact destination. Missing Docker or inputs are reported without blocking the supporting checks. This observation never grants native readiness or release approval; it does not launch containers or verify candidate/browser integrity. If already provisioned, `HARNESS_ASSURANCE_INPUT` identifies the existing five-field native job JSON. No raw paths, credentials or Docker errors are published.
