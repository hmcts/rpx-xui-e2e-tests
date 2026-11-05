import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { digestBytes, loadRunEvidence } from "./exui-evidence-io.mjs";
import { getReleasePolicy } from "./exui-release-policy.mjs";
import { validatePromotionReceipt } from "./exui-release-evidence.mjs";
import {
  validateCompleteNativeProofs,
  validateNativeOutcome,
  isKnownPostalBlock,
} from "./exui-native-proof-validation.mjs";
import { projectConfigurationCoverage } from "./exui-configuration-runtime-coverage.mjs";
import { validateCallbackTransitionEvidence } from "./exui-recipient-callback-transition.mjs";
import { validateEventTransitionEvidence } from "./exui-ccd-event-transition.mjs";
import { nativeInvocations } from "./exui-native-contract.mjs";
import { validateNativePhaseFinalization } from "./exui-native-ci-ownership.mjs";
import { assertRoutingInterpreter, ROUTING_SCOPE } from "./exui-routing-contract.mjs";
import { admitSharedRoleNative } from "./exui-shared-role-native-binding.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scopes = {
  family: "exui-wa-family-pilot",
  scope: "exui-wa-scope-pilot",
  ccd: "exui-ccd-pilot",
  eventCapability: "exui-ccd-event-capability-pilot",
  routing: ROUTING_SCOPE,
  recipientCallback: "exui-ccd-recipient-callback-pilot",
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
      ...(phase === "eventCapability"
        ? { eventTransition: pin.eventTransition }
        : phase === "recipientCallback"
          ? { callbackTransition: pin.callbackTransition }
          : {}),
    },
    ciPhase,
    "CI_PHASE_MISMATCH",
  );
  validateCompleteNativeProofs(loaded.input, policy);
  validateNativeOutcome(loaded.input, gate.value.verdict);
  if (phase === "ccd" && gate.value.verdict.status !== "PASS")
    fact(
      isKnownPostalBlock(loaded.input, gate.value.verdict),
      "CCD_POSTAL_ONLY_BLOCK_REQUIRED",
    );
  if (phase === "eventCapability")
    validateEventTransitionEvidence(directory, pin, loaded.input);
  if (phase === "recipientCallback")
    validateCallbackTransitionEvidence(directory, pin, loaded.input);
  if (phase === "routing") {
    const routeInput = read(path.join(directory, "input.json")).value;
    const review = read(path.join(ROOT, "scripts/fixtures/exui-configuration-review.json")).value;
    const interpreter = assertRoutingInterpreter(
      routeInput.artifact,
      review,
      routeInput.artifact.identity,
    );
    equal(routeInput.releaseScopeId, ROUTING_SCOPE, "ROUTING_SCOPE_MISMATCH");
    equal(routeInput.routingInterpreter, interpreter, "ROUTING_IMPLEMENTATION_MISMATCH");
    equal(pin.routingInterpreter, interpreter, "ROUTING_EXPECTATION_MISMATCH");
    equal(runtime.routingInterpreter, JSON.stringify(interpreter), "ROUTING_RUNTIME_IDENTITY_MISMATCH");
    equal(routeInput.artifact.identity.artifactDigest, pin.identity.artifactDigest, "ROUTING_CANDIDATE_MISMATCH");
    for (const field of ["webappCommit", "dependencyLockDigest", "toolkitVersion", "toolkitDigest"])
      equal(routeInput.artifact.identity[field], pin.identity[field], "ROUTING_CANDIDATE_MISMATCH");
  }
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
        .slice(0, 2)
        .every((item) => item.status === "PASS" && item.exitCode === 0),
      "FIXED_SEQUENCE_MISMATCH",
    );
    const worstExit = Math.max(...phases.map((item) => item.exitCode));
    equal(
      { status: ci.status, exitCode: ci.exitCode },
      { status: ["PASS", "FAIL", "BLOCKED"][worstExit], exitCode: worstExit },
      "CI_OUTCOME_MISMATCH",
    );
    const accounting = projectConfigurationCoverage({
      phaseDirectory: path.join(directory, "private/ccd"),
      eventPhaseDirectory: path.join(directory, "private/eventCapability"),
      routingPhaseDirectory: path.join(directory, "private/routing"),
      callbackPhaseDirectory: path.join(directory, "private/recipientCallback"),
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
    for (const phase of ["ccd", "eventCapability", "routing", "recipientCallback"]) {
      const selected = expected.phases.find((item) => item.phase === phase);
      const ref = accounting.phaseReferences[phase];
      for (const field of [
        "releaseScopeId",
        "runId",
        "receiptArtifactDigest",
        "evidenceManifestDigest",
      ])
        equal(ref[field], selected.expected[field], "COVERAGE_PHASE_MISMATCH");
      equal(
        ref.status,
        phases.find((item) => item.phase === phase).status,
        "COVERAGE_PHASE_MISMATCH",
      );
    }
    let sharedRoleAdmission;
    if (descriptor.value.sharedRoleAdmission) {
      const admission = descriptor.value.sharedRoleAdmission;
      equal(Object.keys(admission).sort(), ['candidateArtifactPath','sourceImageInputs'], 'SHARED_ROLE_INPUT_SCHEMA');
      canonical(admission.candidateArtifactPath);
      equal(admission.candidateArtifactPath, read(path.join(directory, 'private/job-input.json')).value.candidateManifest, 'SHARED_ROLE_CANDIDATE_PATH');
      if (['ccd', 'eventCapability'].every(phase => phases.find(item => item.phase === phase)?.status === 'PASS')) {
        const accepted = await admitSharedRoleNative({ harnessRoot: ROOT, ccdPhaseDirectory: path.join(directory, 'private/ccd'),
          eventPhaseDirectory: path.join(directory, 'private/eventCapability'), candidateArtifactPath: admission.candidateArtifactPath,
          sourceImageInputs: admission.sourceImageInputs });
        equal(accepted.candidateArtifactDigest, expected.candidateArtifactDigest, 'SHARED_ROLE_CANDIDATE_DIGEST');
        const row = accounting.catalogue.obligations.find(item => item.id === accepted.obligationId);
        fact(row?.kind === 'shared-policy' && row.requiredBoundary === 'ccd', 'SHARED_ROLE_CATALOGUE_ROW');
        sharedRoleAdmission = { ...accepted, ccdRunId: accounting.phaseReferences.ccd.runId,
          eventRunId: accounting.phaseReferences.eventCapability.runId };
      }
    }
    const creditedObligationIds = accounting.report.executedProofs
      .filter((item) => item.status === "passed")
      .map((item) => item.obligationId);
    if (sharedRoleAdmission) {
      fact(!creditedObligationIds.includes(sharedRoleAdmission.obligationId), 'SHARED_ROLE_DUPLICATE_CREDIT');
      creditedObligationIds.push(sharedRoleAdmission.obligationId);
    }
    const catalogueCoverage = {
      catalogueDigest: digestBytes(
        JSON.stringify(accounting.catalogue.obligations),
      ),
      selected: accounting.report.coverage.selected,
      candidate: accounting.report.coverage.candidate,
      ccd: accounting.report.coverage.ccd + (sharedRoleAdmission ? 1 : 0),
      creditedObligationIds,
      missing: accounting.report.coverage.missingCandidateOrCcd.length - (sharedRoleAdmission ? 1 : 0),
      sourceArtifactDigests: accounting.report.provenance.sourceArtifactDigests,
      phaseReferences: accounting.phaseReferences,
      ...(sharedRoleAdmission ? { sharedRoleAdmission } : {}),
      releaseCredit: false,
    };
    const first = expected.phases[0].expected;
    for (const { expected: pin } of expected.phases) {
      equal(
        pin.harnessSourceDigest,
        first.harnessSourceDigest,
        "PHASE_SOURCE_MISMATCH",
      );
      for (const field of ["harnessDependencyDigest", "browserDigest"])
        equal(pin[field], first[field], "PHASE_TOOLCHAIN_MISMATCH");
      equal(
        {
          webappCommit: pin.identity.webappCommit,
          artifactDigest: pin.identity.artifactDigest,
          dependencyLockDigest: pin.identity.dependencyLockDigest,
          toolkitVersion: pin.identity.toolkitVersion,
          toolkitDigest: pin.identity.toolkitDigest,
        },
        {
          webappCommit: first.identity.webappCommit,
          artifactDigest: first.identity.artifactDigest,
          dependencyLockDigest: first.identity.dependencyLockDigest,
          toolkitVersion: first.identity.toolkitVersion,
          toolkitDigest: first.identity.toolkitDigest,
        },
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
