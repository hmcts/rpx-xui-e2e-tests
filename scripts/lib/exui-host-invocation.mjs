import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  assertOwnedContainer,
  assertOwnedContainerAuthority,
  stopCandidateAndObserve,
} from "./exui-oci-runtime.mjs";
import { terminateOwnedChild } from "./exui-candidate-runtime.mjs";
import { writeJsonAtomic } from "./exui-evidence-io.mjs";
import { performance } from "node:perf_hooks";

const PROVIDER_SETUP_STEPS = ['provider-container-create','provider-container-start','provider-readiness','provider-ownership-check','provider-egress-probes'];

function timeLifecycle(onTiming, runId, invocationId, step, action, details) {
  if (typeof onTiming !== "function") return action();
  let startedAt, started;
  try { startedAt = new Date().toISOString(); started = performance.now(); } catch { /* Diagnostics never control proof. */ }
  const record = (status) => {
    if (startedAt === undefined || started === undefined) return;
    try { onTiming({ runId, invocationId, step, status, startedAt, durationMs: Math.max(0, Math.round(performance.now() - started)), ...(details ? {details:details()} : {}) }); } catch { /* Diagnostics never control proof. */ }
  };
  try {
    const result = action();
    return result && typeof result.then === "function"
      ? result.then(value => { record("completed"); return value; }, error => { record("failed"); throw error; })
      : (record("completed"), result);
  } catch (error) { record("failed"); throw error; }
}

