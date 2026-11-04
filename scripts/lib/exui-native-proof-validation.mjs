import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  validateIdentity,
  validateProof,
  validateRunManifest,
  evaluateReleaseEvidence,
} from "./exui-release-evidence.mjs";
import { nativeInvocations } from "./exui-native-contract.mjs";
import { getReleasePolicy } from "./exui-release-policy.mjs";
import { digestBytes, readExecutionEvidence } from "./exui-evidence-io.mjs";

const fact = (condition, code) => {
  if (!condition) throw new Error("NATIVE_REPORT_" + code);
};
const equal = (actual, expected, code) =>
  fact(isDeepStrictEqual(actual, expected), code);

export function validateCompleteNativeProofs(input, policy) {
  equal(
    [...input.manifest.requiredObligationIds].sort(),
    [...policy.requiredObligationIds].sort(),
    "POLICY_SELECTION_MISMATCH",
  );
  const invocations = nativeInvocations(policy.releaseScopeId);
  equal(
    input.executions.map(({ invocationId, kind }) => ({ invocationId, kind })),
    invocations.map(({ invocationId, kind }) => ({ invocationId, kind })),
    "INVOCATION_SELECTION_MISMATCH",
  );
  const baselineIds = policy.obligations
    .flatMap((item) => item.requiredProofIds)
    .sort();
  equal(
    input.results.map((item) => item.proofId).sort(),
    baselineIds,
    "BASELINE_SELECTION_MISMATCH",
  );
  equal(
    input.mutations.map((item) => item.mutationId).sort(),
    policy.mutationDefinitions.map((item) => item.mutationId).sort(),
    "MUTATION_SELECTION_MISMATCH",
  );
  const results = [
    ...input.results,
    ...input.mutations.map((item) => item.mutantResult),
  ];
  const cells = new Map(
    policy.obligations.flatMap((obligation) =>
      obligation.requiredProofIds.map((proofId) => [proofId, obligation]),
    ),
  );
  for (const definition of policy.mutationDefinitions)
    cells.set(
      definition.mutantProofId,
      policy.obligations.find(
        (obligation) => obligation.id === definition.obligationId,
      ),
    );
  for (const result of results) {
    validateProof(result);
    const obligation = cells.get(result.proofId);
    fact(obligation, "UNKNOWN_PROOF");
    equal(result.obligationId, obligation.id, "PROOF_OBLIGATION_MISMATCH");
    equal(result.boundary, obligation.boundary, "PROOF_BOUNDARY_MISMATCH");
    fact(
      result.complete === true &&
        result.retryIndex === 0 &&
        ["passed", "failed"].includes(result.outcome),
      "INCOMPLETE_PROOF",
    );
    fact(
      result.outcome === "passed"
        ? result.failureId === null
        : typeof result.failureId === "string" && result.failureId.length > 0,
      "UNATTRIBUTED_PROOF",
    );
  }
  for (const execution of input.executions) {
    validateIdentity(execution.identity);
    fact(
      execution.terminalState === "completed" &&
        execution.unexpectedGlobalErrors.length === 0,
      "INCOMPLETE_EXECUTION",
    );
    const proofs = results.filter(
      (item) => item.invocationId === execution.invocationId,
    );
    fact(proofs.length > 0, "UNREFERENCED_EXECUTION");
    equal(
      execution.runnerExitCode,
      proofs.some((item) => item.outcome === "failed") ? 1 : 0,
      "EXECUTION_EXIT_MISMATCH",
    );
    for (const proof of proofs) {
      equal(proof.runId, input.manifest.runId, "PROOF_RUN_MISMATCH");
      equal(proof.identity, execution.identity, "PROOF_IDENTITY_MISMATCH");
    }
  }
  for (const result of input.results) {
    equal(
      result.identity,
      input.manifest.identity,
      "BASELINE_IDENTITY_MISMATCH",
    );
    equal(
      input.executions.find((item) => item.invocationId === result.invocationId)
        ?.kind,
      "baseline",
      "BASELINE_EXECUTION_MISMATCH",
    );
  }
  for (const witness of input.mutations) {
    const definition = policy.mutationDefinitions.find(
      (item) => item.mutationId === witness.mutationId,
    );
    equal(witness.runId, input.manifest.runId, "MUTATION_RUN_MISMATCH");
    equal(
      witness.obligationId,
      definition.obligationId,
      "MUTATION_OBLIGATION_MISMATCH",
    );
    equal(
      witness.mutationDefinitionDigest,
      definition.definitionDigest,
      "MUTATION_DEFINITION_MISMATCH",
    );
    validateIdentity(witness.baselineIdentity);
    validateIdentity(witness.mutantIdentity);
    equal(
      witness.baselineIdentity,
      input.manifest.identity,
      "MUTATION_BASELINE_IDENTITY_MISMATCH",
    );
    equal(
      witness.baselineResult,
      input.results.find((item) => item.proofId === definition.baselineProofId),
      "MUTATION_BASELINE_PROOF_MISMATCH",
    );
    equal(
      witness.mutantResult.identity,
      witness.mutantIdentity,
      "MUTATION_IDENTITY_MISMATCH",
    );
  }
}
export function validateNativeOutcome(input, verdict) {
  // A complete but unsuccessful product/fault observation is reportable. A
  // structurally rejected evidence set must never credit individual witnesses.
  const outcomeReasons = new Set([
    "MUTATION_BASELINE_UNAVAILABLE",
    "EXPECTED_MUTATION_ASSERTION_MISSING",
    "MUTANT_CONTENT_IDENTITY_UNCHANGED",
    ...input.results
      .filter((result) => result.outcome === "failed")
      .map(
        (result) =>
          `OBSERVED_FAILED_RESULT:${result.proofId}:${result.failureId}`,
      ),
  ]);
  fact(
    verdict.reasons.every((reason) => outcomeReasons.has(reason)),
    "STRUCTURAL_EVIDENCE_REJECTED",
  );
}

