const { test } = require("node:test");
const assert = require("node:assert/strict");
const api = () => require("./lib/exui-native-stage-telemetry.cjs");
function step(id, duration = 1, error) {
  return {
    category: "test.step",
    title: "harness-assertion:" + id,
    duration,
    error,
    annotations: [],
    steps: [],
  };
}
function record(id, steps, duration = 100) {
  const { NativeStageRecorder } = api(),
    r = new NativeStageRecorder(),
    result = { duration };
  for (const s of steps) {
    r.begin(id, result, s);
    r.end(id, result, s);
  }
  return r.finish(id, result);
}
test("WA repeated stage instances preserve actual order/duration without adding tests or duration sums", () => {
  const stages = [
    step("family-membership", 2),
    ...Array.from({ length: 7 }, (_, i) => step("family-filter", i + 3)),
  ];
  const got = record("wa-family-options", stages, 90);
  assert.equal(got.availability, "recorded");
  assert.equal(got.testDurationMs, 90);
  assert.equal(got.stages.length, 8);
  assert.deepEqual(
    got.stages.map((s) => s.ordinal),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.deepEqual(
    got.stages.slice(1).map((s) => s.instance),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.deepEqual(
    got.stages.map((s) => s.durationMs),
    [2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert(
    got.stages.every((s) => s.outcome === "completed-without-reported-error"),
  );
});
test("expected fault retains actual failed stage and never fabricates unreached filter stages", () => {
  const got = record("wa-missing-family", [
    step("family-membership", 12, {
      message: "PRIVATE_COOKIE_CANARY",
      stack: "PRIVATE_STACK",
    }),
  ]);
  assert.equal(got.stages.length, 1);
  assert.equal(got.stages[0].outcome, "reported-error");
  assert.equal(got.stages[0].stageId, "family-membership");
  assert(!JSON.stringify(got).includes("PRIVATE"));
});
test("unknown malformed duplicate and unfinished events fail closed for display, while legacy remains absent", () => {
  const { NativeStageRecorder, readStageTelemetry, assertStageTelemetry } =
    api();
  assert.equal(readStageTelemetry("wa-family-options", undefined), undefined);
  for (const s of [
    step("PRIVATE_COOKIE_CANARY"),
    step("family-filter", -1),
    step("family-filter", NaN),
  ])
    assert.equal(record("wa-family-options", [s]).availability, "unavailable");
  const r = new NativeStageRecorder(),
    result = { duration: 0 },
    s = step("family-filter", 0);
  r.begin("wa-family-options", result, s);
  r.end("wa-family-options", result, s);
  r.end("wa-family-options", result, s);
  assert.equal(
    r.finish("wa-family-options", result).availability,
    "unavailable",
  );
  const unfinished = new NativeStageRecorder();
  unfinished.begin("wa-family-options", result, s);
  assert.equal(
    unfinished.finish("wa-family-options", result).availability,
    "unavailable",
  );
  const good = record("wa-family-options", [step("family-filter", 0)], 0);
  assert.equal(good.testDurationMs, 0);
  assertStageTelemetry("wa-family-options", good);
  for (const mutate of [
    (x) => (x.stages[0].ordinal = 2),
    (x) => (x.stages[0].instance = 2),
    (x) => (x.stages[0].stageId = "PRIVATE_COOKIE_CANARY"),
    (x) => (x.stages[0].raw = "PRIVATE_COOKIE_CANARY"),
    (x) => (x.testDurationMs = -1),
    (x) => (x.stages = []),
    (x) => {
      x.testDurationMs = 0;
      x.stages[0].durationMs = 2;
    },
    (x) => (x.stages[0].outcome = "passed"),
  ]) {
    const x = structuredClone(good);
    mutate(x);
    assert.throws(() => assertStageTelemetry("wa-family-options", x));
    assert.equal(
      readStageTelemetry("wa-family-options", x).availability,
      "unavailable",
    );
  }
});
test("hook/fixture ancestry and arbitrary API metadata stay excluded; skipped annotation is explicit", () => {
  const s = step("family-filter");
  s.parent = { category: "hook" };
  s.params = { cookie: "PRIVATE_COOKIE_CANARY" };
  s.attachments = [{ body: "PRIVATE_BODY" }];
  assert.equal(record("wa-family-options", [s]).reason, "NO_NAMED_STAGES");
  const skipped = step("family-filter");
  skipped.annotations = [{ type: "skip", description: "PRIVATE_REASON" }];
  const got = record("wa-family-options", [skipped]);
  assert.equal(got.stages[0].outcome, "skipped");
  assert(!JSON.stringify(got).includes("PRIVATE"));
});
test("actual browser-free Playwright1.65 events preserve completed/skipped/error stages and existing failure attribution", (t) => {
  const fs = require("node:fs"),
    path = require("node:path"),
    os = require("node:os"),
    { spawnSync } = require("node:child_process");
  const root = path.resolve(__dirname, ".."),
    dir = fs.mkdtempSync(
      path.join(root, "scripts/fixtures/stage-smoke-owned-"),
    ),
    privateRoot = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "stage-smoke-output-"),
    );
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(privateRoot, { recursive: true, force: true });
  });
  const reporter = path.join(
      root,
      "scripts/lib/exui-playwright-evidence-reporter.mjs",
    ),
    report = path.join(privateRoot, "report.json"),
    context = path.join(privateRoot, "context.json");
  fs.writeFileSync(context, "{}", { mode: 0o600 });
  fs.writeFileSync(
    path.join(dir, "smoke.spec.cjs"),
    require("./fixtures/exui-native-stage-telemetry.mock.cjs").browserFreeSpec,
  );
  const config = path.join(dir, "playwright.config.cjs");
  fs.writeFileSync(
    config,
    "module.exports=" +
      JSON.stringify({
        testDir: dir,
        testMatch: "smoke.spec.cjs",
        outputDir: path.join(privateRoot, "output"),
        workers: 1,
        retries: 0,
        reporter: [[reporter]],
      }) +
      ";",
  );
  const terminal = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/playwright/cli.js"),
      "test",
      "--config",
      config,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 20 * 1000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        EXUI_EVIDENCE_CONTEXT: context,
        EXUI_EVIDENCE_REPORT: report,
      },
    },
  );
  assert.equal(terminal.signal, null);
  assert.equal(terminal.status, 1);
  assert(!terminal.error);
  const raw = JSON.parse(fs.readFileSync(report));
  assert.deepEqual(raw.globalErrors, []);
  assert.equal(raw.tests.length, 3);
  const [healthy, fault, unknown] = raw.tests;
  assert.equal(healthy.status, "passed");
  assert.equal(healthy.recordedExecution.stages.length, 9);
  assert(healthy.recordedExecution.testDurationMs >= 0);
  assert(
    healthy.recordedExecution.stages
      .slice(0, 8)
      .every((s) => s.outcome === "completed-without-reported-error"),
  );
  assert.equal(healthy.recordedExecution.stages[8].outcome, "skipped");
  assert.equal(healthy.recordedExecution.stages[8].instance, 8);
  assert.equal(fault.failureId, "family-membership");
  assert.equal(fault.unattributedErrors, 0);
  assert.equal(fault.status, "failed");
  assert.equal(fault.recordedExecution.stages.length, 1);
  assert.equal(fault.recordedExecution.stages[0].outcome, "reported-error");
  assert.equal(unknown.recordedExecution.availability, "unavailable");
  assert.equal(unknown.recordedExecution.reason, "UNKNOWN_STAGE");
  assert(!JSON.stringify(raw).includes("PRIVATE_"));
  assert.equal(require("@playwright/test/package.json").version, "1.65.0");
});
test("finite stage catalogue covers exactly the current core baseline and mutation proof inventory", async () => {
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { assertStageTelemetry } = api();
  for (const scope of [
    "exui-wa-family-pilot",
    "exui-wa-scope-pilot",
    "exui-ccd-pilot",
    "exui-ccd-event-capability-pilot",
    "exui-decentralised-routing-pilot",
    "exui-ccd-recipient-callback-pilot",
    "exui-ccd-selector-event-row-pilot",
  ]) {
    const p = getReleasePolicy(scope);
    for (const id of [
      ...p.obligations.flatMap((o) => o.requiredProofIds),
      ...p.mutationDefinitions.map((d) => d.mutantProofId),
    ])
      assertStageTelemetry(id, {
        schemaVersion: 1,
        availability: "unavailable",
        reason: "NO_NAMED_STAGES",
      });
  }
});

test("at most one millisecond of independently measured step/test rounding is accepted, never summed", () => {
  const { readStageTelemetry } = api();
  const borderline = record("wa-family-options", [step("family-filter", 1)], 0);
  assert.equal(borderline.availability, "recorded");
  const tooLarge = record("wa-family-options", [step("family-filter", 2)], 0);
  assert.equal(tooLarge.availability, "unavailable");
  assert.equal(tooLarge.reason, "INVALID_STAGE_TELEMETRY");
  const nested = record(
    "wa-family-options",
    [step("family-membership", 10), step("family-filter", 10)],
    10,
  );
  assert.equal(
    readStageTelemetry("wa-family-options", nested).availability,
    "recorded",
  );
});
