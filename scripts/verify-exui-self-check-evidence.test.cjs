const test = require("node:test"),
  assert = require("node:assert/strict"),
  execFileSync = require("node:child_process").execFileSync,
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { sources } = require("./fixtures/exui-self-check-evidence.mock.cjs");
const root = path.resolve(__dirname, "..");
function assertNoLiveProcess(pid) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    assert.equal(error.code, "ESRCH");
    return;
  }
  const state = execFileSync("ps", ["-o", "stat=", "-p", String(pid)], {
    encoding: "utf8",
  }).trim();
  assert(!state || state.startsWith("Z"), `process ${pid} remains active`);
}
async function run(t, name, signal, controller, testConcurrency = 1) {
  const folder = fs.mkdtempSync(
      path.join(root, "scripts/fixtures/self-check-owned-"),
    ),
    privateRoot = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "self-check-output-"),
    );
  t.after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(privateRoot, { recursive: true, force: true });
  });
  const file = path.join(folder, "scenario.cjs");
  fs.writeFileSync(file, sources[name]);
  const m = await import("./run-harness-self-check-evidence.mjs");
  let ready;
  if (controller) {
    const poll = setInterval(() => {
      const file = path.join(folder, "ready.json");
      if (fs.existsSync(file)) {
        ready = JSON.parse(fs.readFileSync(file));
        clearInterval(poll);
        controller.abort();
      }
    }, 10);
    const deadline = setTimeout(() => controller.abort(), 5000);
    t.after(() => {
      clearInterval(poll);
      clearTimeout(deadline);
    });
  }
  const output = path.join(privateRoot, "evidence"),
    result = await m.collectNodeSelfCheckEvidence({
      files: [path.relative(root, file)],
      output,
      signal,
      testConcurrency,
    });
  return { m, result, output, ready };
}
test("actual Node global summary reports one passing self-check and private JUnit, with no application credit", async (t) => {
  const { result, output } = await run(t, "passed");
  assert.equal(result.status, "passed");
  assert.equal(result.counts.tests, 1);
  assert.equal(result.counts.passed, 1);
  assert.deepEqual(result.terminal, {
    started: true,
    observed: true,
    forced: false,
    cancelled: false,
    code: 0,
    signal: null,
  });
  assert.equal(result.source.scope, "selected-tests-and-collector");
  assert.match(result.source.commit, /^[a-f0-9]{40}$/);
  assert(result.wallDurationMs >= 0);
  assert(result.nodeDurationMs >= 0);
  for (const key of ["runtimeAcceptance", "catalogueCredit", "releaseApproval"])
    assert.equal(result[key], false);
  assert.equal(fs.statSync(output).mode & 0o777, 0o700);
  assert.equal(
    fs.statSync(path.join(output, "raw-junit.xml")).mode & 0o777,
    0o600,
  );
  assert.match(
    fs.readFileSync(path.join(output, "raw-junit.xml"), "utf8"),
    /<testsuites>/,
  );
});
test("actual failures retain finite failed counts and observed nonzero terminal without exposing raw error", async (t) => {
  const { result, output } = await run(t, "failed");
  assert.equal(result.status, "failed");
  assert.equal(result.counts.failed, 1);
  assert.equal(result.terminal.code, 1);
  assert(!JSON.stringify(result).includes("PRIVATE-SELF-CHECK-CANARY"));
  assert(
    fs
      .readFileSync(path.join(output, "raw-junit.xml"), "utf8")
      .includes("PRIVATE-SELF-CHECK-CANARY"),
  );
});
test("suite and top-level measures remain separate from passed/skipped/todo test counts", async (t) => {
  const { result } = await run(t, "skipped");
  assert.equal(result.status, "passed");
  assert.deepEqual(result.counts, {
    tests: 3,
    passed: 1,
    failed: 0,
    cancelled: 0,
    skipped: 1,
    todo: 1,
    suites: 1,
    topLevel: 1,
  });
  assert.equal(
    result.countSemantics,
    "Node test counts include parent tests; suites and topLevel are non-additive.",
  );
});
test("zero declared tests and forged stdout cannot manufacture passing self-check evidence", async (t) => {
  const zero = await run(t, "zero");
  assert.equal(zero.result.status, "incomplete");
  assert.equal(zero.result.reason, "NO_DECLARED_TESTS");
  const forged = await run(t, "forged");
  assert.equal(forged.result.status, "passed");
  assert.equal(forged.result.counts.tests, 1);
});

