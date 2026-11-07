const {reviewedCsrfDetailChildren}=require('./fixtures/harness-reviewed-csrf-details.mock.cjs');
const test = require("node:test"),
  assert = require("node:assert/strict");
const api = require("./harness-build-self-check-report.cjs");
const fixture = () => ({
  schemaVersion: 1,
  kind: "harness-build-self-checks",
  runId: "self-check-00000000-0000-4000-8000-000000000001",
  status: "passed",
  reason: null,
  nodeVersion: "v24.21.0",
  selectedFiles: 2,
  source: {
    commit: "a".repeat(40),
    state: "clean",
    scope: "selected-tests-and-collector",
    selectionDigest: "sha256:" + "b".repeat(64),
  },
  counts: {
    tests: 21,
    passed: 20,
    failed: 0,
    cancelled: 0,
    skipped: 1,
    todo: 0,
    suites: 2,
    topLevel: 3,
  },
  nodeDurationMs: 30,
  wallDurationMs: 41,
  requestDigest: "sha256:" + "c".repeat(64),
  evidenceDigest: "sha256:" + "d".repeat(64),
  junitDigest: "sha256:" + "e".repeat(64),
  runtimeAcceptance: false,
  catalogueCredit: false,
  releaseApproval: false,
});
test("finite Build projection has separate summary/details with honest unknown and no grand total", () => {
  const value = fixture(),
    before = structuredClone(value),
    html =
      api.renderBuildSelfCheckSummary(value) +
      api.renderBuildSelfCheckDetails(value);
  assert.deepEqual(value, before);
  for (const text of [
    "Build self-checks",
    "21 Node tests",
    "2 selected files",
    "TypeScript and ESLint results are not represented",
    "Collector wall time",
    "Source-defined purpose",
    "evidence and admission guards",
    "runtime orchestration and cleanup contracts",
    "not the full Build or lint result",
    "No per-feature counts",
    "Node final-summary duration",
    "not add to diagnostic tests",
  ])
    assert(html.includes(text), text);
  assert(!html.includes("116 + 21"));
  assert(api.renderBuildSelfCheckSummary().includes("Not collected"));
  assert(!api.renderBuildSelfCheckSummary().includes("PASSED"));
});
test("malformed or promoted public self-check fields reject without raw diagnostic leaks", () => {
  for (const change of [
    (v) => (v.extra = "PRIVATE_CANARY"),
    (v) => v.counts.tests++,
    (v) => (v.counts.failed = 1),
    (v) => (v.runtimeAcceptance = true),
    (v) => (v.source.commit = "PRIVATE_CANARY"),
    (v) => (v.source.scope = "all-source"),
    (v) => (v.nodeDurationMs = NaN),
    (v) => (v.wallDurationMs = -1),
    (v) => (v.status = "unknown"),
    (v) => (v.reason = "PRIVATE_CANARY"),
    (v) => (v.selectedFiles = 0),
  ]) {
    const value = fixture();
    change(value);
    assert.throws(
      () => api.renderBuildSelfCheckDetails(value),
      /^Error: HARNESS_BUILD_SELF_CHECK_REPORT_INVALID$/,
    );
  }
});