// This permits continuation to a separate phase; the old CCD verdict remains BLOCKED.
export function isKnownPostalBlock(input, verdict) {
  try {
    const policy = getReleasePolicy("exui-ccd-pilot");
    validateRunManifest(input.manifest);
    equal(input.policy, policy, "POSTAL_CURRENT_POLICY_REQUIRED");
    equal(
      input.manifest.releaseScopeId,
      policy.releaseScopeId,
      "POSTAL_SCOPE_REQUIRED",
    );
    equal(
      input.manifest.policyDigest,
      policy.policyDigest,
      "POSTAL_POLICY_MISMATCH",
    );
    validateCompleteNativeProofs(input, policy);
    validateNativeOutcome(input, verdict);
    equal(
      verdict,
      evaluateReleaseEvidence(input),
      "POSTAL_RAW_VERDICT_MISMATCH",
    );
    equal(
      verdict,
      {
        status: "BLOCKED",
        exitCode: 2,
        reasons: [
          "MUTATION_BASELINE_UNAVAILABLE",
          "OBSERVED_FAILED_RESULT:ccd-postal-two-roundtrip:postal-required-fields",
        ],
      },
      "POSTAL_ONLY_VERDICT_REQUIRED",
    );
    for (const result of input.results) {
      const postal = result.proofId === "ccd-postal-two-roundtrip";
      equal(
        result.outcome,
        postal ? "failed" : "passed",
        "POSTAL_ONLY_BASELINE_REQUIRED",
      );
      equal(
        result.failureId,
        postal ? "postal-required-fields" : null,
        "POSTAL_BASELINE_FAILURE_REQUIRED",
      );
    }
    for (const witness of input.mutations) {
      const definition = policy.mutationDefinitions.find(
        (item) => item.mutationId === witness.mutationId,
      );
      const invocation = nativeInvocations(policy.releaseScopeId).find(
        (item) => item.mutation === witness.mutationId,
      );
      const postal = witness.mutationId === "ccd-drop-postal-optional-child";
      equal(
        witness.mutantResult.proofId,
        definition.mutantProofId,
        "POSTAL_MUTANT_PROOF_MISMATCH",
      );
      equal(
        witness.mutantResult.invocationId,
        invocation.invocationId,
        "POSTAL_MUTANT_INVOCATION_MISMATCH",
      );
      equal(
        witness.mutantResult.outcome,
        "failed",
        "POSTAL_MUTANT_OUTCOME_REQUIRED",
      );
      equal(
        witness.mutantResult.failureId,
        postal ? "postal-required-fields" : definition.expectedFailureId,
        "POSTAL_MUTANT_FAILURE_REQUIRED",
      );
      fact(
        [
          "artifactDigest",
          "dependencyLockDigest",
          "toolkitDigest",
          "configurationDigest",
          "definitionDigests",
          "dependencyIdentities",
        ].some(
          (field) =>
            !isDeepStrictEqual(
              witness.mutantIdentity[field],
              input.manifest.identity[field],
            ),
        ),
        "POSTAL_MUTANT_CONTENT_UNCHANGED",
      );
    }
    return true;
  } catch {
    return false;
  }
}

const checkpointFact = (condition, code) => {
  if (!condition) throw new Error("NATIVE_CHECKPOINT_" + code);
};
const checkpointEqual = (actual, expected, code) =>
  checkpointFact(isDeepStrictEqual(actual, expected), code);
const checkpointHash = (value) => /^sha256:[a-f0-9]{64}$/.test(value ?? "");
function checkpointPath(file, directory = false) {
  checkpointFact(
    typeof file === "string" &&
      path.isAbsolute(file) &&
      path.normalize(file) === file,
    "CANONICAL_PATH_REQUIRED",
  );
  const stat = fs.lstatSync(file);
  checkpointFact(
    !stat.isSymbolicLink() &&
      (directory ? stat.isDirectory() : stat.isFile()) &&
      fs.realpathSync(file) === file,
    "PATH_ALIAS_OR_TYPE",
  );
  return file;
}
function checkpointArtifact(directory, relative) {
  const file = checkpointPath(path.join(directory, relative));
  const bytes = fs.readFileSync(file);
  return {
    value: JSON.parse(bytes),
    reference: { path: relative, digest: digestBytes(bytes) },
  };
}

