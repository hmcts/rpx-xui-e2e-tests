import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  candidateEnvironment,
  HARNESS_SOURCE_FILES,
} from "./exui-candidate-runtime.mjs";

export const OCI_SOURCE_FILES = [
  ...HARNESS_SOURCE_FILES,
  "scripts/run-harness-oci-candidate.mjs",
  "scripts/lib/exui-oci-candidate.mjs",
  "scripts/lib/exui-oci-runtime.mjs",
];
export const ARM64_BROWSER_RUNTIME =
  "sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27";
const digest = (value) => /^sha256:[a-f0-9]{64}$/.test(value ?? "");
const mount = (source, target, readonly = false) => {
  if (
    !path.isAbsolute(source ?? "") ||
    source.includes(",") ||
    /[\r\n]/.test(source)
  )
    throw new Error("INVALID_OCI_MOUNT");
  return [
    "--mount",
    `type=bind,src=${source},dst=${target}${readonly ? ",readonly" : ""}`,
  ];
};
const ownerFlags = (owner, service) => {
  if (!/^harness-oci-[a-f0-9-]+$/.test(owner))
    throw new Error("OWNED_OCI_CONTAINER_REQUIRED");
  return [
    "--label",
    `exui.harness.owner=${owner}`,
    "--label",
    `exui.harness.service=${service}`,
  ];
};
const hardened = [
  "--read-only",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges",
  "--pids-limit",
  "256",
  "--memory",
  "4g",
  "--cpus",
  "2",
  "--tmpfs",
  "/tmp:rw,nosuid,size=512m",
];

