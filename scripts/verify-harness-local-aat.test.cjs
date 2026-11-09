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
                      steps: require('./harness-public-check-steps.cjs').methodFor(entry).steps.map(step=>({title:'harness-check:'+step.id,duration:1,steps:step.id==='auth-basic-csrf'?['csrf-present','csrf-absent'].map(id=>({title:'harness-detail:'+id,duration:1,steps:[]})):[]})),
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
    testCase.results[0].steps = []; // Failed setup cannot supply later method events.
    testCase.results[0].error = {
      message: `${canary} locator.waitFor exui-header Timeout`,
      stack:
        "at createStorageStateViaUi (/owned/src/fixtures/api-auth.ts:365:1)",
    };
  }
  raw.stats.expected = 1;
  raw.stats.unexpected = 4;
  const live = normalizePhase(raw, fixture.selections.environment, 1, root);
  const offlineDocument=document(overview.entries);
  const offline = normalizePhase(offlineDocument,overview.entries,0,root);
  const Capture=require('./harness-public-detail-recorder.cjs'),captures=[];
  for(const [phase,document,normalized]of [['offline',offlineDocument,offline],['aat',raw,live]]){
    const directory=path.join(root,'captured-'+phase);fs.mkdirSync(directory);const request=Capture.preparePhase(directory,phase,root);
    emitSyntheticDetailSidecar({env:{HARNESS_DETAIL_REQUEST_PATH:request.path,HARNESS_DETAIL_REQUEST_DIGEST:request.digest}},document);
    const jsonFile=path.join(directory,'playwright.json'),bytes=JSON.stringify(document);fs.writeFileSync(jsonFile,bytes);const held=Capture.holdPhase(request,jsonFile,'sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex'));Capture.bindPhase(normalized,held);captures.push(held);
  }
  const records = [...offline.records, ...live.records];
  const reporter = new Reporter({ selection: "local-aat" });
  reporter.detailPhaseCaptures=captures;
  const tests = records.map((record) => ({
    location: { file: path.join(root, record.entry.file) },
    titlePath: () => record.entry.titlePath,
    retries: 0,
    expectedStatus: "passed",
  }));
  reporter.onBegin({harnessRunnerPhases:["offline","aat"]}, { allTests: () => tests });
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
    );emitSyntheticDetailSidecar(options,raw);
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
  assert.deepEqual(report.diagnosticWorkers.observed,[{phase:"offline",workerIndex:0},{phase:"aat",workerIndex:0}]);
  assert.deepEqual(report.diagnosticWorkers.runners,[{phase:"offline",configuredWorkers:1},{phase:"aat",configuredWorkers:1}]);
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
  let profileInclusion,personalInclusion;
  const frProfileAttempt={schemaVersion:1,kind:'fr-profile-attempt',status:'BLOCKED',reason:'FR_PROFILE_MEMBERSHIP'};let expectedFrProfileAttempt=frProfileAttempt;
  let nativeStatus = "BLOCKED",
    nativeExitCode = 2;
  Reporter.prototype.prepareNativeEvidence = async function (descriptor) {
    assert.equal(descriptor, "/explicit/descriptor.json");
    calls.push("validate-native");
    clock+=25;
    this.nativeEvidence = {
      status: nativeStatus,
      ...(profileInclusion ? {divorceProfileAdmission:{joint:{status:profileInclusion}}} : {}),
      ...(personalInclusion?{personalServiceAdmission:{joint:{status:personalInclusion}}}:{}),
      exitCode: nativeExitCode,
      descriptorDigest: "sha256:" + "a".repeat(64),
    };
  };
  Reporter.prototype.onEnd = async function () {
    calls.push("render");
    assert.deepEqual(this.frProfileAttempt,expectedFrProfileAttempt);
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
    );emitSyntheticDetailSidecar(options,raw);
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
      { profile: "harness", nativeEvidencePath: "/explicit/descriptor.json", frProfileAttempt, nativeElapsedMs:1000, phaseTimings:[{label:"WA family",status:"completed",durationMs:1000,startedAt:new Date().toISOString()}] },
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
  expectedFrProfileAttempt=undefined;
  for (const inclusion of ['separate','included']) {
    profileInclusion=inclusion;
    const result=await runHarnessCollection({}, {nativeEvidencePath:'/explicit/descriptor.json',nativeElapsedMs:1000,phaseTimings:[{label:'WA family',status:'completed',durationMs:1000,startedAt:new Date().toISOString()}]});
    assert.equal(result.divorceProfileInclusion,inclusion);
    assert.deepEqual(calls.slice(-3),['validate-native','offline','render']);
  }
  profileInclusion=undefined;
  for(const inclusion of [undefined,'separate','included']){
    personalInclusion=inclusion;
    const result=await runHarnessCollection({}, {nativeEvidencePath:'/explicit/descriptor.json',nativeElapsedMs:1000,phaseTimings:[{label:'WA family',status:'completed',durationMs:1000,startedAt:new Date().toISOString()}]});
    assert.equal(result.personalServiceInclusion,inclusion);assert.equal(Object.hasOwn(result,'personalServiceInclusion'),Boolean(inclusion));assert.deepEqual(calls.slice(-3),['validate-native','offline','render']);
  }
  personalInclusion=undefined;
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
    35,
    "invalid evidence must not launch diagnostics or publish",
  );
});

