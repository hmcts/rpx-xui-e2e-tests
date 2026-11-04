#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ARM64_BROWSER_RUNTIME } from "./lib/exui-oci-runtime.mjs";
import { readCandidateBuildContract } from "./lib/exui-candidate-build.mjs";
import { verifyCandidateArtifact } from "./lib/exui-candidate-artifact.mjs";
import {
  validatePublicSummary,
  writePublicSummary,
} from "./lib/exui-evidence-io.mjs";
import { collectWorkerCapabilities, validateCapabilityReport } from "./observe-harness-worker.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEBAPP = "https://github.com/hmcts/rpx-xui-webapp.git";
const PUBLIC = path.join(
  ROOT,
  "functional-output/tests/harness/public/release-assurance-summary.json",
);
let stage = "private setup";

export function assertNativeWorkerPlatform(report = collectWorkerCapabilities()) {
  validateCapabilityReport(report);
  assert(
    report.docker.status === "observed" &&
      report.docker.os === "linux" &&
      report.docker.architecture === "arm64",
    "HARNESS_NATIVE_DOCKER_ARM64_REQUIRED",
  );
}

function safeEnvironment(extra = {}) {
  const environment = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
  ])
    if (process.env[key]) environment[key] = process.env[key];
  return { ...environment, CI: "true", ...extra };
}

function run(command, args, { cwd = ROOT, env = safeEnvironment(), ...options } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error("HARNESS_JENKINS_ASSURANCE_COMMAND_FAILED");
  return result.stdout?.trim() ?? "";
}

export function assertPrivateDirectory(directory) {
  const resolved = path.resolve(directory);
  const info = fs.lstatSync(resolved);
  assert(
    info.isDirectory() &&
      !info.isSymbolicLink() &&
      fs.realpathSync(resolved) === resolved &&
      info.uid === process.getuid() &&
      (info.mode & 0o077) === 0,
    "HARNESS_PRIVATE_JOB_DIRECTORY_REQUIRED",
  );
  return resolved;
}

export function createPrivateJobDirectory(root = ROOT) {
  assert.equal(fs.realpathSync(root), root, "HARNESS_PRIVATE_JOB_ROOT_ALIAS");
  let directory = root;
  for (const component of ["functional-output", "tests", "harness", "private", "native-ci"]) {
    directory = path.join(directory, component);
    try {
      const info = fs.lstatSync(directory);
      assert(info.isDirectory() && !info.isSymbolicLink(), "HARNESS_PRIVATE_JOB_ROOT_ALIAS");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      fs.mkdirSync(directory, { mode: 0o700 });
    }
    assert.equal(fs.realpathSync(directory), directory, "HARNESS_PRIVATE_JOB_ROOT_ALIAS");
    if (component === "private" || component === "native-ci") assertPrivateDirectory(directory);
  }
  const job = fs.mkdtempSync(path.join(directory, "harness-native-ci-"));
  return assertPrivateDirectory(job);
}

export function writePrivateJob(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  assert.equal(fs.realpathSync(file), file, "HARNESS_PRIVATE_JOB_INPUT_REQUIRED");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
}

function prepareBrowserCache(privateRoot) {
  const browserCache = path.join(privateRoot, "browser-cache");
  fs.mkdirSync(browserCache, { mode: 0o700 });
  run(
    "docker",
    [
      "run",
      "--rm",
      "--name",
      `harness-native-ci-browser-${randomUUID()}`,
      "--network",
      "none",
      "--platform",
      "linux/arm64",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "128",
      "--memory",
      "2g",
      "--cpus",
      "1",
      "--init",
      "--mount",
      `type=bind,src=${browserCache},dst=/browser`,
      "--entrypoint",
      "/bin/sh",
      ARM64_BROWSER_RUNTIME,
      "-c",
      "cp -a /ms-playwright/. /browser/",
    ],
  );
  assert(fs.readdirSync(browserCache).length > 0, "ARM64_BROWSER_CACHE_REQUIRED");
  return browserCache;
}

