#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, createHmac } from "node:crypto";
import {
  validateImageCandidate,
  assertCandidateImage,
  verifyImageMetadata,
} from "./lib/exui-oci-candidate.mjs";
import {
  OCI_SOURCE_FILES,
  ARM64_BROWSER_RUNTIME,
  browserExecutable,
  assertBrowserRuntime,
  toolContainerArguments,
  candidateImageArguments,
  assertOwnedContainer,
  stopCandidateAndObserve,
  readImageMetadata,
  installCancellationCleanup,
} from "./lib/exui-oci-runtime.mjs";
import {
  effectiveCandidateConfiguration,
  assertRuntimeIdentity,
} from "./lib/exui-candidate-runtime.mjs";
import { digestCandidateTree } from "./lib/exui-candidate-artifact.mjs";
import { assertCandidateConfigurationSources } from "./lib/exui-configuration-catalogue.mjs";
import { verifyHarnessDependencies } from "./lib/exui-harness-dependencies.mjs";
import {
  startProviderSeams,
  seedSyntheticSession,
} from "./lib/exui-provider-seams.mjs";
import { getReleasePolicy } from "./lib/exui-release-policy.mjs";
import {
  digestBytes,
  writeJsonAtomic,
  loadRunEvidence,
  writePublicSummary,
} from "./lib/exui-evidence-io.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ownedContainers = new Map();
const privatePayloads = [];
let activeOutput;
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const ref = (output, file) => ({
  path: path.relative(output, file),
  digest: digestBytes(fs.readFileSync(file)),
});
const exited = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
const git = (args) => {
  const result = spawnSync("git", args, {
    cwd: root,
    env: { PATH: process.env.PATH },
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error("HARNESS_SOURCE_IDENTITY_UNAVAILABLE");
  return result.stdout.trim();
};
const docker = (args, options = {}) => {
  const result = spawnSync("docker", args, {
    env: { PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0 || result.error)
    throw new Error(
      `OCI_DOCKER_${args[0].toUpperCase()}_FAILED: ${result.error?.message ?? result.stderr.trim()}`,
    );
  return result.stdout.trim();
};
const inspect = (id) => JSON.parse(docker(["inspect", id]))[0];
const containerLog = (id) => {
  const result = spawnSync("docker", ["logs", id], {
    env: { PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error("OCI_CONTAINER_LOG_UNAVAILABLE");
  return result.stdout + result.stderr;
};
const containerResources = (id, executable = "node") =>
  JSON.parse(
    docker([
      "exec",
      id,
      executable,
      "-e",
      "const fs=require('fs');console.log(JSON.stringify({source:'container-cgroup-v2',peakMemoryBytes:Number(fs.readFileSync('/sys/fs/cgroup/memory.peak','utf8')),cpuUsageMicros:Number(/^usage_usec (\\d+)$/m.exec(fs.readFileSync('/sys/fs/cgroup/cpu.stat','utf8'))[1]),pidsAtCompletion:Number(fs.readFileSync('/sys/fs/cgroup/pids.current','utf8'))}))",
    ]),
  );
const sourceDigest = (files) =>
  digestBytes(
    JSON.stringify(
      files.map((file) => [
        file,
        digestBytes(fs.readFileSync(path.join(root, file))),
      ]),
    ),
  );
const review = () =>
  read(path.join(root, "scripts/fixtures/exui-configuration-review.json"));

async function insideProviders() {
  const input = read("/output/input.json");
  const invocation = arg("--invocation");
  if (!["baseline", "wa-drop-family"].includes(invocation))
    throw new Error("UNSUPPORTED_OCI_INVOCATION");
  if (sourceDigest(input.harnessSources) !== input.harnessSourceDigest)
    throw new Error("HARNESS_SOURCE_SNAPSHOT_MISMATCH");
  await verifyHarnessDependencies(
    "/harness/node_modules",
    `${root}/package.json`,
    `${root}/yarn.lock`,
    input.harnessDependencies.digest,
  );
  if ((await digestCandidateTree("/browser")) !== input.browserDigest)
    throw new Error("BROWSER_ARTIFACT_MISMATCH");
  const observed = await verifyImageMetadata(
    input.descriptor,
    readImageMetadata("/candidate"),
    "/candidate",
  );
  assertRuntimeIdentity(observed.identity, input.artifact.identity);
  assertCandidateConfigurationSources("/candidate", review());
  const directory = `/output/${invocation}`;
  const provider = await startProviderSeams(directory);
  const persona = seedSyntheticSession();
  const cookie = `s:${persona.id}.${createHmac("sha256", "synthetic-session-value").update(persona.id).digest("base64").replace(/=+$/, "")}`;
  writeJsonAtomic(`${directory}/provider-ready.json`, {
    cookie,
    sourceDigest: input.harnessSourceDigest,
    metadataVerified: true,
  });
  process.once("SIGTERM", () => {
    provider.close((error) => {
      if (error) process.exit(2);
      writeJsonAtomic(`${directory}/provider-stopped.json`, {
        requestedSignal: "SIGTERM",
        closed: true,
      });
      process.exit(0);
    });
  });
}

async function insideProof() {
  const input = read("/output/input.json");
  const invocation = arg("--invocation");
  if (!["baseline", "wa-drop-family"].includes(invocation))
    throw new Error("UNSUPPORTED_OCI_INVOCATION");
  const directory = `/output/${invocation}`;
  const env = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: "/tmp",
    EXUI_HARNESS_SELECTION: "candidate",
    EXUI_HARNESS_SLICE: "family",
    EXUI_CANDIDATE_RUN_MANIFEST: `${directory}/manifest.json`,
    EXUI_CANDIDATE_URL: "http://127.0.0.1:3100",
    EXUI_RUNTIME_IDENTITY: `${directory}/runtime-identity.json`,
    EXUI_CANDIDATE_ASSETS: "/candidate/dist/rpx-exui/browser",
    EXUI_HARNESS_TEST_OUTPUT: `${directory}/test-output`,
    EXUI_EVIDENCE_CONTEXT: `${directory}/context.json`,
    EXUI_EVIDENCE_REPORT: `${directory}/report.json`,
    EXUI_PROVIDER_REQUESTS: `${directory}/provider-requests.jsonl`,
    EXUI_SESSION_COOKIE: read(`${directory}/provider-ready.json`).cookie,
    EXUI_CHROMIUM_EXECUTABLE: input.browserExecutable,
    ...(invocation === "wa-drop-family"
      ? { EXUI_HARNESS_MUTATION: invocation }
      : {}),
  };
  const terminal = await exited(
    spawn(
      process.execPath,
      [
        "/harness/node_modules/@playwright/test/cli.js",
        "test",
        "--config",
        "/harness/playwright.harness.config.ts",
      ],
      { cwd: root, env, stdio: "inherit" },
    ),
  );
  writeJsonAtomic(`${directory}/framework-terminal.json`, terminal);
  process.exitCode = terminal.signal ? 2 : terminal.code;
}

async function waitForFile(file, container, timeout = 180000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (!inspect(container).State.Running)
      throw new Error("OCI_PROVIDER_EXITED_DURING_STARTUP");
    if (fs.existsSync(file)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("OCI_PROVIDER_STARTUP_TIMEOUT");
}

function expectedMount(source, target, writable) {
  return { source: fs.realpathSync(source), target, writable };
}
function removeOwned(id, owner) {
  if (!ownedContainers.has(id)) return;
  const info = JSON.parse(docker(["inspect", id], { timeout: 5000 }))[0];
  if (info.Config.Labels?.["exui.harness.owner"] !== owner)
    throw new Error("OCI_CLEANUP_OWNER_MISMATCH");
  docker(["rm", "-f", "-v", id], { timeout: 5000 });
  ownedContainers.delete(id);
}

async function runInvocation(input, output, staged, invocation, policy) {
  const directory = path.join(output, invocation);
  const sessions = path.join(directory, "synthetic-sessions");
  const diagnostics = path.join(directory, "candidate-diagnostics");
  fs.mkdirSync(directory, { mode: 0o700 });
  for (const folder of [sessions, diagnostics]) {
    fs.mkdirSync(folder, { mode: 0o777 });
    // The image's non-root UID is deliberately preserved; these contain synthetic state only.
    fs.chmodSync(folder, 0o777);
  }
  const mutation = invocation === "baseline" ? null : invocation;
  const { config, digest } = effectiveCandidateConfiguration(
    input.artifact.candidateRoot,
    mutation,
  );
  const identity = {
    ...input.artifact.identity,
    configurationDigest: digest,
    definitionDigests: {},
    dependencyIdentities: {},
  };
  const manifest = {
    schemaVersion: 1,
    runId: input.runId,
    harnessCommit: input.harnessCommit,
    releaseScopeId: policy.releaseScopeId,
    policyDigest: policy.policyDigest,
    identity,
    requiredObligationIds: policy.requiredObligationIds,
    runtimeMetadata: {
      isolation: "oci-separate-candidate-owned-network-none",
      candidateImage: input.descriptor.imageReference,
      producerObservedImageId: input.descriptor.observedImageId,
      candidateObservedImageId: input.observedImageId,
      candidatePlatform: input.descriptor.platform,
      browserRuntimeImage: input.browserRuntime,
      browserDigest: input.browserDigest,
      artifactConfigurationDigest: input.artifact.identity.configurationDigest,
      effectiveConfigurationDigest: digest,
      harnessSourceState: input.harnessSourceState,
      harnessSourceDigest: input.harnessSourceDigest,
      harnessDependencyDigest: input.harnessDependencies.digest,
      playwrightVersion: input.harnessDependencies.playwrightVersion,
      reviewedConfigurationSources: input.reviewedConfigurationSources,
      excludedSeams:
        "synthetic-auth,refdata,task-provider,feature-flags,telemetry",
    },
  };
  writeJsonAtomic(`${directory}/manifest.json`, manifest);
  writeJsonAtomic(`${directory}/context.json`, {
    runId: input.runId,
    invocationId: invocation,
    identity,
    harnessCommit: input.harnessCommit,
    releaseScopeId: policy.releaseScopeId,
    policyDigest: policy.policyDigest,
    harnessSourceState: input.harnessSourceState,
    harnessSourceDigest: input.harnessSourceDigest,
  });
  const owner = `harness-oci-${randomUUID()}`;
  const guard = path.join(staged, "scripts/lib/exui-runtime-network-guard.cjs");
  let toolsId, candidateId;
  const started = Date.now();
  const toolMounts = [
    expectedMount(staged, "/harness", false),
    expectedMount(`${root}/node_modules`, "/harness/node_modules", false),
    expectedMount(input.artifact.candidateRoot, "/candidate", false),
    expectedMount(output, "/output", true),
    expectedMount(input.browserRoot, "/browser", false),
    expectedMount(sessions, "/tmp/.sessions", true),
  ];
  const candidateMounts = [
    expectedMount(sessions, "/tmp/.sessions", true),
    expectedMount(diagnostics, "/diagnostics", true),
    expectedMount(guard, "/harness-network-guard.cjs", false),
  ];
  const candidateExpected = () => ({
    image: input.observedImageId,
    namespace: toolsId,
    owner,
    service: "candidate",
    mounts: candidateMounts,
  });
  try {
    toolsId = docker(
      toolContainerArguments({
        owner,
        image: input.browserRuntime,
        platform: input.descriptor.platform,
        harnessRoot: staged,
        dependenciesRoot: `${root}/node_modules`,
        candidateRoot: input.artifact.candidateRoot,
        output,
        browserRoot: input.browserRoot,
        sessions,
        invocationId: invocation,
      }),
    );
    ownedContainers.set(toolsId, owner);
    writeJsonAtomic(`${directory}/owned-containers.json`, { owner, toolsId });
    docker(["start", toolsId]);
    await waitForFile(`${directory}/provider-ready.json`, toolsId);
    assertOwnedContainer(inspect(toolsId), {
      image: input.browserRuntime,
      owner,
      service: "browser-provider",
      mounts: toolMounts,
      running: true,
    });
    // Probe outside destinations from the actual namespace, before giving the candidate a process.
    const probes = JSON.parse(
      docker([
        "exec",
        toolsId,
        "node",
        "-e",
        "const net=require('net');Promise.all(['1.1.1.1','host.docker.internal'].map(host=>new Promise(resolve=>{const s=net.connect({host,port:443});s.setTimeout(500);s.on('connect',()=>{s.destroy();resolve(true)});s.on('error',()=>resolve(false));s.on('timeout',()=>{s.destroy();resolve(false)});}))).then(result=>console.log(JSON.stringify(result)))",
      ]),
    );
    if (probes.some(Boolean)) throw new Error("OCI_NAMESPACE_EGRESS_AVAILABLE");
    candidateId = docker(
      candidateImageArguments({
        descriptor: input.descriptor,
        namespace: toolsId,
        owner,
        sessions,
        diagnostics,
        guard,
        config,
      }),
    );
    ownedContainers.set(candidateId, owner);
    writeJsonAtomic(`${directory}/owned-containers.json`, {
      owner,
      toolsId,
      candidateId,
    });
    docker(["start", candidateId]);
    assertOwnedContainer(inspect(candidateId), {
      ...candidateExpected(),
      running: true,
    });
    const runtime = JSON.parse(
      docker([
        "exec",
        candidateId,
        "/usr/local/bin/node",
        "-e",
        "console.log(JSON.stringify({nodeVersion:process.version,platform:process.platform,architecture:process.arch}))",
      ]),
    );
    const expectedArch =
      input.descriptor.platform === "linux/arm64" ? "arm64" : "x64";
    if (runtime.platform !== "linux" || runtime.architecture !== expectedArch)
      throw new Error("OCI_CANDIDATE_RUNTIME_PLATFORM_MISMATCH");
    if (!/^v\d+\.\d+\.\d+$/.test(runtime.nodeVersion ?? ""))
      throw new Error("OCI_CANDIDATE_NODE_IDENTITY_MISSING");
    manifest.runtimeMetadata.candidateRuntimeNodeVersion = runtime.nodeVersion;
    manifest.runtimeMetadata.candidateBuildNodeVersion =
      input.artifact.provenance.buildRuntime.nodeVersion;
    writeJsonAtomic(`${directory}/manifest.json`, manifest);
    writeJsonAtomic(`${directory}/runtime-identity.json`, {
      identity,
      payloadDigest: input.descriptor.digest,
      candidateContainerId: candidateId,
      observedImageId: inspect(candidateId).Image,
      runtime,
    });
    docker([
      "exec",
      toolsId,
      "node",
      "--input-type=module",
      "-e",
      "let ready=false;for(let i=0;i<120;i++){try{if((await fetch('http://127.0.0.1:3100/external/config/ui')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250));}if(!ready)process.exit(2)",
    ]);
    assertOwnedContainer(inspect(candidateId), {
      ...candidateExpected(),
      running: true,
    });
    const log = fs.openSync(`${directory}/playwright.log`, "wx", 0o600);
    let terminal;
    try {
      terminal = await exited(
        spawn(
          "docker",
          [
            "exec",
            toolsId,
            "node",
            "scripts/run-harness-oci-candidate.mjs",
            "--inside-proof",
            "--invocation",
            invocation,
          ],
          { env: { PATH: process.env.PATH }, stdio: ["ignore", log, log] },
        ),
      );
    } finally {
      fs.closeSync(log);
    }
    const beforeStop = inspect(candidateId);
    assertOwnedContainer(beforeStop, { ...candidateExpected(), running: true });
    const measured = {
      candidate: containerResources(candidateId, "/usr/local/bin/node"),
      browserProvider: containerResources(toolsId),
    };
    const lifecycle = await stopCandidateAndObserve({
      inspect: () => inspect(candidateId),
      signal: () => {
        docker(["kill", "--signal", "SIGTERM", candidateId]);
        return true;
      },
      wait: () => docker(["wait", candidateId]),
    });
    assertOwnedContainer(lifecycle.after, {
      ...candidateExpected(),
      running: false,
    });
    writeJsonAtomic(`${directory}/candidate-lifecycle.json`, lifecycle);
    fs.writeFileSync(`${directory}/candidate.log`, containerLog(candidateId), {
      mode: 0o600,
    });
    docker(["kill", "--signal", "SIGTERM", toolsId]);
    docker(["wait", toolsId]);
    const toolFinal = inspect(toolsId);
    assertOwnedContainer(toolFinal, {
      image: input.browserRuntime,
      owner,
      service: "browser-provider",
      mounts: toolMounts,
      running: false,
    });
    if (
      toolFinal.State.ExitCode !== 0 ||
      read(`${directory}/provider-stopped.json`).closed !== true
    )
      throw new Error("OCI_PROVIDER_SHUTDOWN_FAILED");
    for (const file of [
      `${diagnostics}/network-rejections.jsonl`,
      `${directory}/provider-rejections.jsonl`,
    ])
      if (fs.existsSync(file)) throw new Error("OCI_UNDECLARED_DESTINATION");
    const framework = read(`${directory}/framework-terminal.json`);
    if (framework.signal || terminal.signal || framework.code !== terminal.code)
      throw new Error("OCI_FRAMEWORK_TERMINATION_MISMATCH");
    const report = read(`${directory}/report.json`);
    const execution = {
      invocationId: invocation,
      runId: input.runId,
      identity,
      kind: mutation ? "mutation" : "baseline",
      terminalState: "completed",
      runnerExitCode: terminal.code,
      unexpectedGlobalErrors: report.globalErrors,
      resultArtifact: ref(output, `${directory}/report.json`),
    };
    writeJsonAtomic(`${directory}/execution.json`, execution);
    writeJsonAtomic(`${directory}/resources.json`, {
      elapsedMs: Date.now() - started,
      measured,
      isolation: "two containers in owned network-none namespace",
      perContainerLimits: { memoryBytes: 4294967296, cpus: 2, pids: 256 },
    });
    return {
      manifest,
      identity,
      reference: ref(output, `${directory}/execution.json`),
    };
  } finally {
    const cleanupErrors = [];
    for (const [id, logName] of [
      [candidateId, "candidate"],
      [toolsId, "browser-provider"],
    ])
      if (id) {
        try {
          fs.writeFileSync(
            `${directory}/${logName}-container.log`,
            containerLog(id),
            { mode: 0o600 },
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
        try {
          removeOwned(id, owner);
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    if (cleanupErrors.length)
      throw new AggregateError(
        cleanupErrors,
        "OCI_OWNED_RESOURCE_CLEANUP_FAILED",
      );
  }
}

async function extractCandidate(descriptor, observedImageId, output) {
  const owner = `harness-oci-${randomUUID()}`;
  const candidateRoot = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "harness-oci-payload-"),
  );
  fs.chmodSync(candidateRoot, 0o700);
  privatePayloads.push(candidateRoot);
  const id = docker([
    "create",
    "--network",
    "none",
    "--read-only",
    "--label",
    `exui.harness.owner=${owner}`,
    "--platform",
    descriptor.platform,
    "--entrypoint",
    "/usr/local/bin/node",
    descriptor.imageReference,
    "--version",
  ]);
  ownedContainers.set(id, owner);
  writeJsonAtomic(`${output}/extracted-files.json`, {
    root: candidateRoot,
    imageReference: descriptor.imageReference,
    observedImageId,
    readonlyOutsideOutput: true,
  });
  try {
    if (inspect(id).Image !== observedImageId)
      throw new Error("OCI_EXTRACTION_IMAGE_MISMATCH");
    for (const item of [
      "dist",
      "config",
      "api",
      "package.json",
      "yarn.lock",
      "harness-build.json",
    ])
      docker(["cp", `${id}:/opt/app/${item}`, path.join(candidateRoot, item)]);
    return await verifyImageMetadata(
      descriptor,
      readImageMetadata(candidateRoot),
      candidateRoot,
    );
  } finally {
    removeOwned(id, owner);
  }
}

async function launch() {
  if (arg("--scope") && arg("--scope") !== "exui-wa-family-pilot")
    throw new Error("OCI_SCOPE_REQUIRES_DERIVED_IMAGE_ADAPTER");
  if (arg("--mutant")) throw new Error("OCI_DERIVED_IMAGE_MUTANT_UNSUPPORTED");
  if (!arg("--candidate")) throw new Error("OCI_CANDIDATE_DESCRIPTOR_REQUIRED");
  const descriptor = validateImageCandidate(
    read(path.resolve(arg("--candidate"))),
  );
  const observedImage = JSON.parse(
    docker(["image", "inspect", descriptor.imageReference]),
  )[0];
  assertCandidateImage(descriptor, observedImage);
  const observedImageId = observedImage.Id;
  const output = path.resolve(
    arg("--output") ??
      `functional-output/tests/harness/private/oci-${randomUUID()}`,
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(output, { mode: 0o700 });
  activeOutput = output;
  writePublicSummary(`${output}/public/release-assurance-summary.json`, {
    status: "BLOCKED",
  });
  const artifact = await extractCandidate(descriptor, observedImageId, output);
  const sources = assertCandidateConfigurationSources(
    artifact.candidateRoot,
    review(),
  );
  const browserRuntime =
    arg("--browser-runtime-image") ??
    (descriptor.platform === "linux/arm64" ? ARM64_BROWSER_RUNTIME : undefined);
  if (!browserRuntime)
    throw new Error("MATCHING_PINNED_BROWSER_RUNTIME_REQUIRED");
  assertBrowserRuntime(
    JSON.parse(docker(["image", "inspect", browserRuntime]))[0],
    browserRuntime,
    descriptor.platform,
  );
  const browserRoot = fs.realpathSync(
    path.resolve(arg("--browser") ?? "functional-output/inputs/browser"),
  );
  const relativeBrowser = browserExecutable(
    read(`${root}/node_modules/playwright-core/browsers.json`),
    descriptor.platform,
  );
  const executable = fs.readFileSync(path.join(browserRoot, relativeBrowser));
  const expectedMachine = descriptor.platform === "linux/arm64" ? 183 : 62;
  if (
    executable.subarray(0, 4).toString("hex") !== "7f454c46" ||
    executable.readUInt16LE(18) !== expectedMachine
  )
    throw new Error("BROWSER_EXECUTABLE_PLATFORM_MISMATCH");
  const input = {
    descriptor,
    observedImageId,
    artifact,
    browserRuntime,
    browserRoot,
    browserExecutable: `/browser/${relativeBrowser}`,
    browserDigest: await digestCandidateTree(browserRoot),
    harnessDependencies: await verifyHarnessDependencies(
      `${root}/node_modules`,
      `${root}/package.json`,
      `${root}/yarn.lock`,
    ),
    harnessCommit: git(["rev-parse", "HEAD"]),
    harnessSources: OCI_SOURCE_FILES,
    harnessSourceState: git([
      "status",
      "--porcelain",
      "--",
      ...OCI_SOURCE_FILES,
    ])
      ? "dirty-diagnostic"
      : "clean",
    harnessSourceDigest: sourceDigest(OCI_SOURCE_FILES),
    reviewedConfigurationSources: digestBytes(JSON.stringify(sources)),
    runId: `oci-${randomUUID()}`,
  };
  writeJsonAtomic(`${output}/input.json`, input);
  const staged = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "harness-oci-sources-"),
  );
  fs.chmodSync(staged, 0o700);
  for (const file of OCI_SOURCE_FILES) {
    const destination = path.join(staged, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  fs.mkdirSync(path.join(staged, "node_modules"));
  const policy = getReleasePolicy("exui-wa-family-pilot");
  const executions = [],
    mutations = [],
    identities = [];
  let manifest;
  try {
    for (const invocation of ["baseline", "wa-drop-family"]) {
      const result = await runInvocation(
        input,
        output,
        staged,
        invocation,
        policy,
      );
      manifest ??= result.manifest;
      executions.push(result.reference);
      identities.push(result.identity);
    }
    const definition = policy.mutationDefinitions[0];
    writeJsonAtomic(`${output}/derivation.json`, {
      mutationDefinitionDigest: definition.definitionDigest,
      baselineIdentity: identities[0],
      mutantIdentity: identities[1],
      transformation: "remove-supported-IA-family",
      target: "NODE_CONFIG.waSupportedJurisdictions",
      before: effectiveCandidateConfiguration(artifact.candidateRoot).config
        .waSupportedJurisdictions,
      after: effectiveCandidateConfiguration(
        artifact.candidateRoot,
        "wa-drop-family",
      ).config.waSupportedJurisdictions,
    });
    mutations.push({
      mutationId: definition.mutationId,
      baselineInvocationId: "baseline",
      mutantInvocationId: "wa-drop-family",
      derivationArtifact: ref(output, `${output}/derivation.json`),
    });
  } finally {
    try {
      if (manifest) {
        writeJsonAtomic(`${output}/run.json`, {
          schemaVersion: 1,
          manifest,
          executionArtifacts: executions,
          mutations,
        });
        const { receipt } = loadRunEvidence(`${output}/run.json`, policy);
        writeJsonAtomic(`${output}/gate.json`, receipt);
        writePublicSummary(
          `${output}/public/release-assurance-summary.json`,
          receipt.verdict,
          true,
        );
        process.exitCode = receipt.verdict.exitCode;
      }
    } finally {
      try {
        fs.rmSync(staged, { recursive: true, force: true });
      } catch (error) {
        if (!["EACCES", "EPERM"].includes(error.code)) throw error;
        writeJsonAtomic(`${output}/source-snapshot.json`, {
          retained: true,
          path: staged,
          digest: input.harnessSourceDigest,
        });
      }
    }
  }
  console.log(`OCI candidate evidence: ${output}`);
}

try {
  if (process.argv.includes("--inside-providers")) await insideProviders();
  else if (process.argv.includes("--inside-proof")) await insideProof();
  else {
    const dispose = installCancellationCleanup({
      resources: ownedContainers,
      remove: removeOwned,
      onCancel: (signal) => {
        if (!activeOutput) return;
        for (const name of ["run.json", "gate.json"]) {
          const file = path.join(activeOutput, name);
          if (fs.existsSync(file))
            fs.renameSync(file, path.join(activeOutput, `interrupted-${name}`));
        }
        writeJsonAtomic(`${activeOutput}/cancelled.json`, {
          signal,
          status: "BLOCKED",
          containers: [...ownedContainers].map(([id, owner]) => ({
            id,
            owner,
          })),
        });
        writePublicSummary(
          `${activeOutput}/public/release-assurance-summary.json`,
          { status: "BLOCKED" },
        );
      },
    });
    try {
      await launch();
    } finally {
      dispose();
      for (const directory of privatePayloads)
        fs.rmSync(directory, { recursive: true, force: true });
    }
  }
} catch (error) {
  console.error(`BLOCKED: ${error.message}`);
  process.exitCode = 2;
}