test('collector abort during evidence preparation launches no diagnostics and withdraws old report',async t=>{
 const os=require('node:os'),cp=require('node:child_process'),previous=process.cwd(),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'collector-abort-')));process.chdir(root);
 const Reporter=require('./harness-public-odhin-reporter.cjs'),oldPrepare=Reporter.prototype.prepareNativeEvidence,oldSpawn=cp.spawn;let launches=0,snapshots=0;
 t.after(()=>{Reporter.prototype.prepareNativeEvidence=oldPrepare;cp.spawn=oldSpawn;delete require.cache[modulePath];process.chdir(previous);fs.rmSync(root,{recursive:true,force:true});});
 const controller=new AbortController();Reporter.prototype.prepareNativeEvidence=async()=>{await Promise.resolve();controller.abort();};cp.spawn=()=>{launches++;throw Error('UNEXPECTED_DIAGNOSTIC_LAUNCH');};delete require.cache[modulePath];
 await assert.rejects(require(modulePath).runHarnessCollection({PATH:process.env.PATH},{nativeEvidencePath:'/private/native.json',signal:controller.signal,snapshotAssuranceTiming:()=>{snapshots++;assert.fail('aborted work sampled');}}),/LOCAL_AAT_INCOMPLETE_OR_INVALID/);
 assert.equal(launches,0);assert.equal(snapshots,0);assert.equal(fs.existsSync(path.join(root,'functional-output/tests/harness/public/odhin/index.html')),false);
});

test('one successful diagnostic collection keeps a nonadmitted profile BLOCKED',async t=>{
 const os=require('node:os'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),previous=process.cwd(),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'collector-profile-blocked-')));process.chdir(root);const oldSpawn=cp.spawn;
 t.after(()=>{cp.spawn=oldSpawn;delete require.cache[modulePath];process.chdir(previous);fs.rmSync(root,{recursive:true,force:true});});let calls=0;
 cp.spawn=(_file,_args,options)=>{calls++;const raw=document(require('./harness-public-overview.cjs').entries);raw.config.rootDir=root;raw.stats.startTime=new Date().toISOString();raw.stats.duration=1;for(const suite of raw.suites)for(const child of suite.suites)for(const spec of child.specs)spec.tests[0].results[0].startTime=raw.stats.startTime;fs.writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE,JSON.stringify(raw));emitSyntheticDetailSidecar(options,raw);const child=new EventEmitter();child.kill=()=>{};setImmediate(()=>child.emit('close',0,null));return child;};delete require.cache[modulePath];
 const attempt={schemaVersion:1,kind:'divorce-profile-attempt',status:'BLOCKED',reason:'profile-not-admitted',durationMs:2000};const result=await require(modulePath).runHarnessCollection({PATH:process.env.PATH},{divorceProfileAttempt:attempt});assert.equal(calls,1);assert.equal(result.status,'passed');assert.equal(result.exitCode,2);const record=require('./harness-public-odhin-reporter.cjs').validatePublicReport();assert.equal(record.tests,116);assert.deepEqual(record.divorceProfileAttempt,attempt);assert.equal(record.nativeEvidence,null);assert.equal(record.assuranceTiming,undefined);
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

