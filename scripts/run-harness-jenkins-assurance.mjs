#!/usr/bin/env node
import Reporter from "./harness-public-odhin-reporter.cjs";
import {holdBuildSelfChecks,readHeldBuildSelfChecks} from "./run-harness-self-check-evidence.mjs";
import {prepareComplexAdmissionInputs} from './lib/exui-complex-email-admission.mjs';
import { classifyNativeFailure, formatNativeFailure } from "./lib/exui-native-failure-diagnostics.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync, fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { browserExecutable } from "./lib/exui-oci-runtime.mjs";
import { nativeRuntimeImages, nativeBrowserDonor, assertNativeRuntimeImage } from "./lib/exui-native-containers.mjs";
import { ccdImagePins, assertCcdImageIdentity } from "./lib/exui-ccd-runtime.mjs";
import { readCandidateBuildContract } from "./lib/exui-candidate-build.mjs";
import { verifyCandidateArtifact, digestCandidateTree } from "./lib/exui-candidate-artifact.mjs";
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
      ["arm64", "amd64"].includes(report.docker.architecture),
    "HARNESS_NATIVE_DOCKER_SUPPORTED_PLATFORM_REQUIRED",
  );
  return `linux/${report.docker.architecture}`;
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
    "HARNESS_SHARED_ROLE_SOURCE_INPUTS",
    "HARNESS_COMPLEX_SOURCE_INPUTS",
    "http_proxy",
    "https_proxy",
    "no_proxy",
  ])
    if (process.env[key]) environment[key] = process.env[key];
  return { ...environment, CI: "true", ...extra };
}

export function classifyPinPullFailure(output, errorCode) {
  if (/toomanyrequests|rate limit|\b429\b/i.test(output)) return "RATE_LIMIT";
  if (/unauthorized|authentication required|access denied|forbidden|\b40[13]\b/i.test(output)) return "ACCESS_DENIED";
  if (/manifest unknown|no such manifest|manifest.*not found|\b404\b/i.test(output)) return "MANIFEST_UNAVAILABLE";
  if (/timed? out|deadline exceeded/i.test(output) || errorCode === "ETIMEDOUT") return "TIMEOUT";
  if (/connection|network|tls|certificate|resolve|no such host/i.test(output)) return "NETWORK";
  return "UNKNOWN";
}

function run(command, args, { cwd = ROOT, env = safeEnvironment(), ...options } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
    const pullCause = classifyPinPullFailure(output, result.error?.code);
    const code = command === "az" ? "NATIVE_REGISTRY_ACCESS_UNAVAILABLE" : command === "docker" && args[0] === "pull" ? `NATIVE_PINNED_IMAGE_PULL_FAILED_${pullCause}` : command === "docker" && args[0] === "login" ? "NATIVE_REGISTRY_LOGIN_FAILED" : "HARNESS_JENKINS_ASSURANCE_COMMAND_FAILED";
    throw new Error(code);
  }
  return result.stdout?.trim() ?? "";
}

