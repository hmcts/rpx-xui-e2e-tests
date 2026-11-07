const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { sources } = require("./fixtures/exui-self-check-evidence.mock.cjs");
const root = path.resolve(__dirname, "..");
async function run(t, name, signal, controller) {
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
  assert.throws(
    () => process.kill(ready.pid, 0),
    (error) => error.code === "ESRCH",
  );
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
    1,
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
        1,
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
      1,
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
