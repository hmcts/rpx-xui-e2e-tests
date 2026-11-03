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
} from "./exui-host-invocation.mjs";
import { verifyHearingPublicationMutant } from "./exui-hearing-publication-mutation.mjs";
import { verifyScopeMutant } from "../prepare-harness-scope-mutant.mjs";
import { installCancellationCleanup } from "./exui-oci-runtime.mjs";
import { getReleasePolicy } from "./exui-release-policy.mjs";
import { effectiveCandidateConfiguration } from "./exui-candidate-runtime.mjs";
import { GLOBAL_SEARCH_SCOPE, globalSearchContract } from "./exui-global-search-contract.mjs";
import { ROUTING_SCOPE } from "./exui-routing-contract.mjs";
import { EVENT_CAPABILITY_SCOPE, validateEventCapabilityPair } from "./exui-ccd-event-capability.mjs";
import { eventCapabilityTransitionRequest, waitForEventCapabilityRuntime } from "./exui-ccd-event-transition.mjs";
import {
  digestBytes,
  writeJsonAtomic,
  loadRunEvidence,
} from "./exui-evidence-io.mjs";
import { writeHarnessPublicSummary } from "./exui-output-boundary.mjs";
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
            : input.releaseScopeId === EVENT_CAPABILITY_SCOPE
              ? {
                  target: "AuthorisationCaseEvent:caseworker-privatelaw-judge:serviceOfDocuments:CRUD",
                  transformationRecord: validateEventCapabilityPair(
                    read(new URL("../fixtures/ccd/event-capability/baseline.json", import.meta.url)),
                    read(new URL("../fixtures/ccd/event-capability/mutant.json", import.meta.url)),
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
export async function runNativeHostPhase(output, stagedHarness) {
  const input = read(path.join(output, "input.json")),
    policy = getReleasePolicy(input.releaseScopeId),
    resources = new Map(),
    cleanupErrors = [];
  let interrupted,
    manifest,
    pendingReceipt,
    executions = [],
    identities = [],
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
    input.nativeRuntime = inspectNativeApiRuntime();
    input.browserRuntimeImage = inspectNativeBrowserRuntime();
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
    writeJsonAtomic(path.join(output, "input.json"), input);
    writeJsonAtomic(path.join(output, "container-launch.json"), handoff);
    for (const invocation of invocations) {
      const invocationInput = input.releaseScopeId === EVENT_CAPABILITY_SCOPE && invocation.mutation
        ? await waitForEventCapabilityRuntime(input, output, { isCancelled: () => Boolean(interrupted) })
        : input;
      const directory = path.join(output, invocation.invocationId);
      fs.mkdirSync(directory, { mode: 0o700, ...(input.releaseScopeId === EVENT_CAPABILITY_SCOPE && invocation.mutation ? { recursive: true } : {}) });
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
                observedDefinitionDigest:
                  invocationInput.definition.observedDefinitionDigest,
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
              : input.releaseScopeId === EVENT_CAPABILITY_SCOPE
                ? "literal source role/event/field permission shape in normalized HARNESS case type; synthetic sessions and IDAM; omitted PRL callbacks; no deployed PRL, AM/ABAC, OIDC, CSRF-enforcement or owner-acceptance credit"
              : input.ccd
                ? "synthetic-session,IDAM-simulator,feature-flags,telemetry; real CCD RBAC only; role removal uses renewed synthetic session, not immediate stale-session invalidation or OIDC login; ABAC/provider excluded"
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
      const { terminal } = await runHostInvocation(
        { ...plan, manifest: current, payloadDigest: artifact.payloadDigest },
        { resources, isCancelled: () => Boolean(interrupted) },
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
      });
      manifest ??= current;
      executions.push(ref(output, path.join(directory, "execution.json")));
      identities.push({ invocationId: invocation.invocationId, identity,
        ...(input.releaseScopeId === EVENT_CAPABILITY_SCOPE ? {
          runtimeMetadata: Object.fromEntries(["definitionImportDigest", "observedDefinitionDigest", "definitionVersion", "ccdNamespace"].map((key) => [key, current.runtimeMetadata[key]])),
        } : {}),
      });
      if (input.releaseScopeId === EVENT_CAPABILITY_SCOPE && invocation.invocationId === "baseline")
        writeJsonAtomic(path.join(output, "event-transition-request.json"), eventCapabilityTransitionRequest(input));
    }
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
    uninstall();
    try {
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
        writeHarnessPublicSummary(output, verdict, Boolean(pendingReceipt) && cleanupErrors.length === 0);
        // All mandatory cleanup and output work precedes the machine receipt.
        if (pendingReceipt && cleanupErrors.length === 0)
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
      try { writeHarnessPublicSummary(output, verdict); } catch { /* Best effort; the producer still rejects. */ }
      throw error;
    }
  }
  return verdict;
}
