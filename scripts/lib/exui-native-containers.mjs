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
        "node@sha256:0925478b811e8890f5508ad2a75135933310effd45492696ecf7c111c8339d02",
      manifestDigest:
        "sha256:0925478b811e8890f5508ad2a75135933310effd45492696ecf7c111c8339d02",
      configDigest:
        "sha256:8279a176db0ac2d89d4d3ef16063c1990ee00ea98d81e0937ed38117feab7fed",
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
    platform: artifact.provenance.platform,
    diagnostics,
    tools: {
      name: `${owner}-${invocationId}-tools`,
      image: input.browserRuntimeImage,
      namespace,
      mounts: toolsMounts,
      args: toolContainerArguments({
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