export function hostDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    env: { PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 10000,
    killSignal: "SIGKILL",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw Error(`HOST_DOCKER_${args[0].toUpperCase()}_FAILED`);
  return args[0] === "logs"
    ? result.stdout + result.stderr
    : result.stdout.trim();
}
export function inspectHostContainer(id) {
  const result = spawnSync("docker", ["inspect", id], {
    env: { PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 10000,
    killSignal: "SIGKILL",
  });
  if (
    result.status === 1 &&
    /No such (?:object|container)/i.test(result.stderr)
  )
    return null;
  if (result.error || result.status !== 0)
    throw Error("HOST_DOCKER_INSPECTION_FAILED");
  return JSON.parse(result.stdout)[0];
}
export const WRITE_DENIAL_PATHS = [
  "/output/report.json",
  "/harness/controller.mjs",
];
export function assertCandidateWriteDenial(observed) {
  assert.deepEqual(
    observed.attempts?.map((item) => item.path),
    WRITE_DENIAL_PATHS,
    "CANDIDATE_EVIDENCE_AUTHORITY",
  );
  assert(
    observed.attempts.every((item) => item.denied === true) &&
      observed.controllerSourceVisible === false,
    "CANDIDATE_EVIDENCE_AUTHORITY",
  );
}
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const saveRegistry = (output, resources) =>
  writeJsonAtomic(
    path.join(output, "owned-resources.json"),
    [...resources.values()].filter((item) => item.kind === "container"),
  );
export function removeHostResource(
  resources,
  key,
  output,
  { docker = hostDocker, inspect = inspectHostContainer } = {},
) {
  const resource = resources.get(key);
  if (!resource) return;
  if (resource.kind === "process")
    return terminateOwnedChild(resource.child).then((terminal) => {
      assert(!terminal.forced, "HOST_PROOF_CLIENT_FORCED");
      resources.delete(key);
    });
  const named = inspect(resource.name),
    identified = resource.id ? inspect(resource.id) : null;
  if (named && resource.id)
    assert.equal(named.Id, resource.id, "HOST_CID_NAME_MISMATCH");
  const info = identified ?? named;
  if (!info) {
    assert(resource.id, "HOST_CONTAINER_CREATION_OUTCOME_UNCERTAIN");
    resource.removed = true;
    saveRegistry(output, resources);
    return;
  }
  assert.equal(info.Name, `/${resource.name}`, "HOST_CONTAINER_NAME_MISMATCH");
  assert(/^[a-f0-9]{64}$/.test(info.Id), "HOST_OBSERVED_CID_REQUIRED");
  assertOwnedContainerAuthority(info, resource);
  if (resource.service === "browser-provider")
    assert(
      ![...resources.values()].some(
        (item) =>
          item.kind === "container" &&
          item.service === "candidate" &&
          item.namespace === info.Id &&
          item.removed !== true,
      ),
      "HOST_NAMESPACE_CANDIDATE_CLEANUP_REQUIRED",
    );
  resource.id = info.Id;
  saveRegistry(output, resources);
  docker(["rm", "-f", "-v", info.Id]);
  assert.equal(inspect(info.Id), null, "HOST_CONTAINER_REMOVAL_INCOMPLETE");
  resource.removed = true;
  saveRegistry(output, resources);
}
function resource(name, expected) {
  return { kind: "container", name, ...expected, id: null, removed: false };
}
function namedArguments(args, name) {
  const result = [...args];
  assert.equal(result[0], "create", "HOST_CREATE_REQUIRED");
  const index = result.indexOf("--name");
  if (index >= 0)
    assert.equal(result[index + 1], name, "HOST_PLANNED_NAME_MISMATCH");
  else result.splice(1, 0, "--name", name);
  result.splice(1, 0, "--pull", "never");
  return result;
}
const resourcesProbe =
  "const fs=require('fs');console.log(JSON.stringify({source:'container-cgroup-v2',peakMemoryBytes:Number(fs.readFileSync('/sys/fs/cgroup/memory.peak','utf8')),cpuUsageMicros:Number(/^usage_usec (\\d+)$/m.exec(fs.readFileSync('/sys/fs/cgroup/cpu.stat','utf8'))[1]),pidsAtCompletion:Number(fs.readFileSync('/sys/fs/cgroup/pids.current','utf8'))}))";
const runtimeProbe =
  "console.log(JSON.stringify({nodeVersion:process.version,platform:process.platform,architecture:process.arch,osRelease:require('fs').readFileSync('/etc/os-release','utf8')}))";
const writeProbe = `const fs=require('fs');const paths=${JSON.stringify(WRITE_DENIAL_PATHS)};const attempts=paths.map(path=>{try{fs.mkdirSync(require('path').dirname(path),{recursive:true});fs.writeFileSync(path,'candidate-must-not-author-evidence');return {path,denied:false};}catch(error){return {path,denied:['EROFS','EACCES','ENOENT'].includes(error.code),code:error.code};}});console.log(JSON.stringify({attempts,controllerSourceVisible:fs.existsSync('/harness/playwright.harness.config.ts')}));`;
async function waitForReady(file, id, inspect, isCancelled) {
  const until = Date.now() + 180000;
  let lastInspection = 0;
  while (Date.now() < until) {
    assert(!isCancelled(), "HOST_INVOCATION_CANCELLED");
    if (fs.existsSync(file)) {
      assert(inspect(id)?.State.Running, "HOST_PROVIDER_STARTUP_EXIT");
      return;
    }
    if (Date.now() - lastInspection >= 1000) {
      assert(inspect(id)?.State.Running, "HOST_PROVIDER_STARTUP_EXIT");
      lastInspection = Date.now();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("HOST_PROVIDER_STARTUP_TIMEOUT");
}

// Fixed two-container protocol shared by native and OCI delivery adapters. All arguments come from repo-owned factories.
export async function runHostInvocation(
  spec,
  {
    resources,
    docker = hostDocker,
    inspect = inspectHostContainer,
    runProof,
    spawnProof = spawn,
    isCancelled = () => false,
    eventSerialV3 = false,
    onLifecycleTiming,
  } = {},
) {
  const checkCancellation = () =>
    assert(!isCancelled(), "HOST_INVOCATION_CANCELLED");
  checkCancellation();
  const { directory, output, owner, invocationId } = spec;
  const timed = (step, action, details) => timeLifecycle(onLifecycleTiming, owner, invocationId, step, action, details);
  const providerDetails = typeof onLifecycleTiming === 'function' ? PROVIDER_SETUP_STEPS.map(step => ({step,status:'not-run',durationMs:null})) : undefined;
  const timeProviderStage = (index, action, details) => providerDetails ? timeLifecycle(record => {
    providerDetails[index] = {step:PROVIDER_SETUP_STEPS[index],status:record.status,durationMs:record.durationMs,...(record.details?{initialization:record.details}:{})};
  }, owner, invocationId, PROVIDER_SETUP_STEPS[index], action, details) : action();
  const toolsName = `${owner}-${invocationId}-tools`,
    candidateName = `${owner}-${invocationId}-candidate`;
  const tools = resource(toolsName, {
    owner,
    service: "browser-provider",
    image: spec.tools.image,
    namespace: spec.namespace,
    mounts: spec.tools.mounts,
  });
  let candidate, runtime;
  const started = Date.now();
  const v3Creators = [];
  // Opt-in receipts derive code0 from the existing guarded synchronous create contract.
  const created = value => { if(eventSerialV3) v3Creators.push({name:value.name,id:value.id,terminal:{started:true,observed:true,forced:false,cancelled:false,code:0,signal:null}}); };
  const register = (value) => {
    resources.set(value.name, value);
    saveRegistry(output, resources);
  };
  try {
    await timed("browser-provider-setup", async () => {
    register(tools);
    timeProviderStage(0, () => {
      tools.id = docker(namedArguments(spec.tools.args, toolsName));
      assert(/^[a-f0-9]{64}$/.test(tools.id), "HOST_TOOLS_CID_REQUIRED");
    });
    created(tools);
    saveRegistry(output, resources);
    timeProviderStage(1, () => docker(["start", tools.id]));
    await timeProviderStage(2, () => waitForReady(
      path.join(directory, "provider-ready.json"),
      tools.id,
      inspect,
      isCancelled,
    ), () => {
      try { return read(path.join(directory, "provider-initialization-timings.json")); }
      catch { return undefined; }
    });
    checkCancellation();
    timeProviderStage(3, () => assertOwnedContainer(inspect(tools.id), { ...tools, running: true }));
    timeProviderStage(4, () => {
    const probes = JSON.parse(
      docker([
        "exec",
        tools.id,
        "node",
        "-e",
        "const net=require('net');Promise.all(['1.1.1.1','host.docker.internal'].map(host=>new Promise(resolve=>{const s=net.connect({host,port:443});s.setTimeout(500);s.on('connect',()=>{s.destroy();resolve(true)});s.on('error',()=>resolve(false));s.on('timeout',()=>{s.destroy();resolve(false)});}))).then(result=>console.log(JSON.stringify(result)))",
      ]),
    );
    assert(
      probes.length === 2 && probes.every((value) => value === false),
      "HOST_NAMESPACE_EGRESS_AVAILABLE",
    );
    });
    }, () => providerDetails);
    const namespace = spec.namespace ?? tools.id;
    candidate = resource(candidateName, {
      owner,
      service: "candidate",
      image: spec.candidate.image,
      namespace,
      mounts: spec.candidate.mounts,
      ...(spec.candidate.launchProcess
        ? { launchProcess: spec.candidate.launchProcess }
        : {}),
    });
    await timed("candidate-runtime-setup", async () => {
    register(candidate);
    candidate.id = docker(
      namedArguments(spec.candidate.arguments(namespace), candidateName),
    );
    assert(/^[a-f0-9]{64}$/.test(candidate.id), "HOST_CANDIDATE_CID_REQUIRED");
    created(candidate);
    saveRegistry(output, resources);
    docker(["start", candidate.id]);
    assertOwnedContainer(inspect(candidate.id), {
      ...candidate,
      running: true,
    });
    runtime = JSON.parse(
      docker(["exec", candidate.id, spec.candidate.node, "-e", runtimeProbe]),
    );
    assert.equal(runtime.platform, "linux", "HOST_CANDIDATE_RUNTIME_OS");
    assert.equal(
      runtime.architecture,
      spec.platform === "linux/arm64" ? "arm64" : "x64",
      "HOST_CANDIDATE_RUNTIME_ARCH",
    );
    assert(
      /^v\d+\.\d+\.\d+$/.test(runtime.nodeVersion),
      "HOST_CANDIDATE_NODE_VERSION",
    );
    if (spec.candidate.expectedNodeVersion)
      assert.equal(
        runtime.nodeVersion,
        spec.candidate.expectedNodeVersion,
        "HOST_CANDIDATE_SEALED_NODE_VERSION",
      );
    if (spec.kind === "native")
      assert(
        /^ID=debian$/m.test(runtime.osRelease) &&
          /^VERSION_CODENAME=bookworm$/m.test(runtime.osRelease),
        "HOST_NATIVE_DEBIAN_RUNTIME_REQUIRED",
      );
    const denial = JSON.parse(
      docker(["exec", candidate.id, spec.candidate.node, "-e", writeProbe]),
    );
    assertCandidateWriteDenial(denial);
    writeJsonAtomic(path.join(directory, "candidate-write-denial.json"), {
      candidateId: candidate.id,
      ...denial,
    });
    spec.manifest.runtimeMetadata = {
      ...spec.manifest.runtimeMetadata,
      candidateAuthorityIsolation: "separate-container-no-evidence-mount",
      candidateRuntimeNodeVersion: runtime.nodeVersion,
      candidateObservedImageId: spec.candidate.image,
    };
    writeJsonAtomic(path.join(directory, "manifest.json"), spec.manifest);
    writeJsonAtomic(path.join(directory, "runtime-identity.json"), {
      identity: spec.manifest.identity,
      payloadDigest: spec.payloadDigest,
      candidateContainerId: candidate.id,
      observedImageId: spec.candidate.image,
      runtime,
    });
    });
    await timed("application-readiness", () =>
    docker(
      [
        "exec",
        tools.id,
        "node",
        "--input-type=module",
        "-e",
        "let ready=false;for(let i=0;i<120;i++){try{if((await fetch('http://127.0.0.1:3100/external/config/ui')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250));}if(!ready)process.exit(2)",
      ],
      { timeout: 35000 },
    ));
    assertOwnedContainer(inspect(candidate.id), {
      ...candidate,
      running: true,
    });
    const proofKey = `${owner}-${invocationId}-proof`;
    const execute =
      runProof ??
      (async () => {
        const log = fs.openSync(
          path.join(directory, "playwright.log"),
          "wx",
          0o600,
        );
        const child = spawnProof(
          "docker",
          ["exec", tools.id, "node", ...spec.proofArguments],
          { env: { PATH: process.env.PATH }, stdio: ["ignore", log, log] },
        );
        resources.set(proofKey, { kind: "process", child });
        try {
          return await new Promise((resolve, reject) => {
            child.once("error", reject);
            child.once("exit", (code, signal) => resolve({ code, signal }));
          });
        } finally {
          fs.closeSync(log);
          resources.delete(proofKey);
        }
      });
    const terminal = await timed("playwright-proof", execute);
    let measured;
    await timed("post-proof-resource-observation", () => {
      checkCancellation();
      assertOwnedContainer(inspect(candidate.id), {
        ...candidate,
        running: true,
      });
      measured = {
        candidate: JSON.parse(
          docker([
            "exec",
            candidate.id,
            spec.candidate.node,
            "-e",
            resourcesProbe,
          ]),
        ),
        browserProvider: JSON.parse(
          docker(["exec", tools.id, "node", "-e", resourcesProbe]),
        ),
      };
    });
    const lifecycle = await timed("candidate-graceful-shutdown", () => stopCandidateAndObserve({
      inspect: () => inspect(candidate.id),
      signal: () => {
        docker(["kill", "--signal", "SIGTERM", candidate.id]);
        return true;
      },
      wait: () => docker(["wait", candidate.id]),
    }));
    checkCancellation();
    assertOwnedContainer(lifecycle.after, { ...candidate, running: false });
    writeJsonAtomic(
      path.join(directory, "candidate-lifecycle.json"),
      lifecycle,
    );
    let providerWait, toolFinal;
    await timed("provider-graceful-shutdown", () => {
      docker(["kill", "--signal", "SIGTERM", tools.id]);
      providerWait = docker(["wait", tools.id]);
      toolFinal = inspect(tools.id);
      assertOwnedContainer(toolFinal, { ...tools, running: false });
      assert.equal(toolFinal.State.ExitCode, 0, "HOST_PROVIDER_SHUTDOWN_FAILED");
      assert.equal(
        read(path.join(directory, "provider-stopped.json")).closed,
        true,
        "HOST_PROVIDER_SHUTDOWN_FAILED",
      );
    });
    for (const file of [
      path.join(spec.diagnostics, "network-rejections.jsonl"),
      path.join(directory, "provider-rejections.jsonl"),
      path.join(directory, "unhandled-provider.jsonl"),
      path.join(directory, "gateway-errors.jsonl"),
    ])
      assert(!fs.existsSync(file), "HOST_UNDECLARED_DESTINATION");
    const framework = read(path.join(directory, "framework-terminal.json"));
    assert(
      !framework.signal && !terminal.signal && framework.code === terminal.code,
      "HOST_FRAMEWORK_TERMINATION_MISMATCH",
    );
    writeJsonAtomic(path.join(directory, "resources.json"), {
      elapsedMs: Date.now() - started,
      measured,
      isolation:
        "separate API and browser/controller containers in owned network-none namespace",
      perContainerLimits: { memoryBytes: 4294967296, cpus: 2, pids: 256 },
    });
    if(eventSerialV3) assert(String(toolFinal.State.ExitCode)===providerWait && terminal.signal===null,'HOST_V3_TERMINAL_REQUIRED');
    return { terminal, runtime, lifecycle, ...(eventSerialV3?{v3Finalization:{
      host:{started:true,observed:true,forced:false,cancelled:false,code:terminal.code,signal:terminal.signal},
      fixture:{started:true,observed:true,forced:false,cancelled:false,code:toolFinal.State.ExitCode,signal:null},
      creators:v3Creators,
    }}:{}) };
  } finally {
    const finishCleanup = async () => {
    const errors = [];
    for (const value of [candidate, tools])
      if (value) {
        try {
          if (value.id) {
            const logs = docker(["logs", value.id]);
            fs.writeFileSync(
              path.join(directory, `${value.service}-container.log`),
              logs,
              { mode: 0o600 },
            );
          }
        } catch (error) {
          errors.push(error);
        }
        try {
          await removeHostResource(resources, value.name, output, {
            docker,
            inspect,
          });
        } catch (error) {
          errors.push(error);
        }
      }
    if (errors.length)
      throw new AggregateError(errors, "HOST_OWNED_RESOURCE_CLEANUP_FAILED");
    };
    await timed("resource-cleanup", finishCleanup);
  }
}
