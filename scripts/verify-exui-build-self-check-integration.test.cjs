const test = require("node:test"),
  assert = require("node:assert/strict");
test("configured unit selection has one pipeline verifier and excludes generated evidence", async () => {
  const m = await import("./run-harness-self-check-evidence.mjs");
  const files = m.readConfiguredUnitFiles();
  assert.equal(
    files.filter((f) => f === "scripts/verify-playwright-pipeline.test.cjs")
      .length,
    1,
  );
  assert.equal(new Set(files).size, files.length);
  assert(!files.some((f) => f.includes(".harness-build-self-check")));
});
const fs = require("node:fs"),
  path = require("node:path");
const {
  buildSelfCheckFixture: fixture,
} = require("./fixtures/exui-build-self-check.mock.cjs");
test("one actual configured fixture run yields byte-bound held evidence and observed Node argv", async (t) => {
  const f = await fixture(t),
    result = await f.api.runConfiguredSelfChecks();
  assert.equal(result.status, "passed");
  assert.equal(result.counts.tests, 2);
  const argv = JSON.parse(fs.readFileSync(f.argvPath));
  assert.deepEqual(argv.args.slice(0, 2), ["--test", "--test-concurrency=1"]);
  assert.deepEqual(argv.args.slice(-2), f.unitFiles);
  const held = f.api.holdBuildSelfChecks(),
    observed = f.api.readHeldBuildSelfChecks(held);
  assert.equal(observed.counts.tests, 2);
  assert.equal(observed.status, "passed");
  assert.equal(observed.runtimeAcceptance, false);
  assert(!JSON.stringify(observed).includes(f.root));
  const request = path.join(f.privateRoot, "current-request.json");
  fs.appendFileSync(request, " ");
  assert.throws(
    () => f.api.readHeldBuildSelfChecks(held),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});
test("failed configured units retain failed evidence without reporting success", async (t) => {
  const f = await fixture(t, { failed: true }),
    result = await f.api.runConfiguredSelfChecks();
  assert.equal(result.status, "failed");
  assert.equal(result.counts.failed, 1);
  assert.equal(
    f.api.readHeldBuildSelfChecks(f.api.holdBuildSelfChecks()).status,
    "failed",
  );
});
test("required Jenkins context cannot use local or foreign build evidence", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  assert.throws(
    () => f.api.holdBuildSelfChecks({ required: true, env: {} }),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
  assert.throws(
    () =>
      f.api.holdBuildSelfChecks({
        required: true,
        env: { JOB_NAME: "foreign", BUILD_NUMBER: "3", BUILD_TAG: "foreign-3" },
      }),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});
test("only fixed canonical private output exception succeeds; aliases and stale child paths reject", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  const output = path.join(f.root, "arbitrary");
  await assert.rejects(
    f.api.collectNodeSelfCheckEvidence({ files: f.unitFiles, output }),
  );
  assert(!fs.existsSync(output));
  const request = JSON.parse(
    fs.readFileSync(path.join(f.privateRoot, "current-request.json")),
  );
  await assert.rejects(
    f.api.collectNodeSelfCheckEvidence({
      files: f.unitFiles,
      output: request.directory,
    }),
  );
});

test("Git state is descriptive while selected input and HEAD bindings remain strict", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  fs.writeFileSync(path.join(f.root, "unrelated-note"), "not selected");
  const held = f.api.holdBuildSelfChecks();
  assert.equal(f.api.readHeldBuildSelfChecks(held).status, "passed");
  fs.appendFileSync(
    path.join(f.root, f.unitFiles[1]),
    "\n// changed selected input",
  );
  assert.throws(
    () => f.api.readHeldBuildSelfChecks(held),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});
test("failed new startup retires current request instead of falling back to old pass", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    f.api.runConfiguredSelfChecks({ signal: controller.signal }),
  );
  assert.equal(f.api.holdBuildSelfChecks(), undefined);
});
test("actual public-report and worker reset callers preserve the held private unit bytes", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  const held = f.api.holdBuildSelfChecks(),
    before = fs.readFileSync(path.join(f.privateRoot, "current-request.json"));
  const { execFileSync } = require("node:child_process");
  execFileSync(
    process.execPath,
    [path.resolve("scripts/manage-harness-public-reports.cjs"), "--reset"],
    {
      cwd: f.root,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      stdio: "pipe",
    },
  );
  const worker = await import("./observe-harness-worker.mjs");
  worker.resetCapabilityReport(f.root);
  assert.deepEqual(
    fs.readFileSync(path.join(f.privateRoot, "current-request.json")),
    before,
  );
  assert.equal(f.api.readHeldBuildSelfChecks(held).status, "passed");
});

