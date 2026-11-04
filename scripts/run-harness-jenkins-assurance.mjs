#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readCandidateBuildContract } from "./lib/exui-candidate-build.mjs";
import { verifyCandidateArtifact } from "./lib/exui-candidate-artifact.mjs";
import {
  validatePublicSummary,
  writePublicSummary,
} from "./lib/exui-evidence-io.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEBAPP = "https://github.com/hmcts/rpx-xui-webapp.git";
const PUBLIC = path.join(
  ROOT,
  "functional-output/tests/harness/public/release-assurance-summary.json",
);
const require = createRequire(import.meta.url);
let stage = "private setup";

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

function removePrivateDirectory(directory, parent) {
  const resolved = path.resolve(directory);
  assert(
    path.dirname(resolved) === parent &&
      path.basename(resolved).startsWith("harness-native-ci-"),
    "HARNESS_PRIVATE_CLEANUP_TARGET_REQUIRED",
  );
  const info = fs.lstatSync(resolved);
  assert(
    info.isDirectory() &&
      !info.isSymbolicLink() &&
      fs.realpathSync(resolved) === resolved &&
      info.uid === process.getuid(),
    "HARNESS_PRIVATE_CLEANUP_OWNERSHIP_REQUIRED",
  );
  fs.rmSync(resolved, { recursive: true, force: true });
}

export function writePrivateJob(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  assert.equal(fs.realpathSync(file), file, "HARNESS_PRIVATE_JOB_INPUT_REQUIRED");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
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
  const yarnConfiguration = fs.readFileSync(path.join(source, ".yarnrc.yml"), "utf8");
  const contract = readCandidateBuildContract(manifest, yarnConfiguration);
  const yarnEntry = run("git", ["-C", source, "ls-tree", commit, "--", contract.yarnPath]);
  assert(/^100(?:644|755) blob /.test(yarnEntry), "COMMITTED_YARN_RELEASE_REQUIRED");
  const yarnPath = path.join(source, contract.yarnPath);
  const yarnInfo = fs.lstatSync(yarnPath);
  assert(yarnInfo.isFile() && !yarnInfo.isSymbolicLink(), "COMMITTED_YARN_RELEASE_REQUIRED");

  // Only fetch locked package archives here. The candidate build itself is offline and has scripts disabled.
  stage = "locked dependency cache";
  run(
    process.execPath,
    [yarnPath, "install", "--immutable", "--mode=skip-builds"],
    {
      cwd: source,
      env: safeEnvironment({ YARN_ENABLE_NETWORK: "1", YARN_ENABLE_SCRIPTS: "0" }),
      stdio: "ignore",
      timeout: 1_800_000,
    },
  );
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

  const { chromium } = require("@playwright/test");
  const executable = chromium.executablePath();
  assert(fs.existsSync(executable), "ARM64_PLAYWRIGHT_BROWSER_REQUIRED");
  const browserCache = fs.realpathSync(
    path.dirname(path.dirname(path.dirname(executable))),
  );
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
    console.log(
      `[harness-assurance] Native ${result.status}; completed proofs: ${completed}; cleanup ${result.cleanupComplete ? "complete" : "incomplete"}.`,
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

  const temporaryRoot = fs.realpathSync(os.tmpdir());
  let privateRoot;
  let exitCode = 2;
  try {
    privateRoot = fs.mkdtempSync(path.join(temporaryRoot, "harness-native-ci-"));
    assertPrivateDirectory(privateRoot);
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
      if (privateRoot) removePrivateDirectory(privateRoot, temporaryRoot);
    } catch {
      console.error("[harness-assurance] BLOCKED: private job cleanup could not be verified.");
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