test('assurance timing is sampled once after actual collector replay diagnostics and metadata before onEnd',async t=>{
 const os=require('node:os'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
 const previous=process.cwd(),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'assurance-timing-')));process.chdir(root);
 const Reporter=require('./harness-public-odhin-reporter.cjs'),oldSpawn=cp.spawn,oldPrepare=Reporter.prototype.prepareNativeEvidence,oldEnd=Reporter.prototype.onEnd;
 t.after(()=>{cp.spawn=oldSpawn;Reporter.prototype.prepareNativeEvidence=oldPrepare;Reporter.prototype.onEnd=oldEnd;delete require.cache[modulePath];process.chdir(previous);fs.rmSync(root,{recursive:true,force:true});});
 let now=0,samples=0;const events=[];t.mock.method(performance,'now',()=>now);
 Reporter.prototype.prepareNativeEvidence=async function(){events.push('replay');now+=50;this.nativeEvidence={status:'PASS',exitCode:0,descriptorDigest:'sha256:'+'a'.repeat(64),...Object.fromEntries(['divorceProfileAdmission','personalServiceAdmission','complexEmailAdmission'].map(key=>[key,{joint:{status:'included'}}]))};};
 cp.spawn=(_file,_args,options)=>{
  const raw=document(require('./harness-public-overview.cjs').entries);raw.config.rootDir=root;raw.stats.startTime=new Date().toISOString();raw.stats.duration=1;
  for(const suite of raw.suites)for(const nested of suite.suites)for(const spec of nested.specs)spec.tests[0].results[0].startTime=raw.stats.startTime;
  fs.writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE,JSON.stringify(raw));emitSyntheticDetailSidecar(options,raw);const child=new EventEmitter();child.kill=()=>assert.fail('unexpected cancellation');setImmediate(()=>{events.push('diagnostics');now+=300;child.emit('close',0,null);});return child;
 };
 Reporter.prototype.onEnd=async function(){events.push('onEnd');assert.equal(samples,1);assert.equal(this.assuranceTiming.elapsedMs,10480);assert.equal(this.nativeElapsedMs,180);assert.equal(this.results.size,116);assert.deepEqual(events,['replay','diagnostics','snapshot','onEnd']);const privateRoot=path.join(root,'functional-output/tests/harness/private');const run=fs.readdirSync(privateRoot).find(name=>name.startsWith('.local-aat-'));assert(fs.existsSync(path.join(privateRoot,run,'collection.json')));};
 delete require.cache[modulePath];const {runHarnessCollection}=require(modulePath),{runAssuranceSequence}=await import('./run-harness-assurance.mjs');
 const request=runId=>({path:'/private/'+runId+'.json',runId,digest:'sha256:'+'a'.repeat(64)});
 const result=await runAssuranceSequence({clock:()=>now,native:async()=>{now+=100;return {status:'PASS',exitCode:0,continuationSafe:true};},prepare:async()=>{now+=10;},profile:async()=>{now+=5000;return {status:'passed',reportRequest:request('profile')};},personal:async()=>{now+=2000;return {status:'passed',reportRequest:request('personal')};},complex:async()=>{now+=3000;return {status:'passed',reportRequest:request('complex-00000000-0000-4000-8000-000000000001')};},descriptor:async()=>{now+=20;return '/private/native.json';},collect:(nativeEvidencePath,timing)=>runHarnessCollection({}, {nativeEvidencePath,...timing,snapshotAssuranceTiming:async()=>{events.push('snapshot');samples++;await Promise.resolve();return timing.snapshotAssuranceTiming();}})});
 assert.equal(result.exitCode,0);assert.equal(samples,1);assert.equal(result.releaseApproval,false);
});