test("owned interruption is joined and never represented as a completed pass", async (t) => {
  const controller = new AbortController();
  const { result, ready } = await run(
    t,
    "waiting",
    controller.signal,
    controller,
  );
  assert(ready, "real test body started before cancellation");
  assertNoLiveProcess(ready.pid);
  assert.equal(result.status, "incomplete");
  assert.equal(result.terminal.cancelled, true);
  assert.equal(result.terminal.observed, true);
  assert.notEqual(result.terminal.code, 0);
});
test("pure event validation rejects missing duplicate malformed contradictory summaries and ignores stdout events", async () => {
  const { summarizeNodeTestEvents, validateSelfCheckOutcome } =
    await import("./harness-self-check-reporter.mjs");
  const counts = {
    tests: 1,
    passed: 1,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    suites: 0,
    topLevel: 1,
  };
  const file = {
    type: "test:summary",
    data: {
      file: "/private/fixture.cjs",
      entryFile: "/private/fixture.cjs",
      counts,
      success: true,
      duration_ms: 1,
    },
  };
  const global = {
    type: "test:summary",
    data: { counts, success: true, duration_ms: 2 },
  };
  const collect = (events) =>
    summarizeNodeTestEvents(
      (async function* () {
        yield* events;
      })(),
    );
  for (const events of [
    [],
    [file],
    [file, global, global],
    [
      file,
      { ...global, data: { ...global.data, counts: { ...counts, passed: 2 } } },
    ],
    [file, { ...global, data: { ...global.data, duration_ms: NaN } }],
  ])
    assert.equal((await collect(events)).complete, false);
  const explicitUndefined = await collect([
    file,
    {
      ...global,
      data: { ...global.data, file: undefined, entryFile: undefined },
    },
  ]);
  assert.equal(
    explicitUndefined.complete,
    true,
    "installed Node global event retains undefined own properties",
  );
  const cancelledCounts = { ...counts, passed: 0, cancelled: 1 };
  const cancelled = await collect([
    {
      ...file,
      data: { ...file.data, counts: cancelledCounts, success: false },
    },
    {
      ...global,
      data: { ...global.data, counts: cancelledCounts, success: false },
    },
  ]);
  const cancelledOutcome = validateSelfCheckOutcome(
    cancelled,
    {
      started: true,
      code: 1,
      signal: null,
      observed: true,
      cancelled: false,
      forced: false,
    },
    ["/private/fixture.cjs"],
  );
  assert.equal(cancelledOutcome.reason, "TESTS_CANCELLED");
  assert.equal(cancelledOutcome.counts.cancelled, 1);
  const valid = await collect([
    { type: "test:stdout", data: { message: "PRIVATE-SELF-CHECK-CANARY" } },
    file,
    global,
  ]);
  assert.equal(valid.complete, true);
  assert(!JSON.stringify(valid).includes("PRIVATE"));
  for (const change of [
    (s) => {
      s.counts.passed = 2;
    },
    (s) => {
      s.nodeDurationMs = -1;
    },
    (s) => {
      s.nodeVersion = "v24.0.0";
    },
    (s) => {
      s.extra = "PRIVATE-CANARY";
    },
  ]) {
    const malformed = structuredClone(valid);
    change(malformed);
    assert.equal(
      validateSelfCheckOutcome(
        malformed,
        {
          started: true,
          code: 0,
          signal: null,
          observed: true,
          cancelled: false,
          forced: false,
        },
        ["/private/fixture.cjs"],
      ).status,
      "incomplete",
    );
  }
  assert.equal(
    validateSelfCheckOutcome(
      valid,
      {
        started: true,
        code: 1,
        signal: null,
        observed: true,
        cancelled: false,
        forced: false,
      },
      ["/private/fixture.cjs"],
    ).status,
    "incomplete",
  );
});

