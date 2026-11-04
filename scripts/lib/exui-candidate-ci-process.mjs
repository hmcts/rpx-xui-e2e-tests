import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { ccdImagePins, stopCcdRuntime } from "./exui-ccd-runtime.mjs";
import { installCancellationCleanup } from "./exui-oci-runtime.mjs";
import { digestBytes, writeJsonAtomic } from "./exui-evidence-io.mjs";
import { EVENT_CAPABILITY_SCOPE } from "./exui-ccd-event-capability.mjs";
import { validateEventCapabilityTransitionRequest } from "./exui-ccd-event-transition.mjs";
import { writeCiPublicSummary } from "./exui-candidate-ci-inputs.mjs";
import { cleanupNativeOwnership } from "./exui-native-ci-ownership.mjs";
import { captureCiOwnership } from "./exui-candidate-ci-evidence.mjs";
import { terminateOwnedChild } from "./exui-candidate-runtime.mjs";
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const blocked = () => ({ status: "BLOCKED", exitCode: 2 });
const transportEnv = () => ({ PATH: process.env.PATH });
function command(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: transportEnv(),
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw Error("CI_TOOL_COMMAND_FAILED");
  return result.stdout.trim();
}
function inspectContainer(id) {
  const result = spawnSync("docker", ["inspect", id], {
    env: transportEnv(),
    encoding: "utf8",
    timeout: 10000,
  });
  if (
    result.status === 1 &&
    /No such (?:object|container)/i.test(result.stderr)
  )
    return null;
  if (result.error || result.status !== 0)
    throw Error("CI_CONTAINER_INSPECTION_FAILED");
  return JSON.parse(result.stdout)[0];
}
export function assertCiContainer(info, expected) {
  assert.equal(info.Id, expected.id, "CI_CONTAINER_CID_MISMATCH");
  assert.equal(info.Image, expected.image, "CI_CONTAINER_IMAGE_MISMATCH");
  assert.equal(
    info.Config.Labels?.["exui.harness.owner"],
    expected.owner,
    "CI_CONTAINER_OWNER_MISMATCH",
  );
  assert.equal(
    info.Config.Labels?.["exui.harness.service"],
    "candidate-runtime",
    "CI_CONTAINER_SERVICE_MISMATCH",
  );
  assert.equal(
    info.HostConfig.NetworkMode,
    expected.network,
    "CI_CONTAINER_NETWORK_MISMATCH",
  );
  assert.equal(
    info.HostConfig.ReadonlyRootfs,
    true,
    "CI_CONTAINER_WRITABLE_ROOT",
  );
  assert.equal(
    info.HostConfig.Privileged || false,
    false,
    "CI_CONTAINER_PRIVILEGED",
  );
  const mounts = info.Mounts.filter((m) => m.Type !== "tmpfs")
    .map((m) => [m.Source, m.Destination, m.RW])
    .sort();
  assert.deepEqual(
    mounts,
    expected.mounts.map((m) => [m.source, m.target, m.writable]).sort(),
    "CI_CONTAINER_MOUNT_MISMATCH",
  );
  assert(
    info.Mounts.every((m) => ["bind", "tmpfs"].includes(m.Type)),
    "CI_CONTAINER_SHARED_VOLUME",
  );
}
export function removeCiContainer(
  expected,
  {
    inspect = inspectContainer,
    remove = (id) => command("docker", ["rm", "-f", id]),
  } = {},
) {
  const info = inspect(expected.id);
  if (!info) return { containerId: expected.id, alreadyRemoved: true };
  assertCiContainer(info, expected);
  remove(expected.id);
  assert.equal(inspect(expected.id), null, "CI_CONTAINER_REMOVAL_INCOMPLETE");
  return { containerId: expected.id, removed: true };
}