test('canonical JSON collector forwards only actual reviewed check scalars and fails passed missing steps',()=>{
  const {normalizePhase}=api(),helper=require('./harness-public-check-steps.cjs'),entry=fixture.selections.support[0],method=helper.methodFor(entry);
  const raw=document([entry]),observed=raw.suites[0].suites[0].specs[0].tests[0].results[0];
  observed.steps=method.steps.map(step=>({title:'harness-check:'+step.id,duration:7,error:undefined,subtitle:canary,location:{file:canary},attachments:[{body:canary}],steps:step.id==='auth-basic-csrf'?['csrf-present','csrf-absent'].map(id=>({title:'harness-detail:'+id,duration:2,steps:[]})):[{title:canary,duration:1}]}));
  const phase=normalizePhase(raw,[entry],0,process.cwd());
  assert.deepEqual(phase.records[0].observed.checkSteps,method.steps.map((step,index)=>({id:step.id,status:'passed',durationMs:7,order:index+1})));
  assert(!JSON.stringify(phase).includes(canary));assert.equal(phase.records[0].observed.steps,undefined);
  delete observed.steps;assert.throws(()=>normalizePhase(raw,[entry],0,process.cwd()),/PUBLIC_ODHIN_CHECK/);
  observed.steps=[{title:'harness-check:foreign',duration:1}];assert.throws(()=>normalizePhase(raw,[entry],0,process.cwd()),/PUBLIC_ODHIN_CHECK/);
});
test('canonical JSON failed setup keeps missing check stages unrecorded without fabricating operations',()=>{
  const {normalizePhase}=api(),entry=fixture.selections.support[0],raw=document([entry]),single=raw.suites[0].suites[0].specs[0].tests[0];
  single.status='unexpected';single.results[0].status='failed';single.results[0].steps=undefined;single.results[0].errors=[{message:canary}];raw.stats.expected=0;raw.stats.unexpected=1;
  const phase=normalizePhase(raw,[entry],1,process.cwd());assert.deepEqual(phase.records[0].observed.checkSteps,[]);assert(!JSON.stringify(phase).includes(canary));
});

test('collector runner identity comes only from fixed selected phase and rejects unknown or wrong phase',()=>{
 const {normalizePhase}=api(),entry=fixture.selections.support[0],raw=document([entry]);raw.runnerPhase=canary;raw.suites[0].suites[0].specs[0].tests[0].results[0].runnerPhase='aat';
 assert.equal(normalizePhase(raw,[entry],0,process.cwd(),undefined,'offline').records[0].observed.runnerPhase,'offline');
 for(const phase of ['aat','direct',canary])assert.throws(()=>normalizePhase(raw,[entry],0,process.cwd(),undefined,phase),/LOCAL_AAT/);
});

test('canonical JSON retains both real CSRF child scalars and rejects missing duplicate and wrong-parent detail',()=>{
 const {normalizePhase}=api(),entry=fixture.selections.support.find(row=>row.titlePath.at(-1)==='extractCsrf parses token and returns undefined when missing'),raw=document([entry]),observed=raw.suites[0].suites[0].specs[0].tests[0].results[0],original=structuredClone(observed.steps);
 const safe=normalizePhase(raw,[entry],0,process.cwd()).records[0].observed;assert.deepEqual(safe.jsonCheckDetails.map(row=>[row.id,row.status,row.durationMs,row.order]),[['csrf-present','passed',1,1],['csrf-absent','passed',1,2]]);assert(!JSON.stringify(safe).includes(canary));
 for(const mutate of [r=>r[0].steps=[],r=>r[0].steps.push(r[0].steps[0]),r=>r.push(r[0].steps.shift()),r=>r[0].steps[1].title='harness-detail:foreign']){observed.steps=structuredClone(original);mutate(observed.steps);assert.throws(()=>normalizePhase(raw,[entry],0,process.cwd()),/PUBLIC_ODHIN_CHECK_DETAILS/);}
});

