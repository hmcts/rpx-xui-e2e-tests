# Harness evidence contract

The existing POC remains a diagnostic runner. The fixed native job supports `exui-wa-family-pilot`, `exui-wa-scope-pilot`, `exui-ccd-pilot` and `exui-ccd-event-capability-pilot`. The separate native routing, Global Search and Hearing publication pilots remain outside that sequence. Each scope requires its own complete baseline and mutation evidence. Unsupported scopes, including full EXUI release, block. Artifact identity, isolation and applied mutation provenance come from the trusted runners; the parser cannot independently attest to a deployed runtime.

## Commands

```bash
yarn harness:unit
yarn harness:release-summary --run /path/to/immutable-run/run.json
yarn harness:verify-gate --receipt /path/to/immutable-run/gate.json --expected /path/to/deployment-expectations.json
```

Exit codes are 0 for PASS, 1 for coherent product FAIL, and 2 for BLOCKED evidence. A pilot PASS permits only its named gate step. Missing input, unknown scopes, malformed evidence and missing output after a killed job must deny promotion. CI must use a fresh run directory and independent deployment expectations; a last-green badge or mutable shared directory is insufficient.

## Archive candidate preparation

The archive producer uses pinned Linux/arm64 Node 24.22.1 on Debian 12 (Bookworm). Cache the exact image separately before running; the producer does not pull images or packages:

```bash
docker pull --platform linux/arm64 node@sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea
yarn harness:candidate:prepare --source /path/to/rpx-xui-webapp --commit 76bf7a840fa71af466961de87294973023b2f0f3 --cache /path/to/seeded-yarn-cache --output /path/to/fresh-candidate
```

The producer checks the committed Node engine, packageManager and regular committed Yarn release, then verifies actual Node/OS and Yarn versions before the build. Installation, build and production pruning retain immutable cache inputs and `--network none`; missing cache entries fail. The owned compile container uses `--init`, 8 GiB memory, four CPUs and a 512-PID limit; its observed terminal state and exit are retained in `build-execution.json`, with cleanup on normal completion or cancellation. Provenance records the immutable image reference, observed Node/Yarn versions and source engine. This archive artifact remains separate from proof of an owning Dockerfile/OCI delivery path.

## Native runtime authority and fixed CI job

The native API runs in a separate pinned Node/Debian container. Its mounts are the sealed candidate and network guard read-only, with only synthetic sessions and diagnostics writable. The trusted Tools container runs providers and Playwright, owns private reports and observer credentials, and has no Docker socket. Only the application sessions selected by the fixed policy are shared with the API. The event-capability scope uses a separate bootstrap actor plus courtadmin/judge source actors; the observer calls CCD directly from trusted test Node and is never an application session.

The host checks exact container identity, labels, namespace, hardened settings and mounts, then observes write denial before proof execution. It verifies actual Node/OS, framework terminal status, provider/gateway/network journals, requested shutdown and removal. Uncertain creation or cleanup blocks. A Tools namespace remains while its API removal is unsettled, permitting verified retry. OCI payload extraction records planned ownership before create, recovers only that exact owned name and never starts image code for extraction.

`harness:candidate:ci --input <absolute-job.json>` accepts exactly schemaVersion1, absolute candidateManifest/browserCache/fresh output, and independently supplied expectedArtifactDigest. It requires a clean committed checkout, cached pinned images and a supported Linux/arm64 or Linux/amd64 Docker engine. It runs the fixed family→scope→fresh CCD→fresh event-capability→PCS routing sequence, never a caller-selected subset. Completeness requires twelve baseline proofs and eleven deliberate fault checks; those are required counts, not observed passes. The parent reconstructs ownership and phase identities from declared candidate/toolchain/policy inputs; it does not derive identity expectations from a receipt. Cancellation prevents later phases, quiesces known children, attempts all safely owned cleanup and replaces any intervening PASS with BLOCKED. The result is a fixed-pilot suite, with releaseApproval:false.

Producers commit `gate.json` last, after mandatory controller/source/public records and owned cleanup or recorded source retention. A late finalization failure returns BLOCKED and attempts to withdraw the current receipt and restore safe public output. Cancellation and incomplete-cleanup evidence remain quarantined. Promotion must also require successful trusted producer completion, including when storage prevents artifact withdrawal.