export async function executeCiProcess({
  script,
  args,
  output,
  onPrepared,
  onEventTransition,
  onChild = () => {},
}) {
  assert(!fs.existsSync(output), "FRESH_CI_PHASE_OUTPUT_REQUIRED");
  const log = fs.openSync(
    path.join(path.dirname(output), path.basename(output) + "-supervisor.log"),
    "wx",
    0o600,
  );
  const child = spawn(process.execPath, [script, ...args], {
    cwd: ROOT,
    env: { ...transportEnv(), TMPDIR: fs.realpathSync(os.tmpdir()) },
    stdio: ["ignore", log, log],
  });
  onChild(child);
  let terminal, error;
  const finished = new Promise((resolve) => {
    child.once("error", (err) => {
      error = err;
      terminal = { code: null, signal: null };
      resolve();
    });
    child.once("exit", (code, signal) => {
      terminal = { code, signal };
      resolve();
    });
  });
  let expected, input, handoff, transition;
  const requestFile = path.join(output, "event-transition-request.json");
  const requestSnapshot = () => {
    assert(fs.existsSync(requestFile), "CI_EVENT_TRANSITION_REQUEST_CHANGED");
    const before = fs.lstatSync(requestFile, { bigint: true });
    assert(
      before.isFile() && fs.realpathSync(requestFile) === requestFile,
      "CI_EVENT_TRANSITION_REGULAR_FILE_REQUIRED",
    );
    const bytes = fs.readFileSync(requestFile);
    const after = fs.lstatSync(requestFile, { bigint: true });
    const identity = (stat) => ({
      path: requestFile,
      dev: stat.dev,
      ino: stat.ino,
      size: stat.size,
      mtime: stat.mtimeNs,
      ctime: stat.ctimeNs,
    });
    assert.deepEqual(identity(after), identity(before), "CI_EVENT_TRANSITION_REQUEST_CHANGED");
    return { stamp: { ...identity(after), digest: digestBytes(bytes) }, bytes };
  };
  const checkTransition = async () => {
    if (!fs.lstatSync(requestFile, { throwIfNoEntry: false })) {
      assert(!transition, "CI_EVENT_TRANSITION_REQUEST_CHANGED");
      return;
    }
    assert(expected, "CI_EVENT_TRANSITION_BEFORE_PREPARATION");
    assert.equal(input.releaseScopeId, EVENT_CAPABILITY_SCOPE, "CI_EVENT_TRANSITION_SCOPE");
    assert.equal(typeof onEventTransition, "function", "CI_EVENT_TRANSITION_CALLBACK_REQUIRED");
    const observed = requestSnapshot();
    if (transition) {
      assert.deepEqual(observed.stamp, transition, "CI_EVENT_TRANSITION_REQUEST_CHANGED");
      return;
    }
    assert(!terminal, "CI_EVENT_TRANSITION_CHILD_TERMINATED");
    const request = JSON.parse(observed.bytes);
    validateEventCapabilityTransitionRequest(input, request);
    transition = observed.stamp;
    await onEventTransition(request, {
      input,
      handoff,
      expected,
      isTerminated: () => Boolean(terminal),
    });
    assert(!terminal, "CI_EVENT_TRANSITION_CHILD_TERMINATED");
    assert.deepEqual(requestSnapshot().stamp, transition, "CI_EVENT_TRANSITION_REQUEST_CHANGED");
  };
  try {
    while (!terminal) {
      await checkTransition();
      if (
        !expected &&
        fs.existsSync(path.join(output, "input.json")) &&
        fs.existsSync(path.join(output, "container-launch.json"))
      ) {
        assert(
          !fs.existsSync(path.join(output, "gate.json")),
          "CI_EXPECTATIONS_MUST_PRECEDE_GATE",
        );
        input = read(path.join(output, "input.json"));
        handoff = read(path.join(output, "container-launch.json"));
        if (onEventTransition !== undefined)
          assert.equal(input.releaseScopeId, EVENT_CAPABILITY_SCOPE, "CI_EVENT_TRANSITION_SCOPE");
        expected = onPrepared(input, handoff);
        writeJsonAtomic(path.join(output, "independent-preexecution.json"), {
          ...expected,
          capturedBeforeGate: true,
          capturedAt: new Date().toISOString(),
        });
      }
      await Promise.race([
        finished,
        new Promise((resolve) => setTimeout(resolve, 10)),
      ]);
    }
    await finished;
    if (error) throw error;
    await checkTransition();
    assert(expected, "CI_PHASE_LAUNCH_INPUTS_REQUIRED");
    return { terminal, expected };
  } finally {
    fs.closeSync(log);
  }
}

