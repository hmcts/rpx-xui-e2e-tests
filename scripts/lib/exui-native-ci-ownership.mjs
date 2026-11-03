import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nativeInvocations } from "./exui-native-contract.mjs";
import { nativeContainerPlan } from "./exui-native-containers.mjs";
import { assertOwnedContainerAuthority } from "./exui-oci-runtime.mjs";
import { assertCandidateWriteDenial } from "./exui-host-invocation.mjs";
import { writeJsonAtomic } from "./exui-evidence-io.mjs";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const scopes = {
  routing: "exui-decentralised-routing-pilot",
  family: "exui-wa-family-pilot",
  scope: "exui-wa-scope-pilot",
  ccd: "exui-ccd-pilot",
};
export function captureNativeOwnership(
  input,
  handoff,
  context,
  directory,
  name,
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
      context.nativeRuntime.platform === "linux/arm64",
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
  if (name === "scope")
    assert.deepEqual(
      input.mutantArtifact,
      context.mutantArtifact,
      "CI_NATIVE_MUTANT_MISMATCH",
    );
  else assert(!input.mutantArtifact, "CI_NATIVE_UNEXPECTED_MUTANT");
  if (name === "ccd") {
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
  const invocations = nativeInvocations(scopes[name]).map(
    ({ invocationId }) => ({
      invocationId,
      plan: nativeContainerPlan(input, handoff, invocationId),
    }),
  );
  return { mode: handoff.mode, directory, owner: input.runId, invocations };
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
  for (const execution of executions) {
    assert(
      /^[a-z0-9-]+$/.test(execution.invocationId),
      "CI_NATIVE_INVOCATION_PATH_REQUIRED",
    );
    const root = path.join(directory, execution.invocationId);
    assertCandidateWriteDenial(
      read(path.join(root, "candidate-write-denial.json")),
    );
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
  }
}
