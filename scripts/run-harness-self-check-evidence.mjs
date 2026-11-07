import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createHash, randomUUID } from "node:crypto";
import { terminateOwnedChild } from "./lib/exui-candidate-runtime.mjs";
import { validateSelfCheckOutcome } from "./harness-self-check-reporter.mjs";
const root = fs.realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const reporter = "scripts/harness-self-check-reporter.mjs",
  collector = "scripts/run-harness-self-check-evidence.mjs",
  fixedPortHelper = "scripts/fixtures/exui-self-check-fixed-port-lock.cjs";
const hash = (bytes) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
const fail = "HARNESS_SELF_CHECK_EVIDENCE_INVALID";
function sourceSnapshot(files) {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  assert(/^[a-f0-9]{40}$/.test(commit), fail);
  const state = execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
    ? "modified"
    : "clean";
  const entries = [
    ...files,
    reporter,
    collector,
    fixedPortHelper,
    "package.json",
    ".gitignore",
    "scripts/fixtures/harness-unit-files.json",
  ].map((name) => {
    const file = path.join(root, name);
    assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, fail);
    return [name, hash(fs.readFileSync(file))];
  });
  return {
    commit,
    state,
    scope: "selected-tests-and-collector",
    selectionDigest: hash(JSON.stringify(entries)),
    entries,
  };
}
// Component API only: explicit source-owned files; no default suite or CI publication.
export async function collectNodeSelfCheckEvidence({
  files,
  output,
  signal,
  testConcurrency = 1,
}) {
  const started = performance.now(),
    startedAt = new Date().toISOString();
  assert(process.versions.node.split(".")[0] === "24", fail);
  assert(!signal?.aborted, fail);
  assert(testConcurrency === 1 || testConcurrency === 2, fail);
  assert(
    Array.isArray(files) &&
      files.length > 0 &&
      new Set(files).size === files.length &&
      files.every(
        (file) =>
          /^scripts\/(?:[a-z0-9._-]+\/)*[a-z0-9._-]+\.cjs$/i.test(file) &&
          !file.split("/").includes(".."),
      ),
    fail,
  );
  assert(
    typeof output === "string" &&
      path.isAbsolute(output) &&
      path.resolve(output) === output &&
      fs.realpathSync(path.dirname(output)) === path.dirname(output),
    fail,
  );
  const external =
    output !== root &&
    !output.startsWith(root + path.sep) &&
    !root.startsWith(output + path.sep);
  assert(
    external ||
      (path.dirname(output) === buildPrivateRoot() &&
        /^run-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          path.basename(output),
        )),
    fail,
  );
  const before = sourceSnapshot(files);
  fs.mkdirSync(output, { mode: 0o700 });
  fs.chmodSync(output, 0o700);
  const fixedPortDirectory = path.join(output, "fixed-port-lock");
  fs.mkdirSync(fixedPortDirectory, { mode: 0o700 });
  fs.chmodSync(fixedPortDirectory, 0o700);
  const save = (name, value) =>
    fs.writeFileSync(
      path.join(output, name),
      JSON.stringify(value, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
  const runId = "self-check-" + randomUUID();
  save("source-input.json", {
    runId,
    nodeVersion: process.version,
    ...(testConcurrency === 2 ? { testConcurrency } : {}),
    files,
    before,
  });
  const summaryPath = path.join(output, "structured-summary.json"),
    junitPath = path.join(output, "raw-junit.xml");
  const out = fs.openSync(summaryPath, "wx", 0o600),
    err = fs.openSync(path.join(output, "stderr.log"), "wx", 0o600),
    junit = fs.openSync(junitPath, "wx", 0o600);
  fs.closeSync(junit);
  let child, stop, terminal, rejectTermination;
  const terminationFailure = new Promise((resolve, reject) => {
    rejectTermination = reject;
  });
  const abort = () => {
    stop ??= terminateOwnedChild(child).catch(() => {
      rejectTermination(new Error(fail));
      return { observed: false, forced: true };
    });
  };
  try {
    child = spawn(
      process.execPath,
      [
        "--test",
        "--test-concurrency=" + testConcurrency,
        "--test-reporter=" + path.join(root, reporter),
        "--test-reporter-destination=stdout",
        "--test-reporter=junit",
        "--test-reporter-destination=" + junitPath,
        ...files,
      ],
      {
        cwd: root,
        stdio: ["ignore", out, err],
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          HARNESS_SELF_CHECK_FIXED_PORT_LOCK: fixedPortDirectory,
        },
      },
    );
    const observed = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, endedSignal) =>
        resolve({ code, signal: endedSignal }),
      );
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    terminal = await Promise.race([observed, terminationFailure]);
    if (stop) {
      const stopped = await stop;
      assert(stopped.observed, fail);
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    fs.closeSync(out);
    fs.closeSync(err);
  }
  const observedTerminal = {
    started: true,
    observed: true,
    forced: stop ? (await stop).forced : false,
    cancelled: signal?.aborted ?? false,
    ...terminal,
  };
  // Uncertain cleanup cannot release the fixture lease or publish successful evidence.
  ownedDirectory(fixedPortDirectory);
  assert(fs.readdirSync(fixedPortDirectory).length === 0, fail);
  let summary;
  try {
    assert(fs.statSync(summaryPath).size <= 16 * 1024, fail);
    summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  } catch {
    summary = { complete: false, reason: "SUMMARY_MISSING" };
  }
  const after = sourceSnapshot(files),
    unchanged =
      JSON.stringify(sourceBinding(before)) ===
      JSON.stringify(sourceBinding(after));
  const outcome = validateSelfCheckOutcome(
    summary,
    observedTerminal,
    files.length,
  );
  const { entries, ...source } = before;
  const result = {
    schemaVersion: 1,
    kind: "harness-self-check-evidence",
    runId,
    ...outcome,
    ...(!unchanged ? { status: "incomplete", reason: "SOURCE_CHANGED" } : {}),
    source,
    sourceUnchanged: unchanged,
    nodeVersion: process.version,
    selectedFiles: files.length,
    startedAt,
    clock: "monotonic",
    timingScope: "collector-entry-to-evidence-snapshot",
    wallDurationMs: performance.now() - started,
    terminal: observedTerminal,
    countSemantics:
      "Node test counts include parent tests; suites and topLevel are non-additive.",
    artifacts: {
      junit: "raw-junit.xml",
      summary: "structured-summary.json",
      stderr: "stderr.log",
    },
    runtimeAcceptance: false,
    catalogueCredit: false,
    releaseApproval: false,
  };
  save("self-check-evidence.json", result);
  return result;
}