test("changed selected source cannot retain passing authority", async (t) => {
  const { result } = await run(t, "changed");
  assert.equal(result.sourceUnchanged, false);
  assert.equal(result.status, "incomplete");
  assert.equal(result.reason, "SOURCE_CHANGED");
});
test("global aggregate counts selected files once rather than adding per-file summaries", async (t) => {
  const folder = fs.mkdtempSync(
    path.join(root, "scripts/fixtures/self-check-owned-"),
  );
  const privateRoot = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "self-check-output-"),
  );
  t.after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(privateRoot, { recursive: true, force: true });
  });
  const files = ["one.cjs", "two.cjs"].map((name) => {
    const file = path.join(folder, name);
    fs.writeFileSync(file, sources.passed);
    return path.relative(root, file);
  });
  const { collectNodeSelfCheckEvidence } =
    await import("./run-harness-self-check-evidence.mjs");
  const result = await collectNodeSelfCheckEvidence({
    files,
    output: path.join(privateRoot, "evidence"),
  });
  assert.equal(result.status, "passed");
  assert.equal(result.selectedFiles, 2);
  assert.equal(result.counts.tests, 2);
  assert.equal(result.counts.passed, 2);
});

test("every per-file summary is complete and additive outcome counters agree with the final global summary", async () => {
  const { summarizeNodeTestEvents } =
    await import("./harness-self-check-reporter.mjs");
  const counts = {
    tests: 1,
    passed: 1,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    suites: 0,
    topLevel: 1,
  };
  const file = {
    type: "test:summary",
    data: {
      file: "/private/fixture.cjs",
      entryFile: "/private/fixture.cjs",
      counts,
      success: true,
      duration_ms: 1,
    },
  };
  const global = {
    type: "test:summary",
    data: { counts, success: true, duration_ms: 2 },
  };
  const collect = (events) =>
    summarizeNodeTestEvents(
      (async function* () {
        yield* events;
      })(),
    );
  for (const data of [
    {
      ...file.data,
      counts: { ...counts, passed: 0, failed: 1 },
      success: false,
    },
    { ...file.data, counts: { tests: 1 } },
    { ...file.data, counts: { ...counts, suites: 1 } },
    { ...file.data, counts: { ...counts, topLevel: 2 } },
    { ...file.data, success: false },
    { ...file.data, duration_ms: -1 },
    { ...file.data, duration_ms: NaN },
    {
      ...file.data,
      counts: { ...counts, passed: 0, cancelled: 1 },
      success: false,
    },
    { ...file.data, counts: { ...counts, passed: 0, skipped: 1 } },
    { ...file.data, counts: { ...counts, passed: 0, todo: 1 } },
  ])
    assert.equal((await collect([{ ...file, data }, global])).complete, false);
});

// Pure fixture tests substitute only TCP vacancy observations; actual five provider
// test files retain real probes and real fixed-port authority in the full run.
function fakeFixedPortVacancy(t) {
  const net = require("node:net"),
    { EventEmitter } = require("node:events");
  const original = net.createConnection;
  net.createConnection = ({ host, port }) => {
    assert.equal(host, "127.0.0.1");
    assert([3100, 3101, 3102, 3103, 3104].includes(port));
    const socket = new EventEmitter();
    socket.destroy = () => {};
    socket.setTimeout = () =>
      queueMicrotask(() =>
        socket.emit(
          "error",
          Object.assign(new Error("fixture refusal"), { code: "ECONNREFUSED" }),
        ),
      );
    return socket;
  };
  t.after(() => {
    net.createConnection = original;
  });
}