export function readImageMetadata(runtimeRoot) {
  const root = fs.realpathSync(runtimeRoot);
  const file = path.join(root, "harness-build.json");
  assert(fs.lstatSync(file).isFile(), "OCI_METADATA_REGULAR_FILE_REQUIRED");
  assert(
    fs.realpathSync(file).startsWith(`${root}${path.sep}`),
    "OCI_METADATA_PATH_ESCAPE",
  );
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function assertReadOnlyMountIsolation(readonlyRoots, writableRoots) {
  const overlap = (left, right) =>
    left === right ||
    left.startsWith(`${right}${path.sep}`) ||
    right.startsWith(`${left}${path.sep}`);
  for (const readonly of readonlyRoots.map((value) => fs.realpathSync(value))) {
    for (const writable of writableRoots.map((value) =>
      fs.realpathSync(value),
    )) {
      assert(!overlap(readonly, writable), "OCI_READONLY_MOUNT_WRITABLE_ALIAS");
    }
  }
}

export function browserExecutable(browsers, platform) {
  if (!["linux/arm64", "linux/amd64"].includes(platform))
    throw new Error("UNSUPPORTED_OCI_PLATFORM");
  const revision = browsers.browsers.find(
    (item) => item.name === "chromium-headless-shell",
  )?.revision;
  if (!/^\d+$/.test(revision ?? ""))
    throw new Error("PINNED_BROWSER_REVISION_REQUIRED");
  return `chromium_headless_shell-${revision}/chrome-headless-shell-${platform === "linux/arm64" ? "linux-arm64" : "linux64"}/chrome-headless-shell`;
}

export function assertBrowserRuntime(inspect, image, platform) {
  assert(digest(image), "PINNED_BROWSER_RUNTIME_REQUIRED");
  assert.equal(inspect.Id, image, "BROWSER_RUNTIME_IMAGE_MISMATCH");
  assert.equal(
    `${inspect.Os}/${inspect.Architecture}`,
    platform,
    "BROWSER_RUNTIME_PLATFORM_MISMATCH",
  );
  assert(
    inspect.RepoDigests?.length > 0,
    "BROWSER_RUNTIME_PROVENANCE_REQUIRED",
  );
}

export function toolContainerArguments({
  owner,
  image,
  platform,
  harnessRoot,
  dependenciesRoot,
  candidateRoot,
  output,
  browserRoot,
  sessions,
  invocationId,
}) {
  if (!digest(image)) throw new Error("PINNED_BROWSER_RUNTIME_REQUIRED");
  if (!["baseline", "wa-drop-family"].includes(invocationId))
    throw new Error("UNSUPPORTED_OCI_INVOCATION");
  assertReadOnlyMountIsolation(
    [harnessRoot, dependenciesRoot, candidateRoot, browserRoot],
    [output, sessions],
  );
  return [
    "create",
    "--network",
    "none",
    "--platform",
    platform,
    ...hardened,
    "--shm-size",
    "512m",
    ...ownerFlags(owner, "browser-provider"),
    ...mount(harnessRoot, "/harness", true),
    ...mount(dependenciesRoot, "/harness/node_modules", true),
    ...mount(candidateRoot, "/candidate", true),
    ...mount(output, "/output"),
    ...mount(browserRoot, "/browser", true),
    ...mount(sessions, "/tmp/.sessions"),
    "--workdir",
    "/harness",
    "--entrypoint",
    "/usr/bin/env",
    image,
    "-i",
    "PATH=/usr/local/bin:/usr/bin:/bin",
    "HOME=/tmp",
    "node",
    "scripts/run-harness-oci-candidate.mjs",
    "--inside-providers",
    "--invocation",
    invocationId,
  ];
}

export function candidateImageArguments({
  descriptor,
  namespace,
  owner,
  sessions,
  diagnostics,
  guard,
  config,
}) {
  if (!/^[a-f0-9]{64}$/.test(namespace))
    throw new Error("OWNED_OCI_NAMESPACE_REQUIRED");
  if (
    !digest(descriptor.observedImageId) ||
    !descriptor.imageReference.endsWith(`@${descriptor.digest}`)
  )
    throw new Error("IMMUTABLE_CANDIDATE_IMAGE_REQUIRED");
  const env = {
    ...candidateEnvironment(config, "/diagnostics"),
    NODE_CONFIG_DIR: "/opt/app/config",
  };
  return [
    "create",
    "--network",
    `container:${namespace}`,
    "--platform",
    descriptor.platform,
    ...hardened,
    ...ownerFlags(owner, "candidate"),
    ...mount(sessions, "/tmp/.sessions"),
    ...mount(diagnostics, "/diagnostics"),
    ...mount(guard, "/harness-network-guard.cjs", true),
    "--workdir",
    "/tmp",
    "--entrypoint",
    "/usr/bin/env",
    descriptor.imageReference,
    "-i",
    ...Object.entries(env).map(([key, value]) => `${key}=${value}`),
    "/usr/local/bin/node",
    "--require",
    "/harness-network-guard.cjs",
    "/opt/app/dist/rpx-exui/api/server.bundle.js",
  ];
}

export function assertOwnedContainer(
  info,
  { image, namespace, owner, service, running, mounts },
) {
  assert.equal(info.Image, image, "OCI_CONTAINER_IMAGE_MISMATCH");
  assert.equal(
    info.Config.Labels?.["exui.harness.owner"],
    owner,
    "OCI_CONTAINER_OWNER_MISMATCH",
  );
  assert.equal(
    info.Config.Labels?.["exui.harness.service"],
    service,
    "OCI_CONTAINER_SERVICE_MISMATCH",
  );
  assert.equal(
    info.HostConfig.NetworkMode,
    namespace ? `container:${namespace}` : "none",
    "OCI_CONTAINER_NETWORK_MISMATCH",
  );
  assert.equal(
    info.HostConfig.ReadonlyRootfs,
    true,
    "OCI_CONTAINER_WRITABLE_ROOT",
  );
  assert.equal(
    info.HostConfig.Privileged || false,
    false,
    "OCI_CONTAINER_PRIVILEGED",
  );
  assert.notEqual(info.HostConfig.PidMode, "host", "OCI_CONTAINER_HOST_PID");
  assert(
    info.HostConfig.CapDrop?.includes("ALL"),
    "OCI_CONTAINER_CAPABILITIES",
  );
  assert(
    info.HostConfig.SecurityOpt?.some((value) =>
      /^no-new-privileges(?::true)?$/.test(value),
    ),
    "OCI_CONTAINER_PRIVILEGE_ESCALATION",
  );
  assert.equal(info.HostConfig.PidsLimit, 256, "OCI_CONTAINER_PROCESS_LIMIT");
  assert.equal(
    info.HostConfig.Memory,
    4294967296,
    "OCI_CONTAINER_MEMORY_LIMIT",
  );
  assert.equal(info.HostConfig.NanoCpus, 2000000000, "OCI_CONTAINER_CPU_LIMIT");
  assert.deepEqual(
    info.HostConfig.PortBindings || {},
    {},
    "OCI_CONTAINER_PUBLISHED_PORT",
  );
  assert.equal(info.RestartCount, 0, "OCI_CONTAINER_RESTARTED");
  assert.equal(
    info.State.Running,
    running,
    running
      ? "OCI_CONTAINER_EXITED_DURING_PROOF"
      : "OCI_CONTAINER_STILL_RUNNING",
  );
  assert.equal(info.State.OOMKilled, false, "OCI_CONTAINER_OOM");
  const actual = info.Mounts.filter((item) => item.Type !== "tmpfs")
    .map((item) => [item.Source, item.Destination, item.RW])
    .sort();
  assert.deepEqual(
    actual,
    mounts.map((item) => [item.source, item.target, item.writable]).sort(),
    "OCI_CONTAINER_MOUNT_MISMATCH",
  );
  assert(
    info.Mounts.every((item) => item.Type === "bind" || item.Type === "tmpfs"),
    "OCI_CONTAINER_SHARED_VOLUME",
  );
}

// A pre-existing SIGTERM exit must never be mistaken for the controller's requested shutdown.
export function assertRequestedImageShutdown(before, after, requestedStop) {
  assert.equal(before.State.Running, true, "OCI_CANDIDATE_PREMATURE_EXIT");
  assert.equal(requestedStop, true, "OCI_CANDIDATE_STOP_NOT_REQUESTED");
  assert.equal(after.State.Running, false, "OCI_CANDIDATE_STOP_INCOMPLETE");
  assert.equal(after.State.ExitCode, 143, "OCI_CANDIDATE_UNEXPECTED_EXIT");
  assert.equal(after.State.OOMKilled, false, "OCI_CANDIDATE_OOM");
  assert.equal(after.State.Error, "", "OCI_CANDIDATE_RUNTIME_ERROR");
  assert.equal(after.RestartCount, 0, "OCI_CANDIDATE_RESTARTED");
  assert.equal(
    after.State.StartedAt,
    before.State.StartedAt,
    "OCI_CANDIDATE_RESTARTED",
  );
}

export async function stopCandidateAndObserve({ inspect, signal, wait }) {
  const before = await inspect();
  if (!before.State.Running) throw new Error("OCI_CANDIDATE_PREMATURE_EXIT");
  const requestedStop = await signal();
  await wait();
  const after = await inspect();
  assertRequestedImageShutdown(before, after, requestedStop);
  return { before, after, requestedStop };
}

// The controller owns detached containers: JavaScript finally blocks do not run on default SIGTERM.
export function installCancellationCleanup({
  resources,
  remove,
  onCancel,
  target = process,
}) {
  let cancelling = false;
  const cancel = (signal) => {
    if (cancelling) return;
    cancelling = true;
    const errors = [];
    try {
      onCancel(signal);
    } catch (error) {
      errors.push(error);
    }
    for (const [id, owner] of [...resources].reverse()) {
      try {
        remove(id, owner);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      target.stderr.write("OCI_CANCELLATION_CLEANUP_INCOMPLETE\n");
    target.exit(2);
  };
  const interrupt = () => cancel("SIGINT");
  const terminate = () => cancel("SIGTERM");
  target.on("SIGINT", interrupt);
  target.on("SIGTERM", terminate);
  return () => {
    target.removeListener("SIGINT", interrupt);
    target.removeListener("SIGTERM", terminate);
  };
}
