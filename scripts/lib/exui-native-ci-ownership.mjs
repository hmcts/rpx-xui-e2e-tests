import {CALLBACK_SCOPE,CALLBACK_MUTATION,callbackVariant} from './exui-recipient-callback-contract.mjs';
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nativeInvocations } from "./exui-native-contract.mjs";
import { nativeContainerPlan } from "./exui-native-containers.mjs";
import { assertOwnedContainerAuthority } from "./exui-oci-runtime.mjs";
import { assertCandidateWriteDenial } from "./exui-host-invocation.mjs";
import { digestBytes, writeJsonAtomic } from "./exui-evidence-io.mjs";
import { EVENT_CAPABILITY_SCOPE, EVENT_CAPABILITY_MUTATION, eventCapabilityFaultVariant } from "./exui-ccd-event-capability.mjs";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const scopes = {
  hearingPublication: "exui-hearing-publication-pilot",
  globalSearch: "exui-global-search-pilot",
  routing: "exui-decentralised-routing-pilot",
  family: "exui-wa-family-pilot",
  scope: "exui-wa-scope-pilot",
  ccd: "exui-ccd-pilot",
  eventCapability: EVENT_CAPABILITY_SCOPE,
  recipientCallback: CALLBACK_SCOPE,
};
function captureOwnership(
  input,
  handoff,
  context,
  directory,
  name,
  eventFault = null,
) {
  assert.equal(input.releaseScopeId, scopes[name], "CI_NATIVE_SCOPE_MISMATCH");
  assert.equal(input.only, undefined, "CI_NATIVE_COMPLETE_SLICE_REQUIRED");
  assert(
    /^(candidate|ccd)-[a-f0-9-]{36}$/.test(input.runId),
    "CI_NATIVE_OWNER_REQUIRED",
  );
  assert.equal(handoff.output, directory, "CI_NATIVE_OUTPUT_MISMATCH");
  assert.equal(fs.realpathSync(directory), directory, "CI_NATIVE_OUTPUT_ALIAS");
  assert.equal(
    input.browserRoot,
    context.browserRoot,
    "CI_NATIVE_BROWSER_ROOT_MISMATCH",
  );
  assert.deepEqual(
    input.artifact,
    context.artifact,
    "CI_NATIVE_ARTIFACT_ROOT_MISMATCH",
  );
  assert(
    /^sha256:[a-f0-9]{64}$/.test(context.nativeRuntime?.imageId ?? "") &&
      ["linux/arm64", "linux/amd64"].includes(context.nativeRuntime.platform) &&
      context.nativeRuntime.platform === context.artifact.provenance.platform,
    "CI_NATIVE_PINNED_RUNTIME_REQUIRED",
  );
  assert.deepEqual(
    input.nativeRuntime,
    context.nativeRuntime,
    "CI_NATIVE_RUNTIME_MISMATCH",
  );
  assert.equal(
    input.browserRuntimeImage,
    context.browserRuntimeImage,
    "CI_NATIVE_TOOLS_IMAGE_MISMATCH",
  );
  if (name === "scope" || name === "hearingPublication")
    assert.deepEqual(
      input.mutantArtifact,
      context.mutantArtifact,
      "CI_NATIVE_MUTANT_MISMATCH",
    );
  else assert(!input.mutantArtifact, "CI_NATIVE_UNEXPECTED_MUTANT");
  if (["ccd", "eventCapability", "recipientCallback"].includes(name)) {
    assert.equal(
      input.ccd.namespace,
      context.ccd.namespace,
      "CI_NATIVE_CCD_NAMESPACE_MISMATCH",
    );
    assert.equal(
      input.ccd.owner,
      context.ccd.owner,
      "CI_NATIVE_CCD_OWNER_MISMATCH",
    );
    if (name === "recipientCallback") {
      assert.equal(input.definition?.kind,"native-recipient-callback-definition","CI_NATIVE_CALLBACK_IMPORT_REQUIRED");
      assert.equal(input.definition.variant,callbackVariant(eventFault ?? "baseline"),"CI_NATIVE_CALLBACK_VARIANT_MISMATCH");
      assert.equal(input.definition.namespace,input.ccd.namespace,"CI_NATIVE_CALLBACK_IMPORT_NAMESPACE");
    }
    if (name === "eventCapability")
      assert.equal(input.ccd.fixtureSelection, eventFault ? `event-capability-${eventCapabilityFaultVariant(eventFault)}` : "event-capability-baseline", "CI_NATIVE_EVENT_VARIANT_MISMATCH");
  } else assert(!input.ccd, "CI_NATIVE_UNEXPECTED_NAMESPACE");
  const state = handoff.stateRoot;
  assert(
    typeof state === "string" && path.isAbsolute(state),
    "CI_NATIVE_PRIVATE_STATE_REQUIRED",
  );
  assert.equal(fs.realpathSync(state), state, "CI_NATIVE_STATE_ALIAS");
  assert.equal(
    path.dirname(state),
    fs.realpathSync(os.tmpdir()),
    "CI_NATIVE_PRIVATE_STATE_REQUIRED",
  );
  assert(
    path.basename(state).startsWith("harness-native-state-"),
    "CI_NATIVE_PRIVATE_STATE_REQUIRED",
  );
  // Plans are rebuilt from the declared candidate, toolchain and fixed invocation inventory.
  const invocations = nativeInvocations(scopes[name]).filter((invocation) =>
    !["eventCapability","recipientCallback"].includes(name) || invocation.invocationId === (eventFault ?? "baseline"),
  ).map(
    ({ invocationId }) => ({
      invocationId,
      plan: nativeContainerPlan(input, handoff, invocationId),
    }),
  );
  return { mode: handoff.mode, directory, owner: input.runId, invocations };
}

