import {readSharedRoleArtifact} from './exui-shared-role-artifacts.mjs';
import {sharedRoleObservationBinding,replaySharedRoleDenial} from './exui-shared-role-observations.mjs';
import businessScalars from './exui-business-scalar-detail.cjs';
import {assertMandatoryEmailIntent,readMandatoryEmailNativeBinding} from './exui-mandatory-email-event-contract.mjs';
import {readMandatoryEmailAdmissionPacket,mandatoryEmailNativeJointAdmission,creditMandatoryEmailRows} from './exui-mandatory-email-event-admission.mjs';
import stageTelemetry from './exui-native-stage-telemetry.cjs';
import {assertStCicOwnership,assertMandatoryEmailOwnership} from './exui-st-cic-ownership.mjs';
import {readStCicNativeBinding,readStCicProfileAdmissionPacket} from './exui-st-cic-profile-admission.mjs';
import {stCicNativeJointAdmission} from './exui-st-cic-native-joint.mjs';
import {readComplexNativeBinding,readComplexAdmissionPacket,complexNativeJointAdmission,assertComplexOwnership} from './exui-complex-email-admission.mjs';
import {readPersonalNativeBinding,readPersonalAdmissionPacket,personalNativeJointAdmission} from './exui-personal-service-admission.mjs';
import {readDivorceProfileAdmissionPacket,divorceNativeJointAdmission} from "./exui-divorce-profile-admission.mjs";
import {readFrProfileAdmissionPacket} from "../run-harness-fr-profile-admission.mjs";
import {readCmcProfileAdmissionPacket} from "../run-harness-cmc-profile-admission.mjs";
import {readDivorceNativeBinding} from "./exui-divorce-native-binding.mjs";
import {validateSelectorEventEvidence} from './exui-selector-event-row-evidence.mjs';
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { digestBytes, loadRunEvidence, readEvidenceArtifact } from "./exui-evidence-io.mjs";
import { getReleasePolicy } from "./exui-release-policy.mjs";
import { validatePromotionReceipt } from "./exui-release-evidence.mjs";
import {
  validateCompleteNativeProofs,
  validateNativeOutcome,
  isKnownPostalBlock,
} from "./exui-native-proof-validation.mjs";
import { projectConfigurationCoverage, creditComplexEmailRow } from "./exui-configuration-runtime-coverage.mjs";
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
  selectorEventRow: "exui-ccd-selector-event-row-pilot",
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
  const invocations = run.executionArtifacts.map((item) => {
    const execution = reference(directory, item);
    const report = reference(directory, execution.resultArtifact);
    const configuredWorkers = report.configuredWorkers ?? null;
    fact(configuredWorkers === null || (Number.isSafeInteger(configuredWorkers) && configuredWorkers > 0), "WORKER_CONFIGURATION_INVALID");
    return {invocationId: execution.invocationId, configuredWorkers};
  });
  for (const mutation of run.mutations)
    reference(directory, mutation.derivationArtifact);
  return invocations;
}
function denialDisplay(directory, execution, report, test, manifest) {
  const selected={baseline:'ccd-role-policy','ccd-broaden-access':'ccd-access-broadened','ccd-write-then-deny':'ccd-write-then-deny'};
  equal(selected[execution.invocationId],test.proofId,'DENIAL_DISPLAY_INVOCATION');
  fact(test.businessScalars===undefined,'DENIAL_DISPLAY_SEALED_ROLE_ONLY');
  const raw=name=>readSharedRoleArtifact(directory,execution,name,'exui-ccd-pilot');
  const role=name=>JSON.parse(raw(name));
  const heldManifest=role('manifest.json'),context=role('context.json'),personas=role('personas.json'),observation=role('policy-observation.json');
  equal(context,report.context,'DENIAL_DISPLAY_FRAMEWORK_CONTEXT');
  for(const key of ['runId','harnessCommit','releaseScopeId','policyDigest'])equal(heldManifest[key],manifest[key],'DENIAL_DISPLAY_SOURCE');
  equal(heldManifest.identity,execution.identity,'DENIAL_DISPLAY_IDENTITY');
  for(const key of ['harnessSourceDigest','definitionImportDigest','observedDefinitionDigest','definitionVersion','ccdNamespace'])equal(heldManifest.runtimeMetadata[key],manifest.runtimeMetadata[key],'DENIAL_DISPLAY_RUNTIME_BINDING');
  const binding=sharedRoleObservationBinding(heldManifest,context),actorId=personas?.credentials?.denied?.userId;
  fact(typeof actorId==='string'&&actorId.length>0&&actorId.length<=256,'DENIAL_DISPLAY_ACTOR');
  const mutation=execution.invocationId==='baseline'?null:execution.invocationId;
  replaySharedRoleDenial(observation,{binding,actorId,mutation});
  if(mutation==='ccd-write-then-deny')equal(raw('fault-actions.jsonl').toString().trim().split('\n').map(line=>JSON.parse(line)),[{mutation,caseId:observation.caseId,status:201}],'SHARED_ROLE_FAULT_WRITE_APPLICATION');
  return businessScalars.projectDenialObservation(test.proofId,observation);
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
  const invocations = validateRawPaths(directory, run);
  equal(invocations.map(item => item.invocationId).sort(), nativeInvocations(scopes[phase]).map(item => item.invocationId).sort(), "INVOCATION_INVENTORY_MISMATCH");
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
  if(phase === 'selectorEventRow') validateSelectorEventEvidence(directory,pin,loaded.input,terminal);
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
  // Display telemetry is read from the same digest-bound reports only AFTER
  // proof replay and finalization. It never enters the release proof inputs.
  const display = new Map();
  for (const ref of run.executionArtifacts) {
    const {value: execution} = readEvidenceArtifact(directory, ref);
    const {value: report} = readEvidenceArtifact(directory, execution.resultArtifact);
    for (const test of report.tests) {
      let projected = stageTelemetry.readStageTelemetry(test.proofId, test.recordedExecution);
      if (projected?.availability === 'recorded') {
        const failed = projected.stages.filter(s => s.outcome === 'reported-error');
        if ((test.status === 'passed' && failed.length) ||
            (test.failureId && !failed.some(s => s.stageId === test.failureId)))
          projected = {schemaVersion:1, availability:'unavailable', reason:'INVALID_STAGE_TELEMETRY'};
      }
      const detail = stageTelemetry.readPostalDetail(test.proofId, test.recordedDetail, {...test,recordedExecution:projected});
      const scalars=phase==='ccd'&&['ccd-role-policy','ccd-access-broadened','ccd-write-then-deny'].includes(test.proofId)
        ? denialDisplay(directory,execution,report,test,loaded.input.manifest)
        : businessScalars.readDetail(test.proofId,test.businessScalars,test);
      if (projected !== undefined || detail !== undefined || scalars !== undefined) display.set(execution.invocationId + '/' + test.proofId, {
        ...(projected === undefined ? {} : {recordedExecution:projected}),
        ...(detail === undefined ? {} : {recordedDetail:detail}),
        ...(scalars === undefined ? {} : {businessScalars:scalars})
      });
    }
  }
  const recorded = result => {
    const value = display.get(result.invocationId + '/' + result.proofId);
    return value === undefined ? {} : value;
  };
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
    invocations,
    baselineProofs: loaded.input.results.map((result) => ({
      proofId: result.proofId,
      invocationId: result.invocationId,
      status: result.outcome,
      failureId: publicFailure(result.failureId),
      ...recorded(result),
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
        ...recorded(mutant),
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
export async function readNativeReportEvidence(descriptorPath, {profileConfigurationFor} = {}) {
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
    const mandatorySelected=assertMandatoryEmailIntent(ci,expected,descriptor.value,directory);
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
      selectorPhaseDirectory: path.join(directory, "private/selectorEventRow"),
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
    for (const phase of ["ccd", "eventCapability", "routing", "recipientCallback", "selectorEventRow"]) {
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
    // Validate both complete raw packets and every supplied parent pin before classifying compatibility.
    const nativeBinding = readDivorceNativeBinding(directory, expected);
    fact(!expected.divorceProfileRequest || descriptor.value.divorceProfileAdmission, "PROFILE_REQUEST_REQUIRED");
    fact(!nativeBinding || !descriptor.value.divorceProfileAdmission || expected.divorceProfileRequest, "PROFILE_REQUEST_REQUIRED");
    const profilePacket = descriptor.value.divorceProfileAdmission ? readDivorceProfileAdmissionPacket(descriptor.value.divorceProfileAdmission, expected.divorceProfileRequest, profileConfigurationFor) : undefined;
    let divorceProfileAdmission;
    if (profilePacket) {
      const joint = divorceNativeJointAdmission(nativeBinding, profilePacket, expected);
      divorceProfileAdmission = {...profilePacket.admission, joint};
      if (joint.status === "included") {
        const id = joint.obligationId, rows = accounting.catalogue.obligations.filter(row => row.id === id);
        fact(rows.length === 1 && rows[0].kind === "configuration-profile" && rows[0].family === "DIVORCE" && rows[0].requiredBoundary === "candidate", "PROFILE_CATALOGUE_ROW");
        fact(catalogueCoverage.selected === 112 && !creditedObligationIds.includes(id), "PROFILE_DUPLICATE_CREDIT");
        fact(accounting.report.coverage.missingCandidateOrCcd.some(row => (typeof row === "string" ? row : row.id) === id), "PROFILE_NOT_MISSING");
        creditedObligationIds.push(id);catalogueCoverage.candidate++;catalogueCoverage.missing--;
        catalogueCoverage.divorceProfileAdmission = joint;
      }
    }
    fact(!expected.frProfileRequest||descriptor.value.frProfileAdmission,"FR_PROFILE_REQUEST_REQUIRED");
    fact(!descriptor.value.frProfileAdmission||expected.frProfileRequest,"FR_PROFILE_REQUEST_REQUIRED");
    if(descriptor.value.frProfileAdmission)fact(nativeBinding,"FR_PROFILE_NATIVE_BINDING_REQUIRED");
    const frPacket=descriptor.value.frProfileAdmission?readFrProfileAdmissionPacket(descriptor.value.frProfileAdmission,expected.frProfileRequest,{binding:nativeBinding,expected},accounting.catalogue):undefined;
    let frProfileAdmission;
    if(frPacket){
      frProfileAdmission={...frPacket.admission,joint:frPacket.joint};
      if(frPacket.joint.status==='included'){
        const id=frPacket.joint.obligationId,rows=accounting.catalogue.obligations.filter(row=>row.id===id);
        fact(rows.length===1&&rows[0].family==='FR'&&rows[0].kind==='configuration-profile'&&rows[0].requiredBoundary==='candidate','FR_PROFILE_CATALOGUE_ROW');
        equal(rows[0].sourceKeys,frPacket.joint.sourceKeys,'FR_PROFILE_CATALOGUE_SOURCE');
        fact(catalogueCoverage.selected===112&&!creditedObligationIds.includes(id),'FR_PROFILE_DUPLICATE_CREDIT');
        fact(accounting.report.coverage.missingCandidateOrCcd.some(row=>(typeof row==='string'?row:row.id)===id),'FR_PROFILE_NOT_MISSING');
        creditedObligationIds.push(id);catalogueCoverage.candidate++;catalogueCoverage.missing--;catalogueCoverage.frProfileAdmission=frPacket.joint;
      }
    }
    fact(!expected.cmcProfileRequest||descriptor.value.cmcProfileAdmission,'CMC_PROFILE_REQUEST_REQUIRED');
    fact(!descriptor.value.cmcProfileAdmission||expected.cmcProfileRequest,'CMC_PROFILE_REQUEST_REQUIRED');
    if(descriptor.value.cmcProfileAdmission)fact(nativeBinding,'CMC_PROFILE_NATIVE_BINDING_REQUIRED');
    const cmcPacket=descriptor.value.cmcProfileAdmission?readCmcProfileAdmissionPacket(descriptor.value.cmcProfileAdmission,expected.cmcProfileRequest,{binding:nativeBinding,expected},accounting.catalogue):undefined;
    let cmcProfileAdmission;
    if(cmcPacket){
      cmcProfileAdmission={...cmcPacket.admission,joint:cmcPacket.joint};
      if(cmcPacket.joint.status==='included'){
        const id=cmcPacket.joint.obligationId,rows=accounting.catalogue.obligations.filter(row=>row.id===id);
        fact(rows.length===1&&rows[0].family==='CMC'&&rows[0].kind==='configuration-profile'&&rows[0].requiredBoundary==='candidate','CMC_PROFILE_CATALOGUE_ROW');
        equal(rows[0].sourceKeys,cmcPacket.joint.sourceKeys,'CMC_PROFILE_CATALOGUE_SOURCE');
        fact(catalogueCoverage.selected===112&&!creditedObligationIds.includes(id),'CMC_PROFILE_DUPLICATE_CREDIT');
        fact(accounting.report.coverage.missingCandidateOrCcd.some(row=>(typeof row==='string'?row:row.id)===id),'CMC_PROFILE_NOT_MISSING');
        creditedObligationIds.push(id);catalogueCoverage.candidate++;catalogueCoverage.missing--;catalogueCoverage.cmcProfileAdmission=cmcPacket.joint;
      }
    }
    const personalNative=(expected.personalServiceRequest||descriptor.value.personalServiceAdmission)?readPersonalNativeBinding(directory,expected,nativeBinding):undefined;
    fact(!expected.personalServiceRequest||descriptor.value.personalServiceAdmission,'PERSONAL_REQUEST_REQUIRED');
    fact(!descriptor.value.personalServiceAdmission||expected.personalServiceRequest,'PERSONAL_REQUEST_REQUIRED');
    const personalPacket=descriptor.value.personalServiceAdmission?readPersonalAdmissionPacket(descriptor.value.personalServiceAdmission,expected.personalServiceRequest):undefined;
    let personalServiceAdmission;
    if(personalPacket){
      const joint=personalNativeJointAdmission(nativeBinding,personalNative,personalPacket,expected);personalServiceAdmission={...personalPacket.admission,joint};
      if(joint.status==='included'){
        const id=joint.obligationId,rows=accounting.catalogue.obligations.filter(row=>row.id===id);
        fact(rows.length===1&&rows[0].family==='PRIVATELAW'&&rows[0].kind==='definition-shape'&&rows[0].requiredBoundary==='candidate','PERSONAL_CATALOGUE_ROW');
        equal(rows[0].sourceKeys,[personalPacket.admission.sourceKey],'PERSONAL_CATALOGUE_SOURCE');
        fact(catalogueCoverage.selected===112&&!creditedObligationIds.includes(id),'PERSONAL_DUPLICATE_CREDIT');
        fact(accounting.report.coverage.missingCandidateOrCcd.some(row=>(typeof row==='string'?row:row.id)===id),'PERSONAL_NOT_MISSING');
        creditedObligationIds.push(id);catalogueCoverage.candidate++;catalogueCoverage.missing--;catalogueCoverage.personalServiceAdmission=joint;
      }
    }
    fact(!expected.stCicProfileRequest||descriptor.value.stCicProfileAdmission,'ST_CIC_REQUEST_REQUIRED');
    fact(!descriptor.value.stCicProfileAdmission||expected.stCicProfileRequest,'ST_CIC_REQUEST_REQUIRED');
    const stCicNative=(expected.stCicProfileRequest||descriptor.value.stCicProfileAdmission)?readStCicNativeBinding(directory,expected,nativeBinding):undefined;
    const stCicPacket=descriptor.value.stCicProfileAdmission?readStCicProfileAdmissionPacket(descriptor.value.stCicProfileAdmission,expected.stCicProfileRequest):undefined;
    let stCicProfileAdmission;
    const mandatoryNative=mandatorySelected?readMandatoryEmailNativeBinding(directory,expected,nativeBinding):undefined;
    const mandatoryPacket=mandatorySelected?readMandatoryEmailAdmissionPacket(descriptor.value.mandatoryEmailAdmission,expected.mandatoryEmailRequest):undefined;
    let mandatoryEmailAdmission;
    const complexNative=(expected.complexEmailRequest||descriptor.value.complexEmailAdmission)?readComplexNativeBinding(directory,expected,nativeBinding):undefined;
    fact(!expected.complexEmailRequest||descriptor.value.complexEmailAdmission,'COMPLEX_REQUEST_REQUIRED');
    fact(!descriptor.value.complexEmailAdmission||expected.complexEmailRequest,'COMPLEX_REQUEST_REQUIRED');
    const complexPacket=descriptor.value.complexEmailAdmission?await readComplexAdmissionPacket(descriptor.value.complexEmailAdmission,expected.complexEmailRequest):undefined;
    let complexEmailAdmission;
    if(complexPacket){
      assertComplexOwnership(directory,expected,complexPacket,{personalRequestPath:descriptor.value.personalServiceAdmission,profileOwners:[...(profilePacket?Object.values(profilePacket.binding.owners):[]),...(stCicPacket?Object.values(stCicPacket.binding.owners):[]),...(mandatoryPacket?mandatoryPacket.packets.flatMap(p=>[p.binding.runId,p.binding.ccd.owner]):[])]});
      const joint=complexNativeJointAdmission(nativeBinding,complexNative,complexPacket,expected);complexEmailAdmission={...complexPacket.admission,joint};
      if(joint.status==='included')creditComplexEmailRow(catalogueCoverage,accounting.catalogue,accounting.report.coverage.missingCandidateOrCcd,complexEmailAdmission);
    }
    if(stCicPacket){
      assertStCicOwnership(directory,expected,{stCicRequestPath:descriptor.value.stCicProfileAdmission,divorceRequestPath:descriptor.value.divorceProfileAdmission,personalRequestPath:descriptor.value.personalServiceAdmission,complexRequestPath:descriptor.value.complexEmailAdmission,complexPacket,mandatoryRequestPath:descriptor.value.mandatoryEmailAdmission});
      const joint=stCicNativeJointAdmission(nativeBinding,stCicNative,stCicPacket,expected);
      stCicProfileAdmission={...stCicPacket.admission,joint};
      if(joint.status==='included'){
        const id=joint.obligationId,rows=accounting.catalogue.obligations.filter(row=>row.id===id);
        fact(rows.length===1&&rows[0].family==='ST_CIC'&&rows[0].kind==='configuration-profile'&&rows[0].requiredBoundary==='candidate','ST_CIC_CATALOGUE_ROW');
        equal(rows[0].sourceKeys,joint.sourceKeys,'ST_CIC_CATALOGUE_SOURCE');
        fact(catalogueCoverage.selected===112&&!creditedObligationIds.includes(id),'ST_CIC_DUPLICATE_CREDIT');
        fact(accounting.report.coverage.missingCandidateOrCcd.some(row=>(typeof row==='string'?row:row.id)===id),'ST_CIC_NOT_MISSING');
        creditedObligationIds.push(id);catalogueCoverage.candidate++;catalogueCoverage.missing--;catalogueCoverage.stCicProfileAdmission=joint;
      }
    }
    if(mandatoryPacket){
      assertMandatoryEmailOwnership(directory,expected,{mandatoryRequestPath:descriptor.value.mandatoryEmailAdmission,stCicRequestPath:descriptor.value.stCicProfileAdmission,divorceRequestPath:descriptor.value.divorceProfileAdmission,personalRequestPath:descriptor.value.personalServiceAdmission,complexRequestPath:descriptor.value.complexEmailAdmission,complexPacket});
      // Reopen the held main capsule after every companion raw replay and ownership read.
      readMandatoryEmailNativeBinding(directory,expected,nativeBinding);
      const joint=mandatoryEmailNativeJointAdmission(nativeBinding,mandatoryNative,mandatoryPacket,expected);mandatoryEmailAdmission={...mandatoryPacket.admission,joint};
      if(joint.status==='included')creditMandatoryEmailRows(catalogueCoverage,accounting.catalogue,accounting.report.coverage.missingCandidateOrCcd,mandatoryEmailAdmission);
    }
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
      ...(divorceProfileAdmission ? {divorceProfileAdmission} : {}),
      ...(frProfileAdmission?{frProfileAdmission}:{}),
      ...(cmcProfileAdmission?{cmcProfileAdmission}:{}),
      ...(personalServiceAdmission?{personalServiceAdmission}:{}),
      ...(stCicProfileAdmission?{stCicProfileAdmission}:{}),
      ...(complexEmailAdmission?{complexEmailAdmission}:{}),
      ...(mandatoryEmailAdmission?{mandatoryEmailAdmission}:{}),
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

// Current business-scalar readback only. Reuse the maintained synchronous phase
// replay for the two selected phases; no other phase/companion admission runs.
export function readHeldBusinessScalarProjection(held) {
  try {
    fact(held && Object.keys(held).sort().join() === 'digest,path' && hashPattern.test(held.digest), 'SCALAR_HELD_REFERENCE');
    const descriptor=read(held.path);
    equal(digestBytes(descriptor.bytes),held.digest,'SCALAR_DESCRIPTOR_DIGEST');
    const {directory,expected}=descriptor.value;
    fact(descriptor.value.schemaVersion===1,'DESCRIPTOR_SCHEMA_REQUIRED');canonical(directory,true);
    fact(new RegExp('^ci-'+uuid+'$').test(expected.jobRunId)&&/^[a-f0-9]{40}$/.test(expected.harnessCommit)&&hashPattern.test(expected.candidateArtifactDigest)&&hashPattern.test(expected.ciResultDigest),'SCALAR_SOURCE_IDENTITY');
    equal(expected.phases.map(p=>p.phase),Object.keys(scopes),'PHASE_SELECTION_REQUIRED');
    const result=read(path.join(directory,'private/ci-result.json'));equal(digestBytes(result.bytes),expected.ciResultDigest,'CI_RESULT_DIGEST_MISMATCH');
    const ci=result.value;equal(ci.jobRunId,expected.jobRunId,'CI_JOB_MISMATCH');equal(ci.classification,'fixed-pilot-suite-no-full-release-approval','CI_CLASSIFICATION_REQUIRED');fact(ci.cleanupComplete===true,'CI_CLEANUP_INCOMPLETE');
    equal(ci.phaseResults.map(p=>p.phase),Object.keys(scopes),'CI_PHASE_SELECTION_REQUIRED');
    const first=expected.phases[0].expected;
    const phases=['scope','ccd'].map(phase=>{
      const index=expected.phases.findIndex(p=>p.phase===phase),selection=expected.phases[index],pin=selection.expected;
      for(const field of ['harnessSourceDigest','harnessDependencyDigest','browserDigest'])equal(pin[field],first[field],'SCALAR_SOURCE_TOOLCHAIN');
      for(const field of ['artifactDigest','webappCommit','dependencyLockDigest','toolkitVersion','toolkitDigest'])equal(pin.identity[field],first.identity[field],'SCALAR_CANDIDATE');
      return phaseProjection(canonical(path.join(directory,'private',phase),true),selection,ci.phaseResults[index],expected);
    });
    return businessScalars.scalarProjection({descriptorDigest:held.digest,jobRunId:ci.jobRunId,source:{harnessCommit:expected.harnessCommit,harnessSourceDigest:first.harnessSourceDigest,candidateArtifactDigest:expected.candidateArtifactDigest,webappCommit:first.identity.webappCommit},phases});
  }catch{throw Error('PUBLIC_BUSINESS_SCALAR_RAW_INVALID');}
}