const privateName = ".harness-build-self-check";
const unitList = "scripts/fixtures/harness-unit-files.json";
const rawNames = [
  "source-input.json",
  "self-check-evidence.json",
  "structured-summary.json",
  "raw-junit.xml",
  "stderr.log",
];
const exact = (value, names) =>
  assert(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join() === names.slice().sort().join(),
    fail,
  );
const same = (a, b) => assert.deepEqual(a, b, fail);
function ownedDirectory(file) {
  const stat = fs.lstatSync(file);
  assert(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      fs.realpathSync(file) === file &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o077) === 0,
    fail,
  );
  return file;
}
function ownedBytes(file, limit = 1024 * 1024) {
  const stat = fs.lstatSync(file);
  assert(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o077) === 0 &&
      stat.size <= limit &&
      fs.realpathSync(file) === file,
    fail,
  );
  return fs.readFileSync(file);
}
function buildPrivateRoot(create = false) {
  const file = path.join(root, privateName),
    ignore = path.join(root, ".gitignore");
  assert(
    fs.realpathSync(ignore) === ignore &&
      fs.lstatSync(ignore).isFile() &&
      fs
        .readFileSync(ignore, "utf8")
        .split(/\r?\n/)
        .includes("/" + privateName + "/"),
    fail,
  );
  assert(
    execFileSync("git", ["ls-files", "--", privateName], {
      cwd: root,
      encoding: "utf8",
    }).trim() === "",
    fail,
  );
  if (create && !fs.existsSync(file)) fs.mkdirSync(file, { mode: 0o700 });
  return ownedDirectory(file);
}
export function readConfiguredUnitFiles() {
  const file = path.join(root, unitList);
  assert(fs.realpathSync(file) === file && fs.lstatSync(file).isFile(), fail);
  const files = JSON.parse(fs.readFileSync(file));
  assert(
    Array.isArray(files) &&
      files.length > 0 &&
      new Set(files).size === files.length &&
      files.every(
        (name) =>
          typeof name === "string" &&
          /^scripts\/(?:[a-z0-9._-]+\/)*[a-z0-9._-]+\.cjs$/i.test(name) &&
          !name.split("/").includes(".."),
      ),
    fail,
  );
  assert(
    files.filter(
      (name) => name === "scripts/verify-playwright-pipeline.test.cjs",
    ).length === 1,
    fail,
  );
  return files;
}
export function selfCheckBuildIdentity(env = process.env) {
  const values = [env.JOB_NAME, env.BUILD_NUMBER, env.BUILD_TAG];
  if (values.every((value) => value === undefined)) return { kind: "local" };
  assert(
    values.every(
      (value) =>
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= 256 &&
        !/[\r\n\0]/.test(value),
    ) && /^[1-9][0-9]*$/.test(env.BUILD_NUMBER),
    fail,
  );
  return {
    kind: "jenkins",
    jobName: env.JOB_NAME,
    buildNumber: env.BUILD_NUMBER,
    buildTag: env.BUILD_TAG,
  };
}
const sourceProjection = (value) => {
  const { entries, ...source } = value;
  return source;
};
const sourceBinding = (value) => ({
  commit: value.commit,
  scope: value.scope,
  selectionDigest: value.selectionDigest,
});
function parseSummary(bytes) {
  try {
    assert(bytes.length <= 16 * 1024, fail);
    return JSON.parse(bytes);
  } catch {
    return { complete: false, reason: "SUMMARY_MISSING" };
  }
}
function validateRequest(request, expected) {
  exact(request, [
    "schemaVersion",
    "kind",
    "runId",
    "build",
    "source",
    "directory",
    "files",
  ]);
  assert(
    request.schemaVersion === 1 &&
      request.kind === "harness-build-self-check-request" &&
      /^self-check-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        request.runId,
      ),
    fail,
  );
  if (expected.build?.kind === "local") exact(expected.build, ["kind"]);
  else {
    exact(expected.build, ["kind", "jobName", "buildNumber", "buildTag"]);
    same(
      expected.build,
      selfCheckBuildIdentity({
        JOB_NAME: expected.build.jobName,
        BUILD_NUMBER: expected.build.buildNumber,
        BUILD_TAG: expected.build.buildTag,
      }),
    );
  }
  same(request.build, expected.build);
  exact(request.source, ["commit", "state", "scope", "selectionDigest"]);
  assert(["clean", "modified"].includes(request.source.state), fail);
  same(sourceBinding(request.source), sourceBinding(expected.source));
  assert(
    path.isAbsolute(request.directory) &&
      path.dirname(request.directory) === buildPrivateRoot() &&
      /^run-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        path.basename(request.directory),
      ),
    fail,
  );
  ownedDirectory(request.directory);
  exact(request.files, rawNames);
  const bytes = {};
  for (const name of rawNames) {
    assert(/^sha256:[a-f0-9]{64}$/.test(request.files[name]), fail);
    bytes[name] = ownedBytes(
      path.join(request.directory, name),
      name === "structured-summary.json" ? 16 * 1024 : 64 * 1024 * 1024,
    );
    assert(hash(bytes[name]) === request.files[name], fail);
  }
  const input = JSON.parse(bytes["source-input.json"]),
    evidence = JSON.parse(bytes["self-check-evidence.json"]),
    files = readConfiguredUnitFiles(),
    current = sourceSnapshot(files);
  exact(input, [
    "runId",
    "nodeVersion",
    "files",
    "before",
    ...(Object.hasOwn(input, "testConcurrency") ? ["testConcurrency"] : []),
  ]);
  assert(
    input.testConcurrency === undefined ||
      input.testConcurrency === 1 ||
      input.testConcurrency === 2,
    fail,
  );
  const fixedPortDirectory = path.join(request.directory, "fixed-port-lock");
  ownedDirectory(fixedPortDirectory);
  assert(fs.readdirSync(fixedPortDirectory).length === 0, fail);
  same(input.files, files);
  exact(input.before, [
    "commit",
    "state",
    "scope",
    "selectionDigest",
    "entries",
  ]);
  assert(["clean", "modified"].includes(input.before.state), fail);
  same(sourceBinding(input.before), sourceBinding(current));
  same(input.before.entries, current.entries);
  assert(
    input.runId === request.runId && input.nodeVersion === process.version,
    fail,
  );
  same(request.source, sourceProjection(input.before));
  const outcome = validateSelfCheckOutcome(
    parseSummary(bytes["structured-summary.json"]),
    evidence.terminal,
    files.length,
  );
  exact(evidence.terminal, [
    "started",
    "observed",
    "forced",
    "cancelled",
    "code",
    "signal",
  ]);
  assert(
    evidence.terminal.started === true &&
      evidence.terminal.observed === true &&
      typeof evidence.terminal.forced === "boolean" &&
      typeof evidence.terminal.cancelled === "boolean" &&
      (evidence.terminal.code === null ||
        (Number.isInteger(evidence.terminal.code) &&
          evidence.terminal.code >= 0 &&
          evidence.terminal.code <= 255)) &&
      [null, "SIGINT", "SIGTERM", "SIGKILL"].includes(evidence.terminal.signal),
    fail,
  );
  assert(
    typeof evidence.startedAt === "string" &&
      new Date(evidence.startedAt).toISOString() === evidence.startedAt &&
      Number.isFinite(evidence.wallDurationMs) &&
      evidence.wallDurationMs >= 0,
    fail,
  );
  same(evidence, {
    schemaVersion: 1,
    kind: "harness-self-check-evidence",
    runId: request.runId,
    ...outcome,
    source: sourceProjection(input.before),
    sourceUnchanged: true,
    nodeVersion: process.version,
    selectedFiles: files.length,
    startedAt: evidence.startedAt,
    clock: "monotonic",
    timingScope: "collector-entry-to-evidence-snapshot",
    wallDurationMs: evidence.wallDurationMs,
    terminal: evidence.terminal,
    countSemantics:
      "Node test counts include parent tests; suites and topLevel are non-additive.",
    artifacts: {
      junit: "raw-junit.xml",
      summary: "structured-summary.json",
      stderr: "stderr.log",
    },
    runtimeAcceptance: false,
    catalogueCredit: false,
    releaseApproval: false,
  });
  return {
    schemaVersion: 1,
    kind: "harness-build-self-checks",
    runId: evidence.runId,
    status: evidence.status,
    reason: evidence.reason,
    nodeVersion: evidence.nodeVersion,
    selectedFiles: evidence.selectedFiles,
    source: evidence.source,
    counts: evidence.counts,
    nodeDurationMs: evidence.nodeDurationMs,
    wallDurationMs: evidence.wallDurationMs,
    evidenceDigest: request.files["self-check-evidence.json"],
    junitDigest: request.files["raw-junit.xml"],
    runtimeAcceptance: false,
    catalogueCredit: false,
    releaseApproval: false,
  };
}
export async function runConfiguredSelfChecks({
  signal,
  testConcurrency = 1,
} = {}) {
  const directory = buildPrivateRoot(true),
    requestPath = path.join(directory, "current-request.json");
  if (fs.existsSync(requestPath)) {
    ownedBytes(requestPath);
    fs.unlinkSync(requestPath);
  }
  const files = readConfiguredUnitFiles(),
    output = path.join(directory, "run-" + randomUUID()),
    build = selfCheckBuildIdentity();
  const evidence = await collectNodeSelfCheckEvidence({
    files,
    output,
    signal,
    testConcurrency,
  });
  if (evidence.sourceUnchanged) {
    const request = {
      schemaVersion: 1,
      kind: "harness-build-self-check-request",
      runId: evidence.runId,
      build,
      source: evidence.source,
      directory: output,
      files: Object.fromEntries(
        rawNames.map((name) => [
          name,
          hash(ownedBytes(path.join(output, name), 64 * 1024 * 1024)),
        ]),
      ),
    };
    validateRequest(request, {
      build,
      source: sourceProjection(sourceSnapshot(files)),
    });
    const temporary = path.join(directory, "request-" + randomUUID() + ".tmp");
    fs.writeFileSync(temporary, JSON.stringify(request) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(temporary, requestPath);
  }
  return evidence;
}
export function holdBuildSelfChecks({
  required = false,
  env = process.env,
} = {}) {
  try {
    const build = selfCheckBuildIdentity(env);
    if (required) assert(build.kind === "jenkins", fail);
    if (!required && !fs.existsSync(path.join(root, privateName)))
      return undefined;
    const directory = buildPrivateRoot(),
      requestPath = path.join(directory, "current-request.json");
    if (!fs.existsSync(requestPath)) {
      assert(!required, fail);
      return undefined;
    }
    const bytes = ownedBytes(requestPath),
      request = JSON.parse(bytes),
      expected = {
        build,
        source: sourceProjection(sourceSnapshot(readConfiguredUnitFiles())),
      };
    validateRequest(request, expected);
    const value = {
      schemaVersion: 1,
      kind: "harness-build-self-check-held",
      requestPath,
      requestDigest: hash(bytes),
      runId: request.runId,
      expected,
    };
    const file = path.join(directory, "held-" + randomUUID() + ".json"),
      held = Buffer.from(JSON.stringify(value) + "\n");
    fs.writeFileSync(file, held, { flag: "wx", mode: 0o600 });
    return { path: file, digest: hash(held) };
  } catch {
    throw Error(fail);
  }
}
export function readHeldBuildSelfChecks(held) {
  try {
    exact(held, ["path", "digest"]);
    assert(
      path.dirname(held.path) === buildPrivateRoot() &&
        /^held-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/.test(
          path.basename(held.path),
        ),
      fail,
    );
    const bytes = ownedBytes(held.path);
    assert(hash(bytes) === held.digest, fail);
    const value = JSON.parse(bytes);
    exact(value, [
      "schemaVersion",
      "kind",
      "requestPath",
      "requestDigest",
      "runId",
      "expected",
    ]);
    assert(
      value.schemaVersion === 1 &&
        value.kind === "harness-build-self-check-held" &&
        value.requestPath ===
          path.join(buildPrivateRoot(), "current-request.json"),
      fail,
    );
    exact(value.expected, ["build", "source"]);
    exact(value.expected.source, [
      "commit",
      "state",
      "scope",
      "selectionDigest",
    ]);
    assert(["clean", "modified"].includes(value.expected.source.state), fail);
    same(
      sourceBinding(value.expected.source),
      sourceBinding(
        sourceProjection(sourceSnapshot(readConfiguredUnitFiles())),
      ),
    );
    const requestBytes = ownedBytes(value.requestPath);
    assert(hash(requestBytes) === value.requestDigest, fail);
    const request = JSON.parse(requestBytes);
    assert(request.runId === value.runId, fail);
    return {
      ...validateRequest(request, value.expected),
      requestDigest: value.requestDigest,
    };
  } catch {
    throw Error(fail);
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const cancellation = new AbortController(),
    cancel = () => cancellation.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    assert(process.argv.length === 2, fail);
    const result = await runConfiguredSelfChecks({
      signal: cancellation.signal,
    });
    console.log(
      `[harness-self-checks] ${result.status}; tests ${result.counts?.tests ?? "not recorded"}; no application or release credit.`,
    );
    process.exitCode =
      result.status === "passed" ? 0 : result.status === "failed" ? 1 : 2;
  } catch {
    console.error("[harness-self-checks] Evidence incomplete.");
    process.exitCode = 2;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