// Synthetic presentation fixture: real reporter events, never native acceptance evidence.
test("actual public reporter round-trips distinct Build counts and rejects visible tampering", async (t) => {
  const fs = require("node:fs"),
    path = require("node:path"),
    os = require("node:os");
  const Reporter = require("./harness-public-odhin-reporter.cjs");
  const source = Reporter.captureDiagnosticSource();
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "self-check-public-"),
  );
  const previous = process.cwd();
  process.chdir(root);
  t.after(() => {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const entries = require("./harness-public-overview.cjs").profiles.harness;
  const methods = require("./harness-public-check-steps.cjs");
  const tests = entries.map((entry, index) => ({
    id: String(index),
    titlePath: () => entry.titlePath,
    location: { file: path.join(root, entry.file), line: 1 },
    retries: 0,
    expectedStatus: "passed",
  }));
  const reporter = new Reporter({
    selection: "harness",
    diagnosticSource: source,
  });
  const projected = fixture();
  projected.source.commit = source.commit;
  reporter.buildSelfChecks = projected;
  await reporter.onBegin({ projects: [] }, { allTests: () => tests });
  for (let index = 0; index < tests.length; index++)
    await reporter.onTestEnd(tests[index], {
      status: "passed",
      retry: 0,
      duration: 2,
      startTime: new Date("2026-11-06T10:00:00Z"),
      workerIndex: 0,
      parallelIndex: 0,
      steps: methods.methodFor(entries[index]).steps.map((step) => ({
        title: "harness-check:" + step.id,
        category: "test.step",
        duration: 1,
        steps: reviewedCsrfDetailChildren(step.id),
      })),
    });
  await reporter.onEnd({
    status: "passed",
    startTime: new Date("2026-11-06T10:00:00Z"),
    duration: 1000,
  });
  const htmlPath = path.join(
    root,
    "functional-output/tests/harness/public/odhin/index.html",
  );
  const html = fs.readFileSync(htmlPath, "utf8");
  const recordPath = path.join(
      root,
      "functional-output/tests/harness/private/public-odhin-harness.json",
    ),
    recordBytes = fs.readFileSync(recordPath),
    record = JSON.parse(recordBytes);
  assert.equal(Reporter.validatePublicReport("harness").tests, 116);
  assert(html.includes("21 Node tests"));
  assert(!html.includes(root));
  assert(html.includes("NOT RUN"));
  for (const changed of [
    html.replace("21 Node tests", "999 Node tests"),
    html.replace(
      "</body>",
      api.renderBuildSelfCheckSummary(projected) + "</body>",
    ),
    html.replace("2 selected files", "3 selected files"),
    html.replace(
      'data-build-self-check-tests="21"',
      'data-build-self-check-tests="22"',
    ),
  ]) {
    fs.writeFileSync(htmlPath, changed);
    fs.writeFileSync(
      recordPath,
      JSON.stringify({
        ...record,
        sha256: require("node:crypto")
          .createHash("sha256")
          .update(changed)
          .digest("hex"),
      }),
    );
    assert.throws(
      () => Reporter.validatePublicReport("harness"),
      /^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/,
    );
  }
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(recordPath, recordBytes);
  assert.equal(Reporter.validatePublicReport("harness").tests, 116);
  // Only import relocation: exercise the actual caller in this owned temporary repo.
  const { pathToFileURL } = require("node:url");
  const sourceFile = path.join(__dirname, "run-harness-assurance.mjs");
  const relocated = fs
    .readFileSync(sourceFile, "utf8")
    .replace(/(["'])(\.\/[^"']+)\1/g, (_match, quote, relative) =>
      JSON.stringify(pathToFileURL(path.resolve(__dirname, relative)).href),
    );
  fs.mkdirSync(path.join(root, "scripts"));
  const callerFile = path.join(root, "scripts/run-harness-assurance.mjs");
  fs.writeFileSync(callerFile, relocated);
  const { runHarnessAssurance } = await import(pathToFileURL(callerFile).href);
  await assert.rejects(
    runHarnessAssurance(path.join(root, "must-not-read-job.json"), {
      buildSelfCheckHeld: {
        path: "/private/tmp/not-used",
        digest: "sha256:" + "f".repeat(64),
        extra: () => {},
      },
    }),
    (error) => error.name === "DataCloneError",
  );
  assert(
    !fs.existsSync(htmlPath),
    "uncloneable held input must withdraw prior public HTML before snapshot validation",
  );
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(recordPath, recordBytes);
  assert.equal(Reporter.validatePublicReport("harness").tests, 116);
  await assert.rejects(
    require("./run-harness-local-aat.cjs").runHarnessCollection(
      {},
      {
        buildSelfCheckHeld: {
          path: "/private/tmp/missing-private-held.json",
          digest: "sha256:" + "f".repeat(64),
        },
      },
    ),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
  assert(
    !fs.existsSync(htmlPath),
    "invalid mandatory held receipt must withdraw prior public HTML before any collection",
  );
});

test("fallback held transport accepts only an explicit complete pair", () => {
  assert.equal(api.buildSelfCheckReporterOption({}), undefined);
  const pair = {
    HARNESS_BUILD_SELF_CHECK_PATH: "/private/tmp/unit-held.json",
    HARNESS_BUILD_SELF_CHECK_DIGEST: "sha256:" + "a".repeat(64),
  };
  assert.deepEqual(api.buildSelfCheckReporterOption(pair), {
    path: pair.HARNESS_BUILD_SELF_CHECK_PATH,
    digest: pair.HARNESS_BUILD_SELF_CHECK_DIGEST,
  });
  for (const env of [
    { HARNESS_BUILD_SELF_CHECK_PATH: pair.HARNESS_BUILD_SELF_CHECK_PATH },
    { HARNESS_BUILD_SELF_CHECK_DIGEST: pair.HARNESS_BUILD_SELF_CHECK_DIGEST },
    { ...pair, HARNESS_BUILD_SELF_CHECK_PATH: "relative" },
    { ...pair, HARNESS_BUILD_SELF_CHECK_DIGEST: "PRIVATE_CANARY" },
  ])
    assert.throws(
      () => api.buildSelfCheckReporterOption(env),
      /^Error: HARNESS_BUILD_SELF_CHECK_REPORT_INVALID$/,
    );
});

function buildDashboard(summary) {
  const fs = require("node:fs"),
    path = require("node:path");
  const make = () => ({
    dataset: {},
    children: [],
    attributes: {},
    classList: { add() {} },
    append(...items) {
      this.children.push(...items);
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  });
  const metrics = make();
  metrics.querySelector = (selector) => ({
    textContent: selector.includes("metric-0")
      ? "116"
      : selector.includes("metric-1")
        ? "100%"
        : "0",
  });
  metrics.replaceChildren = () => {
    metrics.children = [];
  };
  const timeline = {};
  let movedTimeline;
  metrics.after = (element) => {
    movedTimeline = element;
  };
  const elements = {
    "#harness-public-run": {
      dataset: {
        assuranceVersion: "1",
        assuranceScope: "assurance-start-to-report-snapshot",
        assuranceClock: "monotonic",
        assuranceElapsedMs: "10480",
      },
    },
    "#harness-application-coverage": { dataset: { runtimeObligations: "112" } },
    ".report-metrics": metrics,
    "#harness-native-evidence": {
      dataset: { nativeStatus: "PASS" },
      querySelectorAll: () => [{}, {}],
    },
    "#harness-phase-timings": timeline,
  };
  if (summary !== null)
    elements["#harness-build-self-check-summary"] = {
      dataset:
        typeof summary === "string"
          ? Object.fromEntries(
              Object.entries(
                require("node-html-parser").parse(summary).firstChild
                  .attributes,
              )
                .filter(([name]) => name.startsWith("data-"))
                .map(([name, value]) => [
                  name
                    .slice(5)
                    .replace(/-([a-z])/g, (_all, letter) =>
                      letter.toUpperCase(),
                    ),
                  value,
                ]),
            )
          : summary,
    };
  require("node:vm").runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "harness-public-dashboard.js"),
      "utf8",
    ),
    {
      document: {
        createElement: make,
        querySelector: (selector) => elements[selector] ?? null,
        querySelectorAll: (selector) =>
          selector.includes("data-catalogue-kind")
            ? [{ dataset: { catalogueAccepted: "39" } }]
            : [],
      },
    },
  );
  return {
    metrics,
    movedTimeline,
    timeline,
    text: (node) => {
      const all = (node) =>
        [node.textContent ?? "", ...node.children.map(all)].join(" ");
      return all(node);
    },
  };
}

test("top dashboard adds linked Build status/counts/wall interval without changing four cards or elapsed/timeline", () => {
  const value = fixture();
  value.wallDurationMs = 61004.25;
  const view = buildDashboard(api.renderBuildSelfCheckSummary(value)),
    cards = view.metrics.children;
  const measure = cards.find((node) =>
    node.className?.includes("report-build-self-checks"),
  );
  assert(measure, "Build self-checks must be visible with top metrics");
  assert.equal(measure.href, "#harness-build-self-check-details");
  assert.match(
    view.text(measure),
    /Build self-checks.*PASSED.*21 Node tests.*20 passed.*0 failed.*1 skipped/s,
  );
  assert.match(
    view.text(measure),
    /Build unit collector wall time: 1m 1\.004s/,
  );
  assert.match(view.text(measure), /Separate.*not additive/s);
  assert.match(view.text(measure), /TypeScript and ESLint.*not represented/s);
  assert.equal(cards[0].children[1].textContent, "39 / 112");
  assert.equal(cards[1].children[1].textContent, "2 + 2");
  assert.equal(cards[2].children[1].textContent, "116");
  assert.equal(cards[3].children[1].textContent, "Unavailable");
  assert.equal(cards[4].children[0].textContent, "Harness elapsed to report");
  assert.equal(cards[4].children[1].textContent, "0m 10.480s");
  assert.equal(view.movedTimeline, view.timeline);
});

test("top Build measure leaves missing and incomplete counters unrecorded and rejects malformed datasets", () => {
  const incomplete = {
    ...fixture(),
    status: "incomplete",
    reason: "SUMMARY_MISSING",
    counts: null,
    nodeDurationMs: null,
  };
  for (const [value, status] of [
    [undefined, "Not collected"],
    [incomplete, "INCOMPLETE"],
  ]) {
    const view = buildDashboard(api.renderBuildSelfCheckSummary(value)),
      measure = view.metrics.children.find((node) =>
        node.className?.includes("report-build-self-checks"),
      );
    assert(measure);
    const text = view.text(measure);
    assert(text.includes(status));
    assert.match(text, /counts not recorded/i);
    assert.doesNotMatch(text, /\b0 Node tests|PASSED|21 Node tests/);
    if (value === undefined)
      assert.match(text, /Build unit collector wall time: Not recorded/);
    else assert.match(text, /Build unit collector wall time: 0m 0\.041s/);
  }
  const cancelled = {
    ...fixture(),
    status: "incomplete",
    reason: "TESTS_CANCELLED",
    counts: { ...fixture().counts, passed: 19, cancelled: 1 },
  };
  const observed = buildDashboard(api.renderBuildSelfCheckSummary(cancelled));
  assert.match(
    observed.text(observed.metrics),
    /INCOMPLETE.*21 Node tests.*1 cancelled/s,
  );
  const zero = { ...fixture(), wallDurationMs: 0 };
  let view = buildDashboard(api.renderBuildSelfCheckSummary(zero));
  assert.match(
    view.text(view.metrics),
    /Build unit collector wall time: 0m 0\.000s/,
  );
  for (const dataset of [
    { buildSelfCheckStatus: "PRIVATE_CANARY" },
    {
      buildSelfCheckStatus: "passed",
      buildSelfCheckTests: "21",
      buildSelfCheckWallMs: "-1",
    },
    {
      buildSelfCheckStatus: "passed",
      buildSelfCheckTests: "999",
      buildSelfCheckPassed: "20",
      buildSelfCheckFailed: "0",
      buildSelfCheckCancelled: "0",
      buildSelfCheckSkipped: "1",
      buildSelfCheckTodo: "0",
      buildSelfCheckWallMs: "41",
    },
  ]) {
    view = buildDashboard(dataset);
    const measure = view.metrics.children.find((node) =>
      node.className?.includes("report-build-self-checks"),
    );
    assert(measure);
    assert.doesNotMatch(
      view.text(measure),
      /PRIVATE_CANARY|PASSED|999 Node tests|0 Node tests/,
    );
    assert.match(view.text(measure), /Not recorded/);
  }
});
