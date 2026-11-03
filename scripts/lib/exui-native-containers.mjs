import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARM64_BROWSER_RUNTIME,
  NATIVE_API_RUNTIME_REFERENCE,
  toolContainerArguments,
  candidateArchiveArguments,
  candidateArchiveProcess,
  assertBrowserRuntime,
} from "./exui-oci-runtime.mjs";
import { hostDocker } from "./exui-host-invocation.mjs";
import {
  nativeInvocation,
  selectedArtifact,
  nativeIdentity,
} from "./exui-native-contract.mjs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const mount = (source, target, writable) => ({
  source: fs.realpathSync(source),
  target,
  writable,
});
export function inspectNativeApiRuntime() {
  const info = JSON.parse(
    hostDocker(["image", "inspect", NATIVE_API_RUNTIME_REFERENCE]),
  )[0];
  assert.equal(info.Os, "linux", "NATIVE_API_RUNTIME_OS");
  assert.equal(info.Architecture, "arm64", "NATIVE_API_RUNTIME_ARCH");
  assert(
    info.RepoDigests?.some((ref) =>
      ref.endsWith(
        NATIVE_API_RUNTIME_REFERENCE.slice(
          NATIVE_API_RUNTIME_REFERENCE.indexOf("@"),
        ),
      ),
    ),
    "NATIVE_API_RUNTIME_PROVENANCE",
  );
  return {
    reference: NATIVE_API_RUNTIME_REFERENCE,
    imageId: info.Id,
    platform: "linux/arm64",
  };
}
export function inspectNativeBrowserRuntime() {
  const info = JSON.parse(
    hostDocker(["image", "inspect", ARM64_BROWSER_RUNTIME]),
  )[0];
  assertBrowserRuntime(info, ARM64_BROWSER_RUNTIME, "linux/arm64");
  return info.Id;
}
export function nativeContainerPlan(
  input,
  handoff,
  invocationId,
  toolsNamespace,
) {
  const invocation = nativeInvocation(input, invocationId),
    artifact = selectedArtifact(input, invocation),
    candidateRoot = artifact.candidateRoot;
  const { config } = nativeIdentity(input, invocation, candidateRoot);
  const dependenciesRoot = fs.realpathSync(path.join(root, "node_modules"));
  const output = handoff.output,
    directory = path.join(output, invocationId),
    owner = input.runId,
    namespace = input.ccd?.namespace;
  const sessions = path.join(handoff.stateRoot, invocationId, "sessions"),
    diagnostics = path.join(handoff.stateRoot, invocationId, "diagnostics"),
    guard = path.join(
      handoff.stagedHarness,
      "scripts/lib/exui-runtime-network-guard.cjs",
    );
  const toolsMounts = [
    mount(handoff.stagedHarness, "/harness", false),
    mount(dependenciesRoot, "/harness/node_modules", false),
    mount(candidateRoot, "/candidate", false),
    mount(output, "/output", true),
    mount(input.browserRoot, "/browser", false),
    mount(sessions, "/tmp/.sessions", true),
  ];
  const candidateMounts = [
    mount(candidateRoot, "/candidate", false),
    mount(sessions, "/tmp/.sessions", true),
    mount(diagnostics, "/diagnostics", true),
    mount(guard, "/harness-network-guard.cjs", false),
  ];
  assert(
    /^v\d+\.\d+\.\d+$/.test(artifact.provenance.runtimeNodeVersion ?? ""),
    "NATIVE_SEALED_NODE_VERSION_REQUIRED",
  );
  return {
    kind: "native",
    output,
    directory,
    owner,
    invocationId,
    namespace,
    platform: "linux/arm64",
    diagnostics,
    tools: {
      name: `${owner}-${invocationId}-tools`,
      image: input.browserRuntimeImage,
      namespace,
      mounts: toolsMounts,
      args: toolContainerArguments({
        owner,
        image: input.browserRuntimeImage,
        platform: "linux/arm64",
        harnessRoot: handoff.stagedHarness,
        dependenciesRoot,
        candidateRoot,
        output,
        browserRoot: input.browserRoot,
        sessions,
        invocationId,
        native: true,
        namespace,
      }),
    },
    candidate: {
      name: `${owner}-${invocationId}-candidate`,
      image: input.nativeRuntime.imageId,
      node: "/candidate/runtime/node",
      namespace: namespace ?? toolsNamespace,
      mounts: candidateMounts,
      expectedNodeVersion: artifact.provenance.runtimeNodeVersion,
      ...(input.releaseScopeId === "exui-decentralised-routing-pilot"
        ? {
            launchProcess: candidateArchiveProcess(
              config,
              input.releaseScopeId,
            ),
          }
        : {}),
      arguments: (actualNamespace) =>
        candidateArchiveArguments({
          image: input.nativeRuntime.imageId,
          namespace: actualNamespace,
          owner,
          invocationId,
          candidateRoot,
          sessions,
          diagnostics,
          guard,
          config,
          releaseScopeId: input.releaseScopeId,
          evidenceRoot: output,
          harnessRoot: handoff.stagedHarness,
        }),
    },
    proofArguments: [
      "scripts/run-harness-native-tools.mjs",
      "--inside-proof",
      "--invocation",
      invocationId,
    ],
  };
}