The portable configuration projection/review is loaded from the clean committed Harness source, with independent file/fragment/row/revision pins and the normalized fixture source/workbook digests. It does not freshly rehash external repositories or accept caller-authored catalogue/status inputs. The additive postal obligation is `configuration-sequence:5e3fa818f42a05cf53c18623577ef91e26ceaff4ee829692ad7cf5e305ce22ed`: baseline `ccd-postal-two-roundtrip`, fault `ccd-drop-postal-optional-child`, exact failure `postal-persistence`. The fault removes only the second postal recipient's optional AddressLine2 on a real forwarded submission.

Catalogue execution credit is derived only after phase validation, raw-evidence recomputation, source binding and native finalization. The adapter receives the immutable receipt digest returned by that validator and rechecks candidate/source/policy/transport, imported workbook/source, observed definition/version and CCD image identity. The postal sequence and courtadmin cell can gain a CCD fact after their individual complete phases pass. The reviewed PCS routing obligation can gain one candidate fact only after both baseline proofs and both exact omission faults pass, and the sealed interpreter matches the reviewed source contract. Whole-profile/family/PRL-role IDs are not aliases. The current source catalogue has112 obligations: adding the two decentralized configuration keys replaces13 profile IDs, preserves98 other objects including the postal sequence and16 PRL cells, and adds one PCS routing obligation. The accepted `6895660` run reports **112 selected / 1 CCD / 111 missing** from the event-capability phase alone; it predates the fixed routing phase, and its postal phase remains BLOCKED. Its separate historical routing receipt is not combined with that run. Interpreter-source changes remain unknown impacts that broaden selection. Initial/missing/mismatched/blocked evidence gains no passing credit. This accounting distinguishes bounded runtime facts from remaining source-catalogue gaps; releaseCredit:false and releaseApproval:false remain unchanged.

Previous same-container native receipts remain local diagnostic observations. Separate-container source review and boundary probes do not themselves prove the composed job or a full release; acceptance must retain that job's actual immutable evidence and source identity. Checked-in Jenkins supporting/model checks remain separate from this opt-in native job and cannot issue candidate or full-release approval.

## Source event capability phase

`exui-ccd-event-capability-pilot` represents the pinned PRL `serviceOfDocuments` permission shape in normalized `HARNESS/HarnessNestedPRL`, state `JUDICIAL_REVIEW`. Baseline proof `ccd-courtadmin-email-one` requires the literal source courtadmin role to enter exactly one email recipient through form → CYA → Change → submit and independent observer readback. Baseline `ccd-event-create-denied` requires the source judge to read that test's independently seeded case, but receive HTTP 404 on event start and submit with event permission `R`, with complete observer state/history unchanged. This is an event restriction, not a claim that the judge persona is globally read-only.

The original fault `ccd-enable-judge-event` changes only the imported judge event ACL from `R` to `CR`. Proof `ccd-event-create-enabled` must first observe HTTP 200 at start, HTTP 201 on submit and the intended data/history change, retaining the source state, before the named `event-capability-isolation` denial assertion fails. Unrelated setup errors cannot satisfy it. Baseline and fault use separate fresh parent-owned CCD namespaces. The parent validates the full-policy raw baseline checkpoint and API/Tools removal, verifies CCD removal, imports and validates the fault definition, then pins its expected identity before publishing the startup acknowledgement. Cancellation prevents the handoff and retains owned recovery information.

Only complete phase PASS can credit `configuration-cell:a6d5e8421152eca670bc39912f6781824bfc3190d2b78ed9ea7757b5f168e313` through the exact reviewed source/normalized-fixture/import binding. A courtadmin proof by itself cannot award that credit; the judge proof is outside the catalogue.

The accepted actual run from Harness `68956604c604b0fa825015f30abdeb7147c50a1d` passed both baselines and detected the intended fault, producing event receipt `sha256:2a2f720f9876ef282217a577f64709b4c6be5c3fbfb7fbf917f3964b9bc8c5ca`. Courtadmin readback contained exactly one edited email recipient. Judge baseline state/history were unchanged; the fault persisted the intended change and advanced version/history before the named denial assertion failed. Raw replay and identity seals matched, and all 47 job-owned containers were independently confirmed absent. The overall job remained BLOCKED (exit 2) at `postal-required-fields`. No production PRL, AM/ABAC, service callback, OIDC login, CSRF enforcement, whole-role, owner-approval or full-release claim follows; no tests are retired by this acceptance.