async function prepareJob(privateRoot) {
  const source = path.join(privateRoot, "webapp-source");
  const candidate = path.join(privateRoot, "candidate");
  const output = path.join(privateRoot, "native-output");
  const jobPath = path.join(privateRoot, "job-input.json");

  stage = "webapp master fetch";
  run(
    "git",
    ["clone", "--depth", "1", "--single-branch", "--branch", "master", WEBAPP, source],
    { env: safeEnvironment(), stdio: "ignore", timeout: 300_000 },
  );
  const commit = run("git", ["-C", source, "rev-parse", "HEAD"]);
  assert(/^[a-f0-9]{40}$/.test(commit), "WEBAPP_MASTER_COMMIT_REQUIRED");

  const manifest = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8"));
  const yarnConfigurationPath = path.join(source, ".yarnrc.yml");
  const yarnConfiguration = fs.readFileSync(yarnConfigurationPath, "utf8");
  const contract = readCandidateBuildContract(manifest, yarnConfiguration);
  const yarnEntry = run("git", ["-C", source, "ls-tree", commit, "--", contract.yarnPath]);
  assert(/^100(?:644|755) blob /.test(yarnEntry), "COMMITTED_YARN_RELEASE_REQUIRED");
  const yarnPath = path.join(source, contract.yarnPath);
  const yarnInfo = fs.lstatSync(yarnPath);
  assert(yarnInfo.isFile() && !yarnInfo.isSymbolicLink(), "COMMITTED_YARN_RELEASE_REQUIRED");

  // Only fetch locked package archives here. The candidate build itself is offline and has scripts disabled.
  stage = "locked dependency cache";
  try {
    run(
      process.execPath,
      [
        yarnPath,
        "config",
        "set",
        "supportedArchitectures",
        "--json",
        JSON.stringify({
          os: ["linux"],
          cpu: ["arm64"],
          libc: ["glibc"],
        }),
      ],
      { cwd: source, stdio: "ignore" },
    );
    run(
      process.execPath,
      [yarnPath, "install", "--immutable", "--mode=skip-build"],
      {
        cwd: source,
        env: safeEnvironment({ YARN_ENABLE_NETWORK: "1", YARN_ENABLE_SCRIPTS: "0" }),
        stdio: "ignore",
        timeout: 1_800_000,
      },
    );
  } finally {
    fs.writeFileSync(yarnConfigurationPath, yarnConfiguration);
  }
  const cache = path.join(source, ".yarn/cache");
  assert(fs.statSync(cache).isDirectory() && fs.readdirSync(cache).length > 0, "WEBAPP_LOCKED_CACHE_REQUIRED");

  stage = "immutable candidate build";
  run(
    process.execPath,
    [
      "scripts/prepare-harness-candidate.mjs",
      "--source",
      source,
      "--commit",
      commit,
      "--output",
      candidate,
      "--cache",
      cache,
    ],
    { stdio: "inherit", timeout: 1_800_000 },
  );
  const candidateManifest = path.join(candidate, "candidate-artifact.json");
  const artifact = await verifyCandidateArtifact(candidateManifest);
  assert.equal(artifact.identity.webappCommit, commit, "WEBAPP_CANDIDATE_COMMIT_MISMATCH");

  const browserCache = prepareBrowserCache(privateRoot);
  const job = {
    schemaVersion: 1,
    candidateManifest,
    expectedArtifactDigest: artifact.identity.artifactDigest,
    browserCache,
    output,
  };
  writePrivateJob(jobPath, job);

  stage = "native worker preflight";
  run(process.execPath, ["scripts/observe-harness-worker.mjs", "--reset"]);
  run(process.execPath, ["scripts/observe-harness-worker.mjs"], {
    env: safeEnvironment({ HARNESS_ASSURANCE_INPUT: jobPath }),
  });
  return { jobPath, output };
}

function publishSummary(privateOutput) {
  const source = path.join(privateOutput, "public/release-assurance-summary.json");
  const info = fs.lstatSync(source);
  assert(info.isFile() && !info.isSymbolicLink() && fs.realpathSync(source) === source);
  const summary = validatePublicSummary(source);
  writePublicSummary(
    PUBLIC,
    { status: summary.status, exitCode: { PASS: 0, FAIL: 1, BLOCKED: 2 }[summary.status] },
    summary.receiptAvailable,
  );
  assert.equal(validatePublicSummary(PUBLIC).status, summary.status);
  return summary.status;
}

function reportIsValid() {
  const result = spawnSync(
    process.execPath,
    ["scripts/manage-harness-public-reports.cjs", "--validate"],
    { cwd: ROOT, env: safeEnvironment(), stdio: "ignore" },
  );
  return !result.error && result.status === 0;
}