test("fixed-port lease serializes holders and never deletes foreign replacement ownership", async (t) => {
  fakeFixedPortVacancy(t);
  const {
    acquireFixedPortLock,
  } = require("./fixtures/exui-self-check-fixed-port-lock.cjs");
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "self-check-lock-"),
  );
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const first = await acquireFixedPortLock({ directory, timeoutMs: 1000 });
  let acquired = false;
  const pending = acquireFixedPortLock({ directory, timeoutMs: 1000 }).then(
    (lease) => {
      acquired = true;
      return lease;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(acquired, false);
  await first.release();
  const second = await pending;
  assert.equal(acquired, true);
  const token = path.join(directory, "fixed-ports.lock");
  fs.unlinkSync(token);
  fs.writeFileSync(token, "foreign", { mode: 0o600, flag: "wx" });
  await assert.rejects(second.release(), /SELF_CHECK_FIXED_PORT_LOCK/);
  assert.equal(fs.readFileSync(token, "utf8"), "foreign");
});
test("fixed-port lease rejects bounded wait, cancellation and aliased roots without stale removal", async (t) => {
  fakeFixedPortVacancy(t);
  const {
    acquireFixedPortLock,
  } = require("./fixtures/exui-self-check-fixed-port-lock.cjs");
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "self-check-lock-"),
  );
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const held = await acquireFixedPortLock({ directory, timeoutMs: 1000 });
  const bytes = fs.readFileSync(path.join(directory, "fixed-ports.lock"));
  await assert.rejects(
    acquireFixedPortLock({ directory, timeoutMs: 20 }),
    /SELF_CHECK_FIXED_PORT_LOCK/,
  );
  const controller = new AbortController();
  const waiting = acquireFixedPortLock({
    directory,
    timeoutMs: 1000,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(waiting, /SELF_CHECK_FIXED_PORT_LOCK/);
  assert.deepEqual(
    fs.readFileSync(path.join(directory, "fixed-ports.lock")),
    bytes,
  );
  const alias = directory + "-alias";
  fs.symlinkSync(directory, alias);
  t.after(() => fs.unlinkSync(alias));
  await assert.rejects(
    acquireFixedPortLock({ directory: alias }),
    /SELF_CHECK_FIXED_PORT_LOCK/,
  );
  await held.release();
});
test("fixed-port release requires refused fixed destinations and fails closed on connected or unknown probe", async (t) => {
  fakeFixedPortVacancy(t);
  const {
    acquireFixedPortLock,
  } = require("./fixtures/exui-self-check-fixed-port-lock.cjs");
  const net = require("node:net"),
    { EventEmitter } = require("node:events");
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "self-check-lock-"),
  );
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const lease = await acquireFixedPortLock({ directory });
  const original = net.createConnection;
  net.createConnection = () => {
    const socket = new EventEmitter();
    socket.destroy = () => {};
    socket.setTimeout = () => queueMicrotask(() => socket.emit("connect"));
    return socket;
  };
  try {
    await assert.rejects(lease.release(), /SELF_CHECK_FIXED_PORT_LOCK/);
  } finally {
    net.createConnection = original;
  }
  assert(fs.existsSync(path.join(directory, "fixed-ports.lock")));
  net.createConnection = () => {
    const socket = new EventEmitter();
    socket.destroy = () => {};
    socket.setTimeout = () => queueMicrotask(() => socket.emit("timeout"));
    return socket;
  };
  try {
    await assert.rejects(lease.release(), /SELF_CHECK_FIXED_PORT_LOCK/);
  } finally {
    net.createConnection = original;
  }
  assert(fs.existsSync(path.join(directory, "fixed-ports.lock")));
  await lease.release();
  assert.equal(fs.existsSync(path.join(directory, "fixed-ports.lock")), false);
  await assert.rejects(lease.release());
});
test("parallel collector preserves both file outcomes and pins fixed-port fixture bytes", async (t) => {
  const folder = fs.mkdtempSync(
    path.join(root, "scripts/fixtures/self-check-owned-"),
  );
  const privateRoot = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "self-check-parallel-"),
  );
  t.after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(privateRoot, { recursive: true, force: true });
  });
  const files = ["one.cjs", "two.cjs"].map((name) => {
    const file = path.join(folder, name);
    fs.writeFileSync(file, sources.fixedPortParallel);
    return path.relative(root, file);
  });
  const { collectNodeSelfCheckEvidence } =
    await import("./run-harness-self-check-evidence.mjs");
  const result = await collectNodeSelfCheckEvidence({
    files,
    output: path.join(privateRoot, "evidence"),
    testConcurrency: 2,
  });
  assert.equal(result.status, "passed");
  assert.equal(result.selectedFiles, 2);
  assert.equal(result.counts.tests, 2);
  const input = JSON.parse(
    fs.readFileSync(path.join(privateRoot, "evidence/source-input.json")),
  );
  assert.equal(input.testConcurrency, 2);
  assert(
    input.before.entries.some(
      ([name]) =>
        name === "scripts/fixtures/exui-self-check-fixed-port-lock.cjs",
    ),
  );
  assert.deepEqual(
    fs.readdirSync(path.join(privateRoot, "evidence/fixed-port-lock")),
    [],
  );
  for (const bad of [0, 3, 5, 6, 7, 9, "2", null]) {
    const target = path.join(privateRoot, "invalid-" + String(bad));
    await assert.rejects(
      collectNodeSelfCheckEvidence({
        files,
        output: target,
        testConcurrency: bad,
      }),
    );
    assert.equal(fs.existsSync(target), false);
  }
});
test("unreleased holder cannot publish self-check evidence after a successful Node exit", async (t) => {
  const folder = fs.mkdtempSync(
    path.join(root, "scripts/fixtures/self-check-owned-"),
  );
  const privateRoot = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "self-check-unreleased-"),
  );
  t.after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(privateRoot, { recursive: true, force: true });
  });
  const file = path.join(folder, "unreleased.cjs");
  fs.writeFileSync(file, sources.unreleasedHolder);
  const { collectNodeSelfCheckEvidence } =
    await import("./run-harness-self-check-evidence.mjs");
  const output = path.join(privateRoot, "evidence");
  await assert.rejects(
    collectNodeSelfCheckEvidence({
      files: [path.relative(root, file)],
      output,
      testConcurrency: 2,
    }),
    /HARNESS_SELF_CHECK_EVIDENCE_INVALID/,
  );
  assert(fs.existsSync(path.join(output, "fixed-port-lock/fixed-ports.lock")));
  assert.equal(
    fs.existsSync(path.join(output, "self-check-evidence.json")),
    false,
  );
});