export function captureNativeOwnership(input, handoff, context, directory, name) {
  return captureOwnership(input, handoff, context, directory, name);
}

export function captureCallbackFaultOwnership(input,handoff,context,directory,invocationId=CALLBACK_MUTATION) {
  assert.equal(invocationId,CALLBACK_MUTATION,"CI_NATIVE_CALLBACK_INVOCATION");
  return captureOwnership(input,handoff,context,directory,"recipientCallback",invocationId);
}

export function captureEventFaultOwnership(input, handoff, context, directory, invocationId = EVENT_CAPABILITY_MUTATION) {
  eventCapabilityFaultVariant(invocationId);
  return captureOwnership(input, handoff, context, directory, "eventCapability", invocationId);
}

export function assertEventBaselineRemoved(expected, { inspect }) {
  assert.deepEqual(expected.invocations.map((item) => item.invocationId), ["baseline"], "EVENT_BASELINE_OWNERSHIP_REQUIRED");
  const { plan } = expected.invocations[0];
  const bindings = [];
  for (const name of ["baseline/candidate-write-denial.json", "baseline/candidate-lifecycle.json"]) {
    const file = path.join(expected.directory, name);
    assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, "EVENT_BASELINE_ARTIFACT_ALIAS");
    bindings.push({ path: name, digest: digestBytes(fs.readFileSync(file)) });
  }
  const registry = read(path.join(expected.directory, "owned-resources.json"));
  assert.deepEqual(registry.map((item) => item.name).sort(), [plan.candidate.name, plan.tools.name].sort(), "EVENT_BASELINE_RESOURCE_INVENTORY");
  const removed = [];
  for (const [service, resource] of [["candidate", plan.candidate], ["browser-provider", plan.tools]]) {
    const recorded = registry.find((item) => item.name === resource.name);
    assert(/^[a-f0-9]{64}$/.test(recorded.id), "EVENT_BASELINE_CID_REQUIRED");
    assert.equal(recorded.owner, expected.owner, "EVENT_BASELINE_OWNER_MISMATCH");
    assert.equal(recorded.service, service, "EVENT_BASELINE_SERVICE_MISMATCH");
    assert.equal(recorded.image, resource.image, "EVENT_BASELINE_IMAGE_MISMATCH");
    assert.equal(recorded.namespace, plan.namespace, "EVENT_BASELINE_NAMESPACE_MISMATCH");
    assert.deepEqual(recorded.mounts, resource.mounts, "EVENT_BASELINE_MOUNTS_MISMATCH");
    assert.equal(inspect(resource.name), null, "EVENT_BASELINE_NAME_STILL_PRESENT");
    assert.equal(inspect(recorded.id), null, "EVENT_BASELINE_CID_STILL_PRESENT");
    removed.push({ name: resource.name, id: recorded.id });
  }
  const { denial, lifecycle } = validateNativeInvocationFinalization(expected.directory, { invocationId: "baseline" });
  const candidate = registry.find((item) => item.name === plan.candidate.name);
  assert.equal(denial.candidateId, candidate.id, "EVENT_BASELINE_WRITE_PROBE_CID");
  for (const observation of [lifecycle.before, lifecycle.after]) {
    assert.equal(observation.Id, candidate.id, "EVENT_BASELINE_LIFECYCLE_CID");
    assert.equal(observation.Name, `/${plan.candidate.name}`, "EVENT_BASELINE_LIFECYCLE_NAME");
    assertOwnedContainerAuthority(observation, { owner: expected.owner, service: "candidate", image: plan.candidate.image, namespace: plan.namespace, mounts: plan.candidate.mounts });
  }
  assert.equal(lifecycle.after.State.OOMKilled, false, "EVENT_BASELINE_OOM");
  const snapshot = path.join(expected.directory, "baseline-owned-resources.json");
  fs.writeFileSync(snapshot, JSON.stringify(registry, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  bindings.push({ path: "baseline-owned-resources.json", digest: digestBytes(fs.readFileSync(snapshot)) });
  return { removed, bindings };
}

export async function cleanupNativeOwnership(expected, { inspect, remove }) {
  const registryPath = path.join(expected.directory, "owned-resources.json");
  const terminalPath = path.join(
    expected.directory,
    "controller-terminal.json",
  );
  const terminal = fs.existsSync(terminalPath) ? read(terminalPath) : null;
  const registry = fs.existsSync(registryPath) ? read(registryPath) : [];
  assert(Array.isArray(registry), "CI_NATIVE_RESOURCE_INVENTORY_REQUIRED");
  const knownNames = expected.invocations.flatMap(({ plan }) => [
    plan.tools.name,
    plan.candidate.name,
  ]);
  assert(
    registry.every((item) => knownNames.includes(item.name)),
    "CI_NATIVE_UNDECLARED_RESOURCE",
  );
  assert.equal(
    new Set(registry.map((item) => item.name)).size,
    registry.length,
    "CI_NATIVE_DUPLICATE_RESOURCE",
  );
  const errors = [],
    removed = [];
  // A host controller may have exited after Docker created a planned name but before recording its CID.
  // Lookup every fixed name; the mutable registry never defines cleanup authority.
  for (const { plan } of [...expected.invocations].reverse()) {
    let namespace = plan.namespace;
    try {
      const toolsRecord = registry.find(
        (item) => item.name === plan.tools.name,
      );
      const toolsInfo = inspect(plan.tools.name);
      if (toolsInfo) {
        if (toolsRecord?.id)
          assert.equal(
            toolsInfo.Id,
            toolsRecord.id,
            "CI_NATIVE_CID_NAME_MISMATCH",
          );
        assertOwnedContainerAuthority(toolsInfo, {
          owner: expected.owner,
          service: "browser-provider",
          image: plan.tools.image,
          namespace: plan.namespace,
          mounts: plan.tools.mounts,
        });
        namespace ??= toolsInfo.Id;
      }
    } catch (error) {
      errors.push(error);
    }
    let candidateSettled = false;
    for (const [service, definition] of [
      ["candidate", plan.candidate],
      ["browser-provider", plan.tools],
    ]) {
      try {
        const record = registry.find((item) => item.name === definition.name);
        const named = inspect(definition.name);
        const identified = record?.id ? inspect(record.id) : null;
        if (named && record?.id)
          assert.equal(named.Id, record.id, "CI_NATIVE_CID_NAME_MISMATCH");
        const info = identified ?? named;
        if (!info) {
          // Known CID absence is conclusive. Without a CID, a completed controller must attest cleanup.
          assert(
            record?.id || terminal?.cleanupComplete === true,
            "CI_NATIVE_CREATION_OUTCOME_UNCERTAIN",
          );
          if (service === "candidate") candidateSettled = true;
          continue;
        }
        assert(
          /^[a-f0-9]{64}$/.test(info.Id),
          "CI_NATIVE_OBSERVED_CID_REQUIRED",
        );
        assert.equal(
          info.Name,
          `/${definition.name}`,
          "CI_NATIVE_NAME_MISMATCH",
        );
        if (service === "candidate")
          assert(namespace, "CI_NATIVE_NAMESPACE_REQUIRED");
        assertOwnedContainerAuthority(info, {
          owner: expected.owner,
          service,
          image: definition.image,
          namespace: service === "candidate" ? namespace : plan.namespace,
          mounts: definition.mounts,
          ...(definition.launchProcess
            ? { launchProcess: definition.launchProcess }
            : {}),
        });
        if (service === "browser-provider" && !plan.namespace)
          assert(
            candidateSettled,
            "CI_NATIVE_NAMESPACE_CANDIDATE_CLEANUP_REQUIRED",
          );
        remove(info.Id);
        assert.equal(inspect(info.Id), null, "CI_NATIVE_REMOVAL_INCOMPLETE");
        removed.push(info.Id);
        if (service === "candidate") candidateSettled = true;
      } catch (error) {
        errors.push(error);
      }
    }
  }
  writeJsonAtomic(path.join(expected.directory, "container-cleanup.json"), {
    mode: "native-separate-api",
    removed,
    cleanupComplete: errors.length === 0,
  });
  if (errors.length)
    throw new AggregateError(errors, "CI_NATIVE_CLEANUP_INCOMPLETE");
}

// Structural authority/lifecycle requirements supplement the common product evaluator; they do not decide proof outcomes.
export function validateNativePhaseFinalization(
  directory,
  executions,
  terminal,
) {
  const controller = read(path.join(directory, "controller-terminal.json"));
  assert.equal(
    controller.status,
    "completed",
    "CI_NATIVE_CONTROLLER_INCOMPLETE",
  );
  assert.equal(
    controller.cleanupComplete,
    true,
    "CI_NATIVE_CLEANUP_INCOMPLETE",
  );
  assert.equal(
    controller.exitCode,
    terminal.code,
    "CI_NATIVE_CONTROLLER_EXIT_MISMATCH",
  );
  for (const execution of executions)
    validateNativeInvocationFinalization(directory, execution);
}

export function validateNativeInvocationFinalization(directory, execution) {
    assert(
      /^[a-z0-9-]+$/.test(execution.invocationId),
      "CI_NATIVE_INVOCATION_PATH_REQUIRED",
    );
    const root = path.join(directory, execution.invocationId);
    const denial = read(path.join(root, "candidate-write-denial.json"));
    assertCandidateWriteDenial(denial);
    const lifecycle = read(path.join(root, "candidate-lifecycle.json"));
    assert.equal(lifecycle.requestedStop, true, "CI_NATIVE_STOP_NOT_OBSERVED");
    assert.equal(
      lifecycle.before.State.Running,
      true,
      "CI_NATIVE_PREMATURE_EXIT",
    );
    assert.equal(
      lifecycle.after.State.Running,
      false,
      "CI_NATIVE_STOP_INCOMPLETE",
    );
    assert.equal(
      lifecycle.after.State.ExitCode,
      143,
      "CI_NATIVE_STOP_EXIT_MISMATCH",
    );
    return { denial, lifecycle };
}