// Synthetic framework events for existing fake-process collector tests only.
// Real installed JSON skip loss is proved separately by an actual Playwright run.
function emitSyntheticDetailSidecar(options,raw){
 const Recorder=require('./harness-public-detail-recorder.cjs'),names=['HARNESS_DETAIL_REQUEST_PATH','HARNESS_DETAIL_REQUEST_DIGEST'],previous=names.map(name=>process.env[name]);
 try{names.forEach(name=>process.env[name]=options.env[name]);const recorder=new Recorder(),cases=[];for(const suite of raw.suites)for(const nested of suite.suites??[])for(const spec of nested.specs??[]){const entry=require('./harness-public-overview.cjs').profiles['local-aat'].find(row=>row.file===spec.file&&row.titlePath.at(-1)===spec.title);assert(entry);cases.push({entry,result:spec.tests[0].results[0]});}const tests=cases.map(({entry})=>({location:{file:path.join(raw.config.rootDir,entry.file)},titlePath:()=>entry.titlePath}));recorder.onBegin({}, {allTests:()=>tests});const framework=rows=>(rows??[]).map(row=>({...row,category:'test.step',steps:framework(row.steps)}));cases.forEach(({result},index)=>recorder.onTestEnd(tests[index],{...result,steps:framework(result.steps)}));recorder.onEnd();}finally{names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];});}
}
function capturedCsrfPhase(t,skipFirst=false){
 const Capture=require('./harness-public-detail-recorder.cjs'),entry=fixture.selections.support.find(row=>row.titlePath.at(-1)==='extractCsrf parses token and returns undefined when missing'),root=fs.realpathSync(process.cwd()),directory=fs.mkdtempSync(path.join(fs.realpathSync(require('node:os').tmpdir()),'csrf-phase-unit-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const request=Capture.preparePhase(directory,'offline',root),raw=document([entry]),observed=raw.suites[0].suites[0].specs[0].tests[0].results[0],framework=rows=>rows.map(row=>({...row,category:'test.step',steps:framework(row.steps??[])})),steps=framework(observed.steps);if(skipFirst)steps[0].steps[0].annotations=[{type:'skip'}];const names=['HARNESS_DETAIL_REQUEST_PATH','HARNESS_DETAIL_REQUEST_DIGEST'],previous=names.map(name=>process.env[name]);
 try{process.env.HARNESS_DETAIL_REQUEST_PATH=request.path;process.env.HARNESS_DETAIL_REQUEST_DIGEST=request.digest;const recorder=new Capture(),test={location:{file:path.join(root,entry.file)},titlePath:()=>entry.titlePath};recorder.onBegin({}, {allTests:()=>[test]});recorder.onTestEnd(test,{...observed,steps});recorder.onEnd();}finally{names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];});}
 const jsonFile=path.join(directory,'playwright.json'),bytes=JSON.stringify(raw);fs.writeFileSync(jsonFile,bytes);const held=Capture.holdPhase(request,jsonFile,'sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex'));return{Capture,entry,raw,held,request,directory,normalize:()=>api().normalizePhase(raw,[entry],0,root)};
}
test('canonical pre-JSON capture preserves real skip status instead of promoting JSON annotation loss to PASS',t=>{
 const healthy=capturedCsrfPhase(t),normal=healthy.normalize();assert.equal(normal.records[0].observed.checkDetails,undefined);healthy.Capture.bindPhase(normal,healthy.held);assert.deepEqual(normal.records[0].observed.checkDetails.map(row=>row.status),['passed','passed']);healthy.Capture.verifyCaptures([healthy.held]);
 const skipped=capturedCsrfPhase(t,true),raw=skipped.Capture.readCapture(skipped.held);assert.deepEqual(raw.document.checks[0].details.map(row=>row.status),['skipped','passed']);assert.deepEqual(skipped.normalize().records[0].observed.jsonCheckDetails.map(row=>row.status),['passed','passed']);assert.throws(()=>skipped.Capture.bindPhase(skipped.normalize(),skipped.held),/PUBLIC_ODHIN_CHECK_DETAILS/);
});
test('phase capture binds request nonce registry phase test parent and held JSON/result bytes',t=>{
 const f=capturedCsrfPhase(t),read=file=>fs.readFileSync(file),result=read(f.held.result.path),request=read(f.held.request.path),json=read(f.held.json.path);
 for(const [key,bytes]of [['result',result],['json',json],['request',request]]){fs.chmodSync(f.held[key].path,0o600);fs.appendFileSync(f.held[key].path,' ');assert.throws(()=>f.Capture.verifyCaptures([f.held]),/HARNESS_DETAIL_CAPTURE_INVALID/);fs.writeFileSync(f.held[key].path,bytes);}
 f.Capture.verifyCaptures([f.held]);const original=JSON.parse(result);
 for(const mutate of [v=>v.runId=require('node:crypto').randomUUID(),v=>v.phase='aat',v=>v.registryDigest='sha256:'+'0'.repeat(64),v=>v.checks[0].file='foreign',v=>v.checks[0].details[0].parentId='foreign',v=>v.checks.push(v.checks[0]),v=>v.checks[0].details[0].Authorization=canary]){const value=structuredClone(original);mutate(value);const bytes=JSON.stringify(value);fs.writeFileSync(f.held.result.path,bytes);const held=structuredClone(f.held);held.result.digest='sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex');assert.throws(()=>f.Capture.readCapture(held));}fs.writeFileSync(f.held.result.path,result);
 assert.throws(()=>f.Capture.preparePhase(f.directory,'offline',process.cwd()));
});

