import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARM64_BROWSER_RUNTIME,
  NATIVE_API_RUNTIME_REFERENCE,
  toolContainerArguments,
  sharedNestedAuditToolContainerArguments,
  candidateArchiveArguments,
  candidateArchiveProcess,
  assertBrowserRuntime,
} from "./exui-oci-runtime.mjs";
import { hostDocker } from "./exui-host-invocation.mjs";
import { SHARED_NESTED_SCOPE, sharedNestedRemovedStatePaths } from "./exui-shared-nested-scope.mjs";
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
export function nativeRuntimeImages(platform) {
  if (platform === "linux/arm64")
    return {
      api: {
        reference: NATIVE_API_RUNTIME_REFERENCE,
        manifestDigest: NATIVE_API_RUNTIME_REFERENCE.split("@")[1],
      },
      browser: {
        reference: `mcr.microsoft.com/playwright@${ARM64_BROWSER_RUNTIME}`,
        manifestDigest: ARM64_BROWSER_RUNTIME,
      },
    };
  assert.equal(platform, "linux/amd64", "UNSUPPORTED_NATIVE_PLATFORM");
  return {
    api: {
      reference:
        "node@sha256:6b9d4ea31e614e29f364bf75758458731eb1e105b80c99667438dd6b3fe262e0",
      manifestDigest:
        "sha256:6b9d4ea31e614e29f364bf75758458731eb1e105b80c99667438dd6b3fe262e0",
      configDigest:
        "sha256:4ec989dc9e69bc7f2cdede4d6755b81f34d697447daba63c72d81d3b48011800",
    },
    browser: {
      reference:
        "mcr.microsoft.com/playwright@sha256:ee15712262f017b8157421b212b12099146645f44b1bc5c0514cbbe6a229b1d0",
      manifestDigest:
        "sha256:ee15712262f017b8157421b212b12099146645f44b1bc5c0514cbbe6a229b1d0",
      configDigest:
        "sha256:a0d7b2b49ffa0e99787a00b7ec2af46eca58020082713f002ca9f0f1cfd1a017",
    },
  };
}
// Browser bytes are independent of the pinned tools image.
export function nativeBrowserDonor(platform) {
  assert(["linux/arm64", "linux/amd64"].includes(platform), "UNSUPPORTED_NATIVE_PLATFORM");
  const [manifestDigest, configDigest] = platform === "linux/arm64"
    ? ["sha256:ccf917390e8eea6cad2bb493313b9d8db2856ed41c24db0a6727eacc766fd273", "sha256:197b5df7a4651a463469f0e5473b59c0284f3802d915de304f1aeeb39ec03874"]
    : ["sha256:bc4fbb329a25287ed23e9216c97063646abdd1bf2da669a9895fa3e2078b2302", "sha256:494de4cdb8f7edd16c6512c8bcae447cc477248c5b1c5d458b9fe85c67b04edf"];
  return { reference: `mcr.microsoft.com/playwright@${manifestDigest}`, manifestDigest, configDigest };
}
export function assertNativeRuntimeImage(info, pin, platform) {
  assert.equal(
    `${info.Os}/${info.Architecture}`,
    platform,
    "NATIVE_RUNTIME_PLATFORM_MISMATCH",
  );
  assert(
    info.Id === pin.manifestDigest ||
      (pin.configDigest && info.Id === pin.configDigest),
    "NATIVE_RUNTIME_IMAGE_MISMATCH",
  );
  assert(
    info.RepoDigests?.some((ref) => ref.endsWith(`@${pin.manifestDigest}`)),
    "NATIVE_RUNTIME_PROVENANCE_REQUIRED",
  );
}
export function inspectNativeApiRuntime(platform = "linux/arm64") {
  const pin = nativeRuntimeImages(platform).api;
  const info = JSON.parse(hostDocker(["image", "inspect", pin.reference]))[0];
  if (platform === "linux/arm64") {
    assert.equal(info.Os, "linux", "NATIVE_API_RUNTIME_OS");
    assert.equal(info.Architecture, "arm64", "NATIVE_API_RUNTIME_ARCH");
    assert(
      info.RepoDigests?.some((ref) => ref.endsWith(`@${pin.manifestDigest}`)),
      "NATIVE_API_RUNTIME_PROVENANCE",
    );
  } else assertNativeRuntimeImage(info, pin, platform);
  return { reference: pin.reference, imageId: info.Id, platform };
}
export function inspectNativeBrowserRuntime(platform = "linux/arm64") {
  const pin = nativeRuntimeImages(platform).browser;
  const info = JSON.parse(
    hostDocker([
      "image",
      "inspect",
      platform === "linux/arm64" ? ARM64_BROWSER_RUNTIME : pin.reference,
    ]),
  )[0];
  if (platform === "linux/arm64")
    assertBrowserRuntime(info, ARM64_BROWSER_RUNTIME, platform);
  else assertNativeRuntimeImage(info, pin, platform);
  return info.Id;
}
export function nativeContainerPlan(
  input,
  handoff,
  invocationId,
  toolsNamespace,
) {
  return buildNativeContainerPlan(input, handoff, invocationId, toolsNamespace, mount, toolContainerArguments);
}