export function provisionNativeImages(platform, { runCommand = run } = {}) {
  const native = { ...nativeRuntimeImages(platform), browserDonor: nativeBrowserDonor(platform) };
  const targets = [
    ...Object.entries(native).map(([name, pin]) => ({
      name: name.toUpperCase(),
      ...pin,
      verify: (info) => assertNativeRuntimeImage(info, pin, platform),
    })),
    ...Object.entries(ccdImagePins(platform)).map(([name, pin]) => ({
      name: name.toUpperCase(),
      ...pin,
      verify: (info) => assertCcdImageIdentity(info, pin, platform),
    })),
  ];
  let registryDirectory;
  const cleanup = () => {
    if (!registryDirectory) return;
    fs.rmSync(registryDirectory, { recursive: true, force: true });
    assert(
      !fs.existsSync(registryDirectory),
      "NATIVE_REGISTRY_CREDENTIAL_CLEANUP_REQUIRED",
    );
  };
  const onSignal = () => {
    try {
      cleanup();
    } finally {
      process.exit(2);
    }
  };
  try {
    for (const pin of new Map(
      targets.map((pin) => [pin.reference, pin]),
    ).values()) {
      let cached;
      try {
        cached = JSON.parse(
          runCommand("docker", ["image", "inspect", pin.reference]),
        );
      } catch {
        /* Missing images are provisioned by immutable reference. */
      }
      if (cached) {
        assert.equal(cached.length, 1);
        pin.verify(cached[0]);
        continue;
      }
      assert.equal(
        platform,
        "linux/amd64",
        "HARNESS_ARM64_PINNED_CACHE_REQUIRED",
      );
      if (
        pin.reference.startsWith("hmctsprod.azurecr.io/") &&
        !registryDirectory
      ) {
        if (process.env.CI === "true") {
          const context = process.env.AZURE_CONFIG_DIR;
          assert(
            typeof context === "string" &&
              path.isAbsolute(context) &&
              fs.realpathSync(context) === context &&
              fs.statSync(context).isDirectory(),
            "NATIVE_EXISTING_AZURE_CONTEXT_REQUIRED",
          );
        }
        const access = JSON.parse(
          runCommand(
            "az",
            [
              "acr",
              "login",
              "--name",
              "hmctsprod",
              "--expose-token",
              "--output",
              "json",
              "--only-show-errors",
            ],
            {
              env: safeEnvironment(
                process.env.AZURE_CONFIG_DIR
                  ? { AZURE_CONFIG_DIR: process.env.AZURE_CONFIG_DIR }
                  : {},
              ),
              timeout: 120_000,
            },
          ),
        );
        assert(
          access.loginServer === "hmctsprod.azurecr.io" &&
            typeof access.accessToken === "string" &&
            access.accessToken.length > 0,
          "NATIVE_REGISTRY_ACCESS_REQUIRED",
        );
        registryDirectory = fs.mkdtempSync(
          path.join(fs.realpathSync(os.tmpdir()), "harness-registry-"),
        );
        assertPrivateDirectory(registryDirectory);
        process.once("SIGTERM", onSignal);
        process.once("SIGINT", onSignal);
        runCommand(
          "docker",
          [
            "login",
            "hmctsprod.azurecr.io",
            "--username",
            "00000000-0000-0000-0000-000000000000",
            "--password-stdin",
          ],
          {
            env: safeEnvironment({ DOCKER_CONFIG: registryDirectory }),
            input: access.accessToken,
            timeout: 120_000,
          },
        );
      }
      try {
        runCommand("docker", ["pull", "--platform", platform, pin.reference], {
          env: safeEnvironment(
            registryDirectory ? { DOCKER_CONFIG: registryDirectory } : {},
          ),
          timeout: 900_000,
        });
      } catch (error) {
        throw new Error(`NATIVE_${pin.name}_${controlledFailureCode(error.message, "PINNED_IMAGE_PULL_FAILED_UNKNOWN")}`);
      }
      const inspected = JSON.parse(
        runCommand("docker", ["image", "inspect", pin.reference]),
      );
      assert.equal(inspected.length, 1);
      pin.verify(inspected[0]);
    }
  } finally {
    try {
      cleanup();
    } finally {
      process.removeListener("SIGTERM", onSignal);
      process.removeListener("SIGINT", onSignal);
    }
  }
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

export async function prepareBrowserCache(privateRoot, platform, { runCommand = run } = {}) {
  assertPrivateDirectory(privateRoot);
  const donor = nativeBrowserDonor(platform);
  const inspected = JSON.parse(runCommand("docker", ["image", "inspect", donor.reference]));
  assert.equal(inspected.length, 1, "NATIVE_BROWSER_DONOR_IDENTITY_REQUIRED");
  assertNativeRuntimeImage(inspected[0], donor, platform);
  const playwrightVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules/playwright-core/package.json"))).version;
  const browsers = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules/playwright-core/browsers.json")));
  assert.equal(playwrightVersion, "1.65.0", "NATIVE_BROWSER_DONOR_VERSION_MISMATCH");
  const revision = browsers.browsers.find(item => item.name === "chromium-headless-shell")?.revision;
  assert.equal(revision, "1254", "NATIVE_BROWSER_DONOR_REVISION_MISMATCH");
  const browserCache = path.join(privateRoot, "browser-cache");
  fs.mkdirSync(browserCache, { mode: 0o700 });
  runCommand(
    "docker",
    [
      "run",
      "--rm",
      "--user",
      `${process.getuid()}:${process.getgid()}`,
      "--name",
      `harness-native-ci-browser-${randomUUID()}`,
      "--network",
      "none",
      "--platform",
      platform,
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
      donor.reference,
      "-c",
      "cp -a --no-preserve=ownership /ms-playwright/. /browser/",
    ],
  );
  // The enclosing job stays private; stable root execute bits survive Docker Desktop bind mounts.
  fs.chmodSync(browserCache, 0o755);
  assert(fs.realpathSync(browserCache) === browserCache && fs.statSync(browserCache).uid === process.getuid(), "NATIVE_BROWSER_CACHE_OWNER_REQUIRED");
  assertPrivateDirectory(privateRoot);
  assert(fs.readdirSync(browserCache).length > 0, "NATIVE_BROWSER_CACHE_REQUIRED");
  const executable = browserExecutable(browsers, platform);
  const executablePath = path.join(browserCache, executable);
  assert.equal(fs.realpathSync(executablePath), executablePath, "NATIVE_BROWSER_EXECUTABLE_ALIAS");
  const info = fs.lstatSync(executablePath);
  assert(info.isFile() && (info.mode & 0o111) !== 0, "NATIVE_BROWSER_EXECUTABLE_REQUIRED");
  const header = Buffer.alloc(20), fd = fs.openSync(executablePath, "r");
  try {
    assert.equal(fs.readSync(fd, header, 0, header.length, 0), header.length, "NATIVE_BROWSER_EXECUTABLE_REQUIRED");
  } finally { fs.closeSync(fd); }
  assert(header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) &&
    header.readUInt16LE(18) === (platform === "linux/arm64" ? 183 : 62), "NATIVE_BROWSER_PLATFORM_MISMATCH");
  writePrivateJob(path.join(privateRoot, "browser-cache-receipt.json"), {
    kind: "browser-cache-preparation", donor, platform, playwrightVersion, revision, executable, executableBytes: info.size,
    cacheDigest: await digestCandidateTree(browserCache),
  });
  return browserCache;
}