test('AAT detail capture is explicitly empty and cannot import offline helper evidence',t=>{
 const f=capturedCsrfPhase(t),Capture=f.Capture,root=fs.realpathSync(process.cwd()),directory=fs.mkdtempSync(path.join(fs.realpathSync(require('node:os').tmpdir()),'aat-detail-unit-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const request=Capture.preparePhase(directory,'aat',root),names=['HARNESS_DETAIL_REQUEST_PATH','HARNESS_DETAIL_REQUEST_DIGEST'],previous=names.map(name=>process.env[name]);
 try{process.env.HARNESS_DETAIL_REQUEST_PATH=request.path;process.env.HARNESS_DETAIL_REQUEST_DIGEST=request.digest;const recorder=new Capture();recorder.onBegin({}, {allTests:()=>[]});recorder.onEnd();}finally{names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];});}
 const raw=document(fixture.selections.environment),bytes=JSON.stringify(raw),jsonFile=path.join(directory,'playwright.json');fs.writeFileSync(jsonFile,bytes);const held=Capture.holdPhase(request,jsonFile,'sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(Capture.readCapture(held).document.checks,[]);const normalized=api().normalizePhase(raw,fixture.selections.environment,0,root,undefined,'aat');Capture.bindPhase(normalized,held);assert(normalized.records.every(row=>row.observed.checkDetails.length===0));Capture.verifyCaptures([f.held,held]);assert.throws(()=>Capture.bindPhase(f.normalize(),held),/HARNESS_DETAIL_CAPTURE_INVALID/);
 const graft=fs.readFileSync(f.held.result.path);fs.writeFileSync(held.result.path,graft);const changed=structuredClone(held);changed.result.digest='sha256:'+require('node:crypto').createHash('sha256').update(graft).digest('hex');assert.throws(()=>Capture.readCapture(changed),/HARNESS_DETAIL_CAPTURE_INVALID/);
});

