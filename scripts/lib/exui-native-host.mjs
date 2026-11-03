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
import { verifyScopeMutant } from "../prepare-harness-scope-mutant.mjs";
import { installCancellationCleanup } from "./exui-oci-runtime.mjs";
import { getReleasePolicy } from "./exui-release-policy.mjs";
import { effectiveCandidateConfiguration } from "./exui-candidate-runtime.mjs";
import { ROUTING_SCOPE } from "./exui-routing-contract.mjs";
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
function derivations(input, output, policy, identities, scopeDerivation) {
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
      ...(scopeDerivation
        ? {
            productionArtifact: input.mutantArtifact,
            transformationRecord: scopeDerivation,
            target: scopeDerivation.target,
            beforeDigest: scopeDerivation.beforeDigest,
            afterDigest: scopeDerivation.afterDigest,
          }
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
      invalidate(output, interrupted, cleanupErrors.length === 0);
      process.exit(code);
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
    const scopeDerivation =
      input.releaseScopeId === "exui-wa-scope-pilot"
        ? await verifyScopeMutant(input.artifact, input.mutantArtifact)
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
      const directory = path.join(output, invocation.invocationId);
      fs.mkdirSync(directory, { mode: 0o700 });
      const artifact = selectedArtifact(input, invocation),
        { identity, config } = nativeIdentity(
          input,
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
          ...(input.ccd
            ? {
                gatewayDigest: input.gatewayDigest,
                definitionImportDigest: input.definitionImportDigest,
                observedDefinitionDigest:
                  input.definition.observedDefinitionDigest,
                definitionVersion: String(input.definition.definitionVersion),
                ccdNamespace: input.ccd.namespace,
              }
            : {}),
          excludedSeams:
            input.releaseScopeId === ROUTING_SCOPE
              ? "synthetic-auth,upstream-definition-metadata,central-NoC-response,PCS-NoC-response,PCS-destination-marker,feature-flags,telemetry; no PCS backend/CCD/access/persistence or aggregate80ee credit"
              : input.ccd
                ? "synthetic-session,IDAM-simulator,feature-flags,telemetry; real CCD RBAC only; ABAC/provider excluded"
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
      const plan = nativeContainerPlan(input, handoff, invocation.invocationId);
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
      identities.push({ invocationId: invocation.invocationId, identity });
    }
    const mutations = derivations(
      input,
      output,
      policy,
      identities,
      scopeDerivation,
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
    writeJsonAtomic(path.join(output, "gate.json"), loaded.receipt);
  } finally {
    for (const key of [...resources.keys()].reverse())
      try {
        await remove(key);
      } catch {
        verdict = { status: "BLOCKED", exitCode: 2 };
      }
    uninstall();
    if (interrupted)
      invalidate(output, interrupted, cleanupErrors.length === 0);
    else {
      if (cleanupErrors.length) {
        verdict = { status: "BLOCKED", exitCode: 2 };
        for (const name of ["run.json", "gate.json"])
          if (fs.existsSync(path.join(output, name)))
            fs.renameSync(
              path.join(output, name),
              path.join(output, `incomplete-cleanup-${name}`),
            );
      }
      writeJsonAtomic(path.join(output, "controller-terminal.json"), {
        status: "completed",
        exitCode: verdict.exitCode,
        cleanupComplete: cleanupErrors.length === 0,
      });
      writeHarnessPublicSummary(
        output,
        verdict,
        fs.existsSync(path.join(output, "gate.json")),
      );
    }
    writeJsonAtomic(path.join(output, "source-snapshot.json"), {
      retained: true,
      path: stagedHarness,
      digest: input.harnessSourceDigest,
    });
  }
  return verdict;
}
