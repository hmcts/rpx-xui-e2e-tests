# Harness evidence contract

This is the evidence-validation foundation. The existing POC is a diagnostic runner, not a candidate producer. The only policy currently supplied is `exui-wa-family-pilot`; it covers family membership, not organisation/case scope or full EXUI readiness. Unsupported scopes block. Real candidate identity, isolation and production-facing mutation provenance must come from the planned trusted runner; this parser cannot independently attest to a deployed runtime.

## Commands

```bash
yarn harness:unit
yarn harness:release-summary --run /path/to/immutable-run/run.json
yarn harness:verify-gate --receipt /path/to/immutable-run/gate.json --expected /path/to/deployment-expectations.json
```

Exit codes are 0 for PASS, 1 for coherent product FAIL, and 2 for BLOCKED evidence. A pilot PASS permits only its named gate step. Missing input, unknown scopes, malformed evidence and missing output after a killed job must deny promotion. CI must use a fresh run directory and independent deployment expectations; a last-green badge or mutable shared directory is insufficient.

## Producer input

`run.json` has these fields:

- `schemaVersion: 1`.
- `manifest`: run ID, Harness commit, release scope/policy digest, runtime metadata, exact candidate/dependency/configuration/definition identity, and required obligation IDs. See `scripts/lib/exui-release-evidence.d.mts`.
- `executionArtifacts`: relative path and SHA-256 digest references to finalized execution receipts, one per baseline/mutant invocation.
- `mutations`: mutation ID, baseline invocation ID, mutant invocation ID, and a path/digest reference to the trusted runner's derivation record.

The checked-in `scripts/lib/exui-release-policy.mjs` supplies policy and mutation definitions. The run cannot override policy or choose a smaller mandatory set. Derivation records bind baseline and changed mutant identities to the reviewed transformation digest; verifying a record's digest is integrity checking, not independent proof that the transformation was actually applied. The trusted producer must establish that fact.

Each execution receipt carries observed terminal state and exit code, run/invocation/candidate identity, unexpected global errors, and `resultArtifact: { path, digest }`. Its result artifact is produced by `scripts/lib/exui-playwright-evidence-reporter.mjs`. The supervising launcher must finalize the receipt only after the test process exits; reporter completion alone does not establish successful process termination.

The reporter requires `EXUI_EVIDENCE_REPORT` and `EXUI_EVIDENCE_CONTEXT`. The latter names a JSON file containing `runId`, `invocationId`, `identity`, `harnessCommit`, `releaseScopeId` and `policyDigest`. The reporter embeds that context; the loader compares it before deriving proofs. Rewrapping an old report with a new execution receipt fails.

Tests carry one `harness-proof` annotation. Product assertions run inside `test.step('harness-assertion:<policy-failure-id>', ...)`. The adapter attributes only a single failed Playwright expectation inside a test-body step. Hook/fixture assertions, setup errors, unrelated cleanup failures and console text cannot satisfy mutation witnesses. Every attempt and test must be accounted for; unknown proofs and retries cannot disappear.

Artifacts stay under the run directory. Loading checks their digests and resolved paths, including symlink escapes. Input receipts/reports and the run manifest contribute to the evidence-manifest digest. These artifacts remain private; test framework output can contain sensitive diagnostics.

## Promotion consumer

The expectation file is supplied independently by the deployment job. It contains run ID, Harness commit, release scope, policy digest, exact candidate identity, evidence-manifest digest and `receiptArtifactDigest` (SHA-256 of the immutable `gate.json` bytes from the trusted producer).

The consumer validates receipt bytes before comparing identity and status. Deriving expected identity or digest from an untrusted receipt at the point of consumption defeats the check. The expectation file cannot be the receipt file itself. Deployment integrations must also require the producer job to succeed; this repository does not currently own or wire an EXUI production promotion pipeline.

## Publication boundary

Only `functional-output/tests/harness/public/release-assurance-summary.json` is eligible for general Harness publication. The writer projects a fixed schema with enumerated status/reason values and `releaseApproval: false`; it does not copy arbitrary IDs, errors, credentials or metadata. Jenkins validates exact bytes/schema before archive. `gate.json` and raw diagnostics are not included in that public allowlist.

Started CI diagnostics replace stale public output with BLOCKED before contact, pin reporter destinations under Harness private output, and preserve conventional-suite diagnostics. This is publication quarantine, not a shared sanitizer repair or a network sandbox. Local diagnostic console/report safety and actual candidate/CCD isolation still require their planned work.

## Validation evidence

Offline Node tests exercise the real evaluator, loader, CLIs and CI shell boundaries. A no-browser Playwright probe demonstrates passing assertions followed by global teardown failure, hard termination before report finalization, setup-hook rejection, intended body assertion failure, unrelated cleanup failure and retry preservation. Synthetic bundle fixtures demonstrate receipt identity and digest rejection; they are not candidate browser/CCD proofs.