The old CCD phase may continue to this phase while BLOCKED only when complete current-policy raw evidence shows `ccd-postal-two-roundtrip` failed at `postal-required-fields`, its postal fault stopped at the same early assertion, every other baseline passed and every other fault is valid. The only permitted gate reasons are that observed postal failure and `MUTATION_BASELINE_UNAVAILABLE`. The job preserves the worst phase status, and the blocked postal obligation still receives zero credit. No policy is reduced or historical receipt relabelled.

## Checked-in deployment profile inventory

The source snapshot stores chart/values projections separately from configuration JSON and definition sources. Independent revision, complete-file and projected-fragment pins bind the four reviewed files. The source reader discovers additional values YAML as unreviewed input; unsupported values YML, duplicate YAML keys and nonscalar selected values block. Only15 selected nonsecret environment keys are projected, with explicit presence. Base/AAT/preview composition records the last declared source value; it does not render Helm templates, apply Helm null-removal semantics, coerce process environment strings or infer defaults for absent declarations.

The catalogue and coverage provenance retain a separate deployment source manifest. Removing a profile, key or source distinction fails validation. Each profile/key retains a runtime-unproved gap; unreviewed families retain their capability key. Even passing results for every existing obligation cannot discharge these profile gaps. All112 existing obligation objects/IDs and their required runtime boundaries are unchanged. Actual rendered/deployed values and owner grouping acceptance remain unavailable; source-consistent diagnostics have releaseCredit:false. Changes to Helm sources keep broad impact selection.

## Separate native routing pilot

`harness:candidate --scope exui-decentralised-routing-pilot` uses the same sealed candidate, isolated API/Tools authority, fixed policy and evidence evaluator. The API can reach central metadata on3101 and PCS NoC on3102; only the browser can reach synthetic PCS UI on3103. Socket-origin journals independently identify the destination. Real rendered Create/Start entry must redirect externally and retain ordinary/unmatched local editor fallbacks. NoC must select central or PCS routes using per-case session state, with real CSRF and a distinct fresh session.

The routing API receives complete reviewed configuration under a private empty configuration directory; candidate defaults cannot silently restore an omitted destination through node-config merging. `routing-omit-web-url` must fail at `event-redirect`; `routing-omit-noc-base-url` must fail at `noc-session-routing`. Both baselines and both exact witnesses are mandatory. The reviewed source pins define the expected contract; the tested implementation binds to its own independently expected identity and sealed bytes, allowing later candidate builds.

The fixed CI run now executes this pilot as its fifth phase and binds the complete policy to the single reviewed PCS source obligation. The two pilot-only obligations still do not count as separate catalogue cells. A new combined job receipt is required before the aggregate routing obligation can be called covered; the previously separate routing receipt does not count toward another job. Loopback origins do not establish live PCS/CCD identity, DNS/TLS, authorization, business callbacks or deployed overlay equivalence. Existing-event forwarding and broader routing interpretation remain gaps.

## Producer input

`run.json` has these fields:

- `schemaVersion: 1`.
- `manifest`: run ID, Harness commit, release scope/policy digest, runtime metadata, exact candidate/dependency/configuration/definition identity, and required obligation IDs. See `scripts/lib/exui-release-evidence.d.mts`.
- `executionArtifacts`: relative path and SHA-256 digest references to finalized execution receipts, one per baseline/mutant invocation.
- `mutations`: mutation ID, baseline invocation ID, mutant invocation ID, and a path/digest reference to the trusted runner's derivation record.

The checked-in `scripts/lib/exui-release-policy.mjs` supplies policy and mutation definitions. The run cannot override policy or choose a smaller mandatory set. Derivation records bind baseline and changed mutant identities to the reviewed transformation digest; verifying a record's digest is integrity checking, not independent proof that the transformation was actually applied. The trusted producer must establish that fact.

Each execution receipt carries observed terminal state and exit code, run/invocation/candidate identity, unexpected global errors, and `resultArtifact: { path, digest }`. Its result artifact is produced by `scripts/lib/exui-playwright-evidence-reporter.mjs`. The supervising launcher must finalize the receipt only after the test process exits; reporter completion alone does not establish successful process termination.