async function prepareJob(privateRoot, platform) {
  const source = path.join(privateRoot, "webapp-source");
  const candidate = path.join(privateRoot, "candidate");
  const output = path.join(privateRoot, "native-output");
  const jobPath = path.join(privateRoot, "job-input.json");
  // Provisioning supplies only paths. Invalid specified inputs fail before builds;
  // unsupported fixed source toolchains remain visible as NOT_RUN in assurance.
  const complex=prepareComplexAdmissionInputs(process.env.HARNESS_COMPLEX_SOURCE_INPUTS);
  let complexSourceInputs;
  if(complex.inputs){complexSourceInputs=path.join(privateRoot,'complex-source-inputs.json');writePrivateJob(complexSourceInputs,complex.inputs);}


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
          cpu: [platform === "linux/amd64" ? "x64" : "arm64"],
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
        env: safeEnvironment({ YARN_ENABLE_NETWORK: "1", YARN_ENABLE_SCRIPTS: "0", YARN_GLOBAL_FOLDER: path.join(privateRoot, "yarn-global") }),
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
      "--platform",
      platform,
    ],
    { stdio: "inherit", timeout: 1_800_000 },
  );
  const candidateManifest = path.join(candidate, "candidate-artifact.json");
  const artifact = await verifyCandidateArtifact(candidateManifest);
  assert.equal(artifact.identity.webappCommit, commit, "WEBAPP_CANDIDATE_COMMIT_MISMATCH");

  stage = "matching browser cache";
  const browserCache = await prepareBrowserCache(privateRoot, platform);
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
  return { jobPath, output, complexSourceInputs };
}

export function publishSummary(privateOutput, assuranceExitCode = 0) {
  const source = path.join(privateOutput, "public/release-assurance-summary.json");
  const info = fs.lstatSync(source);
  assert(info.isFile() && !info.isSymbolicLink() && fs.realpathSync(source) === source);
  const summary = validatePublicSummary(source);
  assert([0,1,2].includes(assuranceExitCode),'ASSURANCE_EXIT_REQUIRED');
  const exitCode=Math.max({PASS:0,FAIL:1,BLOCKED:2}[summary.status],assuranceExitCode),status=['PASS','FAIL','BLOCKED'][exitCode];
  writePublicSummary(PUBLIC,{status,exitCode},exitCode===0&&summary.receiptAvailable);
  assert.equal(validatePublicSummary(PUBLIC).status,status);
  return status;
}

function reportIsValid() {
  const result = spawnSync(
    process.execPath,
    ["scripts/manage-harness-public-reports.cjs", "--validate"],
    { cwd: ROOT, env: safeEnvironment(), stdio: "ignore" },
  );
  return !result.error && result.status === 0;
}