test('mandatory collection snapshots success-only call timing and exposes inclusion from strict native evidence only', async t => {
 const f=await require('./fixtures/exui-mandatory-email-admission.mock.cjs').admissionPacket(t),{readNativeReportEvidence}=await import('./lib/exui-native-report-evidence.mjs');f.write(f.main.descriptorPath,f.descriptor);const evidence=await readNativeReportEvidence(f.main.descriptorPath);
 const os=require('node:os'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),previous=process.cwd(),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'collector-mandatory-report-')));process.chdir(root);
 const Reporter=require('./harness-public-odhin-reporter.cjs'),oldSpawn=cp.spawn,oldPrepare=Reporter.prototype.prepareNativeEvidence;
 t.after(()=>{cp.spawn=oldSpawn;Reporter.prototype.prepareNativeEvidence=oldPrepare;delete require.cache[modulePath];process.chdir(previous);fs.rmSync(root,{recursive:true,force:true});});
 const a=evidence.mandatoryEmailAdmission,held={schemaVersion:1,scope:'mandatory-email-admission-call',clock:'monotonic',startedAt:'2026-11-07T01:00:00.000Z',elapsedMs:222227,mainRunId:evidence.jobRunId,mandatoryRunId:a.runId,requestDigest:a.requestDigest};let selected=evidence,launches=0;
 Reporter.prototype.prepareNativeEvidence=async function(){await Promise.resolve();held.elapsedMs=999999;await oldPrepare.call(this,f.main.descriptorPath);this.nativeEvidence=structuredClone(selected);};
 cp.spawn=(_file,_args,options)=>{launches++;const raw=document(require('./harness-public-overview.cjs').entries);raw.config.rootDir=root;raw.stats.startTime=new Date().toISOString();raw.stats.duration=1;for(const suite of raw.suites)for(const nested of suite.suites)for(const spec of nested.specs)spec.tests[0].results[0].startTime=raw.stats.startTime;fs.writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE,JSON.stringify(raw));emitSyntheticDetailSidecar(options,raw);const child=new EventEmitter();child.kill=()=>{};setImmediate(()=>child.emit('close',0,null));return child;};delete require.cache[modulePath];
 const {runHarnessCollection}=require(modulePath);const result=await runHarnessCollection({}, {nativeEvidencePath:'/private/unit-only-mandatory-descriptor.json',mandatoryEmailTiming:held,nativeElapsedMs:60000});
 assert.equal(result.mandatoryEmailInclusion,'included');assert.equal(result.status,'passed');assert.equal(launches,1);const record=Reporter.validatePublicReport();assert.equal(record.mandatoryEmailTiming.elapsedMs,222227);assert(record.nativeElapsedMs>=60000);assert.deepEqual(record.nativeEvidence,evidence);
 const invalid={...held,requestDigest:'sha256:'+'e'.repeat(64)};await assert.rejects(runHarnessCollection({}, {nativeEvidencePath:'/private/unit-only-mandatory-descriptor.json',mandatoryEmailTiming:invalid}),/MANDATORY_EMAIL_TIMING_INVALID/);assert.equal(launches,1);assert(!fs.existsSync(path.join(root,'functional-output/tests/harness/public/odhin/index.html')));
 await assert.rejects(runHarnessCollection({}, {mandatoryEmailTiming:held}),/MANDATORY_EMAIL_TIMING_INVALID/);assert.equal(launches,1);
 selected=structuredClone(evidence);selected.mandatoryEmailAdmission.joint={policy:'mandatory-email-two-source-rows-v1',status:'separate',reason:'different-producer',releaseCredit:false,releaseApproval:false};for(const id of a.obligationIds)selected.catalogueCoverage.creditedObligationIds=selected.catalogueCoverage.creditedObligationIds.filter(value=>value!==id);selected.catalogueCoverage.candidate-=2;selected.catalogueCoverage.missing+=2;delete selected.catalogueCoverage.mandatoryEmailAdmission;
 const separate=await runHarnessCollection({}, {nativeEvidencePath:'/private/unit-only-mandatory-descriptor.json'});assert.equal(separate.mandatoryEmailInclusion,'separate');assert.equal(Reporter.validatePublicReport().mandatoryEmailTiming,undefined);
});