The reporter requires `EXUI_EVIDENCE_REPORT` and `EXUI_EVIDENCE_CONTEXT`. The latter names a JSON file containing `runId`, `invocationId`, `identity`, `harnessCommit`, `releaseScopeId`, `policyDigest`, `harnessSourceState` and `harnessSourceDigest`. The last two are also recorded in manifest runtime metadata. Shared evaluation requires clean source and a valid digest, so regenerating a summary cannot remove a dirty-source blocker. The reporter embeds that context; the loader compares it before deriving proofs. Rewrapping an old report with a new execution receipt fails.

Tests carry one `harness-proof` annotation. Product assertions run inside `test.step('harness-assertion:<policy-failure-id>', ...)`. The adapter attributes only a single failed Playwright expectation inside a test-body step. Hook/fixture assertions, setup errors, unrelated cleanup failures and console text cannot satisfy mutation witnesses. Every attempt and test must be accounted for; unknown proofs and retries cannot disappear.

Artifacts stay under the run directory. Loading checks their digests and resolved paths, including symlink escapes. Input receipts/reports and the run manifest contribute to the evidence-manifest digest. These artifacts remain private; test framework output can contain sensitive diagnostics.

## Independent owner receipts

An optional `externalResults` array uses a distinct adapter. Each entry binds the current `releaseRunId`, local `proofId`/`obligationId`, policy-owned `compatibilityRuleId`, original `producerRunId`, and `producerArtifact: { uri, path, digest }`. The loader reads the original receipt bytes from that path; an inline replacement is rejected. The original producer identity is retained, never overwritten with the webapp identity.

Checked-in compatibility rules specify the producer gate/scope/proof, its reviewed gate-configuration digest, a run-specific HTTPS artifact URI template, maximum age and explicit producer-to-candidate identity bindings. A separately versioned provider can match its dependency image/API-contract digests without pretending to share the webapp commit. Freshness uses the evaluator's current UTC clock, never a timestamp supplied in the run manifest. Producer run IDs must be immutable numeric build IDs; aliases such as `lastSuccessfulBuild` are rejected even when repeated consistently in the wrapper and original receipt. Missing, future, stale, incomplete, retried, mismatched or BLOCKED evidence denies promotion; a coherent original FAIL remains FAIL. An internal Playwright result cannot substitute for an external receipt.

The adapter has offline positive and adversarial tests. No real external owner gate is configured yet: adding a compatibility rule still requires evidence that the named producer and promotion path enforce that obligation. A digest or a self-reported PASS alone does not establish that ownership. The current pilot policies cannot approve a full release.

## Promotion consumer

The expectation file is supplied independently by the deployment job. It contains run ID, Harness commit, release scope, policy digest, exact candidate identity, evidence-manifest digest and `receiptArtifactDigest` (SHA-256 of the immutable `gate.json` bytes from the trusted producer).

The consumer validates receipt bytes before comparing identity and status. Deriving expected identity or digest from an untrusted receipt at the point of consumption defeats the check. The expectation file cannot be the receipt file itself. Deployment integrations must also require the producer job to succeed; this repository does not currently own or wire an EXUI production promotion pipeline.

## Publication boundary

`functional-output/tests/harness/public/release-assurance-summary.json` is the only public release-assurance summary; the separate supporting Odhín HTML allowlist is described below. The writer projects a fixed schema with enumerated status/reason values and `releaseApproval: false`; it does not copy arbitrary IDs, errors, credentials or metadata. Jenkins validates exact bytes/schema before archive. `gate.json` and raw diagnostics are not included in that public allowlist.

Started CI diagnostics replace stale public output with BLOCKED before contact, pin reporter destinations under Harness private output, and preserve conventional-suite diagnostics. This is publication quarantine, not a shared sanitizer repair. Dedicated candidate runs use a network-isolated runtime and curated read-only source/dependency mounts; legacy POC diagnostics retain their separate execution boundary.

## Validation evidence

Offline Node tests exercise the real evaluator, loader, CLIs and CI shell boundaries. A no-browser Playwright probe demonstrates passing assertions followed by global teardown failure, hard termination before report finalization, setup-hook rejection, intended body assertion failure, unrelated cleanup failure and retry preservation. Synthetic bundle fixtures demonstrate receipt identity and digest rejection; they are not candidate browser/CCD proofs.

## Separate native Global Search pilot