test("cancelled holders and replaced private directories cannot release their ownership", async (t) => {
  fakeFixedPortVacancy(t);
  const {
    acquireFixedPortLock,
  } = require("./fixtures/exui-self-check-fixed-port-lock.cjs");
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "self-check-lock-"),
  );
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const controller = new AbortController();
  const cancelled = await acquireFixedPortLock({
    directory,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(cancelled.release(), /SELF_CHECK_FIXED_PORT_LOCK/);
  assert(fs.existsSync(path.join(directory, "fixed-ports.lock")));
  const other = directory + "-other";
  fs.mkdirSync(other, { mode: 0o700 });
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  const held = await acquireFixedPortLock({ directory: other });
  const original = other + "-original";
  fs.renameSync(other, original);
  t.after(() => fs.rmSync(original, { recursive: true, force: true }));
  fs.mkdirSync(other, { mode: 0o700 });
  await assert.rejects(held.release(), /SELF_CHECK_FIXED_PORT_LOCK/);
  assert(fs.existsSync(path.join(original, "fixed-ports.lock")));
  assert.deepEqual(fs.readdirSync(other), []);
});
test("concurrency 2 retains actual failure, nested skip/todo and forged stdout semantics", async (t) => {
  for (const [name, status] of [
    ["failed", "failed"],
    ["skipped", "passed"],
    ["forged", "passed"],
    ["zero", "incomplete"],
  ]) {
    const { result } = await run(t, name, undefined, undefined, 2);
    assert.equal(result.status, status);
    if (name === "skipped") {
      assert.equal(result.counts.skipped, 1);
      assert.equal(result.counts.todo, 1);
    }
    if (name === "forged") assert.equal(result.counts.tests, 1);
  }
  const controller = new AbortController();
  const { result, ready } = await run(
    t,
    "waiting",
    controller.signal,
    controller,
    2,
  );
  assert.equal(result.status, "incomplete");
  assert.equal(result.terminal.cancelled, true);
  assertNoLiveProcess(ready.pid);
});

