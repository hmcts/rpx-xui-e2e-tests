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
  readImageMetadata,
  installCancellationCleanup,
} from "./lib/exui-oci-runtime.mjs";
import {
  effectiveCandidateConfiguration,
  assertRuntimeIdentity,
} from "./lib/exui-candidate-runtime.mjs";
import { withOwnedImageExtraction } from "./lib/exui-oci-extraction.mjs";
import { digestCandidateTree } from "./lib/exui-candidate-artifact.mjs";
import {
  runHostInvocation,
  removeHostResource,
} from "./lib/exui-host-invocation.mjs";
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
const invocationResources = new Map();
const privatePayloads = [];
let activeOutput;
let interrupted = false;
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

function expectedMount(source, target, writable) {
  return { source: fs.realpathSync(source), target, writable };
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
  manifest.runtimeMetadata.candidateBuildNodeVersion =
    input.artifact.provenance.buildRuntime.nodeVersion;
  const { terminal } = await runHostInvocation(
    {
      output,
      directory,
      owner,
      invocationId: invocation,
      platform: input.descriptor.platform,
      manifest,
      payloadDigest: input.descriptor.digest,
      diagnostics,
      tools: {
        image: input.browserRuntime,
        mounts: toolMounts,
        args: toolContainerArguments({
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
      },
      candidate: {
        image: input.observedImageId,
        node: "/usr/local/bin/node",
        mounts: candidateMounts,
        arguments: (namespace) =>
          candidateImageArguments({
            descriptor: input.descriptor,
            namespace,
            owner,
            sessions,
            diagnostics,
            guard,
            config,
          }),
      },
      proofArguments: [
        "scripts/run-harness-oci-candidate.mjs",
        "--inside-proof",
        "--invocation",
        invocation,
      ],
    },
    { resources: invocationResources, isCancelled: () => interrupted },
  );
  const report = read(`${directory}/report.json`);
  writeJsonAtomic(`${directory}/execution.json`, {
    invocationId: invocation,
    runId: input.runId,
    identity,
    kind: mutation ? "mutation" : "baseline",
    terminalState: "completed",
    runnerExitCode: terminal.code,
    unexpectedGlobalErrors: report.globalErrors,
    resultArtifact: ref(output, `${directory}/report.json`),
  });
  return {
    manifest,
    identity,
    reference: ref(output, `${directory}/execution.json`),
  };
}

async function extractCandidate(descriptor, observedImageId, output) {
  const owner = `harness-oci-${randomUUID()}`;
  const candidateRoot = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "harness-oci-payload-"),
  );
  fs.chmodSync(candidateRoot, 0o700);
  privatePayloads.push(candidateRoot);
  writeJsonAtomic(`${output}/extracted-files.json`, {
    root: candidateRoot,
    imageReference: descriptor.imageReference,
    observedImageId,
    readonlyOutsideOutput: true,
  });
  return withOwnedImageExtraction(
    { descriptor, observedImageId, owner, output, resources: ownedContainers },
    async (id) => {
      for (const item of [
        "dist",
        "config",
        "api",
        "package.json",
        "yarn.lock",
        "harness-build.json",
      ])
        docker([
          "cp",
          `${id}:/opt/app/${item}`,
          path.join(candidateRoot, item),
        ]);
      return verifyImageMetadata(
        descriptor,
        readImageMetadata(candidateRoot),
        candidateRoot,
      );
    },
  );
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
      resources: new Map([
        ["payloads", ownedContainers],
        ["invocations", invocationResources],
      ]),
      remove: async (_group, resources) => {
        for (const [key] of [...resources].reverse()) {
          await removeHostResource(resources, key, activeOutput);
        }
      },
      onCancel: (signal) => {
        interrupted = true;
        if (!activeOutput) return;
        for (const name of ["run.json", "gate.json"]) {
          const file = path.join(activeOutput, name);
          if (fs.existsSync(file))
            fs.renameSync(file, path.join(activeOutput, `interrupted-${name}`));
        }
        writeJsonAtomic(`${activeOutput}/cancelled.json`, {
          signal,
          status: "BLOCKED",
          containers: [...ownedContainers.values()],
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
