#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { CCD_IMAGES } from "./lib/exui-ccd-runtime.mjs";
import { CANDIDATE_BUILD_IMAGE } from "./lib/exui-candidate-build.mjs";
import { ARM64_BROWSER_RUNTIME, NATIVE_API_RUNTIME_REFERENCE } from "./lib/exui-oci-runtime.mjs";
import { validateCiJob } from "./lib/exui-candidate-ci-inputs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relativeOutput = "functional-output/tests/harness/public/native-ci-capabilities.json";
const pins = { api: NATIVE_API_RUNTIME_REFERENCE, tools: ARM64_BROWSER_RUNTIME, build: CANDIDATE_BUILD_IMAGE, ...CCD_IMAGES };
const operatingSystems = ["linux", "darwin", "windows", "unknown"];
const architectures = ["amd64", "arm64", "unknown"];
const osName = value => operatingSystems.includes(value) ? value : value === "win32" ? "windows" : "unknown";
const architecture = value => ["amd64", "x64", "x86_64"].includes(value) ? "amd64" : ["arm64", "aarch64"].includes(value) ? "arm64" : "unknown";
const keys = (value, expected) => assert.deepEqual(Object.keys(value ?? {}).sort(), expected.split(",").sort(), "INVALID_WORKER_CAPABILITIES");
const valid = condition => assert(condition, "INVALID_WORKER_CAPABILITIES");
function reasons(report) {
  const result = ["NATIVE_EXECUTION_NOT_RUN", "MOUNT_AND_LIFECYCLE_NOT_VERIFIED"];
  if (report.docker.status !== "observed") result.push("DOCKER_UNAVAILABLE");
  else if (report.docker.os !== "linux" || report.docker.architecture !== "arm64") result.push("DOCKER_PLATFORM_UNSUPPORTED");
  if (report.images.some(image => image.status !== "present" || !image.pinnedIdentityMatched || image.os !== "linux" || image.architecture !== "arm64")) result.push("PINNED_IMAGES_NOT_VERIFIED");
  if (report.inputs.job === "unconfigured") result.push("NATIVE_INPUT_UNCONFIGURED");
  else if (report.inputs.job !== "present" || report.inputs.candidateManifest !== "present" || report.inputs.browserCache !== "present") result.push("NATIVE_INPUT_UNAVAILABLE_OR_INVALID");
  result.push("CANDIDATE_AND_BROWSER_INTEGRITY_NOT_VERIFIED");
  return result;
}
function inputPresence(inputPath) {
  const value = { job: "unconfigured", candidateManifest: "not-checked", browserCache: "not-checked", integrity: "not-verified" };
  if (!inputPath) return value;
  const present = (file, directory = false) => {
    try { const stat = fs.lstatSync(file); return fs.realpathSync(file) === file && (directory ? stat.isDirectory() : stat.isFile()); }
    catch { return false; }
  };
  if (!path.isAbsolute(inputPath) || !present(inputPath)) return { ...value, job: "unavailable" };
  try {
    if (fs.statSync(inputPath).size > 65536) throw Error("JOB_TOO_LARGE");
    const job = validateCiJob(JSON.parse(fs.readFileSync(inputPath, "utf8")));
    return { ...value, job: "present", candidateManifest: present(job.candidateManifest) ? "present" : "unavailable", browserCache: present(job.browserCache, true) ? "present" : "unavailable" };
  } catch { return { ...value, job: "invalid" }; }
}