function logNativeCompletion(output) {
  try {
    const result = JSON.parse(
      fs.readFileSync(path.join(output, "private/ci-result.json"), "utf8"),
    );
    const allowed = new Set(["family", "scope", "ccd", "eventCapability", "routing"]);
    assert(
      ["PASS", "FAIL", "BLOCKED"].includes(result.status) &&
        Array.isArray(result.phaseResults) &&
        result.phaseResults.every(
          (phase) => allowed.has(phase.phase) && ["PASS", "FAIL", "BLOCKED"].includes(phase.status),
        ),
      "INVALID_PRIVATE_CI_RESULT",
    );
    const completed = result.phaseResults
      .map((phase) => `${phase.phase} ${phase.status}`)
      .join(", ") || "none";
    let stopReason = "";
    try {
      const failure = JSON.parse(
        fs.readFileSync(path.join(output, "private/orchestration-error.json"), "utf8"),
      );
      stopReason = /^[A-Z][A-Z0-9_]*$/.test(failure.message)
        ? `; stop reason ${failure.message}`
        : "; stop reason NATIVE_PREFLIGHT_FAILED";
    } catch {
      // No orchestration failure was recorded.
    }
    console.log(
      `[harness-assurance] Native ${result.status}; completed proofs: ${completed}${stopReason}; cleanup ${result.cleanupComplete ? "complete" : "incomplete"}.`,
    );
  } catch {
    // Missing or malformed private evidence gets no native credit.
  }
}

async function main() {
  assert.equal(process.cwd(), ROOT, "HARNESS_REPOSITORY_CWD_REQUIRED");
  process.umask(0o077);
  const publicDirectory = path.dirname(PUBLIC);
  fs.mkdirSync(publicDirectory, { recursive: true, mode: 0o700 });
  assert.equal(fs.realpathSync(publicDirectory), publicDirectory, "HARNESS_PUBLIC_DIRECTORY_REQUIRED");
  writePublicSummary(PUBLIC, { status: "BLOCKED", exitCode: 2 });

  let privateRoot;
  let exitCode = 2;
  try {
    stage = "native worker platform";
    assertNativeWorkerPlatform();
    privateRoot = createPrivateJobDirectory();
    const { jobPath, output } = await prepareJob(privateRoot);
    stage = "native candidate and CCD pilots";
    const result = spawnSync(
      process.execPath,
      ["scripts/run-harness-assurance.mjs", "--input", jobPath],
      { cwd: ROOT, env: safeEnvironment(), stdio: "inherit" },
    );
    exitCode = result.error || result.status === null ? 2 : result.status;
    logNativeCompletion(output);
    stage = "validated summary publication";
    try {
      const summaryStatus = publishSummary(output);
      if (exitCode === 0 && summaryStatus !== "PASS") exitCode = 2;
    } catch {
      console.error("[harness-assurance] No validated native summary was available; release approval remains blocked.");
      writePublicSummary(PUBLIC, { status: "BLOCKED", exitCode: 2 });
      exitCode = Math.max(exitCode, 2);
    }
  } catch {
    console.error(`[harness-assurance] BLOCKED during ${stage}; release approval remains unavailable.`);
    exitCode = 2;
  } finally {
    try {
      if (privateRoot) assertPrivateDirectory(privateRoot);
    } catch {
      console.error("[harness-assurance] BLOCKED: private job evidence permissions could not be verified.");
      writePublicSummary(PUBLIC, { status: "BLOCKED", exitCode: 2 });
      exitCode = 2;
    }
  }
  if (!reportIsValid()) {
    console.error("[harness-assurance] Combined Odhín report unavailable; generating diagnostics-only coverage.");
    const fallback = spawnSync(
      process.execPath,
      ["scripts/run-harness-local-poc.mjs", "--ci", "--odhin"],
      { cwd: ROOT, env: safeEnvironment(), stdio: "inherit" },
    );
    if (fallback.error || fallback.status !== 0 || !reportIsValid()) {
      console.error("[harness-assurance] No validated Odhín report could be generated.");
      exitCode = 2;
    } else {
      writePublicSummary(PUBLIC, { status: "BLOCKED", exitCode: 2 });
      exitCode = 2;
    }
  }
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main();