test("fixed-port ownership remains held until delayed vacancy observations settle", async (t) => {
  fakeFixedPortVacancy(t);
  const net = require("node:net"),
    { EventEmitter } = require("node:events");
  const {
    acquireFixedPortLock,
  } = require("./fixtures/exui-self-check-fixed-port-lock.cjs");
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "self-check-lock-"),
  );
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const lease = await acquireFixedPortLock({ directory });
  const original = net.createConnection;
  let complete;
  net.createConnection = () => {
    const socket = new EventEmitter();
    socket.destroy = () => {};
    socket.setTimeout = () => {
      complete = () =>
        socket.emit(
          "error",
          Object.assign(new Error("fixture refusal"), { code: "ECONNREFUSED" }),
        );
    };
    return socket;
  };
  const closing = lease.release();
  let acquired = false;
  const waiting = acquireFixedPortLock({ directory, timeoutMs: 1000 }).then(
    (value) => {
      acquired = true;
      return value;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(acquired, false);
  assert(fs.existsSync(path.join(directory, "fixed-ports.lock")));
  complete();
  await closing;
  net.createConnection = original;
  await (await waiting).release();
  assert.equal(acquired, true);
  assert.throws(
    () =>
      require("./fixtures/exui-self-check-fixed-port-lock.cjs").installFixedPortHooks(
        "unknown",
      ),
    /SELF_CHECK_FIXED_PORT_LOCK/,
  );
});

test("actual configured CLI selects eight file workers while component API defaults stay one", async (t) => {
  const { buildSelfCheckFixture } = require("./fixtures/exui-build-self-check.mock.cjs");
  const { spawnSync } = require("node:child_process");
  const f = await buildSelfCheckFixture(t);
  const observed = spawnSync(process.execPath, [f.modulePath], {
    cwd: f.root,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
    encoding: "utf8",
    timeout: 10 * 1000,
  });
  assert.equal(observed.error, undefined);
  assert.equal(observed.status, 0, observed.stderr);
  assert.equal(observed.signal, null);
  const cli = JSON.parse(fs.readFileSync(f.argvPath));
  assert.equal(cli.command, process.execPath);
  assert.deepEqual(cli.args.slice(0, 2), ["--test", "--test-concurrency=8"]);
  assert.deepEqual(cli.args.slice(-2), f.unitFiles);
  assert.equal((fs.readFileSync(f.callsPath, "utf8").match(/spawn/g) ?? []).length, 1);
  assert.equal(f.api.readHeldBuildSelfChecks(f.api.holdBuildSelfChecks()).counts.tests, 2);

  const direct = await f.api.runConfiguredSelfChecks();
  assert.equal(direct.status, "passed");
  const component = JSON.parse(fs.readFileSync(f.argvPath));
  assert.deepEqual(component.args.slice(0, 2), ["--test", "--test-concurrency=1"]);
  assert.deepEqual(component.args.slice(-2), f.unitFiles);
  assert.equal((fs.readFileSync(f.callsPath, "utf8").match(/spawn/g) ?? []).length, 2);
});


