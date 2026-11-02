# Harness evidence contract

The existing POC remains a diagnostic runner. Dedicated candidate producers support `exui-wa-family-pilot`, `exui-wa-scope-pilot` and `exui-ccd-pilot`; each requires its own complete baseline and mutation evidence. Unsupported scopes, including full EXUI release, block. Artifact identity, isolation and applied mutation provenance come from the trusted runners; the parser cannot independently attest to a deployed runtime.

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

The native API runs in a separate pinned Node/Debian container. Its mounts are the sealed candidate and network guard read-only, with only synthetic sessions and diagnostics writable. The trusted Tools container runs providers and Playwright, owns private reports and observer credentials, and has no Docker socket. Only allowed/denied application sessions are shared with the API; the observer calls CCD directly from trusted test Node.

The host checks exact container identity, labels, namespace, hardened settings and mounts, then observes write denial before proof execution. It verifies actual Node/OS, framework terminal status, provider/gateway/network journals, requested shutdown and removal. Uncertain creation or cleanup blocks. A Tools namespace remains while its API removal is unsettled, permitting verified retry. OCI payload extraction records planned ownership before create, recovers only that exact owned name and never starts image code for extraction.

`harness:candidate:ci --input <absolute-job.json>` accepts exactly schemaVersion1, absolute candidateManifest/browserCache/fresh output, and independently supplied expectedArtifactDigest. It requires a clean committed checkout, cached pinned images and a Linux/arm64 Docker engine. It runs the fixed family→scope→fresh CCD sequence, never a caller-selected subset. The parent reconstructs ownership and phase identities from declared candidate/toolchain/policy inputs; it does not derive identity expectations from a receipt. Cancellation prevents later phases, quiesces known children, attempts all safely owned cleanup and replaces any intervening PASS with BLOCKED. The result is a fixed-pilot suite, with releaseApproval:false.

Previous same-container native receipts remain local diagnostic observations. Separate-container source review and boundary probes do not themselves prove the composed job or a full release; acceptance must retain that job's actual immutable evidence and source identity. Existing Jenkins commands are not automatically changed by this opt-in command.

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

Only `functional-output/tests/harness/public/release-assurance-summary.json` is eligible for general Harness publication. The writer projects a fixed schema with enumerated status/reason values and `releaseApproval: false`; it does not copy arbitrary IDs, errors, credentials or metadata. Jenkins validates exact bytes/schema before archive. `gate.json` and raw diagnostics are not included in that public allowlist.

Started CI diagnostics replace stale public output with BLOCKED before contact, pin reporter destinations under Harness private output, and preserve conventional-suite diagnostics. This is publication quarantine, not a shared sanitizer repair. Dedicated candidate runs use a network-isolated runtime and curated read-only source/dependency mounts; legacy POC diagnostics retain their separate execution boundary.

## Validation evidence

Offline Node tests exercise the real evaluator, loader, CLIs and CI shell boundaries. A no-browser Playwright probe demonstrates passing assertions followed by global teardown failure, hard termination before report finalization, setup-hook rejection, intended body assertion failure, unrelated cleanup failure and retry preservation. Synthetic bundle fixtures demonstrate receipt identity and digest rejection; they are not candidate browser/CCD proofs.