`harness:candidate --scope exui-global-search-pilot` runs exactly a baseline and `global-search-wa-capability`. A fresh signed synthetic session uses actual authenticated Node GET `/api/globalSearch/services`, real reference-data retrieval and Angular's Services selector. The real browser POST `/api/globalsearch/results` reaches upstream `/globalSearch`. Literal independent ID/label expectations require nine configured services in the DOM and submitted scope. The single-property mutation binds `globalSearchServices` to WA's seven services, with all other candidate bytes and effective configuration unchanged.

Both invocations must complete an exactly admitted nine/seven-ID request and the auxiliary read-jurisdiction request. The mutant's literal WA-seven transport precondition runs before the named `global-search-capability-scope` assertion, so a DOM-only mismatch cannot earn mutation credit. Real CSRF remains enabled; the actual browser header is observed as presence/hash, never injected. All consumed same-origin JavaScript, including lazy chunks, is checked against the sealed candidate. Unknown provider/browser destinations and unrelated errors block credit.

The clean `121f213` local run passed this pilot only. Reference-data labels, empty search results, auxiliary jurisdiction metadata, authentication, flags and telemetry are declared synthetic/excluded seams. The receipt is not an alias for the 112 source catalogue obligations, actual service authorization, deployed profiles, production label algorithms, cache behavior or full release approval. Fixed CI order and OCI family-only support remain unchanged. The retired mock diagnostic's injected display dictionary and screenshot are explicit product-scope withdrawals, not exact parity claims.

## Private native-phase evidence packets

The opt-in `scripts/export-exui-private-evidence.mjs` copies the complete regular-file/directory tree of one finalized native phase. It preserves gate/run/report/derivation bytes and supplemental browser/provider/lifecycle/source-retention records; it never follows external paths recorded inside those JSON files. The result includes private transport copies and a sorted digest/length/type inventory. It is not a self-contained rebuild archive or a snapshot of the whole CI job, CCD runtime, candidate, dependencies or browser.

Export requires an external independent expectation with exactly `runId`, `harnessCommit`, `releaseScopeId`, `policyDigest`, `identity`, `harnessSourceDigest`, `harnessDependencyDigest`, `browserDigest`, `nativeAuthority:true`, `evidenceManifestDigest` and `receiptArtifactDigest`. The separately observed producer file is the existing supervisor envelope `{terminal:{code,signal},expected:{...launchFields}}`. Its launch fields must equal that expectation without the two later evidence/receipt digests; signal must be null and exit must match the original verdict. Expectations and terminal must be outside the checked phase. Archived copies are evidence, not independent authority.

The trusted installed verifier uses the existing fixed policy, raw loader/evaluator, native finalization and identity consumer. Both independently supplied transport digests are checked directly. Every recorded execution must be completed with framework exit 0/1; reports must be complete with overall passed/failed and no interrupted/timed-out tests. A coherent complete BLOCKED result remains exportable, while an interrupted run cannot qualify merely because the evaluator also returns BLOCKED. Required policy gaps and coherent product FAIL remain visible; no receipt is manufactured for incomplete, quarantined or malformed inputs.

The canonical destination's existing parent must be private and owned by the invoking user. Symlink components, nonregular entries, overlapping inputs/output, existing destinations (including empty ones) and the known public archive root are rejected. New directories/files use 0700/0600 regardless of umask. All source entries/bytes and external inputs are rechecked after copying. A non-overwriting completion manifest is committed last; failure withdraws only this operation's marker where filesystem permissions permit. An incomplete destination is not reusable. If withdrawal is physically denied, a failed operation and absent trusted digest handoff must remain failure; finding a file alone does not establish successful export.

Verification requires a separately trusted external expectation and manifest digest before using the packet. It checks exact inventory, private permissions, all raw/receipt identities and recorded native completion without writes, source-file execution, network or Docker inspection. It does not re-observe historical container absence or authenticate a malicious producer. Portable copying assumes a quiescent caller-owned filesystem, not a concurrent privileged attacker.

Export/verify exit 0 means copy/verification integrity, including when the preserved original verdict is FAIL 1 or BLOCKED 2. Output contains only operation metadata, manifest digest, `originalStatus` and `releaseApproval:false`; raw errors/session data remain private. The existing release-gate consumer retains its original 0/1/2 outcome. Do not use the export command as a promotion decision.

Local canary at exporter `f3cd7ab` copied all 54 phase files from the accepted Global Search runtime `121f213`, preserved the exact receipt and independently declared expectations, and verified after relocation with original phase/candidate/browser reads blocked by a private probe. Wrong manifest/identity checks rejected and original files remained unchanged. This is filesystem preservation evidence, not a new application run, whole-job retention, approved storage, live Jenkins or full-release acceptance. The 14 focused CLI/filesystem checks are included in the 376 Harness Node checks; counts overlap.