// Read-only observations, deliberately insufficient to admit native execution.
export function collectWorkerCapabilities({ run = spawnSync, inputPath, host = { os: process.platform, architecture: process.arch } } = {}) {
  const dockerJson = args => {
    try {
      const response = run("docker", args, { env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 });
      return response.status === 0 && !response.error ? JSON.parse(response.stdout) : null;
    } catch { return null; }
  };
  const server = dockerJson(["version", "--format", "{{json .Server}}"]);
  const observed = server && typeof server.Os === "string" && typeof server.Arch === "string";
  const report = {
    schemaVersion: 1, kind: "worker-capability-observation", nativeExecution: "not-run", nativeReady: false, releaseApproval: false,
    host: { os: osName(host.os), architecture: architecture(host.architecture) },
    docker: { status: observed ? "observed" : "unavailable", os: osName(server?.Os), architecture: architecture(server?.Arch) },
    images: Object.entries(pins).map(([service, reference]) => {
      const info = observed ? dockerJson(["image", "inspect", reference]) : null;
      const item = Array.isArray(info) && info.length === 1 ? info[0] : null;
      const pin = reference.slice(reference.indexOf("sha256:"));
      const digests = Array.isArray(item?.RepoDigests) ? item.RepoDigests : [];
      const pinnedDigest = digests.some(digest => typeof digest === "string" && digest.endsWith("@" + pin));
      const provenance = service === "tools" ? digests.length > 0 : pinnedDigest;
      return { service, status: !observed ? "not-checked" : item ? "present" : "unavailable",
        os: osName(item?.Os), architecture: architecture(item?.Architecture),
        pinnedIdentityMatched: Boolean(item && ((service === "api" || service === "build") || item.Id === reference) && provenance) };
    }),
    inputs: inputPresence(inputPath),
  };
  report.reasons = reasons(report);
  validateCapabilityReport(report);
  return report;
}
export function validateCapabilityReport(report) {
  keys(report, "schemaVersion,kind,nativeExecution,nativeReady,releaseApproval,host,docker,images,inputs,reasons");
  valid(report.schemaVersion === 1 && report.kind === "worker-capability-observation" && report.nativeExecution === "not-run" && report.nativeReady === false && report.releaseApproval === false);
  keys(report.host, "os,architecture"); keys(report.docker, "status,os,architecture");
  for (const item of [report.host, report.docker]) valid(operatingSystems.includes(item.os) && architectures.includes(item.architecture));
  valid(["observed", "unavailable"].includes(report.docker.status));
  valid(Array.isArray(report.images) && report.images.length === Object.keys(pins).length);
  report.images.forEach((item, index) => {
    keys(item, "service,status,os,architecture,pinnedIdentityMatched");
    valid(item.service === Object.keys(pins)[index] && ["present", "unavailable", "not-checked"].includes(item.status));
    valid(operatingSystems.includes(item.os) && architectures.includes(item.architecture) && typeof item.pinnedIdentityMatched === "boolean");
    valid(item.status === "present" || (!item.pinnedIdentityMatched && item.os === "unknown" && item.architecture === "unknown"));
  });
  keys(report.inputs, "job,candidateManifest,browserCache,integrity");
  valid(["unconfigured", "present", "unavailable", "invalid"].includes(report.inputs.job) && report.inputs.integrity === "not-verified");
  for (const key of ["candidateManifest", "browserCache"]) valid(["present", "unavailable", "not-checked"].includes(report.inputs[key]));
  assert.deepEqual(report.reasons, reasons(report), "INVALID_WORKER_CAPABILITIES");
  return report;
}
function outputPath(root, create = false) {
  assert(path.resolve(root) === fs.realpathSync(root), "WORKER_CAPABILITY_OUTPUT_ALIAS");
  let current = root;
  for (const component of path.dirname(relativeOutput).split("/")) {
    current = path.join(current, component);
    if (!fs.existsSync(current) && create) fs.mkdirSync(current, { mode: 0o700 });
    try { assert(fs.lstatSync(current).isDirectory() && fs.realpathSync(current) === current, "WORKER_CAPABILITY_OUTPUT_ALIAS"); }
    catch (error) { if (error.code === "ENOENT" && !create) return path.join(root, relativeOutput); throw error; }
  }
  const file = path.join(root, relativeOutput);
  try { assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, "WORKER_CAPABILITY_OUTPUT_ALIAS"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return file;
}
export function resetCapabilityReport(root = ROOT) { fs.rmSync(outputPath(root), { force: true }); }
export function writeCapabilityReport(report, root = ROOT) {
  validateCapabilityReport(report);
  const file = outputPath(root, true);
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return file;
}
export function readCapabilityReport(root = ROOT) { return validateCapabilityReport(JSON.parse(fs.readFileSync(outputPath(root), "utf8"))); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.cwd(), ROOT, "WORKER_CAPABILITY_CWD_REQUIRED");
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === "--reset") resetCapabilityReport();
    else if (args.length === 1 && args[0] === "--validate") readCapabilityReport();
    else {
      assert.equal(args.length, 0, "WORKER_CAPABILITY_ARGUMENTS");
      resetCapabilityReport();
      writeCapabilityReport(collectWorkerCapabilities({ inputPath: process.env.HARNESS_ASSURANCE_INPUT }));
      console.log("[harness-worker] Sanitized capability observation recorded; native execution not run.");
    }
  } catch {
    console.error("[harness-worker] Capability observation or safe publication failed.");
    process.exitCode = 1;
  }
}