export async function cleanupCiPhase(
  resource,
  context,
  {
    inspect = inspectContainer,
    remove = (id) => command("docker", ["rm", "-f", id]),
    reconcileMs = 1000,
  } = {},
) {
  const terminal = await terminateOwnedChild(resource.child, {
    graceMs: 10000,
  });
  const handoff = path.join(resource.directory, "container-launch.json");
  if (!fs.existsSync(handoff)) return;
  const expected =
    resource.expectedContainer ??
    captureCiOwnership(
      read(path.join(resource.directory, "input.json")),
      read(handoff),
      context,
      resource.directory,
      resource.name,
    );
  if (expected.mode === "native-separate-api") {
    await cleanupNativeOwnership(expected, { inspect, remove });
    assert(
      !terminal.forced,
      "CI_NATIVE_CONTROLLER_FORCED_TERMINATION_UNCERTAIN",
    );
    return;
  }
  const cidFile = path.join(resource.directory, "container-id"),
    deadline = Date.now() + reconcileMs;
  let id, info;
  do {
    const raw = fs.existsSync(cidFile)
      ? fs.readFileSync(cidFile, "utf8").trim()
      : "";
    if (raw) {
      assert(/^[a-f0-9]{64}$/.test(raw), "CI_CLEANUP_CID_REQUIRED");
      id = raw;
    }
    const named = inspect(expected.owner),
      identified = id ? inspect(id) : null;
    if (named && id) assert.equal(named.Id, id, "CI_CLEANUP_CID_NAME_MISMATCH");
    info = identified ?? named;
    if (info || id) break;
    if (Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  if (!info && !id) throw Error("CI_CONTAINER_CREATION_OUTCOME_UNCERTAIN");
  if (info) {
    assert(/^[a-f0-9]{64}$/.test(info.Id), "CI_CLEANUP_OBSERVED_CID_REQUIRED");
    assert.equal(
      info.Name,
      `/${expected.owner}`,
      "CI_CLEANUP_PLANNED_NAME_MISMATCH",
    );
    id = info.Id;
    assertCiContainer(info, { ...expected, id });
  }
  writeJsonAtomic(
    path.join(resource.directory, "container-cleanup.json"),
    removeCiContainer({ ...expected, id }, { inspect, remove }),
  );
  const client = read(
    path.join(resource.directory, "docker-client-shutdown.json"),
  );
  assert.equal(client.owner, expected.owner, "CI_DOCKER_CLIENT_OWNER_MISMATCH");
  assert.equal(client.observed, true, "CI_DOCKER_CLIENT_TERMINAL_UNOBSERVED");
  assert(
    !client.forced && !terminal.forced,
    "CI_DOCKER_CLIENT_FORCED_TERMINATION_UNCERTAIN",
  );
}

export function cleanupCiCcd(
  directory,
  { inspect = inspectContainer, stop = stopCcdRuntime } = {},
) {
  const recoveryPath = path.join(directory, "recovery.json");
  if (!fs.existsSync(recoveryPath)) {
    assert(
      !fs.existsSync(path.join(directory, "runtime.json")),
      "CI_CCD_RECOVERY_REQUIRED",
    );
    return;
  }
  const recovery = read(recoveryPath);
  assert(
    /^harness-[a-f0-9]{16}$/.test(recovery.owner),
    "CI_CCD_RECOVERY_OWNER_REQUIRED",
  );
  assert.equal(recovery.output, directory, "CI_CCD_RECOVERY_PATH_MISMATCH");
  const elasticsearch = recovery.elasticsearch ?? false;
  const pins = ccdImagePins(recovery.platform ?? "linux/arm64", { elasticsearch });
  assert.deepEqual(
    Object.keys(recovery.resources).sort(),
    Object.keys(pins).sort(),
    "CI_CCD_RECOVERY_SERVICE_INVENTORY",
  );
  const statePath = path.join(directory, "runtime.json");
  const state = fs.existsSync(statePath)
    ? read(statePath)
    : { owner: recovery.owner, output: directory, containers: {}, ...(recovery.platform ? { platform: recovery.platform } : {}), ...(elasticsearch ? { elasticsearch } : {}) };
  assert.equal(state.elasticsearch ?? false, elasticsearch, "CI_CCD_RECOVERY_ELASTICSEARCH_MISMATCH");
  assert.equal(state.platform ?? "linux/arm64", recovery.platform ?? "linux/arm64", "CI_CCD_RECOVERY_PLATFORM_MISMATCH");
  assert.equal(state.owner, recovery.owner, "CI_CCD_RECOVERY_OWNER_MISMATCH");
  assert.equal(state.output, directory, "CI_CCD_RECOVERY_PATH_MISMATCH");
  assert(
    Object.keys(state.containers).every((service) =>
      Object.hasOwn(pins, service),
    ),
    "CI_CCD_RECORDED_SERVICE_MISMATCH",
  );
  const observed = {};
  for (const [service, pin] of Object.entries(pins)) {
    const planned = recovery.resources[service];
    assert.equal(
      planned.name,
      `${recovery.owner}-${service}`,
      "CI_CCD_RECOVERY_NAME_MISMATCH",
    );
    assert(planned.image === pin.manifestDigest || (pin.configDigest && planned.image === pin.configDigest), "CI_CCD_RECOVERY_IMAGE_MISMATCH");
    const image = planned.image;
    const recorded = state.containers[service];
    if (recorded)
      assert(/^[a-f0-9]{64}$/.test(recorded), "CI_CCD_RECORDED_CID_REQUIRED");
    const info = inspect(planned.name) ?? (recorded ? inspect(recorded) : null);
    if (!info) continue;
    assert(/^[a-f0-9]{64}$/.test(info.Id), "CI_CCD_OBSERVED_CID_REQUIRED");
    if (recorded)
      assert.equal(info.Id, recorded, "CI_CCD_RECORDED_CID_MISMATCH");
    assert.equal(info.Name, `/${planned.name}`, "CI_CCD_CLEANUP_NAME_MISMATCH");
    assert.equal(info.Image, image, "CI_CCD_CLEANUP_IMAGE_MISMATCH");
    assert.equal(
      info.Config.Labels?.["exui.harness.owner"],
      recovery.owner,
      "CI_CCD_CLEANUP_OWNER_MISMATCH",
    );
    assert.equal(
      info.Config.Labels?.["exui.harness.service"],
      service,
      "CI_CCD_CLEANUP_SERVICE_MISMATCH",
    );
    observed[service] = info;
  }
  const namespace = observed.database?.Id ?? state.namespace;
  for (const [service, info] of Object.entries(observed))
    assert.equal(
      info.HostConfig.NetworkMode,
      service === "database" ? "none" : `container:${namespace}`,
      "CI_CCD_CLEANUP_NETWORK_MISMATCH",
    );
  const recovered = {
    ...state,
    namespace,
    containers: Object.fromEntries(
      Object.entries(observed).map(([service, info]) => [service, info.Id]),
    ),
  };
  const checkedNames = Object.values(recovery.resources).map((item) => item.name);
  const checkedContainerIds = [...new Set([
    ...Object.values(state.containers),
    ...Object.values(observed).map((info) => info.Id),
    ...(state.namespace ? [state.namespace] : []),
  ])].sort();
  assert(
    checkedContainerIds.every((id) => /^[a-f0-9]{64}$/.test(id)),
    "CI_CCD_RECORDED_CID_REQUIRED",
  );
  stop(recovered);
  for (const identifier of [...checkedNames, ...checkedContainerIds])
    assert.equal(inspect(identifier), null, "CI_CCD_REMOVAL_INCOMPLETE");
  return { owner: recovery.owner, cleanupComplete: true, checkedNames, checkedContainerIds };
}

export function installCiCancellation({
  resources,
  remove,
  output,
  target = process,
  phaseResults = [],
  onCancel = () => {},
}) {
  output = fs.realpathSync(output);
  let interruptedBy;
  return installCancellationCleanup({
    resources,
    remove: (id, resource) => {
      const result = remove(id, resource);
      if (result && typeof result.then === "function")
        return result.then(() => resources.delete(id));
      resources.delete(id);
    },
    onCancel: (signal) => {
      interruptedBy = signal;
      onCancel(signal);
      writeCiPublicSummary(output, blocked());
    },
    target: {
      on: (...args) => target.on(...args),
      removeListener: (...args) => target.removeListener(...args),
      stderr: target.stderr,
      exit: (code) => {
        writeCiPublicSummary(output, blocked());
        writeJsonAtomic(path.join(output, "private/ci-result.json"), {
          classification: "fixed-pilot-suite-no-full-release-approval",
          status: "BLOCKED",
          exitCode: 2,
          interruptedBy,
          cleanupComplete: resources.size === 0,
          phaseResults,
        });
        target.exit(code);
      },
    },
  });
}