## Supporting Odhín publication

One combined CI runner renders the **EXUI Assurance Harness** report at `functional-output/tests/harness/public/odhin/index.html`. Its reviewed declaration union executes each retained framework/model contract once. The overview derives catalogue-model, historical-replay and framework counts/statuses from those records, explains their evidence basis and shows reviewed service/capability metadata. Framework passes never become per-service coverage. Build-time Node/pipeline/TypeScript/lint results are not represented as individual Playwright rows.

Candidate and CCD checks are NOT RUN by this job: 0 of 112 runtime obligations observed, with additional deployment/profile, preview, discovery and owner gaps still open. No historical native receipt is relabelled as this build's result, and no retired mock UI or accessibility credit is restored. The fixed public summary remains BLOCKED/releaseApproval:false.

The genuine Odhín renderer and pinned fluid presentation receive only reviewed declaration identities and validated execution scalars. Run and per-file/project clocks come from observed execution, not rendering time. Errors, stdout/stderr, raw steps, annotations, tags and attachments remain private. Only the single self-contained HTML is published; a private digest record is checked before archive/HTML publication. Reset precedes the run. Unknown/missing/duplicate identities, incomplete outcomes, aliases, unexpected sidecars and integrity errors prevent publication. The existing native evidence/retention contract is unchanged.

## Complete definition discovery before impact selection

The live source CLI reads the pinned PRL definition root without executing owner code, following links, fetching Git objects or inferring effective environment variants. Its expected file inventory comes from the independently pinned local Git tree. Raw byte/Git-blob digests, exact paths and physical entry kinds distinguish added, missing, changed and unsupported input. Missing baseline objects produce an explicit unavailable gap, never an invented per-path comparison.

Typed references retain all candidates and traversed dependencies. Singleton schemas, unknown semantic keys, condition expressions, external types, unresolved paths, duplicate declarations and cycles remain explicit gaps; they are not classified as invalid production CCD without an owner contract. Only reviewed exact all-row/ID selectors choose catalogue rows. Existing112 objects and45 deployment/nine preview-family gaps remain.

Every impact-selector call validates trusted snapshot/review context itself. Missing context, compact summaries, source drift, unresolved or unreviewed graph content and forged completeness flags cannot narrow the authoritative selection. Native compact summaries remain dependency-free, carry unavailable-graph provenance and grant no extra receipt credit. Only a complete reviewed graph can support focused selection; the production PRL inventory remains broad while its semantic gaps are unresolved.

The full physical inventory/reference graph are private diagnostic artifacts, with transport digests in source-validation. They are never committed or generally published. The CLI requires a fresh canonical destination under an existing owned private parent, disjoint from source/review/Harness inputs and the fixed public report roots. It creates no public summary. Source-consistent diagnostic exit0 may still include explicit semantic gaps and `releaseCredit:false`; provenance/pin/structural errors exit2. Historical runtime identities and policies remain unchanged.

### Court-admin read projection extension

The current event-capability scope additionally requires `ccd-courtadmin-read-recipient-shapes`: the literal source court-admin role reads all four seeded email/post and one/two-recipient shapes through the candidate case view while an independent observer confirms unchanged CCD data and history. Its separate fault, `ccd-remove-courtadmin-recipient-read`, removes only `R` from that role’s recipient-field ACL (`CRUD` → `CUD`). The fault must observe the intended missing field in every shape before failing `courtadmin-recipient-read-projection`.

The parent removes the baseline runtime, imports both judge and read faults into distinct owned CCD namespaces, and captures both expected identities before publishing either startup acknowledgement. Schema 2 replay requires both imported workbooks, mutation derivations, process finalisation and the complete three-proof baseline. Historical one-fault packets cannot satisfy this expanded policy.

Only complete accepted evidence may credit the four exact courtadmin read cells for email/post and one/two recipients. The required aggregate proof is `ccd-source-courtadmin-read-shapes`; the adapter independently checks each catalogue cell and credits none if any shape or its permission fault fails. Old one-email proof receipts cannot satisfy the expanded policy. The source catalogue stays at 112 obligations; this implementation does not itself establish runtime credit or full release approval.