function controlledFailureCode(message, fallback) {
  const firstLine = typeof message === "string" ? message.split("\n", 1)[0] : "";
  return /^[A-Z][A-Z0-9_]{0,199}$/.test(firstLine) ? firstLine : fallback;
}

export function logNativeCompletion(output) {
  try {
    const result = JSON.parse(
      fs.readFileSync(path.join(output, "private/ci-result.json"), "utf8"),
    );
    const allowed = new Set(["family", "scope", "ccd", "eventCapability", "routing", "recipientCallback", "selectorEventRow"]);
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
      stopReason = `; stop reason ${formatNativeFailure(failure.diagnostic ?? classifyNativeFailure(failure))}`;
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

export function createPreparationTimingSnapshot({clock = () => performance.now(), startedAt = new Date().toISOString()} = {}) {
  const start = clock(); let sampled = false;
  return () => {
    assert(!sampled, 'HARNESS_PREPARATION_TIMING_INVALID'); sampled = true;
    const end = clock(), elapsed = end-start;
    assert(Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(elapsed) && elapsed >= 0 && Number.isSafeInteger(Math.round(elapsed)), 'HARNESS_PREPARATION_TIMING_INVALID');
    const timing = {schemaVersion:2,scope:'harness-preparation-start-to-report-snapshot',clock:'monotonic',startedAt,elapsedMs:Math.round(elapsed)};
    Reporter.validateAssuranceTiming(timing); return timing;
  };
}

export function runTimedAssuranceChild(jobPath, {snapshotAssuranceTiming, enableStCic = false, env = safeEnvironment(), forkChild = fork, signals = process, withdraw = () => Reporter.resetPublicReport('harness'), buildSelfCheckHeld} = {}) {
  assert(typeof snapshotAssuranceTiming === 'function', 'HARNESS_PREPARATION_TIMING_REQUIRED');
  assert(typeof enableStCic === 'boolean', 'HARNESS_ST_CIC_ENABLE_REQUIRED');
  const token = randomUUID();
  const child = forkChild('scripts/run-harness-assurance.mjs', ['--input',jobPath,'--parent-timing',...(enableStCic ? ['--st-cic'] : []),...(buildSelfCheckHeld===undefined?[]:['--build-self-check-held',buildSelfCheckHeld.path,'--build-self-check-digest',buildSelfCheckHeld.digest])], {execPath:process.execPath,execArgv:[],cwd:ROOT,env,stdio:['inherit','inherit','inherit','ipc']});
  return new Promise((resolve,reject) => {
    let state = 'ready', failed = false, cancelling = false;
    const cancel = signal => { failed = true; if (!cancelling) { cancelling = true; child.kill(signal); } };
    const interrupt = () => cancel('SIGINT'), terminate = () => cancel('SIGTERM');
    const fail = () => cancel('SIGTERM');
    const timer = setTimeout(fail, 5 * 1000);
    const send = value => { try { child.send(value, error => { if (error) fail(); }); } catch { fail(); } };
    const message = value => {
      try {
        if (state === 'ready') {
          assert.deepEqual(Object.keys(value ?? {}).sort(),['kind']); assert.equal(value.kind,'harness-preparation-ready');
          clearTimeout(timer); state='snapshot'; send({kind:'harness-preparation-init',token});
        } else {
          assert.equal(state,'snapshot'); assert.deepEqual(Object.keys(value ?? {}).sort(),['kind','token']);
          assert.equal(value.kind,'harness-preparation-snapshot'); assert.equal(value.token,token);
          state='complete'; send({kind:'harness-preparation-timing',token,timing:snapshotAssuranceTiming()});
        }
      } catch { fail(); }
    };
    const disconnected = () => { if(state !== 'complete') fail(); };
    child.on('message',message); child.on('error',fail); child.on('disconnect',disconnected);
    signals.on('SIGINT',interrupt); signals.on('SIGTERM',terminate);
    child.once('close',(code,signal) => {
      clearTimeout(timer); child.removeListener('message',message); child.removeListener('error',fail); child.removeListener('disconnect',disconnected);
      signals.removeListener('SIGINT',interrupt); signals.removeListener('SIGTERM',terminate);
      if (failed || state !== 'complete' || signal) { try { withdraw(); resolve({status:2,signal}); } catch { reject(new Error('HARNESS_TIMING_WITHDRAWAL_FAILED')); } }
      else resolve({status:code,signal});
    });
  });
}

async function main({requireBuildSelfChecks=false}={}) {
  const snapshotAssuranceTiming = createPreparationTimingSnapshot();
  assert.equal(process.cwd(), ROOT, "HARNESS_REPOSITORY_CWD_REQUIRED");
  const inheritedUmask = process.umask(0o077);
  Reporter.resetPublicReport("harness");
  const publicDirectory = path.dirname(PUBLIC);
  fs.mkdirSync(publicDirectory, { recursive: true, mode: 0o700 });
  assert.equal(fs.realpathSync(publicDirectory), publicDirectory, "HARNESS_PUBLIC_DIRECTORY_REQUIRED");
  writePublicSummary(PUBLIC, { status: "BLOCKED", exitCode: 2 });

  let privateRoot,buildSelfCheckHeld,selfChecksInvalid=false;
  let exitCode = 2;
  try {
    if(requireBuildSelfChecks){stage='Build self-check evidence';try{buildSelfCheckHeld=holdBuildSelfChecks({required:true});}catch(error){selfChecksInvalid=true;throw error;}}
    privateRoot = createPrivateJobDirectory();
    // Preserve the existing shell preparation permissions; private work resumes at 077.
    process.umask(inheritedUmask);
    try {
      stage = "worker observation";
      run(process.execPath, ['scripts/observe-harness-worker.mjs'], {env:process.env});
      stage = "host Chromium preparation";
      run('corepack', ['yarn','test:setup:playwright-install-chromium'], {env:process.env,stdio:'inherit'});
      run(process.execPath, ['scripts/verify-playwright-browsers.cjs','chromium'], {env:process.env,stdio:'inherit'});
    } finally { process.umask(0o077); }
    stage = "native worker platform";
    const platform = assertNativeWorkerPlatform();
    stage = "pinned runtime provisioning";
    provisionNativeImages(platform);
    const { jobPath, output, complexSourceInputs } = await prepareJob(privateRoot, platform);
    stage = "native candidate and CCD pilots";
    const result = await runTimedAssuranceChild(jobPath, {
      // Enable only after the exact producer has passed profile qualification.
      enableStCic: false,
      snapshotAssuranceTiming,
      buildSelfCheckHeld,
      env: safeEnvironment(complexSourceInputs?{HARNESS_COMPLEX_SOURCE_INPUTS:complexSourceInputs}:{}),
    });
    exitCode = result.error || result.status === null ? 2 : result.status;
    logNativeCompletion(output);
    stage = "validated summary publication";
    try {
      const summaryStatus = publishSummary(output, exitCode);
      if (exitCode === 0 && summaryStatus !== "PASS") exitCode = 2;
    } catch {
      console.error("[harness-assurance] No validated native summary was available; release approval remains blocked.");
      writePublicSummary(PUBLIC, { status: "BLOCKED", exitCode: 2 });
      exitCode = Math.max(exitCode, 2);
    }
  } catch (error) {
    const reason = controlledFailureCode(error.message, "HARNESS_NATIVE_PREPARATION_FAILED");
    if (privateRoot) {
      assertPrivateDirectory(privateRoot);
      writePrivateJob(path.join(privateRoot, "preparation-error.json"), { stage, reason });
    }
    console.error(`[harness-assurance] BLOCKED during ${stage}; reason ${reason}; release approval remains unavailable.`);
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
  if(buildSelfCheckHeld!==undefined){try{readHeldBuildSelfChecks(buildSelfCheckHeld);}catch{selfChecksInvalid=true;}}
  if(selfChecksInvalid){Reporter.resetPublicReport('harness');writePublicSummary(PUBLIC,{status:'BLOCKED',exitCode:2});return 2;}
  if (!reportIsValid()) {
    console.error("[harness-assurance] Combined Odhín report unavailable; generating diagnostics-only coverage.");
    const fallback = spawnSync(
      process.execPath,
      ["scripts/run-harness-local-poc.mjs", "--ci", "--odhin",...(buildSelfCheckHeld===undefined?[]:["--build-self-check="+buildSelfCheckHeld.path,"--build-self-check-sha256="+buildSelfCheckHeld.digest])],
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args.length>1||args.some(arg=>arg!=='--require-build-self-checks')){console.error('[harness-assurance] Invalid arguments.');process.exitCode=2;}
  else process.exitCode=await main({requireBuildSelfChecks:args.includes('--require-build-self-checks')});
}
