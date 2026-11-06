const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const canary = "PRIVATE_AAT_HEADERS_cookie_Query_9b";
const modulePath = path.join(__dirname, "run-harness-local-aat.cjs");
const fixture = require("./fixtures/harness-public-report-titles.json");
function api() {
  assert.ok(
    fs.existsSync(modulePath),
    "fixed AAT collection adapter must exist",
  );
  return require(modulePath);
}
function document(entries) {
  return {
    config: { rootDir: process.cwd(), metadata: { canary } },
    errors: [],
    stats: {
      startTime: "2026-11-03T12:00:00Z",
      duration: 1000,
      expected: entries.length,
      unexpected: 0,
      skipped: 0,
      flaky: 0,
    },
    suites: entries.map((entry) => ({
      title: entry.titlePath[2],
      suites: [
        {
          title: entry.titlePath[3],
          specs: [
            {
              file: entry.file,
              title: entry.titlePath.at(-1),
              tests: [
                {
                  expectedStatus: "passed",
                  status: "expected",
                  results: [
                    {
                      status: "passed",
                      retry: 0,
                      duration: 10,
                      startTime: "2026-11-03T12:00:00.100Z",
                      workerIndex: 0,
                      parallelIndex: 0,
                      errors: [{ message: canary }],
                      stdout: [canary],
                      attachments: [{ path: canary }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })),
  };
}
test("fixed phases admit complete failed results and retain no raw diagnostic fields", () => {
  const { normalizePhase } = api();
  const entries = fixture.selections.environment;
  const raw = document(entries);
  raw.suites[0].suites[0].specs[0].tests[0].results[0].status = "failed";
  raw.suites[0].suites[0].specs[0].tests[0].status = "unexpected";
  raw.stats.expected--;
  raw.stats.unexpected++;
  const result = normalizePhase(raw, entries, 1, process.cwd());
  assert.equal(result.records.length, 5);
  assert.equal(result.status, "failed");
  assert.equal(result.records[0].observed.status, "failed");
  assert.ok(!JSON.stringify(result).includes(canary));
});
test("incomplete, duplicate, unknown, retried, inconsistent exit and stale-root phases fail closed", () => {
  const { normalizePhase } = api();
  const entries = fixture.selections.environment;
  for (const mutation of [
    "missing",
    "duplicate",
    "unknown",
    "retry",
    "root",
    "exit",
    "stats",
    "interrupted",
  ]) {
    const raw = document(entries);
    let code = 0;
    if (mutation === "missing") raw.suites.pop();
    if (mutation === "duplicate") raw.suites[0] = raw.suites[1];
    if (mutation === "unknown") raw.suites[0].suites[0].specs[0].title = canary;
    if (mutation === "retry")
      raw.suites[0].suites[0].specs[0].tests[0].results[0].retry = 1;
    if (mutation === "root") raw.config.rootDir = "/unowned";
    if (mutation === "exit") code = 2;
    if (mutation === "stats") raw.stats.expected--;
    if (mutation === "interrupted")
      raw.suites[0].suites[0].specs[0].tests[0].results[0].status =
        "interrupted";
    assert.throws(
      () => normalizePhase(raw, entries, code, process.cwd()),
      /LOCAL_AAT/,
    );
  }
});
test("live-AAT profile adds exactly five reviewed probes without claiming candidate credit", async () => {
  const overview = require("./harness-public-overview.cjs");
  assert.equal(overview.profiles["local-aat"].length, 121);
  const records = overview.profiles["local-aat"].map((entry) => ({
    entry,
    observed: { status: "passed", aatOutcome: "response-passed" },
  }));
  const html = await overview.renderOverview(records, "local-aat");
  assert.match(html, /Live environment API diagnostics/);
  assert.match(html, /<td>5<\/td>/);
  assert.match(html, /deployed version.*unknown/i);
  assert.match(
    html,
    /0 \/ 112 catalogue requirements satisfied by accepted runtime evidence/,
  );
  assert.match(html, /No accepted candidate\/CCD runtime evidence is attached/);
  assert.doesNotMatch(html, /No validated native candidate application or CCD run is attached/);
});

test("known fixture login/header timeout is setup-blocked without leaking its private message", () => {
  const { normalizePhase } = api();
  const entries = fixture.selections.environment;
  const raw = document(entries),
    r = raw.suites[1].suites[0].specs[0].tests[0];
  r.status = "unexpected";
  r.results[0].status = "failed";
  r.results[0].error = {
    message: `${canary} Recent UI session capture failed locator.waitFor exui-header Timeout`,
    stack: "at createStorageStateViaUi (/owned/src/fixtures/api-auth.ts:365:1)",
  };
  raw.stats.expected--;
  raw.stats.unexpected++;
  const normalized = normalizePhase(raw, entries, 1, process.cwd());
  assert.equal(
    normalized.records[1].observed.aatOutcome,
    "login-setup-blocked",
  );
  assert.ok(!JSON.stringify(normalized).includes(canary));
  r.results[0].error.stack = "at unrelatedFixture";
  assert.equal(
    normalizePhase(raw, entries, 1, process.cwd()).records[1].observed
      .aatOutcome,
    "failure-unclassified",
  );
});
test("service-unavailable login bootstrap and cached rejection are setup-blocked; an endpoint failure is not", () => {
  const { normalizePhase } = api();
  for (const prefix of [
    "Unable to capture UI session for DIVORCE_SOLICITOR.",
    "Recent UI session capture failed for DIVORCE_SOLICITOR; refusing a repeated login attempt for now:",
  ]) {
    const entries = fixture.selections.environment;
    const raw = document(entries),
      result = raw.suites[1].suites[0].specs[0].tests[0];
    result.status = "unexpected";
    result.results[0].status = "failed";
    result.results[0].error = {
      message: `${prefix} UI bootstrap target returned a service-unavailable page (${canary})`,
      stack: "at createStorageStateViaUi (/owned/src/fixtures/api-auth.ts:365:1)",
    };
    raw.stats.expected--;
    raw.stats.unexpected++;
    const normalized = normalizePhase(raw, entries, 1, process.cwd());
    assert.equal(normalized.records[1].observed.aatOutcome, "login-setup-blocked");
    assert(!JSON.stringify(normalized).includes(canary));
    result.results[0].error.stack = "at request.get (/owned/src/tests/harness/diagnostic/configuration.spec.ts:30:1)";
    assert.equal(normalizePhase(raw, entries, 1, process.cwd()).records[1].observed.aatOutcome, "failure-unclassified");
  }
});
test("offline environment cannot receive credentials and AAT targets are fixed with owned UI storage", () => {
  const { phaseEnvironment, normalizePhase, AAT_ORIGIN, IDAM_ORIGIN } = api();
  const env = {
    PATH: "/bin",
    HOME: "/owned",
    TEST_URL: AAT_ORIGIN,
    TEST_ENV: "aat",
    IDAM_WEB_URL: IDAM_ORIGIN,
    SOLICITOR_USERNAME: canary,
    SOLICITOR_PASSWORD: canary,
    OTHER_SECRET: canary,
    PW_UI_STORAGE_PATH: "/foreign",
  };
  const projected = phaseEnvironment(env, "/owned/run");
  assert.ok(!JSON.stringify(projected.offline).includes(canary));
  assert.equal(
    projected.aat.PW_UI_STORAGE_PATH,
    "/owned/run/aat/ui-storage.json",
  );
  assert.equal(projected.aat.OTHER_SECRET, undefined);
  assert.throws(
    () =>
      phaseEnvironment(
        { ...env, TEST_URL: AAT_ORIGIN + "?q=" + canary },
        "/owned/run",
      ),
    /LOCAL_AAT/,
  );
  assert.throws(
    () =>
      normalizePhase(
        document(fixture.selections.environment),
        fixture.selections.environment,
        0,
        process.cwd(),
        { startedAt: Date.now(), finishedAt: Date.now() },
      ),
    /LOCAL_AAT/,
  );
});

test("AAT overview accounts for timed-out probes separately from failed callbacks", async () => {
  const overview = require("./harness-public-overview.cjs");
  let live = 0;
  const records = overview.profiles["local-aat"].map((entry) => ({
    entry,
    observed: overview.groupFor(entry.file) === "aat"
      ? { status: live++ === 1 ? "timedOut" : "failed", aatOutcome: "failure-unclassified" }
      : { status: "passed" },
  }));
  const html = await overview.renderOverview(records, "local-aat");
  assert.match(html, /0\/5 response checks passed; 4 failed callbacks \(0 blocked by login\/setup\); 1 timed out/);
});

test("real renderer combines121 records, labels login setup honestly, and resets across profiles", async (t) => {
  const os = require("node:os");
  const { normalizePhase } = api();
  const Reporter = require("./harness-public-odhin-reporter.cjs");
  const overview = require("./harness-public-overview.cjs");
  const previous = process.cwd(),
    root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "aat-report-"),
    );
  process.chdir(root);
  t.after(() => {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const raw = document(fixture.selections.environment);
  for (const suite of raw.suites.slice(1)) {
    const testCase = suite.suites[0].specs[0].tests[0];
    testCase.status = "unexpected";
    testCase.results[0].status = "failed";
    testCase.results[0].error = {
      message: `${canary} locator.waitFor exui-header Timeout`,
      stack:
        "at createStorageStateViaUi (/owned/src/fixtures/api-auth.ts:365:1)",
    };
  }
  raw.stats.expected = 1;
  raw.stats.unexpected = 4;
  const live = normalizePhase(raw, fixture.selections.environment, 1, root);
  const offline = normalizePhase(
    document(overview.entries),
    overview.entries,
    0,
    root,
  );
  const records = [...offline.records, ...live.records];
  const reporter = new Reporter({ selection: "local-aat" });
  const tests = records.map((record) => ({
    location: { file: path.join(root, record.entry.file) },
    titlePath: () => record.entry.titlePath,
    retries: 0,
    expectedStatus: "passed",
  }));
  reporter.onBegin({}, { allTests: () => tests });
  records.forEach((record, index) =>
    reporter.onTestEnd(tests[index], record.observed),
  );
  await reporter.onEnd({
    status: "failed",
    startTime: new Date("2026-11-03T12:00:00Z"),
    duration: 1000,
  });
  const html = fs.readFileSync(
    path.join(root, "functional-output/tests/harness/public/odhin/index.html"),
    "utf8",
  );
  assert.match(
    html,
    /1\/5 response checks passed; 4 failed callbacks \(4 blocked by login\/setup\)/,
  );
  assert.match(html, /login-setup-blocked/);
  assert.ok(!html.includes(canary));
  assert.equal(Reporter.validatePublicReport("local-aat").tests, 121);
  assert.equal(Reporter.validatePublicReport().selection, "local-aat");
  assert.throws(() => Reporter.validatePublicReport("harness"), /PUBLIC_ODHIN/);
  Reporter.resetPublicReport("harness");
  assert.ok(
    !fs.existsSync(
      path.join(
        root,
        "functional-output/tests/harness/public/odhin/index.html",
      ),
    ),
  );
});

test("global-search family mismatch exposes only reviewed codes, never arbitrary raw errors", async () => {
  const { normalizePhase } = api();
  const overview = require("./harness-public-overview.cjs");
  const raw = document(fixture.selections.environment),
    testCase = raw.suites[2].suites[0].specs[0].tests[0];
  testCase.status = "unexpected";
  testCase.results[0].status = "failed";
  testCase.results[0].error = {
    message: `Error: api/globalSearch/services is missing central must-run service families: DIVORCE, PROBATE\n${canary}`,
  };
  raw.stats.expected--;
  raw.stats.unexpected++;
  const phase = normalizePhase(
    raw,
    fixture.selections.environment,
    1,
    process.cwd(),
  );
  assert.equal(
    phase.records[2].observed.aatOutcome,
    "service-family-contract-mismatch",
  );
  assert.deepEqual(phase.records[2].observed.aatMissingFamilies, [
    "DIVORCE",
    "PROBATE",
  ]);
  const records = [
    ...overview.entries.map((entry) => ({
      entry,
      observed: { status: "passed" },
    })),
    ...phase.records,
  ];
  const html = await overview.renderOverview(records, "local-aat");
  assert.match(html, /Required service-family contract differs/);
  assert.match(html, /Divorce \(DIVORCE\), Probate \(PROBATE\)/);
  assert.match(
    html,
    /116 local Harness\/model checks \+ 5 live AAT probes = 121 checks/,
  );
  assert.match(html, /AAT: 4\/5 response checks passed/);
  assert.match(html, /one configured solicitor session/);
  const dom = require("node-html-parser").parse(html);
  assert.equal(
    dom.querySelectorAll("#harness-lanes tbody tr[data-lane]").length,
    4,
  );
  assert.ok(
    html.indexOf("data-aat-contract-mismatch") <
      html.indexOf('id="harness-lanes"'),
  );

  assert.ok(!html.includes(canary));
  testCase.results[0].error.message =
    "Error: api/globalSearch/services is missing central must-run service families: UNKNOWN_SECRET";
  assert.equal(
    normalizePhase(raw, fixture.selections.environment, 1, process.cwd())
      .records[2].observed.aatOutcome,
    "failure-unclassified",
  );
});

test("actual controller launches AAT in its fresh private cwd with absolute config and observes complete failure", async (t) => {
  const os = require("node:os");
  const { EventEmitter } = require("node:events");
  const cp = require("node:child_process");
  const previous = process.cwd(),
    root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "aat-controller-"),
    );
  process.chdir(root);
  const oldSpawn = cp.spawn;
  t.after(() => {
    cp.spawn = oldSpawn;
    delete require.cache[modulePath];
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const calls = [];
  cp.spawn = function (command, args, options) {
    const isAat = options.env.EXUI_DIAGNOSTIC_SELECTION === "environment";
    calls.push({ command, args, options });
    const entries = isAat
      ? fixture.selections.environment
      : require("./harness-public-overview.cjs").entries;
    const raw = document(entries);
    raw.config.rootDir = root;
    raw.stats.startTime = new Date().toISOString();
    raw.stats.duration = 1;
    for (const suite of raw.suites)
      for (const nested of suite.suites)
        for (const spec of nested.specs)
          spec.tests[0].results[0].startTime = raw.stats.startTime;
    if (isAat) {
      const testCase = raw.suites[2].suites[0].specs[0].tests[0];
      testCase.status = "unexpected";
      testCase.results[0].status = "failed";
      testCase.results[0].error = {
        message:
          "Error: api/globalSearch/services is missing central must-run service families: DIVORCE, PROBATE",
      };
      raw.stats.expected--;
      raw.stats.unexpected++;
    }
    fs.writeFileSync(
      options.env.PLAYWRIGHT_JSON_OUTPUT_FILE,
      JSON.stringify(raw),
    );
    const child = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => child.emit("close", isAat ? 1 : 0, null));
    return child;
  };
  delete require.cache[modulePath];
  const { runLocalAat, AAT_ORIGIN, IDAM_ORIGIN } = require(modulePath);
  const result = await runLocalAat({
    PATH: "/bin",
    HOME: "/owned",
    TEST_URL: AAT_ORIGIN,
    TEST_ENV: "aat",
    IDAM_WEB_URL: IDAM_ORIGIN,
    SOLICITOR_USERNAME: canary,
    SOLICITOR_PASSWORD: canary,
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.status, "failed");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.cwd, root);
  assert.equal(calls[0].options.env.SOLICITOR_PASSWORD, undefined);
  const aat = calls[1];
  assert.notEqual(aat.options.cwd, root);
  assert.equal(path.basename(aat.options.cwd), "aat");
  assert.ok(
    aat.options.cwd.startsWith(
      path.join(root, "functional-output/tests/harness/private/.local-aat-"),
    ),
  );
  assert.equal(
    aat.args[aat.args.indexOf("--config") + 1],
    path.join(root, "playwright.harness-diagnostic.config.ts"),
  );
  assert.equal(
    aat.options.env.PW_UI_STORAGE_PATH,
    path.join(aat.options.cwd, "ui-storage.json"),
  );
  assert.ok(fs.statSync(aat.options.cwd).isDirectory());
  const report =
    require("./harness-public-odhin-reporter.cjs").validatePublicReport(
      "local-aat",
    );
  assert.equal(report.tests, 121);
  assert.equal(report.counts.passed, 120);
  assert.equal(report.counts.failed, 1);
});

test("live family labels do not trust the separate legacy central arrays", async () => {
  const overview = require("./harness-public-overview.cjs");
  const legacy = require("../src/data/exui-central-assurance-source.json")
    .rpxXuiWebapp["config/default.json"];
  const records = overview.profiles["local-aat"].map((entry) => ({
    entry,
    observed: { status: "passed", aatOutcome: "response-passed" },
  }));
  const before = await overview.renderOverview(records, "local-aat");
  const previous = legacy.globalSearchServices;
  try {
    legacy.globalSearchServices = [];
    const after = await overview.renderOverview(records, "local-aat");
    assert.equal(
      after,
      before,
      "live labels must come from the independently validated default projection",
    );
  } finally {
    legacy.globalSearchServices = previous;
  }
});

test("three exact AAT profile comparisons use a fixed safe mismatch enum and source provenance", async () => {
  const { normalizePhase } = api();
  const overview = require("./harness-public-overview.cjs");
  const endpoints = [
    "api/globalSearch/services",
    "api/wa-supported-jurisdiction/get",
    "api/staff-supported-jurisdiction/get",
  ];
  for (let index = 2; index < 5; index++) {
    const raw = document(fixture.selections.environment),
      t = raw.suites[index].suites[0].specs[0].tests[0];
    t.status = "unexpected";
    t.results[0].status = "failed";
    t.results[0].error = {
      message: `${endpoints[index - 2]} differs from reviewed AAT service-family profile ${canary}`,
      stack:
        "at test (/owned/src/tests/harness/diagnostic/configuration.spec.ts:95:1)",
    };
    raw.stats.expected--;
    raw.stats.unexpected++;
    const phase = normalizePhase(
      raw,
      fixture.selections.environment,
      1,
      process.cwd(),
    );
    assert.equal(
      phase.records[index].observed.aatOutcome,
      "aat-profile-contract-mismatch",
    );
    const records = [
      ...overview.entries.map((entry) => ({
        entry,
        observed: { status: "passed" },
      })),
      ...phase.records,
    ];
    const html = await overview.renderOverview(records, "local-aat");
    assert.match(
      html,
      /cnp-flux-config@a88143b0bcb815056f7abdb41d1911ccb3144b5d/,
    );
    assert.match(html, /AAT global\/WA explicitly include SSCS/);
    assert.ok(!html.includes(canary));
  }
});
test("local-AAT overview refuses AAT source drift even when all121 callbacks passed", async () => {
  const overview = require("./harness-public-overview.cjs");
  const source = require("./fixtures/exui-aat-profile-source.json");
  const records = overview.profiles["local-aat"].map((entry) => ({
    entry,
    observed: { status: "passed", aatOutcome: "response-passed" },
  }));
  const original = source.environment.GLOBAL_SEARCH_SERVICES.value;
  try {
    source.environment.GLOBAL_SEARCH_SERVICES.value = "IA";
    await assert.rejects(
      () => overview.renderOverview(records, "local-aat"),
      /AAT_PROFILE_SOURCE_DRIFT/,
    );
  } finally {
    source.environment.GLOBAL_SEARCH_SERVICES.value = original;
  }
});

test("credential-free collection runs only116 offline tests and preserves every native exit status", async (t) => {
  const os = require("node:os"),
    { EventEmitter } = require("node:events"),
    cp = require("node:child_process");
  const previous = process.cwd(),
    root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "offline-collection-"),
    );
  process.chdir(root);
  const Reporter = require("./harness-public-odhin-reporter.cjs");
  const oldSpawn = cp.spawn,
    oldPrepare = Reporter.prototype.prepareNativeEvidence,
    oldCompatibility = Reporter.prototype.prepareCompatibilityEvidence,
    oldSharedNested = Reporter.prototype.prepareSharedNestedAttempt,
    oldEnd = Reporter.prototype.onEnd;
  t.after(() => {
    cp.spawn = oldSpawn;
    Reporter.prototype.prepareNativeEvidence = oldPrepare;
    Reporter.prototype.prepareCompatibilityEvidence = oldCompatibility;
    Reporter.prototype.prepareSharedNestedAttempt = oldSharedNested;
    Reporter.prototype.onEnd = oldEnd;
    delete require.cache[modulePath];
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const calls = [];
  let clock=0, expectedVerificationMs=25;
  t.mock.method(performance,"now",()=>clock);
  let profileInclusion;
  let nativeStatus = "BLOCKED",
    nativeExitCode = 2;
  Reporter.prototype.prepareNativeEvidence = async function (descriptor) {
    assert.equal(descriptor, "/explicit/descriptor.json");
    calls.push("validate-native");
    clock+=25;
    this.nativeEvidence = {
      status: nativeStatus,
      ...(profileInclusion ? {divorceProfileAdmission:{joint:{status:profileInclusion}}} : {}),
      exitCode: nativeExitCode,
      descriptorDigest: "sha256:" + "a".repeat(64),
    };
  };
  Reporter.prototype.onEnd = async function () {
    calls.push("render");
    assert.equal(this.results.size, 116);
    assert.equal(this.diagnosticSource.state, "unavailable");
    assert.equal(this.phaseTimings.length, 2);
    assert.equal(this.phaseTimings[0].durationMs, 1000);
    const verification = this.phaseTimings[1];
    assert.equal(verification.label, "Native evidence and interpreter verification");
    assert.equal(verification.durationMs,expectedVerificationMs);
    assert.equal(this.nativeElapsedMs, 1000 + verification.durationMs);
  };
  cp.spawn = (_command, _args, options) => {
    calls.push("offline");
    assert.equal(options.env.SOLICITOR_PASSWORD, undefined);
    assert.equal(options.env.EXUI_DIAGNOSTIC_SELECTION, undefined);
    assert.equal(options.cwd, root);
    const raw = document(require("./harness-public-overview.cjs").entries);
    raw.stats.startTime = new Date().toISOString();
    raw.stats.duration = 0;
    for (const suite of raw.suites)
      for (const nested of suite.suites)
        for (const spec of nested.specs)
          spec.tests[0].results[0].startTime = raw.stats.startTime;
    fs.writeFileSync(
      options.env.PLAYWRIGHT_JSON_OUTPUT_FILE,
      JSON.stringify(raw),
    );
    const child = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => child.emit("close", 0, null));
    return child;
  };
  delete require.cache[modulePath];
  const { runHarnessCollection } = require(modulePath);
  for (const [status, code] of [
    ["BLOCKED", 2],
    ["FAIL", 1],
    ["PASS", 0],
  ]) {
    nativeStatus = status;
    nativeExitCode = code;
    const result = await runHarnessCollection(
      { PATH: "/bin", SOLICITOR_PASSWORD: canary },
      { profile: "harness", nativeEvidencePath: "/explicit/descriptor.json", nativeElapsedMs:1000, phaseTimings:[{label:"WA family",status:"completed",durationMs:1000,startedAt:new Date().toISOString()}] },
    );
    assert.deepEqual(result, {
      status: "passed",
      nativeStatus: status,
      exitCode: code,
    });
  }
  assert.deepEqual(
    calls,
    Array(3).fill(["validate-native", "offline", "render"]).flat(),
  );
  for (const inclusion of ['separate','included']) {
    profileInclusion=inclusion;
    const result=await runHarnessCollection({}, {nativeEvidencePath:'/explicit/descriptor.json',nativeElapsedMs:1000,phaseTimings:[{label:'WA family',status:'completed',durationMs:1000,startedAt:new Date().toISOString()}]});
    assert.equal(result.divorceProfileInclusion,inclusion);
    assert.deepEqual(calls.slice(-3),['validate-native','offline','render']);
  }
  profileInclusion=undefined;
  Reporter.prototype.prepareCompatibilityEvidence = async function (descriptor) {
    assert.equal(descriptor,"/explicit/compatibility.json");assert.equal(this.nativeEvidence.status,"PASS");
    calls.push("validate-compatibility");clock+=35;
  };
  expectedVerificationMs=60;
  await runHarnessCollection({}, {nativeEvidencePath:"/explicit/descriptor.json",compatibilityEvidencePath:"/explicit/compatibility.json",nativeElapsedMs:1000,phaseTimings:[{label:"WA family",status:"completed",durationMs:1000,startedAt:new Date().toISOString()}]});
  assert.deepEqual(calls.slice(-4),["validate-native","validate-compatibility","offline","render"]);
  Reporter.prototype.prepareSharedNestedAttempt = async function(descriptor) {
    assert.equal(descriptor,"/explicit/nested.json");calls.push("validate-shared-nested");clock+=45;
    this.sharedNestedAttemptEvidence={status:"BLOCKED"};
  };
  expectedVerificationMs=105;
  const nested=await runHarnessCollection({}, {nativeEvidencePath:"/explicit/descriptor.json",compatibilityEvidencePath:"/explicit/compatibility.json",sharedNestedAttemptPath:"/explicit/nested.json",nativeElapsedMs:1000,phaseTimings:[{label:"WA family",status:"completed",durationMs:1000,startedAt:new Date().toISOString()}]});
  assert.deepEqual(nested,{status:"passed",nativeStatus:"PASS",sharedNestedStatus:"BLOCKED",exitCode:2});
  assert.deepEqual(calls.slice(-5),["validate-native","validate-compatibility","validate-shared-nested","offline","render"]);
  Reporter.prototype.prepareCompatibilityEvidence = async function (descriptor) {
    assert.equal(descriptor,"/explicit/compatibility.json");assert.equal(this.nativeEvidence.status,"PASS");
    calls.push("validate-compatibility");throw new Error("APPLICANT_REPORT_EVIDENCE_INVALID");
  };
  await assert.rejects(runHarnessCollection({}, {nativeEvidencePath:"/explicit/descriptor.json",compatibilityEvidencePath:"/explicit/compatibility.json"}),/APPLICANT_REPORT_EVIDENCE_INVALID/);
  assert.deepEqual(calls.slice(-2),["validate-native","validate-compatibility"]);
  Reporter.prototype.prepareNativeEvidence = async () => {
    throw new Error("NATIVE_REPORT_IDENTITY_MISMATCH");
  };
  await assert.rejects(
    runHarnessCollection({}, { nativeEvidencePath: "/invalid" }),
    /IDENTITY_MISMATCH/,
  );
  assert.equal(
    calls.length,
    26,
    "invalid evidence must not launch diagnostics or publish",
  );
});

test('collector abort during evidence preparation launches no diagnostics and withdraws old report',async t=>{
 const os=require('node:os'),cp=require('node:child_process'),previous=process.cwd(),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'collector-abort-')));process.chdir(root);
 const Reporter=require('./harness-public-odhin-reporter.cjs'),oldPrepare=Reporter.prototype.prepareNativeEvidence,oldSpawn=cp.spawn;let launches=0;
 t.after(()=>{Reporter.prototype.prepareNativeEvidence=oldPrepare;cp.spawn=oldSpawn;delete require.cache[modulePath];process.chdir(previous);fs.rmSync(root,{recursive:true,force:true});});
 const controller=new AbortController();Reporter.prototype.prepareNativeEvidence=async()=>{await Promise.resolve();controller.abort();};cp.spawn=()=>{launches++;throw Error('UNEXPECTED_DIAGNOSTIC_LAUNCH');};delete require.cache[modulePath];
 await assert.rejects(require(modulePath).runHarnessCollection({PATH:process.env.PATH},{nativeEvidencePath:'/private/native.json',signal:controller.signal}),/LOCAL_AAT_INCOMPLETE_OR_INVALID/);
 assert.equal(launches,0);assert.equal(fs.existsSync(path.join(root,'functional-output/tests/harness/public/odhin/index.html')),false);
});

test('one successful diagnostic collection keeps a nonadmitted profile BLOCKED',async t=>{
 const os=require('node:os'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),previous=process.cwd(),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'collector-profile-blocked-')));process.chdir(root);const oldSpawn=cp.spawn;
 t.after(()=>{cp.spawn=oldSpawn;delete require.cache[modulePath];process.chdir(previous);fs.rmSync(root,{recursive:true,force:true});});let calls=0;
 cp.spawn=(_file,_args,options)=>{calls++;const raw=document(require('./harness-public-overview.cjs').entries);raw.config.rootDir=root;raw.stats.startTime=new Date().toISOString();raw.stats.duration=1;for(const suite of raw.suites)for(const child of suite.suites)for(const spec of child.specs)spec.tests[0].results[0].startTime=raw.stats.startTime;fs.writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE,JSON.stringify(raw));const child=new EventEmitter();child.kill=()=>{};setImmediate(()=>child.emit('close',0,null));return child;};delete require.cache[modulePath];
 const attempt={schemaVersion:1,kind:'divorce-profile-attempt',status:'BLOCKED',reason:'profile-not-admitted',durationMs:2000};const result=await require(modulePath).runHarnessCollection({PATH:process.env.PATH},{divorceProfileAttempt:attempt});assert.equal(calls,1);assert.equal(result.status,'passed');assert.equal(result.exitCode,2);const record=require('./harness-public-odhin-reporter.cjs').validatePublicReport();assert.equal(record.tests,116);assert.deepEqual(record.divorceProfileAttempt,attempt);assert.equal(record.nativeEvidence,null);
});

test('collector handles abort plus process signal once and observes diagnostic child close',async t=>{
 const os=require('node:os'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),previous=process.cwd(),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'collector-stop-once-')));process.chdir(root);const oldSpawn=cp.spawn;
 t.after(()=>{cp.spawn=oldSpawn;delete require.cache[modulePath];process.chdir(previous);fs.rmSync(root,{recursive:true,force:true});});
 for(const duringSpawn of [false,true]){const controller=new AbortController(),signals=[],child=new EventEmitter();let launches=0;
  child.kill=signal=>{signals.push(signal);queueMicrotask(()=>child.emit('close',143,null));};
  cp.spawn=()=>{launches++;if(duringSpawn)controller.abort();else setImmediate(()=>{controller.abort();process.emit('SIGTERM');});return child;};delete require.cache[modulePath];
  await assert.rejects(require(modulePath).runHarnessCollection({PATH:process.env.PATH},{signal:controller.signal}),/LOCAL_AAT_INCOMPLETE_OR_INVALID/);assert.equal(launches,1);assert.deepEqual(signals,['SIGTERM']);assert.equal(fs.existsSync(path.join(root,'functional-output/tests/harness/public/odhin/index.html')),false);
 }
});
