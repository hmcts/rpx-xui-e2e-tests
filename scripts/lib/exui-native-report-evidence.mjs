import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { digestBytes, loadRunEvidence } from "./exui-evidence-io.mjs";
import { getReleasePolicy } from "./exui-release-policy.mjs";
import {
  validateIdentity,
  validateProof,
  validatePromotionReceipt,
} from "./exui-release-evidence.mjs";
import { projectConfigurationCoverage } from "./exui-configuration-runtime-coverage.mjs";
import { nativeInvocations } from "./exui-native-contract.mjs";
import { validateNativePhaseFinalization } from "./exui-native-ci-ownership.mjs";

const scopes = {
  family: "exui-wa-family-pilot",
  scope: "exui-wa-scope-pilot",
  ccd: "exui-ccd-pilot",
};
const hashPattern = /^sha256:[a-f0-9]{64}$/;
const uuid =
  "[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
const fact = (condition, code) => {
  if (!condition) throw new Error("NATIVE_REPORT_" + code);
};
const equal = (actual, expected, code) =>
  fact(isDeepStrictEqual(actual, expected), code);
const within = (root, file) => {
  const relative = path.relative(root, file);
  return (
    relative !== "" &&
    !path.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(".." + path.sep)
  );
};
function canonical(file, directory = false) {
  fact(
    typeof file === "string" &&
      path.isAbsolute(file) &&
      path.normalize(file) === file,
    "ABSOLUTE_CANONICAL_PATH_REQUIRED",
  );
  const stat = fs.lstatSync(file);
  fact(
    !stat.isSymbolicLink() &&
      (directory ? stat.isDirectory() : stat.isFile()) &&
      fs.realpathSync(file) === file,
    "PATH_ALIAS_OR_TYPE",
  );
  return file;
}
function read(file) {
  canonical(file);
  const bytes = fs.readFileSync(file);
  return { bytes, value: JSON.parse(bytes) };
}
function reference(root, item) {
  fact(
    item &&
      typeof item.path === "string" &&
      !path.isAbsolute(item.path) &&
      hashPattern.test(item.digest),
    "ARTIFACT_REFERENCE_REQUIRED",
  );
  const file = path.resolve(root, item.path);
  fact(within(root, file), "ARTIFACT_OUTSIDE_PHASE");
  const record = read(file);
  equal(digestBytes(record.bytes), item.digest, "ARTIFACT_DIGEST_MISMATCH");
  return record.value;
}
function validateRawPaths(directory, run) {
  fact(
    Array.isArray(run.executionArtifacts) && Array.isArray(run.mutations),
    "EXECUTIONS_REQUIRED",
  );
  for (const item of run.executionArtifacts) {
    const execution = reference(directory, item);
    reference(directory, execution.resultArtifact);
  }
  for (const mutation of run.mutations)
    reference(directory, mutation.derivationArtifact);
}
function validateCompleteProofs(input, policy) {
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
function phaseProjection(directory, selection, ciPhase, expected) {
  const { phase, policy, terminal } = selection;
  const pin = selection.expected;
  equal(policy, getReleasePolicy(scopes[phase]), "CURRENT_POLICY_REQUIRED");
  const { policyDigest, ...content } = policy;
  equal(
    digestBytes(JSON.stringify(content)),
    policyDigest,
    "POLICY_DIGEST_MISMATCH",
  );
  equal(pin.policyDigest, policyDigest, "EXPECTED_POLICY_MISMATCH");
  equal(pin.releaseScopeId, scopes[phase], "SCOPE_MISMATCH");
  equal(pin.harnessCommit, expected.harnessCommit, "SOURCE_MISMATCH");
  equal(
    pin.identity.artifactDigest,
    expected.candidateArtifactDigest,
    "CANDIDATE_MISMATCH",
  );
  fact(
    new RegExp("^(candidate|ccd)-" + uuid + "$").test(pin.runId),
    "RUN_ID_REQUIRED",
  );
  fact(pin.nativeAuthority === true, "NATIVE_AUTHORITY_REQUIRED");
  equal(
    terminal,
    { code: ciPhase.exitCode, signal: null },
    "TERMINAL_MISMATCH",
  );
  for (const field of [
    "harnessSourceDigest",
    "harnessDependencyDigest",
    "browserDigest",
    "evidenceManifestDigest",
    "receiptArtifactDigest",
  ])
    fact(hashPattern.test(pin[field]), "EXPECTED_DIGEST_REQUIRED");
  const run = read(path.join(directory, "run.json")).value;
  validateRawPaths(directory, run);
  const loaded = loadRunEvidence(path.join(directory, "run.json"), policy);
  const gate = read(path.join(directory, "gate.json"));
  equal(
    digestBytes(gate.bytes),
    pin.receiptArtifactDigest,
    "RECEIPT_DIGEST_MISMATCH",
  );
  equal(
    ciPhase.receiptArtifactDigest,
    pin.receiptArtifactDigest,
    "CI_RECEIPT_MISMATCH",
  );
  equal(gate.value, loaded.receipt, "RECEIPT_RECOMPUTATION_MISMATCH");
  equal(
    loaded.evidenceManifestDigest,
    pin.evidenceManifestDigest,
    "EVIDENCE_DIGEST_MISMATCH",
  );
  for (const field of [
    "runId",
    "harnessCommit",
    "releaseScopeId",
    "policyDigest",
    "identity",
  ])
    equal(
      loaded.input.manifest[field],
      pin[field],
      "MANIFEST_IDENTITY_MISMATCH",
    );
  const runtime = loaded.input.manifest.runtimeMetadata;
  equal(runtime.harnessSourceState, "clean", "SOURCE_NOT_CLEAN");
  equal(
    runtime.isolation,
    "native-separate-api-owned-network-none",
    "NATIVE_ISOLATION_REQUIRED",
  );
  for (const field of [
    "harnessSourceDigest",
    "harnessDependencyDigest",
    "browserDigest",
  ])
    equal(runtime[field], pin[field], "RUNTIME_IDENTITY_MISMATCH");
  equal(
    validatePromotionReceipt(gate.value, pin),
    gate.value.verdict,
    "PROMOTION_IDENTITY_MISMATCH",
  );
  equal(
    {
      phase,
      status: gate.value.verdict.status,
      exitCode: gate.value.verdict.exitCode,
      receiptArtifactDigest: pin.receiptArtifactDigest,
    },
    ciPhase,
    "CI_PHASE_MISMATCH",
  );
  validateCompleteProofs(loaded.input, policy);
  // A complete but unsuccessful product/fault observation is reportable. A
  // structurally rejected evidence set must never credit individual witnesses.
  const outcomeReasons = new Set([
    "MUTATION_BASELINE_UNAVAILABLE",
    "EXPECTED_MUTATION_ASSERTION_MISSING",
    "MUTANT_CONTENT_IDENTITY_UNCHANGED",
    ...loaded.input.results
      .filter((result) => result.outcome === "failed")
      .map(
        (result) =>
          `OBSERVED_FAILED_RESULT:${result.proofId}:${result.failureId}`,
      ),
  ]);
  fact(
    gate.value.verdict.reasons.every((reason) => outcomeReasons.has(reason)),
    "STRUCTURAL_EVIDENCE_REJECTED",
  );
  canonical(path.join(directory, "controller-terminal.json"));
  for (const execution of loaded.input.executions) {
    for (const file of [
      "candidate-write-denial.json",
      "candidate-lifecycle.json",
    ])
      canonical(path.join(directory, execution.invocationId, file));
  }
  validateNativePhaseFinalization(directory, loaded.input.executions, terminal);
  // Raw failure text is private, even when it happens to be a valid identifier.
  const failureIds = new Set([
    "postal-required-fields",
    ...policy.mutationDefinitions.map((item) => item.expectedFailureId),
  ]);
  const publicFailure = (value) => (failureIds.has(value) ? value : null);
  return {
    phase,
    releaseScopeId: scopes[phase],
    runId: pin.runId,
    policyDigest,
    receiptArtifactDigest: pin.receiptArtifactDigest,
    status: ciPhase.status,
    exitCode: ciPhase.exitCode,
    baselineProofs: loaded.input.results.map((result) => ({
      proofId: result.proofId,
      invocationId: result.invocationId,
      status: result.outcome,
      failureId: publicFailure(result.failureId),
    })),
    faults: policy.mutationDefinitions.map((definition) => {
      const witness = loaded.input.mutations.find(
        (item) => item.mutationId === definition.mutationId,
      );
      const mutant = witness.mutantResult;
      const invocation = nativeInvocations(policy.releaseScopeId).find(
        (item) => item.mutation === definition.mutationId,
      );
      equal(
        mutant.invocationId,
        invocation.invocationId,
        "MUTATION_INVOCATION_MISMATCH",
      );
      equal(
        mutant.proofId,
        definition.mutantProofId,
        "MUTATION_PROOF_MISMATCH",
      );
      const changed = [
        "artifactDigest",
        "dependencyLockDigest",
        "toolkitDigest",
        "configurationDigest",
        "definitionDigests",
        "dependencyIdentities",
      ].some(
        (field) =>
          !isDeepStrictEqual(
            witness.baselineIdentity[field],
            witness.mutantIdentity[field],
          ),
      );
      return {
        mutationId: definition.mutationId,
        proofId: definition.mutantProofId,
        invocationId: mutant.invocationId,
        baselineProofId: definition.baselineProofId,
        baselineStatus: witness.baselineResult.outcome,
        expectedFailureId: definition.expectedFailureId,
        observedFailureId: publicFailure(mutant.failureId),
        outcome:
          changed &&
          witness.baselineResult.outcome === "passed" &&
          mutant.outcome === "failed" &&
          mutant.failureId === definition.expectedFailureId
            ? "expected-failure-observed"
            : "invalid-witness",
      };
    }),
  };
}

/** Independent expectations are caller-owned launch/terminal captures, never inferred from the receipt. */
export async function readNativeReportEvidence(descriptorPath) {
  try {
    const descriptor = read(descriptorPath);
    const { directory, expected } = descriptor.value;
    fact(descriptor.value.schemaVersion === 1, "DESCRIPTOR_SCHEMA_REQUIRED");
    canonical(directory, true);
    fact(
      new RegExp("^ci-" + uuid + "$").test(expected.jobRunId),
      "JOB_RUN_REQUIRED",
    );
    fact(
      /^[a-f0-9]{40}$/.test(expected.harnessCommit) &&
        hashPattern.test(expected.candidateArtifactDigest) &&
        hashPattern.test(expected.ciResultDigest),
      "SOURCE_IDENTITY_REQUIRED",
    );
    equal(
      expected.phases.map((item) => item.phase),
      Object.keys(scopes),
      "PHASE_SELECTION_REQUIRED",
    );
    const result = read(path.join(directory, "private/ci-result.json"));
    equal(
      digestBytes(result.bytes),
      expected.ciResultDigest,
      "CI_RESULT_DIGEST_MISMATCH",
    );
    const ci = result.value;
    equal(
      ci.classification,
      "fixed-pilot-suite-no-full-release-approval",
      "CI_CLASSIFICATION_REQUIRED",
    );
    equal(ci.jobRunId, expected.jobRunId, "CI_JOB_MISMATCH");
    fact(ci.cleanupComplete === true, "CI_CLEANUP_INCOMPLETE");
    equal(
      ci.phaseResults.map((item) => item.phase),
      Object.keys(scopes),
      "CI_PHASE_SELECTION_REQUIRED",
    );
    const phases = expected.phases.map((item, index) =>
      phaseProjection(
        canonical(path.join(directory, "private", item.phase), true),
        item,
        ci.phaseResults[index],
        expected,
      ),
    );
    fact(
      phases
        .slice(0, -1)
        .every((item) => item.status === "PASS" && item.exitCode === 0),
      "FIXED_SEQUENCE_MISMATCH",
    );
    equal(
      { status: ci.status, exitCode: ci.exitCode },
      { status: phases.at(-1).status, exitCode: phases.at(-1).exitCode },
      "CI_OUTCOME_MISMATCH",
    );
    const accounting = projectConfigurationCoverage({
      phaseDirectory: path.join(directory, "private/ccd"),
    });
    const ccdPin = expected.phases.find(
      (item) => item.phase === "ccd",
    ).expected;
    equal(
      accounting.receiptArtifactDigest,
      ccdPin.receiptArtifactDigest,
      "COVERAGE_RECEIPT_MISMATCH",
    );
    equal(
      accounting.evidenceManifestDigest,
      ccdPin.evidenceManifestDigest,
      "COVERAGE_EVIDENCE_MISMATCH",
    );
    const creditedObligationIds = accounting.report.executedProofs
      .filter((item) => item.status === "passed")
      .map((item) => item.obligationId);
    const catalogueCoverage = {
      catalogueDigest: digestBytes(
        JSON.stringify(accounting.catalogue.obligations),
      ),
      selected: accounting.report.coverage.selected,
      candidate: accounting.report.coverage.candidate,
      ccd: accounting.report.coverage.ccd,
      creditedObligationIds,
      missing: accounting.report.coverage.missingCandidateOrCcd.length,
      sourceArtifactDigests: accounting.report.provenance.sourceArtifactDigests,
      releaseCredit: false,
    };
    const first = expected.phases[0].expected;
    for (const { expected: pin } of expected.phases) {
      equal(
        pin.harnessSourceDigest,
        first.harnessSourceDigest,
        "PHASE_SOURCE_MISMATCH",
      );
      equal(
        pin.identity.webappCommit,
        first.identity.webappCommit,
        "PHASE_CANDIDATE_MISMATCH",
      );
    }
    return {
      schemaVersion: 1,
      kind: "native-policy-proof-outcomes",
      descriptorDigest: digestBytes(descriptor.bytes),
      source: {
        harnessCommit: expected.harnessCommit,
        harnessSourceDigest: first.harnessSourceDigest,
        candidateArtifactDigest: expected.candidateArtifactDigest,
        webappCommit: first.identity.webappCommit,
      },
      jobRunId: ci.jobRunId,
      status: ci.status,
      exitCode: ci.exitCode,
      releaseApproval: false,
      phases,
      catalogueCoverage,
    };
  } catch (error) {
    // Filesystem/library errors can contain private paths or raw evidence; expose fixed codes only.
    // eslint-disable-next-line preserve-caught-error -- A public consumer must not retain private filesystem/evidence causes.
    throw new Error(
      /^NATIVE_REPORT_[A-Z_]+$/.test(error?.message)
        ? error.message
        : "NATIVE_REPORT_INVALID_EVIDENCE",
    );
  }
}