// This is a baseline handoff, not a reduced release gate. The full current policy
// remains in the returned input; the parent owns lifecycle checks and final evaluation.
export function readEventBaselineCheckpoint(directory, expected) {
  checkpointPath(directory, true);
  const scope = "exui-ccd-event-capability-pilot";
  checkpointEqual(expected?.releaseScopeId, scope, "SCOPE_REQUIRED");
  checkpointEqual(expected.nativeAuthority, true, "NATIVE_AUTHORITY_REQUIRED");
  const policy = getReleasePolicy(scope);
  checkpointEqual(
    expected.policyDigest,
    policy.policyDigest,
    "POLICY_MISMATCH",
  );
  const record = checkpointArtifact(directory, "baseline/manifest.json");
  const manifest = validateRunManifest(record.value);
  checkpointFact(
    /^ccd-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      manifest.runId,
    ),
    "RUN_ID_REQUIRED",
  );
  for (const field of [
    "runId",
    "harnessCommit",
    "releaseScopeId",
    "policyDigest",
    "identity",
  ])
    checkpointEqual(
      manifest[field],
      expected[field],
      "EXPECTED_IDENTITY_MISMATCH",
    );
  checkpointEqual(
    manifest.requiredObligationIds,
    policy.requiredObligationIds,
    "FULL_POLICY_SELECTION_REQUIRED",
  );
  checkpointEqual(
    manifest.runtimeMetadata.harnessSourceState,
    "clean",
    "CLEAN_SOURCE_REQUIRED",
  );
  checkpointEqual(
    manifest.runtimeMetadata.isolation,
    "native-separate-api-owned-network-none",
    "NATIVE_ISOLATION_REQUIRED",
  );
  for (const field of [
    "harnessSourceDigest",
    "harnessDependencyDigest",
    "browserDigest",
  ]) {
    checkpointFact(checkpointHash(expected[field]), "EXPECTED_DIGEST_REQUIRED");
    checkpointEqual(
      manifest.runtimeMetadata[field],
      expected[field],
      "RUNTIME_IDENTITY_MISMATCH",
    );
  }
  const baselineIds = ["ccd-courtadmin-email-one", "ccd-event-create-denied"];
  checkpointEqual(
    policy.obligations.flatMap((item) => item.requiredProofIds).sort(),
    baselineIds,
    "CURRENT_BASELINE_POLICY_REQUIRED",
  );
  const raw = checkpointArtifact(directory, "baseline/execution.json");
  checkpointEqual(
    raw.value.resultArtifact?.path,
    "baseline/report.json",
    "REPORT_PATH_REQUIRED",
  );
  checkpointPath(path.join(directory, "baseline/report.json"));
  const {
    execution,
    results,
    references: executionReferences,
  } = readExecutionEvidence(directory, raw.reference, manifest, policy);
  checkpointEqual(
    execution.invocationId,
    "baseline",
    "BASELINE_INVOCATION_REQUIRED",
  );
  checkpointEqual(execution.kind, "baseline", "BASELINE_KIND_REQUIRED");
  checkpointEqual(execution.runId, manifest.runId, "EXECUTION_RUN_MISMATCH");
  checkpointEqual(
    execution.identity,
    manifest.identity,
    "EXECUTION_IDENTITY_MISMATCH",
  );
  checkpointEqual(execution.terminalState, "completed", "EXECUTION_INCOMPLETE");
  checkpointEqual(
    execution.unexpectedGlobalErrors,
    [],
    "UNEXPECTED_EXECUTION_ERRORS",
  );
  checkpointEqual(
    results.map((item) => item.proofId).sort(),
    baselineIds,
    "EXACT_BASELINE_PROOFS_REQUIRED",
  );
  for (const result of results) {
    validateProof(result);
    checkpointFact(
      ["passed", "failed"].includes(result.outcome),
      "INCOMPLETE_PROOF",
    );
    checkpointEqual(result.boundary, "ccd", "PROOF_BOUNDARY_MISMATCH");
  }
  const terminalRecord = checkpointArtifact(
    directory,
    "baseline/framework-terminal.json",
  );
  const terminal = terminalRecord.value;
  checkpointEqual(
    terminal,
    {
      code: results.some((result) => result.outcome === "failed") ? 1 : 0,
      signal: null,
    },
    "FRAMEWORK_TERMINAL_MISMATCH",
  );
  checkpointEqual(
    execution.runnerExitCode,
    terminal.code,
    "EXECUTION_TERMINAL_MISMATCH",
  );
  const references = [
    record.reference,
    ...executionReferences,
    terminalRecord.reference,
  ];
  return {
    input: {
      manifest,
      policy,
      executions: [execution],
      results,
      mutations: [],
      externalResults: [],
    },
    terminal,
    references,
    checkpointDigest: digestBytes(JSON.stringify(references)),
  };
}