test('file summaries bind exact selected identities and reconcile all Node counters without adding durations',async()=>{
 const api=await import(process.env.SELF_CHECK_FILE_SUMMARY_TEST_MODULE??'./harness-self-check-reporter.mjs');
 const counts={tests:1,passed:1,failed:0,cancelled:0,skipped:0,todo:0,suites:0,topLevel:1},a={type:'test:summary',data:{file:'/private/a.cjs',entryFile:'/private/a.cjs',counts,success:true,duration_ms:70}},b={type:'test:summary',data:{file:'/private/b.cjs',entryFile:'/private/b.cjs',counts:{...counts,tests:2,passed:1,skipped:1},success:true,duration_ms:60}},global={type:'test:summary',data:{counts:{...counts,tests:3,passed:2,skipped:1,topLevel:2},success:true,duration_ms:100}};
 const summary=await api.summarizeNodeTestEvents((async function*(){yield b;yield a;yield global;})());assert(Array.isArray(summary.fileSummaries));assert.equal(summary.fileSummaries.length,2);
 const terminal={started:true,observed:true,forced:false,cancelled:false,code:0,signal:null},expected=['/private/a.cjs','/private/b.cjs'];
 const outcome=api.validateSelfCheckOutcome(summary,terminal,expected);assert.equal(outcome.status,'passed');assert.deepEqual(outcome.fileResults.map(row=>row.file),expected);assert.equal(outcome.counts.tests,3);assert.equal(outcome.nodeDurationMs,100);assert.equal(outcome.fileResults.reduce((n,row)=>n+row.nodeDurationMs,0),130);
 for(const mutate of [s=>{s.fileSummaries[0].file='/private/foreign.cjs';},s=>{s.fileSummaries[0].file='/private/./b.cjs';},s=>{s.fileSummaries[0].file=s.fileSummaries[1].file;},s=>{s.fileSummaries.pop();},s=>{delete s.fileSummaries;},s=>{s.fileSummaries[0].nodeDurationMs=-1;},s=>{s.fileSummaries[0].counts.suites++;},s=>{s.fileSummaries[0].extra='PRIVATE_CANARY';}]){const changed=structuredClone(summary);mutate(changed);assert.equal(api.validateSelfCheckOutcome(changed,terminal,expected).status,'incomplete');}
});
test('actual two-file Node summaries retain parent tests in both modes without JUnit-derived counts',async t=>{
 const folder=fs.mkdtempSync(path.join(root,'scripts/fixtures/self-check-owned-')),privateRoot=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'self-check-file-detail-'));t.after(()=>{fs.rmSync(folder,{recursive:true,force:true});fs.rmSync(privateRoot,{recursive:true,force:true});});
 const files=['parent.cjs','plain.cjs'].map((name,index)=>{const file=path.join(folder,name);fs.writeFileSync(file,index===0?sources.nestedParent:sources.passed);return path.relative(root,file);});const api=await import('./run-harness-self-check-evidence.mjs');
 for(const testConcurrency of [1,2]){const output=path.join(privateRoot,'mode-'+testConcurrency),value=await api.collectNodeSelfCheckEvidence({files,output,testConcurrency});assert.equal(value.status,'passed');assert.equal(value.counts.tests,3);assert.equal(value.counts.passed,3);assert.equal(value.fileResults.length,2);assert.deepEqual(value.fileResults.map(row=>row.counts.tests),[2,1]);assert.deepEqual(value.fileResults.map(row=>row.file),files.map(file=>path.join(root,file)));const summary=JSON.parse(fs.readFileSync(path.join(output,'structured-summary.json')));assert.equal(summary.fileSummaries.length,2);assert.equal(summary.counts.tests,3);assert(!JSON.stringify(summary).includes('private nested canary'));assert(!JSON.stringify(summary).includes('private parent canary'));}
});