// Audit an already removed private state root; launch planning always uses realpath.
export function sharedNestedAuditContainerPlan(input, handoff, invocationId) {
  assert.equal(input.releaseScopeId, SHARED_NESTED_SCOPE, "SHARED_NESTED_AUDIT_SCOPE");
  const state = handoff.stateRoot;
  const removed=sharedNestedRemovedStatePaths(state,invocationId);
  const retired = new Map([
    [removed.sessions, "/tmp/.sessions"],
    [removed.diagnostics, "/diagnostics"],
  ]);
  const auditMount = (source, target, writable) => {
    if (!retired.has(source)) return mount(source, target, writable);
    assert.equal(target, retired.get(source), "SHARED_NESTED_AUDIT_MOUNT_TARGET");
    assert.equal(writable, true, "SHARED_NESTED_AUDIT_MOUNT_ACCESS");
    return { source, target, writable };
  };
  // The launch plan contains a function used only to create the candidate container.
  return JSON.parse(JSON.stringify(buildNativeContainerPlan(input, handoff, invocationId, undefined, auditMount, options=>sharedNestedAuditToolContainerArguments(options,state))));
}

function buildNativeContainerPlan(input, handoff, invocationId, toolsNamespace, planMount, planToolsArguments) {
  const invocation = nativeInvocation(input, invocationId),
    artifact = selectedArtifact(input, invocation),
    candidateRoot = artifact.candidateRoot;
  assert.equal(
    input.nativeRuntime.platform,
    artifact.provenance.platform,
    "NATIVE_CANDIDATE_PLATFORM_MISMATCH",
  );
  nativeRuntimeImages(artifact.provenance.platform);
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
    planMount(handoff.stagedHarness, "/harness", false),
    planMount(dependenciesRoot, "/harness/node_modules", false),
    planMount(candidateRoot, "/candidate", false),
    planMount(output, "/output", true),
    planMount(input.browserRoot, "/browser", false),
    planMount(sessions, "/tmp/.sessions", true),
  ];
  const candidateMounts = [
    planMount(candidateRoot, "/candidate", false),
    planMount(sessions, "/tmp/.sessions", true),
    planMount(diagnostics, "/diagnostics", true),
    planMount(guard, "/harness-network-guard.cjs", false),
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
    platform: artifact.provenance.platform,
    diagnostics,
    tools: {
      name: `${owner}-${invocationId}-tools`,
      image: input.browserRuntimeImage,
      namespace,
      mounts: toolsMounts,
      args: planToolsArguments({
        owner,
        image: input.browserRuntimeImage,
        platform: artifact.provenance.platform,
        harnessRoot: handoff.stagedHarness,
        dependenciesRoot,
        candidateRoot,
        output,
        browserRoot: input.browserRoot,
        sessions,
        invocationId,
        native: true,
        namespace,
        releaseScopeId: input.releaseScopeId,
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
          platform: artifact.provenance.platform,
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
