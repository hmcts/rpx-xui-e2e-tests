import {captureV3ExecutionArtifacts,writeV3Completion,waitV3Ack,writeV3ProofStart,writeV3File,waitV3ParentRetirement} from './exui-event-v3-host-writer.mjs';
import {readEventBaselineCheckpoint} from './exui-native-proof-validation.mjs';
import {SELECTOR_EVENT_SCOPE,selectorEventMutation} from './exui-selector-event-row-contract.mjs';
import {selectorTransitionRequest,waitForSelectorRuntime,waitForSelectorBaselineCapture} from './exui-selector-event-row-transition.mjs';
import {selectorObservationReferences} from './exui-selector-event-row-observations.mjs';
import {captureSharedNestedArtifacts} from './exui-shared-nested-artifacts.mjs';
import {SHARED_NESTED_SCOPE,SHARED_NESTED_MUTATIONS} from './exui-shared-nested-scope.mjs';
import {APPLICANT_RESULTS_SCOPE,APPLICANT_RESULTS_MUTATIONS,applicantResultsMutation} from './exui-applicant-results-contract.mjs';
import {applicantResultTransitionRequest,waitForApplicantResultRuntime,waitForApplicantResultBaselineCapture} from './exui-applicant-results-transition.mjs';
import {callbackObservationReferences} from './exui-recipient-callback-observations.mjs';
import {CALLBACK_SCOPE,callbackMutationContract} from './exui-recipient-callback-contract.mjs';
import {callbackTransitionRequest,waitForCallbackRuntime} from './exui-recipient-callback-transition.mjs';
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  nativeInvocations,
  selectedArtifact,
  nativeIdentity,
} from "./exui-native-contract.mjs";
import {
  inspectNativeApiRuntime,
  inspectNativeBrowserRuntime,
  nativeContainerPlan,
} from "./exui-native-containers.mjs";
import {
  runHostInvocation,
  removeHostResource,
  inspectHostContainer,
  inspectHostVolume,
  hostDocker,
} from "./exui-host-invocation.mjs";
import { digestCandidateTree } from "./exui-candidate-artifact.mjs";
import { verifyHearingPublicationMutant } from "./exui-hearing-publication-mutation.mjs";
import { verifyScopeMutant } from "../prepare-harness-scope-mutant.mjs";
import { installCancellationCleanup } from "./exui-oci-runtime.mjs";
import { getReleasePolicy } from "./exui-release-policy.mjs";
import { effectiveCandidateConfiguration } from "./exui-candidate-runtime.mjs";
import { GLOBAL_SEARCH_SCOPE, globalSearchContract } from "./exui-global-search-contract.mjs";
import { ROUTING_SCOPE } from "./exui-routing-contract.mjs";
import { EVENT_CAPABILITY_SCOPE, eventCapabilityFaultContract, eventCapabilityFaultVariant } from "./exui-ccd-event-capability.mjs";
import { eventCapabilityTransitionRequest, waitForEventCapabilityRuntime } from "./exui-ccd-event-transition.mjs";
import {
  digestBytes,
  writeJsonAtomic,
  loadRunEvidence,
} from "./exui-evidence-io.mjs";
import { writeHarnessPublicSummary } from "./exui-output-boundary.mjs";
import { captureSharedRoleArtifacts } from "./exui-shared-role-artifacts.mjs";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const ref = (output, file) => ({
  path: path.relative(output, file),
  digest: digestBytes(fs.readFileSync(file)),
});
function invalidate(output, signal, cleanupComplete) {
  for (const name of ["run.json", "gate.json"])
    if (fs.existsSync(path.join(output, name)))
      fs.renameSync(
        path.join(output, name),
        path.join(output, `interrupted-${name}`),
      );
  writeHarnessPublicSummary(output, { status: "BLOCKED", exitCode: 2 });
  writeJsonAtomic(path.join(output, "controller-terminal.json"), {
    status: "interrupted",
    signal,
    cleanupComplete,
  });
}
function derivations(input, output, policy, identities, artifactDerivation) {
  const mutations = [];
  for (const definition of policy.mutationDefinitions) {
    const baselineId =
      input.releaseScopeId === "exui-wa-scope-pilot" ? "scope-ia" : "baseline";
    const mutantId =
      input.releaseScopeId === "exui-wa-scope-pilot"
        ? "wa-scope-broadened"
        : definition.mutationId;
    const baseline = identities.find(
        (item) => item.invocationId === baselineId,
      ),
      mutant = identities.find((item) => item.invocationId === mutantId);
    if (!baseline || !mutant) continue;
    const file = path.join(output, mutantId, "derivation.json");
    writeJsonAtomic(file, {
      mutationDefinitionDigest: definition.definitionDigest,
      baselineIdentity: baseline.identity,
      mutantIdentity: mutant.identity,
      transformation: definition.mutationId,
      ...(artifactDerivation
        ? {
            productionArtifact: input.mutantArtifact,
            transformationRecord: artifactDerivation,
            target: artifactDerivation.target,
            beforeDigest: artifactDerivation.beforeDigest,
            afterDigest: artifactDerivation.afterDigest,
          }
        : input.releaseScopeId === GLOBAL_SEARCH_SCOPE
          ? { target: "NODE_CONFIG.globalSearchServices",
              before: nativeIdentity(input, { mutation: null }, input.artifact.candidateRoot).config.globalSearchServices,
              after: nativeIdentity(input, { mutation: definition.mutationId }, input.artifact.candidateRoot).config.globalSearchServices }
        : input.releaseScopeId === ROUTING_SCOPE
          ? {
              target: `NODE_CONFIG.decentralisedCaseTypeConfig.PCS.${definition.mutationId === "routing-omit-web-url" ? "webUrl" : "nocBaseUrl"}`,
              before: nativeIdentity(
                input,
                { mutation: null },
                input.artifact.candidateRoot,
              ).config.decentralisedCaseTypeConfig.PCS,
              after: nativeIdentity(
                input,
                { mutation: definition.mutationId },
                input.artifact.candidateRoot,
              ).config.decentralisedCaseTypeConfig.PCS,
            }
          : input.releaseScopeId === "exui-wa-family-pilot"
            ? {
                target: "NODE_CONFIG.waSupportedJurisdictions",
                before: effectiveCandidateConfiguration(
                  input.artifact.candidateRoot,
                ).config.waSupportedJurisdictions,
                after: effectiveCandidateConfiguration(
                  input.artifact.candidateRoot,
                  "wa-drop-family",
                ).config.waSupportedJurisdictions,
              }
            : input.releaseScopeId === APPLICANT_RESULTS_SCOPE
              ? { target:"SearchResultFields+WorkBasketResultFields applicantName", transformationRecord:applicantResultsMutation(definition.mutationId), beforeDigest:baseline.identity.definitionDigests.HarnessResultsPRL, afterDigest:mutant.identity.definitionDigests.HarnessResultsPRL, baselineRuntimeMetadata:baseline.runtimeMetadata, mutantRuntimeMetadata:mutant.runtimeMetadata, runtimeRecord:ref(output,path.join(output,definition.mutationId,"runtime-input.json")) }
            : input.releaseScopeId === SELECTOR_EVENT_SCOPE
              ? {target:selectorEventMutation().target,transformationRecord:selectorEventMutation(),selectorObservations:selectorObservationReferences(output),beforeDigest:baseline.identity.definitionDigests.HarnessNestedPRL,afterDigest:mutant.identity.definitionDigests.HarnessNestedPRL,baselineRuntimeMetadata:baseline.runtimeMetadata,mutantRuntimeMetadata:mutant.runtimeMetadata,runtimeRecord:ref(output,path.join(output,definition.mutationId,"runtime-input.json"))}
            : input.releaseScopeId === CALLBACK_SCOPE
              ? {
                  target: callbackMutationContract().target,
                  transformationRecord: callbackMutationContract(),
                  callbackObservations: callbackObservationReferences(output),
                  beforeDigest: baseline.identity.definitionDigests.HarnessNestedPRL,
                  afterDigest: mutant.identity.definitionDigests.HarnessNestedPRL,
                  baselineRuntimeMetadata: baseline.runtimeMetadata,
                  mutantRuntimeMetadata: mutant.runtimeMetadata,
                  runtimeRecord: ref(output, path.join(output, definition.mutationId, "runtime-input.json")),
                }
            : input.releaseScopeId === EVENT_CAPABILITY_SCOPE
              ? {
                  target: eventCapabilityFaultContract(definition.mutationId).target,
                  transformationRecord: eventCapabilityFaultContract(definition.mutationId).validatePair(
                    read(new URL("../fixtures/ccd/event-capability/baseline.json", import.meta.url)),
                    read(new URL(`../fixtures/ccd/event-capability/${eventCapabilityFaultVariant(definition.mutationId)}.json`, import.meta.url)),
                  ),
                  beforeDigest: baseline.identity.definitionDigests.HarnessNestedPRL,
                  afterDigest: mutant.identity.definitionDigests.HarnessNestedPRL,
                  baselineRuntimeMetadata: baseline.runtimeMetadata,
                  mutantRuntimeMetadata: mutant.runtimeMetadata,
                  runtimeRecord: ref(output, path.join(output, definition.mutationId, "runtime-input.json")),
                }
            : {
                target:
                  "declared CCD gateway fault; same actual Angular/Node/CCD artifact",
                gatewayDigest: input.gatewayDigest,
              }),
    });
    mutations.push({
      mutationId: definition.mutationId,
      baselineInvocationId: baselineId,
      mutantInvocationId: mutantId,
      derivationArtifact: ref(output, file),
    });
  }
  return mutations;
}
export async function runNativeHostPhase(output, stagedHarness, {eventSerialV3=false}={}) {
  const input = read(path.join(output, "input.json")),
    policy = getReleasePolicy(input.releaseScopeId),
    resources = new Map(),
    cleanupErrors = [];
  assert([undefined, true].includes(input.candidateVolumeExperiment) && (!input.candidateVolumeExperiment || input.releaseScopeId === EVENT_CAPABILITY_SCOPE), "CANDIDATE_VOLUME_SCOPE_REQUIRED");
  assert(typeof eventSerialV3==='boolean'&&(!eventSerialV3||(input.releaseScopeId===EVENT_CAPABILITY_SCOPE&&input.only===undefined)),'EVENT_V3_OPT_IN_SCOPE');
  assert.deepEqual(input.eventSerialV3,eventSerialV3?{schemaVersion:3,experimental:true}:undefined,'EVENT_V3_MODE_BINDING');
  let interrupted,
    manifest,
    pendingReceipt,
    executions = [],
    identities = [],
    lifecycleTimings = [],
    verdict = { status: "BLOCKED", exitCode: 2 };
  const remove = async (key) => {
    try {
      await removeHostResource(resources, key, output);
    } catch (error) {
      cleanupErrors.push(error);
      throw error;
    }
  };
  const signalTarget = {
    on: (...args) => process.on(...args),
    removeListener: (...args) => process.removeListener(...args),
    stderr: process.stderr,
    exit: (code) => {
      try { invalidate(output, interrupted, cleanupErrors.length === 0); } finally { process.exit(code); }
    },
  };
  const uninstall = installCancellationCleanup({
    resources,
    target: signalTarget,
    remove: (key) => remove(key),
    onCancel: (signal) => {
      interrupted = signal;
      writeJsonAtomic(path.join(output, "controller-cancelled.json"), {
        signal,
      });
      invalidate(output, signal, false);
    },
  });
  try {
    input.nativeRuntime = inspectNativeApiRuntime(input.artifact.provenance.platform);
    input.browserRuntimeImage = inspectNativeBrowserRuntime(input.artifact.provenance.platform);
    const stateRoot = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "harness-native-state-"),
    );
    fs.chmodSync(stateRoot, 0o700);
    const invocations = nativeInvocations(input.releaseScopeId).filter(
      (item) => !input.only || item.invocationId === input.only,
    );
    for (const invocation of invocations)
      for (const kind of ["sessions", "diagnostics"]) {
        const directory = path.join(stateRoot, invocation.invocationId, kind);
        fs.mkdirSync(directory, { recursive: true, mode: 0o777 });
        fs.chmodSync(directory, 0o777);
      }
    if (input.ccd) {
      const owner = inspectHostContainer(input.ccd.namespace);
      assert(
        owner?.HostConfig.NetworkMode === "none" &&
          owner.Config.Labels?.["exui.harness.owner"] === input.ccd.owner,
        "CCD_OWNERSHIP_ISOLATION_MISMATCH",
      );
    }
    const artifactDerivation =
      input.releaseScopeId === "exui-wa-scope-pilot"
        ? await verifyScopeMutant(input.artifact, input.mutantArtifact)
        : input.releaseScopeId === "exui-hearing-publication-pilot"
          ? await verifyHearingPublicationMutant(input.artifact, input.mutantArtifact)
          : null;
    const handoff = {
      mode: "native-separate-api",
      owner: input.runId,
      output,
      stagedHarness,
      stateRoot,
    };
    if (input.candidateVolumeExperiment) {
      const owner = input.runId;
      assert(/^ccd-[a-f0-9-]{36}$/.test(owner), "CANDIDATE_VOLUME_OWNER_REQUIRED");
      const name = `harness-candidate-${owner.slice(4)}`;
      const volumeResource = { kind: "volume", name, owner, receipt: { schemaVersion: 1, name, owner, service: "candidate-input", driver: "local", readOnlyAtUse: true, sourceDigest: input.artifact.payloadDigest, proofAuthority: false, catalogueCredit: false, status: "created" } };
      const candidateRoot = input.artifact.candidateRoot;
      assert(!candidateRoot.includes(",") && !/[\r\n]/.test(candidateRoot), "CANDIDATE_VOLUME_SOURCE_PATH_INVALID");
      handoff.candidateVolume = { name, owner, sourceRoot: candidateRoot, image: input.browserRuntimeImage };
      resources.set(`volume:${name}`, volumeResource);
      const copyName = `${owner}-candidate-copy`, copyKey = `volume-copy:${name}`;
      resources.set(copyKey, { kind: "volume-copy", name: copyName, owner, image: input.browserRuntimeImage, sourceRoot: candidateRoot, volumeName: name });
      writeJsonAtomic(path.join(output, "input.json"), input);
      writeJsonAtomic(path.join(output, "container-launch.json"), handoff);
      assert.equal(hostDocker(["volume", "create", "--driver", "local", "--label", `exui.harness.owner=${owner}`, "--label", "exui.harness.service=candidate-input", name]), name, "CANDIDATE_VOLUME_CREATE_REQUIRED");
      const observedVolume = inspectHostVolume(name);
      assert.equal(observedVolume?.Name, name, "CANDIDATE_VOLUME_NAME_MISMATCH");
      assert.equal(observedVolume?.Driver, "local", "CANDIDATE_VOLUME_DRIVER_MISMATCH");
      assert.equal(observedVolume?.Labels?.["exui.harness.owner"], owner, "CANDIDATE_VOLUME_OWNER_MISMATCH");
      assert.equal(observedVolume?.Labels?.["exui.harness.service"], "candidate-input", "CANDIDATE_VOLUME_SERVICE_MISMATCH");
      const copyStartedAt = Date.now();
      hostDocker(["run", "--rm", "--pull=never", "--name", copyName, "--label", `exui.harness.owner=${owner}`, "--label", "exui.harness.service=candidate-input-copy", "--platform", input.artifact.provenance.platform, "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "256", "--memory", "4g", "--cpus", "2", "--tmpfs", "/tmp:rw,nosuid,size=512m", "--mount", `type=bind,src=${candidateRoot},dst=/source,readonly`, "--mount", `type=volume,src=${name},dst=/candidate`, "--entrypoint", "/bin/sh", input.browserRuntimeImage, "-ec", "cp -a /source/. /candidate/"], { timeout: 300_000 });
      volumeResource.receipt.copyDurationMs = Date.now() - copyStartedAt;
      await remove(copyKey);
      const digestModule = path.join(stagedHarness, "scripts/lib/exui-candidate-artifact.mjs");
      const observedDigest = hostDocker(["run", "--rm", "--pull=never", "--platform", input.artifact.provenance.platform, "--network", "none", "--mount", `type=volume,src=${name},dst=/candidate,readonly`, "--mount", `type=bind,src=${digestModule},dst=/digest.mjs,readonly`, "--entrypoint", "node", input.browserRuntimeImage, "--input-type=module", "-e", "import {digestCandidateTree} from 'file:///digest.mjs'; console.log(await digestCandidateTree('/candidate'));"], { timeout: 300_000 });
      assert.equal(observedDigest, input.artifact.payloadDigest, "CANDIDATE_VOLUME_DIGEST_MISMATCH");
      volumeResource.receipt = { ...volumeResource.receipt, copiedDigest: observedDigest, status: "ready" };
      writeJsonAtomic(path.join(output, "candidate-volume-receipt.json"), volumeResource.receipt);
    } else {
      writeJsonAtomic(path.join(output, "input.json"), input);
      writeJsonAtomic(path.join(output, "container-launch.json"), handoff);
    }
    if(input.releaseScopeId===APPLICANT_RESULTS_SCOPE)await waitForApplicantResultBaselineCapture(input,output,{isCancelled:()=>Boolean(interrupted)});
    if(input.releaseScopeId===SELECTOR_EVENT_SCOPE)await waitForSelectorBaselineCapture(input,output,{isCancelled:()=>Boolean(interrupted)});
    let priorResultInput=input;
    for (const invocation of invocations) {
      const invocationInput = input.releaseScopeId === APPLICANT_RESULTS_SCOPE && invocation.mutation
        ? await waitForApplicantResultRuntime(input,output,invocation.invocationId,priorResultInput,{isCancelled:()=>Boolean(interrupted)})
        : input.releaseScopeId === SELECTOR_EVENT_SCOPE && invocation.mutation
        ? await waitForSelectorRuntime(input,output,{isCancelled:()=>Boolean(interrupted)})
        : input.releaseScopeId === CALLBACK_SCOPE && invocation.mutation
        ? await waitForCallbackRuntime(input, output, {isCancelled: () => Boolean(interrupted)})
        : input.releaseScopeId === EVENT_CAPABILITY_SCOPE && invocation.mutation
        ? await waitForEventCapabilityRuntime(input, output, { invocationId: invocation.invocationId, isCancelled: () => Boolean(interrupted) })
        : input;
      let v3Ack=null,v3Proof=null;
      if(eventSerialV3&&invocation.mutation){
        v3Ack=await waitV3Ack(output,invocationInput,invocation.invocationId,{isCancelled:()=>Boolean(interrupted)});
        v3Proof=writeV3ProofStart(output,invocationInput,invocation.invocationId,v3Ack);
      }
      const directory = path.join(output, invocation.invocationId);
      fs.mkdirSync(directory, { mode: 0o700, ...([APPLICANT_RESULTS_SCOPE,SELECTOR_EVENT_SCOPE].includes(input.releaseScopeId)||([EVENT_CAPABILITY_SCOPE,CALLBACK_SCOPE].includes(input.releaseScopeId)&&invocation.mutation)?{recursive:true}:{}) });
      const artifact = selectedArtifact(invocationInput, invocation),
        { identity, config } = nativeIdentity(
          invocationInput,
          invocation,
          artifact.candidateRoot,
        );
      const current = {
        schemaVersion: 1,
        runId: input.runId,
        harnessCommit: input.harnessCommit,
        releaseScopeId: policy.releaseScopeId,
        policyDigest: policy.policyDigest,
        identity,
        requiredObligationIds: policy.requiredObligationIds,
        runtimeMetadata: {
          isolation: "native-separate-api-owned-network-none",
          browserDigest: input.browserDigest,
          harnessSourceState: input.harnessSourceState,
          harnessSourceDigest: input.harnessSourceDigest,
          harnessDependencyDigest: input.harnessDependencies.digest,
          playwrightVersion: input.harnessDependencies.playwrightVersion,
          candidateStorage: input.candidateVolumeExperiment ? "run-owned-read-only-docker-volume" : "read-only-host-bind",
          candidateRuntimeReference: input.nativeRuntime.reference,
          candidateBuildNodeVersion: artifact.provenance.runtimeNodeVersion,
          ...(input.releaseScopeId === "exui-hearing-publication-pilot"
            ? {
                hearingProfileSelection: JSON.stringify({
                  idamLoginUrl: config.services.idam.idamLoginUrl,
                  previewDeploymentVariable: false,
                  browserExecuted: false,
                }),
              }
            : {}),
          ...(input.releaseScopeId === GLOBAL_SEARCH_SCOPE ? { globalSearchContract: JSON.stringify(globalSearchContract()) } : {}),
          ...(input.releaseScopeId === ROUTING_SCOPE
            ? {
                routingInterpreter: JSON.stringify(input.routingInterpreter),
                routingConfigurationMode:
                  "complete NODE_CONFIG in a fresh API-owned tmpfs directory; no deployed overlay/merge coverage",
                routingUiConfiguration: JSON.stringify({
                  decentralisedCaseTypeConfig:
                    config.decentralisedCaseTypeConfig,
                  decentralisedServiceMap: config.decentralisedServiceMap,
                }),
              }
            : {}),
          ...(invocationInput.ccd
            ? {
                gatewayDigest: invocationInput.gatewayDigest,
                definitionImportDigest: invocationInput.definitionImportDigest,
                ...(invocationInput.workbasket ? { workbasketImportDigest: invocationInput.workbasketImportDigest } : {}),
                observedDefinitionDigest:
                  invocationInput.definition.observedDefinitionDigest,
                ...([CALLBACK_SCOPE,SELECTOR_EVENT_SCOPE].includes(input.releaseScopeId) ? {observedPagesDigest:invocationInput.definition.observedPagesDigest} : {}),
                ...(input.releaseScopeId === SELECTOR_EVENT_SCOPE ? {selectorStoredDateDigest:invocationInput.definition.storedDateDigest}:{}),
                ...(input.releaseScopeId === APPLICANT_RESULTS_SCOPE ? {resultDatesDigest:invocationInput.resultDatesDigest,resultExpectedDigest:invocationInput.resultExpectedDigest,resultsSourceContractDigest:digestBytes(JSON.stringify(invocationInput.definition.sourceContract)),resultVariant:invocationInput.variant}:{}),
                definitionVersion: String(invocationInput.definition.definitionVersion),
                ccdNamespace: invocationInput.ccd.namespace,
                idamSimulatorImage: invocationInput.ccd.images.idam.id,
              }
            : {}),
          excludedSeams:
            input.releaseScopeId === "exui-hearing-publication-pilot"
              ? "synthetic startup auth; actual Node prod capability publication only; no browser/UI/accessibility/roles/CSRF/HMC/CCD/profile/catalogue credit"
              : input.releaseScopeId === GLOBAL_SEARCH_SCOPE
              ? "synthetic-auth,reference-data,empty-search-response,auxiliary-read-jurisdictions,feature-flags,telemetry; no CCD search/access/cache algorithm/profile credit"
              : input.releaseScopeId === ROUTING_SCOPE
              ? "synthetic-auth,upstream-definition-metadata,central-NoC-response,PCS-NoC-response,PCS-destination-marker,feature-flags,telemetry; no PCS backend/CCD/access/persistence or aggregate80ee credit"
              : input.releaseScopeId === APPLICANT_RESULTS_SCOPE
                ? "two source applicant result rows on explicit corrected local ARM64 CCD; synthetic IDAM/session/scaffold; typed date retention only; no temporal activation, backing-field access/security policy, deployed CCD or full release approval"
              : input.releaseScopeId === SELECTOR_EVENT_SCOPE
                ? "one source CaseEventToFields row; normalized HARNESS case type, two source page rows and synthetic predecessor; neighbouring business callback omitted in both variants; typed LiveFrom retention only; no fields 1-6, temporal activation, full PRL workflow or release approval"
              : input.releaseScopeId === CALLBACK_SCOPE
                ? "actual candidate and owned CCD source-row callback transport; synthetic callback business rules, sessions, IDAM and predecessor page; stored LiveFrom preservation only; no production PRL callback logic, deployed service or release approval credit"
              : input.releaseScopeId === EVENT_CAPABILITY_SCOPE
                ? "literal source role/event/field permission shape in normalized HARNESS case type; synthetic sessions and IDAM; omitted PRL callbacks; no deployed PRL, AM/ABAC, OIDC, CSRF-enforcement or owner-acceptance credit"
              : input.ccd
                ? "synthetic-session,IDAM-simulator,feature-flags,telemetry; source-bound synthetic case-list navigation, empty organisation lookup and empty result search; real CCD RBAC and workbasket-input readback; no deployed PRL or whole-profile credit; role removal uses renewed synthetic session, not immediate stale-session invalidation or OIDC login; ABAC/provider excluded"
                : "synthetic-auth,refdata,task-provider,feature-flags,telemetry",
        },
      };
      writeJsonAtomic(path.join(directory, "manifest.json"), current);
      writeJsonAtomic(path.join(directory, "context.json"), {
        runId: input.runId,
        invocationId: invocation.invocationId,
        identity,
        harnessCommit: input.harnessCommit,
        releaseScopeId: policy.releaseScopeId,
        policyDigest: policy.policyDigest,
        harnessSourceState: input.harnessSourceState,
        harnessSourceDigest: input.harnessSourceDigest,
      });
      const plan = nativeContainerPlan(invocationInput, handoff, invocation.invocationId);
      const { terminal, v3Finalization } = await runHostInvocation(
        { ...plan, manifest: current, payloadDigest: artifact.payloadDigest },
        {
          resources,
          isCancelled: () => Boolean(interrupted),
          eventSerialV3,
          ...(input.releaseScopeId === EVENT_CAPABILITY_SCOPE ? {
            onLifecycleTiming: (timing) => {
              try {
                lifecycleTimings.push({
                  sequence: lifecycleTimings.length + 1,
                  runId: input.runId,
                  ...timing,
                });
              } catch { /* Diagnostic collection never changes proof execution. */ }
            },
          } : {}),
        },
      );
      const report = read(path.join(directory, "report.json"));
      writeJsonAtomic(path.join(directory, "execution.json"), {
        invocationId: invocation.invocationId,
        runId: input.runId,
        identity,
        kind: invocation.kind,
        terminalState: "completed",
        runnerExitCode: terminal.code,
        unexpectedGlobalErrors: report.globalErrors,
        resultArtifact: ref(output, path.join(directory, "report.json")),
        ...(input.releaseScopeId===SHARED_NESTED_SCOPE?{sharedNestedArtifacts:captureSharedNestedArtifacts(output,invocation.invocationId)}:{}),
        ...(["exui-ccd-pilot", EVENT_CAPABILITY_SCOPE].includes(input.releaseScopeId) ? {
          ...(eventSerialV3?captureV3ExecutionArtifacts(output,invocation.invocationId):{sharedRoleArtifacts: captureSharedRoleArtifacts(output, invocation.invocationId, input.releaseScopeId)}),
        } : {}),
      });
      if(eventSerialV3){
        const checkpoint=invocation.invocationId==='baseline'?readEventBaselineCheckpoint(output,read(path.join(output,'independent-preexecution.json'))).checkpointDigest:null;
        writeV3Completion(output,{input:invocationInput,id:invocation.invocationId,ack:v3Ack,proof:v3Proof,checkpointDigest:checkpoint,facts:v3Finalization});
      }
      manifest ??= current;
      executions.push(ref(output, path.join(directory, "execution.json")));
      identities.push({ invocationId: invocation.invocationId, identity,
        ...([EVENT_CAPABILITY_SCOPE,CALLBACK_SCOPE,APPLICANT_RESULTS_SCOPE,SELECTOR_EVENT_SCOPE].includes(input.releaseScopeId) ? {
          runtimeMetadata: Object.fromEntries(["definitionImportDigest", "observedDefinitionDigest", ...([CALLBACK_SCOPE,SELECTOR_EVENT_SCOPE].includes(input.releaseScopeId) ? ["observedPagesDigest"] : []), ...(input.releaseScopeId===SELECTOR_EVENT_SCOPE?["selectorStoredDateDigest"]:[]), ...(input.releaseScopeId===APPLICANT_RESULTS_SCOPE?["resultDatesDigest","resultExpectedDigest","resultsSourceContractDigest","resultVariant"]:[]), "definitionVersion", "ccdNamespace"].map((key) => [key, current.runtimeMetadata[key]])),
        } : {}),
      });
      if(input.releaseScopeId===APPLICANT_RESULTS_SCOPE){
        priorResultInput=invocationInput;
        const next=APPLICANT_RESULTS_MUTATIONS[invocations.indexOf(invocation)];
        if(next)writeJsonAtomic(path.join(output,`results-transition-${next}.json`),applicantResultTransitionRequest(input,next,priorResultInput));
      }
      if (input.releaseScopeId === SELECTOR_EVENT_SCOPE && invocation.invocationId === "baseline")
        writeJsonAtomic(path.join(output,"selector-transition-request.json"),selectorTransitionRequest(input));
      if (input.releaseScopeId === CALLBACK_SCOPE && invocation.invocationId === "baseline")
        writeJsonAtomic(path.join(output, "callback-transition-request.json"), callbackTransitionRequest(input));
      if (input.releaseScopeId === EVENT_CAPABILITY_SCOPE && invocation.invocationId === "baseline")
        writeJsonAtomic(path.join(output, "event-transition-request.json"), eventCapabilityTransitionRequest(input));
      if(input.releaseScopeId===SHARED_NESTED_SCOPE&&invocation.invocationId==='baseline'&&(report.status!=='passed'||report.globalErrors.length))throw Error('SHARED_NESTED_BASELINE_UNSATISFIED');
    }
    if(eventSerialV3)await waitV3ParentRetirement(output,input,{isCancelled:()=>Boolean(interrupted)});
    const mutations = derivations(
      input,
      output,
      policy,
      identities,
      artifactDerivation,
    );
    writeJsonAtomic(path.join(output, "run.json"), {
      schemaVersion: 1,
      manifest,
      executionArtifacts: executions,
      mutations,
    });
    const loaded = loadRunEvidence(path.join(output, "run.json"), policy);
    verdict = loaded.receipt.verdict;
    if (interrupted) throw Error("NATIVE_CONTROLLER_INTERRUPTED");
    pendingReceipt = loaded.receipt;
  } finally {
    for (const key of [...resources.keys()].reverse())
      try {
        await remove(key);
      } catch {
        verdict = { status: "BLOCKED", exitCode: 2 };
      }
    if (input.candidateVolumeExperiment && !interrupted) {
      try {
        const receipt = read(path.join(output, "candidate-volume-receipt.json"));
        assert.equal(receipt.name, `harness-candidate-${input.runId.slice(4)}`, "CANDIDATE_VOLUME_RECEIPT_NAME");
        assert.equal(receipt.owner, input.runId, "CANDIDATE_VOLUME_RECEIPT_OWNER");
        assert.equal(receipt.service, "candidate-input", "CANDIDATE_VOLUME_RECEIPT_SERVICE");
        assert.equal(receipt.readOnlyAtUse, true, "CANDIDATE_VOLUME_RECEIPT_ACCESS");
        assert.equal(receipt.proofAuthority, false, "CANDIDATE_VOLUME_RECEIPT_AUTHORITY");
        assert.equal(receipt.catalogueCredit, false, "CANDIDATE_VOLUME_RECEIPT_CREDIT");
        assert.equal(receipt.sourceDigest, input.artifact.payloadDigest, "CANDIDATE_VOLUME_RECEIPT_SOURCE");
        assert.equal(receipt.copiedDigest, input.artifact.payloadDigest, "CANDIDATE_VOLUME_RECEIPT_COPY");
        assert.equal(receipt.status, "removed", "CANDIDATE_VOLUME_RECEIPT_CLEANUP");
        assert.equal(receipt.cleanupComplete, true, "CANDIDATE_VOLUME_RECEIPT_CLEANUP");
      } catch (error) {
        cleanupErrors.push(error);
        verdict = { status: "BLOCKED", exitCode: 2 };
      }
    }
    uninstall();
    try {
      if (input.releaseScopeId === EVENT_CAPABILITY_SCOPE) {
        try {
          writeJsonAtomic(path.join(output, "event-runtime-lifecycle-timings.json"), {
            schemaVersion: 1,
            kind: "private-event-runtime-lifecycle-timings",
            proofAuthority: false,
            catalogueCredit: false,
            records: lifecycleTimings,
          });
        } catch { /* Optional diagnostics cannot invalidate runtime evidence. */ }
      }
      if (interrupted) {
        verdict = { status: "BLOCKED", exitCode: 2 };
        invalidate(output, interrupted, cleanupErrors.length === 0);
      } else if (cleanupErrors.length) {
        verdict = { status: "BLOCKED", exitCode: 2 };
        for (const name of ["run.json", "gate.json"])
          if (fs.existsSync(path.join(output, name)))
            fs.renameSync(path.join(output, name), path.join(output, `incomplete-cleanup-${name}`));
      }
      writeJsonAtomic(path.join(output, "source-snapshot.json"), {
        retained: true,
        path: stagedHarness,
        digest: input.harnessSourceDigest,
      });
      if (!interrupted) {
        writeJsonAtomic(path.join(output, "controller-terminal.json"), {
          status: "completed",
          exitCode: verdict.exitCode,
          cleanupComplete: cleanupErrors.length === 0,
        });
        if(eventSerialV3) writeV3File(output,'v3/host-result.json',{schemaVersion:3,status:verdict.status,exitCode:verdict.exitCode,cleanupComplete:cleanupErrors.length===0,experimental:true,sourceComplete:false,semanticReplay:false,nativeAuthority:false,runtimeAcceptance:false,catalogueCredit:false,releaseApproval:false,promotionAllowed:false});
        else writeHarnessPublicSummary(output, verdict, Boolean(pendingReceipt) && cleanupErrors.length === 0);
        // All mandatory cleanup and output work precedes the machine receipt.
        if (!eventSerialV3 && pendingReceipt && cleanupErrors.length === 0)
          writeJsonAtomic(path.join(output, "gate.json"), pendingReceipt);
      }
    } catch (error) {
      verdict = { status: "BLOCKED", exitCode: 2 };
      try { fs.rmSync(path.join(output, "gate.json"), { force: true }); } catch { /* Producer completion remains failed if withdrawal is unavailable. */ }
      try {
        writeJsonAtomic(path.join(output, "controller-terminal.json"), {
          ...(interrupted ? { status: "interrupted", signal: interrupted } : { status: "completed", exitCode: 2 }),
          cleanupComplete: cleanupErrors.length === 0,
        });
      } catch { /* Preserve the original finalization error and attempt the other safe output. */ }
      try { if(!eventSerialV3)writeHarnessPublicSummary(output, verdict); } catch { /* Best effort; the producer still rejects. */ }
      throw error;
    }
  }
  return verdict;
}