test("same Jenkins Build can hold evidence; another Build cannot relabel it", async (t) => {
  const f = await fixture(t),
    keys = ["JOB_NAME", "BUILD_NUMBER", "BUILD_TAG"];
  const before = keys.map((key) => process.env[key]);
  Object.assign(process.env, {
    JOB_NAME: "synthetic-build",
    BUILD_NUMBER: "12",
    BUILD_TAG: "synthetic-build-12",
  });
  t.after(() =>
    keys.forEach((key, index) =>
      before[index] === undefined
        ? delete process.env[key]
        : (process.env[key] = before[index]),
    ),
  );
  await f.api.runConfiguredSelfChecks();
  const held = f.api.holdBuildSelfChecks({ required: true });
  assert.equal(f.api.readHeldBuildSelfChecks(held).status, "passed");
  assert.throws(
    () =>
      f.api.holdBuildSelfChecks({
        required: true,
        env: { ...process.env, BUILD_NUMBER: "13" },
      }),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});

test("coherently resealed outcome cannot replace actual structured Node counts", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  const requestPath = path.join(f.privateRoot, "current-request.json");
  const request = JSON.parse(fs.readFileSync(requestPath));
  const evidencePath = path.join(request.directory, "self-check-evidence.json");
  const evidence = JSON.parse(fs.readFileSync(evidencePath));
  evidence.counts.tests++;
  evidence.counts.passed++;
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  request.files["self-check-evidence.json"] =
    "sha256:" +
    require("node:crypto")
      .createHash("sha256")
      .update(fs.readFileSync(evidencePath))
      .digest("hex");
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(
    () => f.api.holdBuildSelfChecks(),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});

test("private root permissions and request symlinks reject before attachment", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  fs.chmodSync(f.privateRoot, 0o755);
  assert.throws(
    () => f.api.holdBuildSelfChecks(),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
  fs.chmodSync(f.privateRoot, 0o700);
  const current = path.join(f.privateRoot, "current-request.json"),
    moved = path.join(f.privateRoot, "saved-request.json");
  fs.renameSync(current, moved);
  fs.symlinkSync(moved, current);
  assert.throws(
    () => f.api.holdBuildSelfChecks(),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});

test("actual timed parent forwards only explicit held receipt flags to the assurance child", async () => {
  const { runTimedAssuranceChild } =
    await import("./run-harness-jenkins-assurance.mjs");
  const { EventEmitter } = require("node:events");
  for (const held of [
    undefined,
    {
      path: "/private/tmp/synthetic-held.json",
      digest: "sha256:" + "a".repeat(64),
    },
  ]) {
    const child = new EventEmitter(),
      signals = new EventEmitter();
    let called;
    child.kill = () => {
      throw Error("unexpected cancellation");
    };
    child.send = (message, done) => {
      done?.();
      queueMicrotask(() =>
        message.kind === "harness-preparation-init"
          ? child.emit("message", {
              kind: "harness-preparation-snapshot",
              token: message.token,
            })
          : child.emit("close", 0, null),
      );
    };
    const running = runTimedAssuranceChild("/private/tmp/synthetic-job.json", {
      snapshotAssuranceTiming: () => ({}),
      signals,
      env: {},
      buildSelfCheckHeld: held,
      forkChild: (file, args, options) => {
        called = { file, args, options };
        queueMicrotask(() =>
          child.emit("message", { kind: "harness-preparation-ready" }),
        );
        return child;
      },
    });
    assert.equal((await running).status, 0);
    assert.deepEqual(called.args, [
      "--input",
      "/private/tmp/synthetic-job.json",
      "--parent-timing",
      ...(held
        ? [
            "--build-self-check-held",
            held.path,
            "--build-self-check-digest",
            held.digest,
          ]
        : []),
    ]);
    assert.deepEqual(called.options.env, {});
    assert.equal(signals.listenerCount("SIGTERM"), 0);
  }
});

test("actual diagnostics fallback forwards held bytes explicitly and rejects partial pairs before launching", (t) => {
  const os = require("node:os"),
    { spawnSync } = require("node:child_process");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "self-check-fallback-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const preload = path.join(root, "capture.mjs"),
    capture = path.join(root, "calls.json");
  fs.writeFileSync(
    preload,
    `import cp from 'node:child_process';import fs from 'node:fs';import{EventEmitter}from'node:events';import{syncBuiltinESMExports}from'node:module';cp.spawn=(command,args,options)=>{fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({command,args,heldPath:options.env.HARNESS_BUILD_SELF_CHECK_PATH,heldDigest:options.env.HARNESS_BUILD_SELF_CHECK_DIGEST}));const child=new EventEmitter();queueMicrotask(()=>child.emit('exit',0));return child;};syncBuiltinESMExports();`,
  );
  const runner = path.resolve("scripts/run-harness-local-poc.mjs"),
    digest = "sha256:" + "a".repeat(64),
    held = "/private/tmp/synthetic-held.json";
  const run = (args) =>
    spawnSync(process.execPath, ["--import", preload, runner, ...args], {
      cwd: root,
      encoding: "utf8",
      env: { PATH: process.env.PATH },
      timeout: 5000,
    });
  let result = run([
    "--ci",
    "--odhin",
    "--build-self-check=" + held,
    "--build-self-check-sha256=" + digest,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const observed = JSON.parse(fs.readFileSync(capture));
  assert.equal(observed.heldPath, held);
  assert.equal(observed.heldDigest, digest);
  assert(observed.args.includes("--config=playwright.harness-ci.config.ts"));
  assert.match(result.stdout, /no release credit/i);
  for (const args of [
    ["--ci", "--odhin", "--build-self-check=" + held],
    [
      "--ci",
      "--build-self-check=" + held,
      "--build-self-check-sha256=" + digest,
    ],
  ]) {
    fs.rmSync(capture, { force: true });
    result = run(args);
    assert.equal(result.status, 2);
    assert(!fs.existsSync(capture));
  }
});

test("held receipt reopens actual JUnit and stderr bytes instead of trusting evidence labels", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  const held = f.api.holdBuildSelfChecks();
  const request = JSON.parse(
    fs.readFileSync(path.join(f.privateRoot, "current-request.json")),
  );
  for (const name of ["raw-junit.xml", "stderr.log"]) {
    const file = path.join(request.directory, name),
      before = fs.readFileSync(file);
    fs.appendFileSync(file, "\n");
    assert.throws(
      () => f.api.readHeldBuildSelfChecks(held),
      /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
    );
    fs.writeFileSync(file, before);
    assert.equal(f.api.readHeldBuildSelfChecks(held).status, "passed");
  }
});

test("configured self-check concurrency 2 is explicit and retains one byte-bound structured run", async (t) => {
  const f = await fixture(t);
  const result = await f.api.runConfiguredSelfChecks({ testConcurrency: 2 });
  assert.equal(result.status, "passed");
  const argv = JSON.parse(fs.readFileSync(f.argvPath));
  assert.deepEqual(argv.args.slice(0, 2), ["--test", "--test-concurrency=2"]);
  assert.deepEqual(argv.args.slice(-2), f.unitFiles);
  assert.equal(
    f.api.readHeldBuildSelfChecks(f.api.holdBuildSelfChecks()).counts.tests,
    2,
  );
});
