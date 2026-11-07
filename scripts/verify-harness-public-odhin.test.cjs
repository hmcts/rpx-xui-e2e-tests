const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const reporterPath = path.join(__dirname, "harness-public-odhin-reporter.cjs");
const buckets =
  require("./fixtures/harness-public-report-titles.json").selections;
const titles = {
  harness: [...buckets.support, ...buckets.model].map((entry) => ({
    ...entry,
    titlePath: entry.titlePath.map((title, index) =>
      index === 2 ? entry.file : title,
    ),
  })),
};
const canary = "PRIVATE_AUTH_cookie_QuerySecret_7f38";

function sandbox(t) {
  const previous = process.cwd();
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "public-odhin-"),
  );
  process.chdir(root);
  t.after(() => {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function api() {
  assert.ok(
    fs.existsSync(reporterPath),
    "public-safe genuine Odhin reporter must exist",
  );
  return require(reporterPath);
}
function testsFor(selection = "harness") {
  return titles[selection].map((entry, index) => ({
    id: `${canary}-${index}`,
    title: canary,
    titlePath: () => [...entry.titlePath],
    location: { file: path.join(process.cwd(), entry.file), line: 1 },
    retries: 0,
    expectedStatus: "passed",
    annotations: [{ description: canary }],
    parent: { project: () => ({ name: canary }) },
  }));
}
function fullResult(status = "passed") {
  return {
    status,
    startTime: new Date("2026-11-03T12:00:00Z"),
    duration: 1000,
  };
}
function result(status = "passed", index = 0, selection = "harness") {
  return {
    status,
    retry: 0,
    duration: index + 12,
    startTime: new Date("2026-11-03T12:00:00Z"),
    workerIndex: 0,
    parallelIndex: 0,
    errors: [
      { message: canary, stack: `Error: ${canary}\n at ${canary}.ts:1:1` },
    ],
    stdout: [canary],
    stderr: [Buffer.from(canary)],
    steps: [
      ...(status==='skipped'?[]:require('./harness-public-check-steps.cjs').methodFor(require('./harness-public-overview.cjs').profiles[selection][index]).steps.map((step,ordinal,list)=>({
        title:'harness-check:'+step.id, category:'test.step', duration:status==='timedOut'&&ordinal===list.length-1?-1:1,
        ...(status==='failed'&&ordinal===list.length-1?{error:{message:canary}}:{}),
        location:{file:canary},steps:step.id==='auth-basic-csrf'?['csrf-present','csrf-absent'].map((id,index)=>({title:'harness-detail:'+id,category:'test.step',duration:status==='timedOut'&&index===1?-1:1,...(status==='failed'&&index===1?{error:{message:canary}}:{}),steps:[]})):[{title:canary,category:'expect',duration:0}],
      }))),
      { title: canary, location: { file: canary }, steps: [{ title: canary }] },
    ],
    attachments: [
      {
        name: canary,
        contentType: "image/png",
        path: canary,
        body: Buffer.from(canary),
      },
    ],
    headers: { Authorization: canary },
    cookies: [{ value: canary }],
    query: canary,
  };
}
async function complete(
  selection = "harness",
  statuses = [],
  finalStatus = "passed",
  globalErrors = 0,
  assuranceTiming,
) {
  const Reporter = api();
  const reporter = new Reporter({
    selection,
    outputFolder: canary,
    release: canary,
    assuranceTiming,
  });
  const tests = testsFor(selection);
  await reporter.onBegin(
    { projects: [{ name: canary }], metadata: { canary } },
    { allTests: () => tests },
  );
  for (let i = 0; i < tests.length; i++)
    await reporter.onTestEnd(tests[i], result(statuses[i] || "passed", i, selection));
  for (let i = 0; i < globalErrors; i++)
    reporter.onError({ message: canary, stack: canary });
  await reporter.onEnd({ ...fullResult(finalStatus), error: canary });
  return Reporter;
}
function output() {
  return path.join(
    process.cwd(),
    "functional-output/tests/harness/public",
    "odhin",
    "index.html",
  );
}

test("real Odhin preserves failed/passed/skipped/timedOut outcomes and strips rich diagnostics", async (t) => {
  sandbox(t);
  const Reporter = await complete(
    "harness",
    ["failed", "skipped", "timedOut"],
    "failed",
  );
  const html = fs.readFileSync(output("harness"), "utf8");
  const summary = Reporter.validatePublicReport("harness");
  assert.equal(summary.tests, 116);
  assert.equal(summary.status, "failed");
  assert.deepEqual(summary.counts, {
    passed: 113,
    failed: 1,
    skipped: 1,
    timedOut: 1,
  });
  assert.match(html, /Odhin|Odhín/);
  assert.match(html, /Final Outcomes/);
  assert.match(html, /<style id="webapp-report-theme">/);
  assert.match(html, /<script id="webapp-report-ui">/);
  assert.match(html, /data-duration-ms="12"/);
  assert.match(
    html,
    /<td data-report-metadata>Authentication parsing and bootstrap helpers<\/td>/,
  );
  assert.match(html, /no release credit/);
  assert.match(html, /extractCsrf parses token/);
  for (const value of [
    canary,
    Buffer.from(canary).toString("base64"),
    encodeURIComponent(canary),
  ])
    assert.ok(!html.includes(value));
  assert.ok(!html.includes("fonts.gstatic.com"));
  assert.ok(!html.includes("{{."));
  assert.deepEqual(fs.readdirSync(path.dirname(output("harness"))), [
    "index.html",
  ]);
});

test("combined output validates and reset withdraws only its complete owned report", async (t) => {
  sandbox(t);
  const Reporter = await complete();
  assert.equal(Reporter.validatePublicReport("harness").tests, 116);
  assert.equal(Reporter.validatePublicReport("harness").status, "passed");
  Reporter.resetPublicReport("harness");
  assert.ok(!fs.existsSync(output()));
  assert.throws(() => Reporter.validatePublicReport("harness"), /PUBLIC_ODHIN/);
  Reporter.resetPublicReport("harness");
});

test("retirement accepts a prior owned report without new RunInfo rows while current publication rejects it", async (t) => {
  const root = sandbox(t);
  const Reporter = await complete();
  const recordFile = path.join(root, "functional-output/tests/harness/private/public-odhin-harness.json");
  const record = JSON.parse(fs.readFileSync(recordFile, "utf8"));
  const rows = require("./harness-native-report.cjs").renderNativeExecutionInfo(record.nativeEvidence);
  const currentHtml = fs.readFileSync(output(), "utf8");
  assert(currentHtml.includes(rows));
  const previousHtml = currentHtml.replace(rows, "");
  record.sha256 = require("node:crypto").createHash("sha256").update(previousHtml).digest("hex");
  fs.writeFileSync(output(), previousHtml);
  fs.writeFileSync(recordFile, JSON.stringify(record));
  assert.throws(() => Reporter.validatePublicReport("harness"), /PUBLIC_ODHIN/);
  // No public argument may opt current publication into retirement compatibility.
  assert.throws(() => Reporter.validatePublicReport("harness", true), /PUBLIC_ODHIN/);
  Reporter.resetPublicReport("harness");
  assert(!fs.existsSync(output()));
  assert(!fs.existsSync(recordFile));
  await complete();
  assert.equal(Reporter.validatePublicReport("harness").status, "passed");
});

test("prior report retirement retains hash, ownership, privacy, metadata and symlink guards", async (t) => {
  const root = sandbox(t);
  const Reporter = await complete();
  const recordFile = path.join(root, "functional-output/tests/harness/private/public-odhin-harness.json");
  const record = JSON.parse(fs.readFileSync(recordFile, "utf8"));
  const previousHtml = fs.readFileSync(output(), "utf8").replace(require("./harness-native-report.cjs").renderNativeExecutionInfo(record.nativeEvidence), "");
  const hash = value => require("node:crypto").createHash("sha256").update(value).digest("hex");
  for (const scenario of ["hash", "ownership", "privacy", "metadata", "foreign-file", "symlink"]) {
    const changed = structuredClone(record);
    let html = previousHtml;
    if (scenario === "ownership") changed.runId = "00000000-0000-4000-8000-000000000000";
    if (scenario === "privacy") html += '<script src="https://example.invalid/private.js"></script>';
    if (scenario === "metadata") changed.tests++;
    changed.sha256 = hash(scenario === "hash" ? html + "changed" : html);
    fs.writeFileSync(output(), html);
    fs.writeFileSync(recordFile, JSON.stringify(changed));
    const foreign = path.join(path.dirname(output()), "foreign.txt");
    const outside = path.join(root, "outside.html");
    if (scenario === "foreign-file") fs.writeFileSync(foreign, canary);
    if (scenario === "symlink") { fs.writeFileSync(outside, html); fs.unlinkSync(output()); fs.symlinkSync(outside, output()); }
    assert.throws(() => Reporter.resetPublicReport("harness"), /PUBLIC_ODHIN/, scenario);
    assert(fs.existsSync(output()), scenario);
    assert.equal(fs.readFileSync(recordFile, "utf8"), JSON.stringify(changed), scenario);
    if (scenario === "foreign-file") { assert.equal(fs.readFileSync(foreign, "utf8"), canary); fs.unlinkSync(foreign); }
    if (scenario === "symlink") { assert.equal(fs.readFileSync(outside, "utf8"), html); fs.unlinkSync(output()); }
  }
});

test("global errors remain numeric failed-run facts without copying their messages", async (t) => {
  sandbox(t);
  const Reporter = await complete("harness", [], "failed", 1);
  const summary = Reporter.validatePublicReport("harness");
  assert.equal(summary.status, "failed");
  assert.equal(summary.globalErrors, 1);
  assert.ok(!fs.readFileSync(output(), "utf8").includes(canary));
});

test("unknown/missing/duplicate declarations and unexpected retry cannot publish", async (t) => {
  sandbox(t);
  const Reporter = api();
  for (const mutation of ["unknown", "missing", "duplicate", "retry"]) {
    const reporter = new Reporter({ selection: "harness" });
    const tests = testsFor();
    if (mutation === "unknown") tests[0].titlePath = () => [canary];
    if (mutation === "missing") tests.pop();
    if (mutation === "duplicate") tests[0] = tests[1];
    if (mutation === "retry") tests[0].retries = 1;
    await assert.rejects(
      async () => reporter.onBegin({}, { allTests: () => tests }),
      /PUBLIC_ODHIN/,
    );
    assert.ok(!fs.existsSync(output()));
  }
});

test("incomplete/empty/interrupted and invalid result records cannot publish", async (t) => {
  sandbox(t);
  const Reporter = api();
  for (const mutation of [
    "empty",
    "incomplete",
    "interrupted",
    "duration",
    "timestamp",
    "status",
    "duplicate",
    "retry",
  ]) {
    const reporter = new Reporter({ selection: "harness" });
    const tests = testsFor();
    if (mutation === "empty") {
      await assert.rejects(
        async () => reporter.onBegin({}, { allTests: () => [] }),
        /PUBLIC_ODHIN/,
      );
      continue;
    }
    await reporter.onBegin({}, { allTests: () => tests });
    const r = result();
    if (mutation === "duration") r.duration = NaN;
    if (mutation === "timestamp") r.startTime = new Date("invalid");
    if (mutation === "status") r.status = canary;
    if (mutation === "retry") r.retry = 1;
    if (["duration", "timestamp", "status", "retry"].includes(mutation)) {
      await assert.rejects(
        async () => reporter.onTestEnd(tests[0], r),
        /PUBLIC_ODHIN/,
      );
    } else if (mutation === "duplicate") {
      await reporter.onTestEnd(tests[0], r);
      await assert.rejects(
        async () => reporter.onTestEnd(tests[0], r),
        /PUBLIC_ODHIN/,
      );
    } else {
      if (mutation !== "incomplete")
        for (const testCase of tests)
          await reporter.onTestEnd(testCase, result("passed",tests.indexOf(testCase)));
      await assert.rejects(
        async () =>
          reporter.onEnd(
            fullResult(mutation === "interrupted" ? "interrupted" : "passed"),
          ),
        /PUBLIC_ODHIN/,
      );
    }
    assert.ok(!fs.existsSync(output()));
  }
});

test("extra files, symlinks, tampering and unowned stale reports fail without deleting foreign content", async (t) => {
  const root = sandbox(t);
  const Reporter = await complete();
  const html = fs.readFileSync(output());
  fs.writeFileSync(path.join(path.dirname(output()), "foreign.txt"), canary);
  assert.throws(() => Reporter.resetPublicReport("harness"), /PUBLIC_ODHIN/);
  assert.throws(() => Reporter.validatePublicReport("harness"), /PUBLIC_ODHIN/);
  assert.equal(
    fs.readFileSync(path.join(path.dirname(output()), "foreign.txt"), "utf8"),
    canary,
  );
  fs.unlinkSync(path.join(path.dirname(output()), "foreign.txt"));
  fs.writeFileSync(output(), `${html}\n${canary}`);
  assert.throws(() => Reporter.validatePublicReport("harness"), /PUBLIC_ODHIN/);
  fs.writeFileSync(output(), html);
  Reporter.resetPublicReport("harness");
  fs.writeFileSync(path.join(root, "foreign"), canary);
  fs.symlinkSync(path.join(root, "foreign"), output());
  assert.throws(() => Reporter.resetPublicReport("harness"), /PUBLIC_ODHIN/);
  assert.equal(fs.readFileSync(path.join(root, "foreign"), "utf8"), canary);
  fs.unlinkSync(output());
  fs.writeFileSync(output(), canary);
  assert.throws(() => Reporter.resetPublicReport("harness"), /PUBLIC_ODHIN/);
  assert.equal(fs.readFileSync(output(), "utf8"), canary);
});

test("actual renderer write failure cannot leave a validated public report", async (t) => {
  sandbox(t);
  const fsExtra = require("fs-extra");
  const original = fsExtra.outputFileSync;
  let fired = false;
  fsExtra.outputFileSync = function (name, ...args) {
    if (String(name).endsWith("/render/index.html")) {
      fired = true;
      throw new Error(canary);
    }
    return original.call(this, name, ...args);
  };
  t.after(() => {
    fsExtra.outputFileSync = original;
  });
  await assert.rejects(() => complete("harness", [], "passed", 0, assuranceTimingFixture()), /PUBLIC_ODHIN/);
  assert.equal(fired, true);
  assert.ok(!fs.existsSync(output()));
  assert.throws(() => api().validatePublicReport("harness"), /PUBLIC_ODHIN/);
});

test("public publication failure withdraws the matching private record and new HTML", async (t) => {
  sandbox(t);
  const originalOpen = fs.openSync;
  const originalWrite = fs.writeFileSync;
  let targetFd;
  let fired = false;
  fs.openSync = function (name, ...args) {
    const fd = originalOpen.call(this, name, ...args);
    if (name === output()) targetFd = fd;
    return fd;
  };
  fs.writeFileSync = function (name, ...args) {
    if (name === targetFd && targetFd !== undefined) {
      fired = true;
      throw new Error(canary);
    }
    return originalWrite.call(this, name, ...args);
  };
  t.after(() => {
    fs.openSync = originalOpen;
    fs.writeFileSync = originalWrite;
  });
  await assert.rejects(() => complete("harness", [], "passed", 0, assuranceTimingFixture()), /PUBLIC_ODHIN/);
  assert.equal(fired, true);
  assert.ok(!fs.existsSync(output()));
  assert.ok(
    !fs.existsSync(
      path.join(
        process.cwd(),
        "functional-output/tests/harness/private/public-odhin-harness.json",
      ),
    ),
  );
});

test("safe boundary never reads attachment paths or mutates the original diagnostic result", async (t) => {
  sandbox(t);
  const Reporter = api();
  const reporter = new Reporter({ selection: "harness" });
  const tests = testsFor();
  reporter.onBegin({}, { allTests: () => tests });
  const raw = result("failed");
  const before = JSON.stringify(raw);
  const read = fs.readFileSync;
  let attempted = false;
  fs.readFileSync = function (file, ...args) {
    if (String(file).includes(canary)) {
      attempted = true;
      throw new Error(canary);
    }
    return read.call(this, file, ...args);
  };
  t.after(() => {
    fs.readFileSync = read;
  });
  reporter.onTestEnd(tests[0], raw);
  for (const testCase of tests.slice(1)) reporter.onTestEnd(testCase, result("passed",tests.indexOf(testCase)));
  await reporter.onEnd(fullResult("failed"));
  assert.equal(JSON.stringify(raw), before);
  assert.equal(attempted, false);
  assert.match(fs.readFileSync(output(), "utf8"), /0h 0m 0s 12ms/);
});

test("symlink ancestors reject reset without touching external destinations", (t) => {
  const root = sandbox(t);
  const Reporter = api();
  fs.mkdirSync(path.join(root, "foreign"));
  fs.writeFileSync(path.join(root, "foreign", "sentinel"), canary);
  fs.symlinkSync(
    path.join(root, "foreign"),
    path.join(root, "functional-output"),
  );
  assert.throws(() => Reporter.resetPublicReport("harness"), /PUBLIC_ODHIN/);
  assert.deepEqual(fs.readdirSync(path.join(root, "foreign")), ["sentinel"]);
  assert.equal(
    fs.readFileSync(path.join(root, "foreign", "sentinel"), "utf8"),
    canary,
  );
});

test("missing asynchronous renderer template fails closed at its bounded readiness deadline", async (t) => {
  sandbox(t);
  const original = fs.readFile;
  let fired = false;
  fs.readFile = function (file, ...args) {
    if (String(file).endsWith("/html/chartStatus.html")) {
      fired = true;
      return;
    }
    return original.call(this, file, ...args);
  };
  t.after(() => {
    fs.readFile = original;
  });
  const started = Date.now();
  await assert.rejects(() => complete(), /PUBLIC_ODHIN/);
  assert.equal(fired, true);
  assert.ok(Date.now() - started < 8000);
  assert.ok(!fs.existsSync(output()));
});

test("fluid presentation is the exact reviewed owning-webapp source including bodyless recovery", () => {
  const crypto = require("node:crypto");
  const { parse } = require("node-html-parser");
  const { applyPresentation } = require("./odhin-presentation/enhance.cjs");
  const source = require("./odhin-presentation/SOURCE.json");
  assert.equal(source.commit, "b978cf7fa15df7fadf678ea41ef9deb638436d40");
  const expected = {
    "enhance.cjs":
      "5bdf0ffd699934c0f8a84b9bfb022cc3cae70911c2495af35179135019f7ba6f",
    "report.css":
      "1874d8772b973366b22533b9cef915c632fab0d650841bb24f422701d016fc21",
    "report.js":
      "29b8927ce07a31104a14f576ad5911ce9a544c819f92396a7f9561dba1de5bca",
  };
  for (const file of source.files) {
    const bytes = fs.readFileSync(
      path.join(__dirname, "odhin-presentation", file.file),
    );
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      expected[file.file],
    );
    assert.equal(file.sha256, expected[file.file]);
  }
  assert.deepEqual(
    source.files.map((file) => file.file).sort(),
    Object.keys(expected).sort(),
  );
  const root = parse(
    '<html><head></head><div id="retained">Retained content</div></html>',
  );
  applyPresentation(root);
  assert.ok(root.querySelector("body #retained"));
  assert.ok(root.querySelector("head #webapp-report-theme"));
  assert.ok(root.querySelector("body #webapp-report-ui"));
});

test("aggregate run/file/project timing uses observed clocks rather than replay time", async (t) => {
  sandbox(t);
  const Reporter = api();
  const reporter = new Reporter({ selection: "harness" });
  const tests = testsFor();
  reporter.onBegin({}, { allTests: () => tests });
  for (let i = 0; i < tests.length; i++) {
    const observed = result("passed",i);
    const isFirstFile = titles.harness[i].file === titles.harness[0].file;
    observed.startTime = new Date(
      isFirstFile ? "2026-11-03T12:00:10.125Z" : "2026-11-03T12:01:00.250Z",
    );
    observed.duration = isFirstFile ? 2250 : 3500;
    reporter.onTestEnd(tests[i], observed);
  }
  await reporter.onEnd({
    status: "passed",
    startTime: new Date("2026-11-03T12:00:00Z"),
    duration: 90000,
  });
  const html = fs.readFileSync(output(), "utf8");
  assert.ok(html.includes("2026-11-03T12:00:00.000Z"));
  assert.ok(html.includes("2026-11-03T12:01:30.000Z"));
  assert.ok(html.includes("0h 1m 30s 0ms"));
  const document = require("node-html-parser").parse(html);
  const panel = (title) =>
    document
      .querySelectorAll(".dashboard-block")
      .find(
        (node) =>
          node.querySelector(".info-box-header")?.textContent.trim() === title,
      );
  const fileRows = panel("Status by test file").querySelectorAll("tr").slice(1);
  for (const row of fileRows) {
    const cells = row.querySelectorAll("td");
    assert.equal(
      cells[2].textContent.trim(),
      cells[0].textContent.trim() === titles.harness[0].file
        ? "0h 0m 2s 250ms"
        : "0h 0m 3s 500ms",
    );
  }
  assert.equal(
    fileRows.length,
    new Set(titles.harness.map((entry) => entry.file)).size,
  );
  const projectRows = panel("Status by project")
    .querySelectorAll("tr")
    .slice(1);
  assert.equal(projectRows.length, 1);
  assert.equal(
    projectRows[0].querySelectorAll("td")[2].textContent.trim(),
    "0h 0m 53s 625ms",
  );
  assert.equal(Reporter.validatePublicReport("harness").duration, 90000);
});

test("invalid completed-run timestamps/durations cannot publish", async (t) => {
  sandbox(t);
  const Reporter = api();
  for (const bad of [
    { startTime: new Date("invalid"), duration: 1000 },
    { startTime: new Date(), duration: -1 },
    { startTime: new Date(), duration: NaN },
    { startTime: new Date(), duration: Infinity },
    { startTime: "2026-11-03T12:00:00Z", duration: 1000 },
    { startTime: new Date(), duration: Number.MAX_VALUE },
  ]) {
    const reporter = new Reporter({ selection: "harness" });
    const tests = testsFor();
    reporter.onBegin({}, { allTests: () => tests });
    for (const testCase of tests) reporter.onTestEnd(testCase, result("passed",tests.indexOf(testCase)));
    await assert.rejects(
      () => reporter.onEnd({ status: "passed", ...bad }),
      /PUBLIC_ODHIN/,
    );
    assert.ok(!fs.existsSync(output()));
  }
});

test("one report explains actual groups and preserves all runtime/owner gaps independently of pass count", async (t) => {
  sandbox(t);
  const Reporter = await complete("harness", ["failed"], "failed");
  const html = fs.readFileSync(output(), "utf8");
  const root = require("node-html-parser").parse(html);
  assert.equal(root.querySelectorAll("#harness-overview").length, 1);
  const dashboard = root.querySelector("#TabDashboard");
  assert(
    dashboard.innerHTML.indexOf('class="container-fluid') < dashboard.innerHTML.indexOf('id="harness-overview"'),
    "Original Odhín panels must precede all added Harness context and coverage",
  );
  assert.ok(
    root.querySelector("#TabDashboard #harness-overview"),
    "Run context must belong to Dashboard so the Tests tab shows only check details",
  );
  assert.equal(
    root
      .querySelector("#TabDashboard > .container-fluid > .row")
      .closest("#harness-overview"),
    null,
    "The fluid dashboard selector must retain its native result grid",
  );
  assert.match(
    root.querySelector("#harness-overview").textContent,
    /What this run checked/,
  );
  assert.match(html, /EXUI Assurance Harness/);
  for (const [id, checks] of [
    ["model", 26],
    ["replay", 12],
    ["framework", 78],
  ]) {
    const group = root.querySelector(`[data-lane="${id}"]`);
    assert.equal(group.querySelectorAll("td")[1].textContent, String(checks));
  }
  assert.equal(
    root
      .querySelector("[data-runtime-obligations]")
      .getAttribute("data-runtime-obligations"),
    "112",
  );
  assert.match(
    root.querySelector("#harness-overview").textContent,
    /0.*112.*NOT RUN/s,
  );
  assert.match(root.querySelector("#harness-overview").textContent, /45.*9/s);
  assert.match(
    root.querySelector("#harness-overview").textContent,
    /Global search|Work allocation|Hearings/,
  );
  assert.match(root.querySelector("#harness-overview").textContent, /PCS/);
  assert.match(
    root.querySelector("#harness-overview").textContent,
    /not.*product.*coverage/i,
  );
  assert.equal(Reporter.validatePublicReport("harness").tests, 116);
  const publicRoot = path.dirname(path.dirname(output()));
  assert.deepEqual(fs.readdirSync(publicRoot), ["odhin"]);
});

test("dashboard separates diagnostic run info from unexecuted candidate evidence", async (t) => {
  sandbox(t);
  const Reporter = await complete();
  const html = fs.readFileSync(output(), "utf8");
  const root = require("node-html-parser").parse(html);
  const info = [...root.querySelectorAll('.info-box-header')].find((header) => header.textContent.trim() === 'Run info').parentNode;
  assert.match(info.textContent, /EXUI Assurance Harness/);
  assert.match(info.textContent, /Source revisions.*candidate not run/s);
  assert.match(info.textContent, /Execution environment.*Local Harness diagnostics only/s);
  assert.match(info.textContent, /Diagnostic execution time/);
  assert.match(info.textContent, /Playwright diagnostic workers.*direct: Not recorded configured · 1 observed across 1 runners; not peak parallelism/s);
  assert.match(info.textContent, /Recorded native interval.*Not run/s);
  assert.match(info.textContent, /Core native Playwright invocations.*Not run/s);
  assert.match(info.textContent, /Configured core native worker slots.*Not run/s);
  assert.ok(root.querySelector('#harness-dashboard-ui'));
  assert.equal(Reporter.validatePublicReport('harness').tests, 116);
});

test("coverage map breaks out each unique AAT diagnostic by lane, slice, service, jurisdiction and case type", () => {
  const overview = require("./harness-public-overview.cjs");
  const { renderCoverage } = require("./harness-report-coverage.cjs");
  const records = overview.profiles["local-aat"].map((entry) => ({
    entry,
    observed: { status: "passed" },
  }));
  const dom = require("node-html-parser").parse(
    renderCoverage(records, { nativeAttached: true }),
  );
  assert.ok(dom.querySelector("#harness-coverage-at-a-glance"));
  for (const [dimension, count] of [
    ["slices", 18],
    ["services", 15],
    ["jurisdictions", 14],
    ["caseTypes", 9],
  ]) {
    const rows = dom.querySelectorAll(
      `[data-coverage-dimension="${dimension}"] tbody tr[data-coverage-area]`,
    );
    assert.equal(rows.length, count, `${dimension} areas`);
  }
  const countFor = (dimension, area) => {
    const row = dom.querySelector(
      `[data-coverage-dimension="${dimension}"] [data-coverage-area="${area}"]`,
    );
    assert.ok(row, `${dimension} ${area}`);
    return Number(row.getAttribute("data-test-count"));
  };
  assert.equal(countFor("services", "Shared Harness"), 78);
  assert.equal(countFor("jurisdictions", "Not case-specific"), 90);
  assert.equal(countFor("caseTypes", "Not case-specific"), 105);
  assert.match(dom.querySelector("#harness-coverage-at-a-glance").textContent, /non-additive/i);
  assert.match(
    dom.querySelector("#harness-coverage-at-a-glance").textContent,
    /jurisdiction labels currently mirror service-family codes/i,
  );
  assert.match(
    dom.querySelector('[data-coverage-dimension="caseTypes"] [data-coverage-area="ET_EnglandWales"]').textContent,
    /Employment Tribunal \(England and Wales\)/,
  );
  assert.match(
    dom.querySelector('[data-coverage-dimension="caseTypes"] [data-coverage-area="CriminalInjuriesCompensation"]').textContent,
    /Criminal Injuries Compensation/,
  );
});

test("main dashboard shows the catalogue evidence gap and coverage map before native proof detail", async () => {
  const overview = require("./harness-public-overview.cjs");
  const records = overview.profiles["local-aat"].map((entry) => ({
    entry,
    observed: { status: "passed", aatOutcome: "response-passed" },
  }));
  const html = await overview.renderOverview(records, "local-aat", {
    nativeEvidence: await nativePresentationFixture(false),
  });
  const coverageAt = html.indexOf('id="harness-coverage-at-a-glance"');
  const nativeAt = html.indexOf('id="harness-native-evidence"');
  assert.ok(coverageAt >= 0 && coverageAt < nativeAt);
  const dom = require("node-html-parser").parse(html);
  const applicationCoverage = dom.querySelector("#harness-application-coverage");
  assert.ok(applicationCoverage);
  assert.equal(applicationCoverage.tagName.toLowerCase(), "section");
  assert.match(applicationCoverage.textContent, /6\s*\/\s*112/);
  assert.match(applicationCoverage.textContent, /Release approval remains unavailable/);
});

test("coverage tables map every exact test once to a lane and slice with scope and drill-down", async (t) => {
  sandbox(t);
  await complete();
  const dom = require("node-html-parser").parse(
    fs.readFileSync(output(), "utf8"),
  );
  const lanes = dom.querySelectorAll("#harness-lanes tbody tr[data-lane]");
  assert.equal(lanes.length, 4);
  const rows = dom.querySelectorAll("[data-harness-check]");
  assert.equal(rows.length, 116);
  assert.equal(
    new Set(rows.map((row) => row.getAttribute("data-harness-check"))).size,
    116,
  );
  for (const row of rows) {
    assert.ok(row.querySelector("[data-harness-open-test]"));
    assert.ok(row.getAttribute("data-slice"));
    assert.ok(row.getAttribute("data-services"));
    assert.ok(row.getAttribute("data-case-types"));
  }
  assert.ok(dom.querySelector("#harness-slices"));
  assert.ok(dom.querySelector("select[data-harness-filter=services]"));
  assert.ok(dom.querySelector("select[data-harness-filter=caseTypes]"));
  const overview = require("./harness-public-overview.cjs");
  assert.throws(
    () => overview.metadataFor({ file: "unreviewed", titlePath: [] }),
    /UNREVIEWED/,
  );
});

test("coverage rejects duplicate definitions and malformed scope", () => {
  const fixture = require("./fixtures/harness-public-report-titles.json");
  const { metadataFor } = require("./harness-report-coverage.cjs");
  const entry = fixture.selections.support[0];
  fixture.lanes.push({ ...fixture.lanes[0] });
  try {
    assert.throws(() => metadataFor(entry), /UNREVIEWED/);
  } finally {
    fixture.lanes.pop();
  }
  const original = entry.metadata.services;
  entry.metadata.services = [null];
  try {
    assert.throws(() => metadataFor(entry), /UNREVIEWED/);
  } finally {
    entry.metadata.services = original;
  }
});

test("overview rejects source-model drift even when every runner check passes", async (t) => {
  sandbox(t);
  const snapshot = require("./fixtures/exui-configuration-source.json");
  const source = snapshot.sources.find(
    (item) =>
      item.repository === "rpx-xui-webapp" &&
      item.path === "config/default.json",
  );
  const previous = source.document.waSupportedJurisdictions;
  try {
    source.document.waSupportedJurisdictions = "IA";
    await assert.rejects(complete(), /PUBLIC_ODHIN/);
    assert.ok(!fs.existsSync(output()));
  } finally {
    source.document.waSupportedJurisdictions = previous;
  }
});

async function nativePresentationFixture(blocked = true) {
  const { nativeInvocations } = await import("./lib/exui-native-contract.mjs");
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { loadCommittedConfigurationCatalogue } =
    await import("./lib/exui-configuration-runtime-coverage.mjs");
  const { catalogue, sourceArtifactDigests } =
    loadCommittedConfigurationCatalogue();
  const { objectDigest } = require("./harness-native-report.cjs");
  const hash = "sha256:" + "a".repeat(64);
  return {
    schemaVersion: 1,
    kind: "native-policy-proof-outcomes",
    descriptorDigest: hash,
    source: {
      harnessCommit: "b".repeat(40),
      harnessSourceDigest: hash,
      candidateArtifactDigest: hash,
      webappCommit: "c".repeat(40),
    },
    jobRunId: "ci-11111111-1111-4111-8111-111111111111",
    status: blocked ? "BLOCKED" : "PASS",
    exitCode: blocked ? 2 : 0,
    releaseApproval: false,
    catalogueCoverage: {
      catalogueDigest: `sha256:${objectDigest(catalogue.obligations)}`,
      selected: catalogue.obligations.length,
      candidate: 3,
      ccd: blocked ? 2 : 3,
      creditedObligationIds: [
        "configuration-shape:bbfb8dfe6d409d6df3291b434a305a3ac5237d63d21ba8c0695b787af62913fe",
        "configuration-shape:4872034ffec23e993a49315123c3a22472baf5411d8010f31d3d01644f23cd94",
        ...(blocked ? [] : [catalogue.sequences[0].id]),
        "configuration-cell:a6d5e8421152eca670bc39912f6781824bfc3190d2b78ed9ea7757b5f168e313",
        "configuration-cell:8c1a3f11d156a5557c5400305414da596d644a4d2378aa539753a7e9fc88d76a",
        "configuration-decentralisation:52f63ce0d43f0422438b698894746ce1dc0e7062288fc8a09fcfd93b84cf2f1c",
      ],
      missing: catalogue.obligations.length - (blocked ? 5 : 6),
      sourceArtifactDigests,
      phaseReferences: Object.fromEntries(
        ["ccd", "eventCapability", "routing", "recipientCallback", "selectorEventRow"].map((phase) => [
          phase,
          {
            releaseScopeId:
              phase === "ccd"
                ? "exui-ccd-pilot"
                : phase === "eventCapability"
                  ? "exui-ccd-event-capability-pilot"
                  : phase === "routing" ? "exui-decentralised-routing-pilot" : phase === "selectorEventRow" ? "exui-ccd-selector-event-row-pilot" : "exui-ccd-recipient-callback-pilot",
            runId: "candidate-11111111-1111-4111-8111-111111111111",
            receiptArtifactDigest: hash,
            status: blocked && phase === "ccd" ? "BLOCKED" : "PASS",
          },
        ]),
      ),
      releaseCredit: false,
    },
    phases: Object.entries({
      family: "exui-wa-family-pilot",
      scope: "exui-wa-scope-pilot",
      ccd: "exui-ccd-pilot",
      eventCapability: "exui-ccd-event-capability-pilot",
      routing: "exui-decentralised-routing-pilot",
      recipientCallback: "exui-ccd-recipient-callback-pilot",
      selectorEventRow: "exui-ccd-selector-event-row-pilot",
    }).map(([phase, scope]) => {
      const policy = getReleasePolicy(scope);
      return {
        phase,
        releaseScopeId: scope,
        runId: "candidate-11111111-1111-4111-8111-111111111111",
        policyDigest: policy.policyDigest,
        receiptArtifactDigest: hash,
        status: blocked && phase === "ccd" ? "BLOCKED" : "PASS",
        exitCode: blocked && phase === "ccd" ? 2 : 0,
        invocations: nativeInvocations(scope).map(item => ({invocationId:item.invocationId, configuredWorkers:null})),
        baselineProofs: policy.obligations
          .flatMap((item) => item.requiredProofIds)
          .map((proofId) => ({
            proofId,
            invocationId: phase === "scope" ? (proofId === "wa-org-scope-civil" ? "scope-civil" : "scope-ia") : "baseline",
            status:
              blocked && proofId === "ccd-postal-two-roundtrip"
                ? "failed"
                : "passed",
            failureId:
              blocked && proofId === "ccd-postal-two-roundtrip"
                ? "postal-required-fields"
                : null,
          })),
        faults: policy.mutationDefinitions.map((item) => ({
          mutationId: item.mutationId,
          proofId: item.mutantProofId,
          invocationId: nativeInvocations(scope).find(invocation => invocation.mutation === item.mutationId).invocationId,
          baselineProofId: item.baselineProofId,
          baselineStatus:
            blocked && item.baselineProofId === "ccd-postal-two-roundtrip"
              ? "failed"
              : "passed",
          expectedFailureId: item.expectedFailureId,
          observedFailureId:
            blocked && item.baselineProofId === "ccd-postal-two-roundtrip"
              ? "postal-required-fields"
              : item.expectedFailureId,
          outcome:
            blocked && item.baselineProofId === "ccd-postal-two-roundtrip"
              ? "invalid-witness"
              : "expected-failure-observed",
        })),
      };
    }),
  };
}

test("same Odhín document separates native baselines and faults from diagnostics and keeps postal BLOCKED", async (t) => {
  sandbox(t);
  const Reporter = api();
  const reporter = new Reporter({ selection: "local-aat", nativeElapsedMs: 1920000, phaseTimings: [
    { label: "WA family", status: "PASS", startedAt: "2026-11-05T10:00:00.000Z", durationMs: 140000 },
    { label: "Scope fault candidate preparation", status: "completed", startedAt: "2026-11-05T10:02:20.000Z", durationMs: 158000 },
  ] });
  // Presentation fixture only: the descriptor reader's raw/expected boundary has its own tests.
  await require("./fixtures/exui-native-report-packet.mock.cjs").preparePublication(t,reporter,{postalFailure:true});
  const entries = require("./harness-public-overview.cjs").profiles[
    "local-aat"
  ];
  const tests = entries.map((entry) => ({
    location: { file: path.join(process.cwd(), entry.file) },
    titlePath: () => entry.titlePath,
    retries: 0,
    expectedStatus: "passed",
  }));
  reporter.onBegin({}, { allTests: () => tests });
  for (const [index, item] of tests.entries())
    reporter.onTestEnd(item, {
      ...result("passed", index, "local-aat"),
      ...(entries[index].file.includes("/diagnostic/")
        ? { aatOutcome: "response-passed" }
        : {}),
    });
  await reporter.onEnd(fullResult());
  const html = fs.readFileSync(output(), "utf8");
  const dom = require("node-html-parser").parse(html);
  assert.equal(dom.querySelector('#harness-public-run').getAttribute('data-native-elapsed-ms'), '1920000');
  assert.match(dom.querySelector('.testcase-run-info-table').textContent, /Recorded native interval.*32\.0 min/s);
  assert.equal(dom.querySelectorAll('#harness-phase-timings tbody tr').length, 2);
  assert.match(dom.querySelector('#harness-phase-timings').textContent, /WA family.*2m 20s.*Scope fault candidate preparation.*2m 38s/s);
  assert.match(
    dom.querySelector("#harness-public-run").textContent,
    /Diagnostics passed \/ Native BLOCKED/,
  );
  assert.equal(dom.querySelectorAll("[data-harness-check]").length, 121);
  assert.equal(dom.querySelectorAll("[data-native-kind=baseline]").length, 23);
  assert.equal(dom.querySelectorAll("[data-native-kind=fault]").length, 23);
  assert.match(
    dom.querySelector("[data-native-postal-blocked]").textContent,
    /required postcode blank/,
  );
  const nativeText = dom.querySelector("#harness-native-evidence").textContent;
  assert.match(nativeText, /deny serviceOfDocuments start and submission/);
  assert.doesNotMatch(nativeText, /deny the serviceOfDocuments start\/token/);
  assert.match(nativeText, /HarnessNestedPRL \(actual synthetic case type\)/);
  assert.match(nativeText, /BLOCKED — invalid witness/);
  assert.match(nativeText, /Required failure: postal-persistence/);
  assert.match(nativeText, /Observed failure: postal-required-fields/);
  assert.match(nativeText, /Expected failure observed/);
  assert.match(nativeText, /PCS external create and local fallback/);
  assert.match(nativeText, /PCS NoC route by requested case/);
  assert.ok(
    !dom
      .querySelector("#harness-overview")
      .textContent.includes("No accepted candidate/CCD runtime evidence is attached."),
  );
  assert.match(
    dom.querySelector("[data-runtime-obligations]").textContent,
        /5 \/ 112/,
  );
  assert.equal(Reporter.validatePublicReport().tests, 121);
  assert.equal(
    Reporter.validatePublicReport().nativeEvidence.status,
    "BLOCKED",
  );
  assert.deepEqual(fs.readdirSync(path.dirname(output())), ["index.html"]);
  assert.ok(!html.includes(canary));
});

test("native PASS does not manufacture postal failure and unknown proofs cannot silently disappear", async () => {
  const { renderNativeEvidence } = require("./harness-native-report.cjs");
  const value = await nativePresentationFixture(false);
  const html = renderNativeEvidence(value);
  assert.ok(!html.includes("data-native-postal-blocked"));
  assert.match(html, /data-native-status="PASS"/);
  assert.match(
    renderNativeEvidence({
      ...(await nativePresentationFixture()),
      status: "FAIL",
      exitCode: 1,
    }),
    /data-native-status="FAIL"/,
  );
  value.phases[0].baselineProofs[0].proofId = canary;
  assert.throws(
    () => renderNativeEvidence(value),
    /UNKNOWN_NATIVE_PROOF|COMPLETE_NATIVE_PROOFS_REQUIRED/,
  );
});

test("catalogue coverage reflects only accepted exact requirements and rejects inconsistent accounting", async () => {
  const overview = require("./harness-public-overview.cjs");
  const records = overview.entries.map((entry) => ({
    entry,
    observed: { status: "passed" },
  }));
  for (const blocked of [true, false]) {
    const html = await overview.renderOverview(records, "harness", {
      nativeEvidence: await nativePresentationFixture(blocked),
    });
    assert.ok(
      html.includes(
        `${blocked ? 5 : 6} / 112 catalogue requirements satisfied by accepted runtime evidence`,
      ),
    );
    assert.ok(html.includes(`${blocked ? 107 : 106} remain unsatisfied`));
    const summary = require("node-html-parser").parse(html);
    const rows = summary.querySelectorAll("[data-catalogue-kind]");
    assert.equal(rows.length, 6);
    assert.equal(rows.reduce((sum, row) => sum + Number(row.getAttribute("data-catalogue-total")), 0), 112);
    assert.equal(rows.reduce((sum, row) => sum + Number(row.getAttribute("data-catalogue-accepted")), 0), blocked ? 5 : 6);
    assert.equal(summary.querySelector('[data-catalogue-kind="definition-shape"]').getAttribute("data-catalogue-total"), "79");
    assert.equal(summary.querySelector('[data-catalogue-kind="configuration-profile"]').getAttribute("data-catalogue-total"), "13");
    assert.match(summary.textContent, /not a count of failed tests/);

    assert.ok(!html.includes("No accepted candidate/CCD runtime evidence is attached."));
  }
  for (const change of [
    (evidence) => delete evidence.catalogueCoverage,
    (evidence) => {
      evidence.catalogueCoverage.catalogueDigest = "sha256:" + "f".repeat(64);
    },
    (evidence) => {
      evidence.catalogueCoverage.creditedObligationIds = [
        "wa-family-membership",
      ];
    },
    (evidence) => {
      evidence.catalogueCoverage.creditedObligationIds.push(
        evidence.catalogueCoverage.creditedObligationIds[0],
      );
    },
    (evidence) => {
      evidence.catalogueCoverage.missing = 0;
    },
    (evidence) => {
      evidence.catalogueCoverage.releaseCredit = true;
    },
    (evidence) => {
      evidence.phases.find(
        (phase) => phase.phase === "eventCapability",
      ).status = "FAIL";
    },
  ]) {
    const nativeEvidence = await nativePresentationFixture(false);
    change(nativeEvidence);
    await assert.rejects(
      overview.renderOverview(records, "harness", { nativeEvidence }),
      /NATIVE_CATALOGUE_MISMATCH/,
    );
  }
});

test("native report attributes pinned Work Basket input rows to the CCD phase", async () => {
  const { buildWorkbasketInputDefinition } = await import("./lib/exui-workbasket-input-definition.mjs");
  const evidence = await nativePresentationFixture(false);
  const rows = buildWorkbasketInputDefinition().workbasketInputBindings.map(item => item.obligationId);
  evidence.catalogueCoverage.creditedObligationIds.push(...rows);
  evidence.catalogueCoverage.candidate += rows.length;
  evidence.catalogueCoverage.missing -= rows.length;
  assert.match(require("./harness-native-report.cjs").renderNativeEvidence(evidence), /CCD data and access/);
});

test("shared role policy credit requires its complete source and phase binding summary", async () => {
  const overview = require("./harness-public-overview.cjs");
  const evidence = await nativePresentationFixture(false), coverage = evidence.catalogueCoverage;
  const id = "configuration-shared:role-policy";
  coverage.creditedObligationIds.push(id);
  coverage.ccd++;
  coverage.missing--;
  assert.throws(() => require("./harness-native-report.cjs").renderNativeEvidence(evidence), /SHARED_ROLE_MISMATCH/);
  coverage.sharedRoleAdmission = { obligationId:id, boundary:"ccd", status:"passed", sourceImageProofDigest:"sha256:"+"a".repeat(64),
    roleFacetCount:25, sourceBindingCount:25, eventObservationCount:8, candidateArtifactDigest:evidence.source.candidateArtifactDigest,
    ccdRunId:coverage.phaseReferences.ccd.runId, eventRunId:coverage.phaseReferences.eventCapability.runId };
  const records = overview.entries.map(entry => ({entry,observed:{status:"passed"}}));
  const html = await overview.renderOverview(records,"harness",{nativeEvidence:evidence});
  assert.match(html,/7 \/ 112 catalogue requirements satisfied by accepted runtime evidence/);
  const summary = require("node-html-parser").parse(html);
  assert.equal(summary.querySelector('[data-catalogue-kind="shared-policy"]').getAttribute("data-catalogue-accepted"),"1");
  coverage.sharedRoleAdmission.roleFacetCount = 24;
  assert.throws(() => require("./harness-native-report.cjs").renderNativeEvidence(evidence), /SHARED_ROLE_MISMATCH/);
});

test("native report attributes every source shape to its accepted event capability receipt", async () => {
  const { SOURCE_SHAPE_ROWS } = await import("./lib/exui-source-shape-contract.mjs");
  const evidence = await nativePresentationFixture(false);
  evidence.catalogueCoverage.creditedObligationIds.push(...SOURCE_SHAPE_ROWS.map(row => row.obligationId));
  evidence.catalogueCoverage.candidate += SOURCE_SHAPE_ROWS.length;
  evidence.catalogueCoverage.missing -= SOURCE_SHAPE_ROWS.length;
  const { renderNativeEvidence } = require("./harness-native-report.cjs");
  assert.match(renderNativeEvidence(evidence), /Postal recipient name/);
  evidence.catalogueCoverage.phaseReferences.eventCapability.receiptArtifactDigest = "sha256:" + "f".repeat(64);
  assert.throws(() => renderNativeEvidence(evidence), /NATIVE_CATALOGUE_MISMATCH/);
});

test("diagnostic source is captured at onBegin and not reread from a changed HEAD while rendering", async (t) => {
  sandbox(t);
  const cp = require("node:child_process"),
    original = cp.execFileSync;
  let commit = "d".repeat(40),
    calls = 0;
  cp.execFileSync = (_command, args) => {
    calls++;
    return args[0] === "rev-parse" ? commit + "\n" : "";
  };
  t.after(() => {
    cp.execFileSync = original;
  });
  const Reporter = api(),
    reporter = new Reporter({ selection: "harness" }),
    tests = testsFor();
  reporter.onBegin({}, { allTests: () => tests });
  commit = "e".repeat(40);
  tests.forEach((item, index) =>
    reporter.onTestEnd(item, result("passed", index)),
  );
  await reporter.onEnd(fullResult());
  assert.equal(calls, 2);
  assert.equal(
    Reporter.validatePublicReport().diagnosticSource.commit,
    "d".repeat(40),
  );
  const html = fs.readFileSync(output(), "utf8");
  assert.ok(html.includes("d".repeat(40)));
  assert.ok(!html.includes("e".repeat(40)));
});

test("native slice filters change only native rows and retain separate baseline/fault counts", () => {
  const vm = require("node:vm");
  const listeners = {};
  const selects = ["phase", "kind"].map((key) => ({
    dataset: { nativeFilter: key },
    value: "",
    addEventListener: (_event, callback) => {
      listeners[key] = callback;
    },
  }));
  const rows = [
    { dataset: { nativePhase: "family", nativeKind: "baseline" } },
    { dataset: { nativePhase: "ccd", nativeKind: "baseline" } },
    { dataset: { nativePhase: "ccd", nativeKind: "fault" } },
  ];
  const tables = ["baseline", "fault"].map((kind) => ({
    dataset: { nativeTable: kind },
  }));
  const count = {};
  const root = {
    querySelectorAll: (selector) =>
      ({
        "[data-native-filter]": selects,
        "[data-native-row]": rows,
        "[data-native-table]": tables,
      })[selector] || [],
    querySelector: (selector) =>
      selector === "[data-native-count]" ? count : { addEventListener() {} },
  };
  const document = { getElementById: () => root };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "harness-report-coverage.js"), "utf8"),
    {
      window: { jQuery: true },
      document,
      $: () => ({ ready: (callback) => callback() }),
    },
  );
  selects[0].value = "ccd";
  listeners.phase();
  assert.deepEqual(
    rows.map((row) => row.hidden),
    [true, false, false],
  );
  assert.equal(
    count.textContent,
    "1 matching baseline results and 1 deliberate fault checks",
  );
  selects[1].value = "fault";
  listeners.kind();
  assert.deepEqual(
    rows.map((row) => row.hidden),
    [true, true, false],
  );
  assert.deepEqual(
    tables.map((table) => table.hidden),
    [true, false],
  );
  assert.equal(
    count.textContent,
    "0 matching baseline results and 1 deliberate fault checks",
  );
  selects[0].value = "";
  selects[1].value = "";
  listeners.kind();
  assert.deepEqual(
    rows.map((row) => row.hidden),
    [false, false, false],
  );
});

test("HTML integrity binds the full native projection and diagnostic source, not only headline status", async (t) => {
  const root = sandbox(t),
    Reporter = api();
  const reporter = new Reporter({ selection: "harness" });
  await require("./fixtures/exui-native-report-packet.mock.cjs").preparePublication(t,reporter,{postalFailure:true});
  const tests = testsFor();
  reporter.onBegin({}, { allTests: () => tests });
  tests.forEach((item, index) =>
    reporter.onTestEnd(item, result("passed", index)),
  );
  await reporter.onEnd(fullResult());
  const file = path.join(
    root,
    "functional-output/tests/harness/private/public-odhin-harness.json",
  );
  const original = fs.readFileSync(file);
  for (const change of [
    (record) => {
      delete record.nativeEvidence;
    },
    (record) => {
      delete record.diagnosticSource;
    },
    (record) => {
      record.nativeEvidence.phases[2].baselineProofs.find(proof => proof.proofId === "ccd-postal-two-roundtrip").status = "passed";
    },
    (record) => {
      record.nativeEvidence.source.harnessCommit = "f".repeat(40);
    },
    (record) => {
      record.diagnosticSource = {
        ...record.diagnosticSource,
        extra: "unbound source field",
      };
    },
  ]) {
    const record = JSON.parse(original);
    change(record);
    fs.writeFileSync(file, JSON.stringify(record));
    assert.throws(() => Reporter.validatePublicReport(), /PUBLIC_ODHIN/);
  }
  fs.writeFileSync(file, original);
  assert.equal(
    Reporter.validatePublicReport().nativeEvidence.status,
    "BLOCKED",
  );
});

test("six-phase presentation cannot relabel historical or partial native collections", async () => {
  const { renderNativeEvidence } = require("./harness-native-report.cjs");
  const value = await nativePresentationFixture();
  value.phases.pop();
  assert.throws(
    () => renderNativeEvidence(value),
    /NATIVE_CATALOGUE_MISMATCH|COMPLETE_NATIVE_PHASES_REQUIRED/,
  );
  const partial = await nativePresentationFixture();
  partial.phases[3].baselineProofs.pop();
  assert.throws(
    () => renderNativeEvidence(partial),
    /COMPLETE_NATIVE_PROOFS_REQUIRED/,
  );
});

test("callback presentation cannot credit a missing phase, wrong source row or extra proof",async()=>{
 const {renderNativeEvidence}=require('./harness-native-report.cjs');
 for(const alter of [e=>e.phases.pop(),e=>e.phases.reverse(),e=>e.phases.push(e.phases.at(-1)),e=>e.phases.find(p=>p.phase==='recipientCallback').baselineProofs.push({...e.phases.find(p=>p.phase==='recipientCallback').baselineProofs[0],proofId:'foreign-callback'}),e=>e.catalogueCoverage.phaseReferences.recipientCallback.status='BLOCKED']) {
  const evidence=await nativePresentationFixture(false);alter(evidence);assert.throws(()=>renderNativeEvidence(evidence),/PUBLIC_ODHIN_/);
 }
 const evidence=await nativePresentationFixture(false);
 evidence.phases.find(p=>p.phase==='recipientCallback').privateCallbackJournal={rawBody:canary,caseReference:canary};
 const html=renderNativeEvidence(evidence);assert.ok(!html.includes(canary));
 assert.match(html,/Additional recipient callback row/);assert.match(html,/Callback business logic is synthetic/);
 assert.equal((html.match(/data-native-phase="recipientCallback" data-native-kind="baseline"/g)||[]).length,1);
 assert.equal((html.match(/data-native-phase="recipientCallback" data-native-kind="fault"/g)||[]).length,1);
});

test('supplementary compatibility evidence stays outside primary counts and is bound into the one public report',async(t)=>{
 const root=sandbox(t),Reporter=api(),reporter=new Reporter({selection:'harness'});
 await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);
 const primary=structuredClone(reporter.nativeEvidence),hash='sha256:'+'a'.repeat(64);
 reporter.compatibilityEvidence={schemaVersion:1,kind:'applicant-results-compatibility',status:'PASS',runId:'ccd-11111111-1111-4111-8111-111111111111',producerCommit:'b'.repeat(40),candidateCommit:'c'.repeat(40),candidateArtifactDigest:hash,sourceDigest:hash,dataImageDigest:hash,profileDigest:hash,descriptorDigest:hash,receiptArtifactDigest:hash,baselineProofs:1,effectiveFaults:3,sourceRows:2,cleanupComplete:true,catalogueCredit:false,releaseCredit:false};
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,index)=>reporter.onTestEnd(item,result('passed',index)));await reporter.onEnd(fullResult());
 const record=Reporter.validatePublicReport();assert.equal(record.tests,tests.length);assert.deepEqual(record.nativeEvidence,primary);
 const htmlFile=path.join(root,'functional-output/tests/harness/public/odhin/index.html');
 const html=fs.readFileSync(htmlFile,'utf8');assert(!html.includes(canary));assert.equal((html.match(/id="harness-applicant-compatibility"/g)||[]).length,1);
 assert(html.indexOf('id="harness-native-evidence"')<html.indexOf('id="harness-applicant-compatibility"'));
 const recordFile=path.join(root,'functional-output/tests/harness/private/public-odhin-harness.json'),original=fs.readFileSync(recordFile);
 for(const change of [v=>v.compatibilityEvidence=null,v=>v.compatibilityEvidence.producerCommit='d'.repeat(40),v=>v.compatibilityEvidence.catalogueCredit=true,v=>v.compatibilityEvidence.private=canary]){
  const changed=JSON.parse(original);change(changed);fs.writeFileSync(recordFile,JSON.stringify(changed));assert.throws(()=>Reporter.validatePublicReport());
 }
 fs.writeFileSync(recordFile,original);assert.equal(Reporter.validatePublicReport().compatibilityEvidence.cleanupComplete,true);
});


test("native headline shows the actual status and reserves green for passing evidence", () => {
 const vm = require('node:vm');
 const script = fs.readFileSync(path.join(__dirname,'harness-public-dashboard.js'),'utf8');
 const make = () => ({dataset:{},children:[],classList:{add(){}},append(...items){this.children.push(...items)},setAttribute(){}});
 for (const status of [null,'PASS','FAIL','BLOCKED']) {
  const metrics=make(); metrics.querySelector=selector=>({textContent:selector.includes('metric-0')?'116':selector.includes('metric-1')?'100%':'0'});metrics.replaceChildren=()=>{metrics.children=[]};
  const native=status?{dataset:{nativeStatus:status},querySelectorAll:()=>[{},{}]}:null;
  const document={createElement:make,querySelector:selector=>({'#harness-application-coverage':{dataset:{runtimeObligations:'112'}},'.report-metrics':metrics,'#harness-native-evidence':native})[selector]||null,querySelectorAll:()=>[]};
  vm.runInNewContext(script,{document});
  const card=metrics.children[1];
  assert.equal(card.dataset.nativeStatus,status||'NOT_RUN');
  assert.equal(card.children[1].textContent,status?'2 + 2':'Not run');
  assert.ok(card.children[2].textContent.includes(status||'Candidate and CCD checks not attached'));
 }
 const css=fs.readFileSync(path.join(__dirname,'harness-report-coverage.css'),'utf8');
 assert.match(css,/\.report-metric\.metric-1\[data-native-status\] strong\s*\{\s*color: var\(--report-ink\);/);
 assert.match(css,/\.report-metric\.metric-1\[data-native-status="PASS"\] strong\s*\{\s*color: var\(--odhin-passed-status-color\);/);
});

test('separately admitted DIVORCE profile stays outside main totals in the same report',async t=>{
 const root=sandbox(t),Reporter=api(),reporter=new Reporter({selection:'harness'}),hash='sha256:'+'a'.repeat(64);
 await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter,{postalFailure:true});const primary=structuredClone(reporter.nativeEvidence);
 reporter.nativeEvidence.divorceProfileAdmission={schemaVersion:1,kind:'divorce-profile-admission',status:'passed',obligationId:'configuration-profile:2260b5331c599e46abfb999b6daeb8612a342c884dd0b88e1c23c04adecc79ce',boundary:'candidate',family:'DIVORCE',baselineProofs:6,effectiveFaults:6,selected:1,accepted:1,catalogueSize:112,releaseCredit:false,releaseApproval:false,runId:'divorce-00000000-0000-4000-8000-000000000001',producerCommit:'e'.repeat(40),candidateCommit:'f'.repeat(40),...Object.fromEntries(['producerDigest','candidateArtifactDigest','inputDigest','bindingDigest','receiptDigest','terminalDigest','launchDigest','cleanupDigest','contractDigest'].map(key=>[key,hash]))};
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,index)=>reporter.onTestEnd(item,result('passed',index)));await reporter.onEnd(fullResult());
 const record=Reporter.validatePublicReport();assert.equal(record.tests,tests.length);assert.deepEqual(record.nativeEvidence.catalogueCoverage,primary.catalogueCoverage);assert.deepEqual(record.nativeEvidence.source,primary.source);assert.equal(record.nativeEvidence.status,primary.status);
 const html=fs.readFileSync(path.join(root,'functional-output/tests/harness/public/odhin/index.html'),'utf8');assert.equal((html.match(/id="harness-divorce-profile-admission"/g)||[]).length,1);assert.match(html,/1\/1 profile accepted in a separate run/);assert.match(html,/Postal proof BLOCKED/);assert.match(html,/Separate profile run: 1\/1 accepted; excluded from main cohort count/);assert.match(html,/Standalone total duration not recorded/);assert.match(html,/data-profile-status="PASS" data-profile-baselines="6" data-profile-faults="6" data-profile-accepted="1" data-profile-selected="1"/);assert(html.includes('data-profile-producer="'+'e'.repeat(40)+'"'));assert(html.includes('data-profile-run="divorce-00000000-0000-4000-8000-000000000001"'));
 const recordFile=path.join(root,'functional-output/tests/harness/private/public-odhin-harness.json'),original=fs.readFileSync(recordFile);
 for(const change of [v=>delete v.nativeEvidence.divorceProfileAdmission,v=>v.nativeEvidence.divorceProfileAdmission.producerCommit='d'.repeat(40),v=>v.nativeEvidence.divorceProfileAdmission.accepted=2,v=>v.nativeEvidence.divorceProfileAdmission.private=canary]){const changed=JSON.parse(original);change(changed);fs.writeFileSync(recordFile,JSON.stringify(changed));assert.throws(()=>Reporter.validatePublicReport());}
 fs.writeFileSync(recordFile,original);
});


test('dashboard exposes supplementary runs without adding them to main counts', () => {
 const vm=require('node:vm');
 const script=fs.readFileSync(path.join(__dirname,'harness-public-dashboard.js'),'utf8');
 const make=()=>({dataset:{},children:[],attributes:{},classList:{add(){}},append(...items){this.children.push(...items)},setAttribute(name,value){this.attributes[name]=value}});
 const panels={
  '#harness-shared-nested-attempt':{dataset:{attemptStatus:'BLOCKED',attemptBaselinesCompleted:'4',attemptBaselinesPassed:'2',attemptBaselinesFailed:'2',attemptFaultsCompleted:'0',attemptFaultsNotRun:'3'}},
  '#harness-divorce-profile-admission':{dataset:{profileStatus:'PASS',profileBaselines:'6',profileFaults:'6',profileAccepted:'1',profileSelected:'1',profileDurationMs:'125000'}},
  '#harness-applicant-compatibility':{dataset:{compatibilityStatus:'PASS',compatibilityBaselines:'1',compatibilityFaults:'3'}},
  '#harness-personal-service-admission':{dataset:{personalStatus:'PASS',personalBaselines:'1',personalEffectiveFaults:'1',personalAccepted:'1',personalTotal:'1',personalInclusion:'included',personalDurationMs:'247013'}},
  '#harness-st-cic-profile-admission':{dataset:{stCicStatus:'PASS',stCicInclusion:'included',stCicBaselines:'5',stCicEffectiveFaults:'5',stCicExecutions:'10',stCicCredited:'1'}},
 };
 const render=(supplements,main=true)=>{
  const metrics=make();metrics.querySelector=selector=>({textContent:selector.includes('metric-0')?'116':selector.includes('metric-1')?'100%':'0'});metrics.replaceChildren=()=>{metrics.children=[]};
  const elements={'#harness-public-run':{dataset:{nativeElapsedMs:'60000'}},'#harness-application-coverage':{dataset:{runtimeObligations:'112'}},'.report-metrics':metrics,...(main?{'#harness-native-evidence':{dataset:{nativeStatus:'PASS'},querySelectorAll:()=>[{},{}]}}:{}),...supplements};
  const document={createElement:make,querySelector:selector=>elements[selector]||null,querySelectorAll:selector=>selector.includes('data-catalogue-kind')?[{dataset:{catalogueAccepted:'35'}}]:[]};
  vm.runInNewContext(script,{document});return metrics;
 };
 const text=node=>[node.textContent||'',...node.children.map(text)].join(' ');
 const plain=render({});assert.equal(plain.children[1].children[0].textContent,'Native proof outcomes');assert(!plain.children.some(x=>x.className==='report-supplement-summary'));
 const metrics=render(panels),summary=metrics.children[5];
 assert.equal(metrics.children[0].children[1].textContent,'35 / 112');assert.equal(metrics.children[1].children[1].textContent,'2 + 2');assert.equal(metrics.children[2].children[1].textContent,'116');assert.equal(metrics.children[3].children[1].textContent,'Unavailable');
 assert.equal(metrics.children[1].children[0].textContent,'Main native proof outcomes');assert.equal(summary.className,'report-supplement-summary');
 const links=summary.children.find(x=>x.className==='report-supplement-links').children;
 assert.deepEqual(links.map(x=>x.href),Object.keys(panels));
 assert.match(text(links[0]),/BLOCKED/);assert.match(text(links[0]),/4 baseline facets completed/);assert.match(text(links[0]),/2 passed.*2 failed/);assert.match(text(links[0]),/0 effective faults.*3 not run/);
 assert.match(text(links[1]),/6 baseline.*6 effective faults/);assert.match(text(links[1]),/1 \/ 1.*separate/);
 assert.match(text(links[2]),/1 baseline.*3 effective faults/);assert.match(text(links[2]),/Corrected local ARM64 CCD/);
 assert.match(text(links[3]),/PASS.*1 baseline.*1 effective fault/);assert.match(text(links[3]),/already included in main candidate coverage/);assert.match(text(links[3]),/Personal pair interval: 4m 7s.*excluded from recorded native interval/);
 assert.match(text(links[4]),/ST_CIC.*5 baseline.*5 effective fault.*10 standalone executions/);assert.match(text(links[4]),/1 requirement already included once/);assert.equal(links[4].href,'#harness-st-cic-profile-admission');assert.match(text(links[4]),/duration not recorded/);
 const mandatoryData={mandatoryEmailStatus:'PASS',mandatoryEmailInclusion:'included',mandatoryEmailBaselines:'2',mandatoryEmailEffectiveFaults:'2',mandatoryEmailExecutions:'3',mandatoryEmailCredited:'2'};
 const mandatoryPanel=(data=mandatoryData,ms='222227')=>({dataset:data,querySelector:()=>({dataset:{mandatoryEmailTiming:ms}})});
 const mandatory=render({'#harness-mandatory-email-admission':mandatoryPanel()});assert.match(text(mandatory.children[5]),/2 baseline results.*2 named fault results.*3 executions/);assert.match(text(mandatory.children[5]),/2 requirements already included once each/);assert.match(text(mandatory.children[5]),/3m 42s/);assert.equal(mandatory.children[0].children[1].textContent,'35 / 112');assert.equal(mandatory.children[1].children[1].textContent,'2 + 2');assert.match(text(mandatory.children[1]),/mandatory email admission, diagnostics/);assert.doesNotMatch(text(plain.children[1]),/mandatory email/);
 const mandatorySeparate=render({'#harness-mandatory-email-admission':mandatoryPanel({...mandatoryData,mandatoryEmailInclusion:'separate',mandatoryEmailCredited:'0'},'not-recorded')});assert.match(text(mandatorySeparate.children[5]),/Separate packet.*no requirements added/);assert.match(text(mandatorySeparate.children[5]),/Not recorded/);
 for(const data of [{...mandatoryData,mandatoryEmailExecutions:'4'},{...mandatoryData,mandatoryEmailCredited:'1'}]){const invalid=render({'#harness-mandatory-email-admission':mandatoryPanel(data)});assert.match(text(invalid.children[5]),/Not recorded.*Execution counts not recorded/);assert.doesNotMatch(text(invalid.children[5]),/2 baseline results/);}
 const stCicPanel=panels['#harness-st-cic-profile-admission'];const separateStCic=render({'#harness-st-cic-profile-admission':{dataset:{...stCicPanel.dataset,stCicInclusion:'separate',stCicCredited:'0'}}});assert.match(text(separateStCic.children[5]),/Separate packet; no requirement added/);assert.equal(separateStCic.children[0].children[1].textContent,'35 / 112');
 const invalidStCic=render({'#harness-st-cic-profile-admission':{dataset:{...stCicPanel.dataset,stCicExecutions:'11'}}});assert.match(text(invalidStCic.children[5]),/Not recorded.*Execution counts not recorded/);assert.doesNotMatch(text(invalidStCic.children[5]),/5 baseline|10 standalone/);assert.doesNotMatch(text(metrics),/View evidence|View Build evidence/);
 const separatePersonal=render({'#harness-personal-service-admission':{dataset:{...panels['#harness-personal-service-admission'].dataset,personalInclusion:'separate'}}});assert.match(text(separatePersonal.children[5]),/1 \/ 1 requirement accepted in this separate run/);assert.equal(separatePersonal.children[0].children[1].textContent,'35 / 112');
 const failedPersonal=render({'#harness-personal-service-attempt':{dataset:{personalAttemptStatus:'BLOCKED',personalAttemptDurationMs:'1234'}}});assert.match(text(failedPersonal.children[5]),/BLOCKED.*Completed proof counts unavailable.*No additional catalogue/);assert.doesNotMatch(text(failedPersonal.children[5]),/1 baseline|1 effective fault/);assert.match(text(failedPersonal.children[5]),/Observed attempt interval: 0m 1s/);
 assert.match(text(metrics.children[1]),/1\.0 min recorded native interval/);
 assert.match(text(links[1]),/Separate profile interval: 2m 5s.*excluded from recorded native interval/);
 assert.match(text(summary),/Separate execution counts and durations/);assert.match(text(summary),/Supplementary requirements enter the catalogue total only when jointly admitted/);assert.doesNotMatch(text(summary),/excluded from the main totals/);
 const unknown=render({'#harness-divorce-profile-admission':{dataset:{...panels['#harness-divorce-profile-admission'].dataset,profileDurationMs:undefined}}});assert.match(text(unknown.children[5]),/Separate profile interval: not recorded/);
 const included=render({'#harness-divorce-profile-admission':{dataset:{...panels['#harness-divorce-profile-admission'].dataset,profileInclusion:'included'}}});assert.match(text(included.children[5]),/already included in main candidate coverage/);assert.match(text(included.children[5]),/2m 5s.*excluded from recorded native interval/);assert.equal(included.children[0].children[1].textContent,'35 / 112');
 const zero=render({'#harness-divorce-profile-admission':{dataset:{...panels['#harness-divorce-profile-admission'].dataset,profileDurationMs:'0'}}});assert.match(text(zero.children[5]),/Separate profile interval: 0m 0s/);
 const standalone=render({'#harness-shared-nested-attempt':panels['#harness-shared-nested-attempt']},false);
 assert.equal(standalone.children[1].children[1].textContent,'Not run');assert.equal(standalone.children[1].dataset.nativeStatus,'NOT_RUN');assert.equal(standalone.children[2].children[1].textContent,'116');assert.match(text(standalone.children[5]),/BLOCKED/);
 for(const [selector,panel]of Object.entries(panels)){const one=render({[selector]:panel});assert.equal(one.children[5].children.find(x=>x.className==='report-supplement-links').children.length,1);}
 const css=fs.readFileSync(path.join(__dirname,'harness-report-coverage.css'),'utf8');assert.match(css,/\.report-supplement-summary[^{]*\{[^}]*grid-column:\s*1 \/ -1/);assert.match(css,/\.report-supplement-links[^{]*\{[^}]*minmax/);
});


test('applicant compatibility publishes only validated dashboard count attributes', () => {
 const {renderApplicantCompatibility}=require('./harness-applicant-results-report.cjs');
 const hash='sha256:'+'a'.repeat(64);
 const value={schemaVersion:1,kind:'applicant-results-compatibility',status:'PASS',runId:'ccd-11111111-1111-4111-8111-111111111111',producerCommit:'b'.repeat(40),candidateCommit:'c'.repeat(40),candidateArtifactDigest:hash,sourceDigest:hash,dataImageDigest:hash,profileDigest:hash,descriptorDigest:hash,receiptArtifactDigest:hash,baselineProofs:1,effectiveFaults:3,sourceRows:2,cleanupComplete:true,catalogueCredit:false,releaseCredit:false};
 const section=require('node-html-parser').parse(renderApplicantCompatibility(value)).querySelector('#harness-applicant-compatibility');
 assert.equal(section.getAttribute('data-compatibility-status'),'PASS');assert.equal(section.getAttribute('data-compatibility-baselines'),'1');assert.equal(section.getAttribute('data-compatibility-faults'),'3');
 for(const changed of [{...value,baselineProofs:2},{...value,effectiveFaults:4},{...value,catalogueCredit:true},{...value,status:'FAIL'}])assert.throws(()=>renderApplicantCompatibility(changed));
});


test('selector catalogue credit requires its exact successful phase and cannot duplicate the source row',async()=>{
 const {renderNativeEvidence}=require('./harness-native-report.cjs');
 const id='configuration-shape:bbfb8dfe6d409d6df3291b434a305a3ac5237d63d21ba8c0695b787af62913fe';
 for(const alter of [e=>{e.phases.find(p=>p.phase==='selectorEventRow').status='BLOCKED';},e=>{e.catalogueCoverage.phaseReferences.selectorEventRow.receiptArtifactDigest='sha256:'+'0'.repeat(64);},e=>{e.catalogueCoverage.creditedObligationIds.push(id);e.catalogueCoverage.candidate++;e.catalogueCoverage.missing--;},e=>{e.phases.find(p=>p.phase==='selectorEventRow').faults=[];}]){
  const evidence=await nativePresentationFixture(false);alter(evidence);assert.throws(()=>renderNativeEvidence(evidence),/PUBLIC_ODHIN_/);
 }
 const evidence=await nativePresentationFixture(false),html=renderNativeEvidence(evidence);
 assert.equal(evidence.catalogueCoverage.creditedObligationIds.filter(value=>value===id).length,1);
 assert.match(html,/Optional recipient selector on source Page2/);assert.match(html,/Fields1–6 and the neighbouring business callback are excluded/);
 assert.equal((html.match(/data-native-phase="selectorEventRow" data-native-kind="baseline"/g)||[]).length,1);assert.equal((html.match(/data-native-phase="selectorEventRow" data-native-kind="fault"/g)||[]).length,1);
});

test('seven-phase dashboard includes selector setup, execution, evidence and cleanup timings exactly once',async t=>{
 sandbox(t);const Reporter=api();
 const labels=['WA family','Scope fault candidate preparation','WA organisation scope','CCD runtime startup','CCD configuration and access','CCD runtime cleanup','Source event CCD runtime startup','CCD source event permissions','Source event CCD runtime cleanup','Application routing','Recipient callback CCD runtime startup','Recipient callback validation and persistence','Recipient callback CCD runtime cleanup','Selector CCD baseline preparation','Selector baseline proof and cleanup','Selector CCD fault preparation','Selector fault proof and cleanup','Selector evidence verification','Selector final cleanup','Selector cohort admission'];
 const passed=new Set(['WA family','WA organisation scope','CCD configuration and access','CCD source event permissions','Application routing','Recipient callback validation and persistence','Selector evidence verification','Selector cohort admission']);
 const phaseTimings=labels.map((label,index)=>({label,status:passed.has(label)?'PASS':'completed',startedAt:new Date(Date.UTC(2026,10,5,12,0,index)).toISOString(),durationMs:1000}));
 const reporter=new Reporter({selection:'harness',nativeElapsedMs:20000,phaseTimings});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,index)=>reporter.onTestEnd(item,result('passed',index)));await reporter.onEnd(fullResult());
 assert.equal(Reporter.validatePublicReport('harness').status,'passed');
 const dom=require('node-html-parser').parse(fs.readFileSync(output(),'utf8')),table=dom.querySelector('#harness-phase-timings');
 assert.match(table.textContent,/Unitemized recorded interval: 0m 0s \(0 ms\)/);assert.match(table.textContent,/preflight and controller work.*ST_CIC when attached/);assert.match(table.textContent,/not an exact ST_CIC or per-facet duration/);
 assert.equal(table.querySelectorAll('tbody tr').length,20);assert.match(table.textContent,/0m 20s recorded native interval/);
 for(const label of labels.slice(-7))assert.equal(table.querySelectorAll('tbody tr').filter(row=>row.textContent.includes(label)).length,1);
 assert.match(table.textContent,/Selector baseline proof and cleanupProof \+ setup \/ cleanup/);
 for(const label of ['WA family','WA organisation scope','CCD configuration and access','CCD source event permissions','Application routing','Recipient callback validation and persistence']){const row=table.querySelectorAll('tbody tr').find(row=>row.children[0].textContent===label);assert.equal(row.children[1].textContent,'Proof + setup / cleanup',label+' is a whole controller phase, not framework-only execution');assert.equal(row.children[4].textContent,'0m 1s');}
 for(const [label,kind] of [['Scope fault candidate preparation','Setup / cleanup'],['Selector evidence verification','Evidence verification'],['Selector baseline proof and cleanup','Proof + setup / cleanup']]){const row=table.querySelectorAll('tbody tr').find(row=>row.children[0].textContent===label);assert.equal(row.children[1].textContent,kind);}
 assert(!table.textContent.includes('parallel input seals'),'no unrecorded segment is invented');
 assert(!table.textContent.includes('Selector Page2 preparation, proofs and cleanup'));
 const recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),originalRecord=fs.readFileSync(recordFile),originalHtml=fs.readFileSync(output(),'utf8');
 for(const mutate of [r=>r.phaseTimings[0].durationMs=1001,r=>r.phaseTimings[1].status='stopped',r=>r.phaseTimings[0].startedAt='2026-11-05T12:00:00.001Z',r=>r.phaseTimings.splice(1,1)]){
  const changed=JSON.parse(originalRecord);mutate(changed);fs.writeFileSync(recordFile,JSON.stringify(changed));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);fs.writeFileSync(recordFile,originalRecord);
 }
 const page=require('node-html-parser').parse(originalHtml),panel=page.querySelector('#harness-phase-timings');panel.insertAdjacentHTML('afterend',panel.toString());const duplicate=page.toString(),changed=JSON.parse(originalRecord);changed.sha256=require('node:crypto').createHash('sha256').update(duplicate).digest('hex');fs.writeFileSync(output(),duplicate);fs.writeFileSync(recordFile,JSON.stringify(changed));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);fs.writeFileSync(output(),originalHtml);fs.writeFileSync(recordFile,originalRecord);
 for(const action of ['value','duplicate']){
  const tampered=require('node-html-parser').parse(originalHtml),nativeRow=tampered.querySelector('.testcase-run-info-table').querySelectorAll('tr').find(row=>row.querySelector('th')?.textContent==='Recorded native interval');if(action==='value')nativeRow.querySelector('td').textContent='PASS · ST_CIC took exactly 20 seconds';else nativeRow.insertAdjacentHTML('afterend',nativeRow.toString());
  const html=tampered.toString(),rec=JSON.parse(originalRecord);rec.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');fs.writeFileSync(output(),html);fs.writeFileSync(recordFile,JSON.stringify(rec));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);fs.writeFileSync(output(),originalHtml);fs.writeFileSync(recordFile,originalRecord);
 }
 const preceding=require('node-html-parser').parse(originalHtml),precedingRecord=JSON.parse(originalRecord),precedingPanel=preceding.querySelector('#harness-phase-timings');
 precedingPanel.querySelector('[data-native-unitemized]').remove();precedingPanel.querySelector('.harness-phase-heading strong').textContent='0m 20s main native + evidence verification';precedingPanel.querySelector('.harness-phase-heading p').textContent='Native controller timings and collector evidence checks, in execution order. These are timing telemetry, not additional catalogue credit. Diagnostic Playwright time and Jenkins checkout/build time are separate.';
 for(const row of precedingPanel.querySelectorAll('tbody tr'))if(['WA family','WA organisation scope','CCD configuration and access','CCD source event permissions','Application routing','Recipient callback validation and persistence'].includes(row.children[0].textContent))row.children[1].textContent='Proof';
 const precedingRow=preceding.querySelector('.testcase-run-info-table').querySelectorAll('tr').find(row=>row.querySelector('th')?.textContent==='Recorded native interval');precedingRow.querySelector('th').textContent='Main native + evidence verification';precedingRow.querySelector('td').textContent='PASS · 0.3 min';
 const precedingHtml=preceding.toString();precedingRecord.sha256=require('node:crypto').createHash('sha256').update(precedingHtml).digest('hex');fs.writeFileSync(output(),precedingHtml);fs.writeFileSync(recordFile,JSON.stringify(precedingRecord));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);Reporter.resetPublicReport('harness');assert(!fs.existsSync(output()));fs.writeFileSync(output(),originalHtml);fs.writeFileSync(recordFile,originalRecord);
 const legacy=require('node-html-parser').parse(originalHtml),prior=JSON.parse(originalRecord);legacy.querySelectorAll('[data-harness-check-info]').forEach(node=>node.remove());legacy.querySelectorAll('[data-harness-check-steps]').forEach(node=>{node.parentNode.innerHTML='';});legacy.querySelectorAll('[data-phase-duration-ms]').forEach(node=>{node.removeAttribute('data-phase-duration-ms');node.removeAttribute('data-phase-started-at');});delete prior.checkMethods;delete prior.detailEvidence;delete prior.diagnosticWorkers;const oldPanel=legacy.querySelector('#harness-phase-timings');oldPanel.querySelector('[data-native-unitemized]').remove();oldPanel.querySelector('.harness-phase-heading strong').textContent='0m 20s main native + evidence verification';oldPanel.querySelector('.harness-phase-heading p').textContent='Native controller timings and collector evidence checks, in execution order. These are timing telemetry, not additional catalogue credit. Diagnostic Playwright time and Jenkins checkout/build time are separate.';for(const row of oldPanel.querySelectorAll('tbody tr'))if(['WA family','WA organisation scope','CCD configuration and access','CCD source event permissions','Application routing','Recipient callback validation and persistence'].includes(row.children[0].textContent))row.children[1].textContent='Proof';const oldHtml=legacy.toString();prior.sha256=require('node:crypto').createHash('sha256').update(oldHtml).digest('hex');fs.writeFileSync(output(),oldHtml);fs.writeFileSync(recordFile,JSON.stringify(prior));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);Reporter.resetPublicReport('harness');assert.equal(fs.existsSync(output()),false);
 // Exact prior kind labels may retire, but never authenticate current results.
 const oldKinds=require('node-html-parser').parse(originalHtml),oldTable=oldKinds.querySelector('#harness-phase-timings');
 const wholePhaseLabels=new Set(['WA family','WA organisation scope','CCD configuration and access','CCD source event permissions','Application routing','Recipient callback validation and persistence']);
 for(const row of oldTable.querySelectorAll('tbody tr'))if(wholePhaseLabels.has(row.children[0].textContent))row.children[1].textContent='Proof';
 const writeOldKinds=page=>{const html=page.toString(),record=JSON.parse(originalRecord);record.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');fs.writeFileSync(output(),html,{mode:0o600});fs.writeFileSync(recordFile,JSON.stringify(record),{mode:0o600});};
 writeOldKinds(oldKinds);assert.throws(()=>Reporter.validatePublicReport('harness'),/PUBLIC_ODHIN/);
 const kindCell=oldTable.querySelectorAll('tbody tr').find(row=>row.children[0].textContent==='WA family').children[1];kindCell.textContent='Framework execution only';writeOldKinds(oldKinds);assert.throws(()=>Reporter.resetPublicReport('harness'),/PUBLIC_ODHIN/);
 kindCell.textContent='Proof';writeOldKinds(oldKinds);Reporter.resetPublicReport('harness');assert.equal(fs.existsSync(output()),false);


});

test('nonadmitted DIVORCE attempts remain visible without invented completion or catalogue credit',async t=>{
 const root=sandbox(t),Reporter=require(reporterPath),overview=require('./harness-public-overview.cjs');
 for(const attempt of [{schemaVersion:1,kind:'divorce-profile-attempt',status:'NOT_RUN',reason:'main-evidence-unavailable'},{schemaVersion:1,kind:'divorce-profile-attempt',status:'BLOCKED',reason:'profile-not-admitted',durationMs:125000}]){
  const reporter=new Reporter({selection:'harness',divorceProfileAttempt:attempt});const tests=overview.entries.map(entry=>({location:{file:path.join(root,entry.file)},titlePath:()=>entry.titlePath,retries:0,expectedStatus:'passed'}));reporter.onBegin({}, {allTests:()=>tests});const startTime=new Date('2026-11-05T12:00:00Z');for(const item of tests)reporter.onTestEnd(item,{...result('passed',tests.indexOf(item)),duration:1,startTime});await reporter.onEnd({status:'passed',startTime,duration:1000});
  const published=Reporter.validatePublicReport();assert.equal(published.tests,116);assert.equal(published.nativeEvidence,null);assert.deepEqual(published.divorceProfileAttempt,attempt);const html=fs.readFileSync(path.join(root,'functional-output/tests/harness/public/odhin/index.html'),'utf8');assert.match(html,/DIVORCE profile: not admitted/);assert.match(html,/Completed proof counts are unavailable/);assert.match(html,/adds no catalogue or release credit/);assert(!html.includes('PRIVATE-CANARY'));assert(html.includes('data-profile-attempt-status="'+attempt.status+'"'));
 }
 const render=require('./harness-divorce-profile-report.cjs').renderDivorceProfileAttempt,base={schemaVersion:1,kind:'divorce-profile-attempt',status:'BLOCKED',reason:'profile-not-admitted'};
 for(const bad of [{...base,status:'PASS'},{...base,reason:'PRIVATE-CANARY'},{...base,accepted:1},{...base,durationMs:-1},{...base,status:'NOT_RUN',durationMs:0},{...base,durationMs:'125000'}])assert.throws(()=>render(bad),/DIVORCE_ATTEMPT_INVALID/);
});


test('native execution counts separate31 physical invocations from46 proof records and unknown workers', async () => {
  const evidence = await nativePresentationFixture(false);
  const {nativeCounts, renderNativeExecutionInfo} = require('./harness-native-report.cjs');
  assert.deepEqual(nativeCounts(evidence), {baselines:23, faults:23, invocations:31, workerSlots:[], workersUnknown:31});
  assert.deepEqual(evidence.phases.map(p=>p.invocations.length), [2,3,7,12,3,2,2]);
  assert.match(renderNativeExecutionInfo(evidence), /Not recorded · 31 invocations not recorded/);
  for (const phase of evidence.phases) for (const item of phase.invocations) item.configuredWorkers=1;
  assert.match(renderNativeExecutionInfo(evidence), /1 per invocation/);
  evidence.phases[0].invocations[0].configuredWorkers=2;
  assert.match(renderNativeExecutionInfo(evidence), /1, 2 slots per invocation \(varies\)/);
  assert.match(renderNativeExecutionInfo(evidence), /Observed and peak native worker process counts are not recorded/);
  for (const change of [e=>e.phases[0].invocations.push(e.phases[0].invocations[0]),e=>e.phases[0].invocations.pop(),e=>{e.phases[0].invocations[0].invocationId='foreign';},e=>{e.phases[0].invocations[0].configuredWorkers=canary;}]) {
    const changed=structuredClone(evidence);change(changed);assert.throws(()=>nativeCounts(changed));
  }
  for (const phase of evidence.phases) delete phase.invocations;
  assert.equal(nativeCounts(evidence).invocations,null);
  assert.match(renderNativeExecutionInfo(evidence), /Core native Playwright invocations<\/th><td>Not recorded/);
});

test('RunInfo shows core native invocations and configured slots without inventing observed processes', async t => {
  sandbox(t);
  const Reporter=api(), reporter=new Reporter({selection:'harness'});
  await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);
  for(const phase of reporter.nativeEvidence.phases)for(const item of phase.invocations)item.configuredWorkers=1;
  const tests=testsFor();reporter.onBegin({workers:1},{allTests:()=>tests});
  for(const [index,item] of tests.entries())reporter.onTestEnd(item,result('passed',index));
  await reporter.onEnd(fullResult());
  const html=fs.readFileSync(output('harness'),'utf8');
  assert.match(html,/Core native Playwright invocations<\/th><td>31<\/td>/);
  assert.match(html,/Configured core native worker slots<\/th><td>1 per invocation/);
  assert.match(html,/Configured slots, not concurrent processes/);
  assert.equal(Reporter.validatePublicReport('harness').tests,116);
});


test('personal invocation telemetry is separate from core and historical absence stays unknown', async () => {
  const evidence=await nativePresentationFixture(false), {renderNativeExecutionInfo,nativeCounts}=require('./harness-native-report.cjs');
  const before=nativeCounts(evidence);
  evidence.personalServiceAdmission={invocations:[
    {invocationId:'baseline',runId:'ccd-11111111-1111-4111-8111-111111111111',configuredWorkers:1},
    {invocationId:'optional',runId:'ccd-22222222-2222-4222-8222-222222222222',configuredWorkers:1}
  ]};
  const html=renderNativeExecutionInfo(evidence);
  assert.match(html,/Core native Playwright invocations<\/th><td>31<\/td>/);
  assert.match(html,/Personal-service Playwright invocations<\/th><td>2<\/td>/);
  assert.match(html,/Configured personal-service worker slots<\/th><td>1 per invocation/);
  assert.deepEqual(nativeCounts(evidence),before);
  for(const change of [a=>a.invocations.pop(),a=>a.invocations.push(a.invocations[0]),a=>{a.invocations[1].runId=a.invocations[0].runId;},a=>{a.invocations[1].invocationId='foreign';},a=>{a.invocations[1].configuredWorkers=canary;}]){
    const modified=structuredClone(evidence);change(modified.personalServiceAdmission);assert.throws(()=>renderNativeExecutionInfo(modified));
  }
  evidence.personalServiceAdmission.invocations.forEach(item=>{item.configuredWorkers=null;});
  assert.match(renderNativeExecutionInfo(evidence),/Not recorded · 2 invocations not recorded/);
  delete evidence.personalServiceAdmission.invocations;
  assert.match(renderNativeExecutionInfo(evidence),/Personal-service Playwright invocations<\/th><td>Not recorded<\/td>/);
});

function assuranceTimingFixture(overrides={}) {
 return {schemaVersion:1,scope:'assurance-start-to-report-snapshot',clock:'monotonic',startedAt:'2026-11-06T12:00:00.000Z',elapsedMs:10480,...overrides};
}
function assuranceDashboard(data={}) {
 if(data.getAttribute)data=Object.fromEntries(['assuranceElapsedMs','assuranceScope','assuranceClock','assuranceVersion','assuranceStartedAt'].map(name=>[name,data.getAttribute('data-'+name.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase()))]));
 const make=()=>({dataset:{},children:[],attributes:{},classList:{add(){}},append(...items){this.children.push(...items)},setAttribute(name,value){this.attributes[name]=value}});
 const metrics=make();metrics.querySelector=selector=>({textContent:selector.includes('metric-0')?'116':selector.includes('metric-1')?'100%':'0'});metrics.replaceChildren=()=>{metrics.children=[]};
 const elements={'#harness-public-run':{dataset:{nativeElapsedMs:'180',...data}},'#harness-application-coverage':{dataset:{runtimeObligations:'112'}},'.report-metrics':metrics,'#harness-native-evidence':{dataset:{nativeStatus:'PASS'},querySelectorAll:()=>[{},{}]}};
 require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname,'harness-public-dashboard.js'),'utf8'),{document:{createElement:make,querySelector:selector=>elements[selector]||null,querySelectorAll:selector=>selector.includes('data-catalogue-kind')?[{dataset:{catalogueAccepted:'39'}}]:[]}});
 return metrics.children;
}

test('assurance timing is persisted and visibly bound without changing diagnostic or native evidence',async t=>{
 sandbox(t);const Reporter=api(),timing=assuranceTimingFixture(),reporter=new Reporter({selection:'harness',assuranceTiming:timing,nativeElapsedMs:180});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);const native=reporter.nativeEvidence;
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,index)=>reporter.onTestEnd(item,result('passed',index)));await reporter.onEnd(fullResult());
 const record=Reporter.validatePublicReport(),dom=require('node-html-parser').parse(fs.readFileSync(output(),'utf8'));
 assert.deepEqual(record.assuranceTiming,timing);assert.deepEqual(record.nativeEvidence,native);assert.equal(record.tests,116);assert.equal(record.counts.passed,116);
 const run=dom.querySelector('#harness-public-run');assert.equal(run.getAttribute('data-assurance-elapsed-ms'),'10480');assert.equal(run.getAttribute('data-assurance-scope'),timing.scope);assert.equal(run.getAttribute('data-assurance-started-at'),timing.startedAt);
 const info=dom.querySelector('.testcase-run-info-table');assert.match(info.textContent,/Harness elapsed to report.*0m 10\.480s/s);assert.match(info.textContent,/Recorded native interval.*PASS.*0\.0 min/s);assert.match(info.textContent,/Includes selected assurance phases, evidence verification and diagnostics/);assert.match(info.textContent,/Excludes report sealing\/publication after snapshot, wrapper bookkeeping and Jenkins checkout\/build\/queue/);
 const cards=assuranceDashboard(run);assert.equal(cards[4].children[0].textContent,'Harness elapsed to report');assert.equal(cards[4].children[1].textContent,'0m 10.480s');assert.equal(cards[4].className,'report-metric report-supplement-summary report-assurance-elapsed');assert.match(cards[4].children[2].textContent,/Excludes report sealing\/publication after snapshot/);assert.equal(cards[0].children[1].textContent,'39 / 112');assert.equal(cards[2].children[1].textContent,'116');
});

test('assurance timing missing and zero remain distinct without native or diagnostic fallback',async t=>{
 sandbox(t);
 for(const timing of [undefined,assuranceTimingFixture({elapsedMs:0})]){
  const Reporter=await complete('harness',[],'passed',0,timing),record=Reporter.validatePublicReport(),dom=require('node-html-parser').parse(fs.readFileSync(output(),'utf8'));
  assert.deepEqual(record.assuranceTiming,timing);const info=dom.querySelector('.testcase-run-info-table');const row=info.querySelectorAll('tr').find(item=>item.querySelector('th')?.textContent==='Harness elapsed to report');assert.equal(row.querySelector('td').textContent,timing?'0m 0.000s':'Not recorded');
  const cards=assuranceDashboard(dom.querySelector('#harness-public-run'));assert.equal(cards[4].children[1].textContent,timing?'0m 0.000s':'Not recorded');
 }
 for(const data of [{assuranceElapsedMs:''},{assuranceElapsedMs:'10480',assuranceScope:'wrong',assuranceClock:'monotonic',assuranceVersion:'1'}])assert.equal(assuranceDashboard(data)[4].children[1].textContent,'Not recorded');
});

test('assurance timing rejects hostile or noninteger optional telemetry before publication',async t=>{
 sandbox(t);
 const values=[null,'10480',{},assuranceTimingFixture({elapsedMs:-1}),assuranceTimingFixture({elapsedMs:0.5}),assuranceTimingFixture({elapsedMs:NaN}),assuranceTimingFixture({elapsedMs:Infinity}),assuranceTimingFixture({elapsedMs:'10480'}),assuranceTimingFixture({elapsedMs:Number.MAX_SAFE_INTEGER+1}),assuranceTimingFixture({scope:canary}),assuranceTimingFixture({clock:'wall'}),assuranceTimingFixture({schemaVersion:2}),assuranceTimingFixture({startedAt:'invalid'}),assuranceTimingFixture({startedAt:'2026-11-06T12:00:00Z'}),assuranceTimingFixture({path:canary})];
 for(const value of values){await assert.rejects(complete('harness',[],'passed',0,value),/PUBLIC_ODHIN/);assert(!fs.existsSync(output()));}
});

test('assurance timing rejects private or coherently resealed visible HTML tampering',async t=>{
 sandbox(t);const Reporter=await complete('harness',[],'passed',0,assuranceTimingFixture()),recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),originalRecord=fs.readFileSync(recordFile),originalHtml=fs.readFileSync(output(),'utf8');
 for(const mutation of ['private-elapsed','private-delete','private-date','attribute','duplicate-attribute','attribute-start','visible-value','scope-note','duplicate-run','duplicate-row','duplicate-header']){
  const record=JSON.parse(originalRecord),dom=require('node-html-parser').parse(originalHtml);
  if(mutation==='private-elapsed')record.assuranceTiming.elapsedMs++;
  else if(mutation==='private-delete')delete record.assuranceTiming;
  else if(mutation==='private-date')record.assuranceTiming.startedAt=canary;
  else {
   if(mutation==='attribute')dom.querySelector('#harness-public-run').setAttribute('data-assurance-elapsed-ms','10481');
   else if(mutation==='attribute-start')dom.querySelector('#harness-public-run').setAttribute('data-assurance-started-at','2026-11-06T12:00:01.000Z');
   else if(mutation==='duplicate-run')dom.querySelector('body').insertAdjacentHTML('afterbegin',dom.querySelector('#harness-public-run').toString());
   else if(mutation==='duplicate-header')dom.querySelector('#TabDashboard').insertAdjacentHTML('beforeend','<div class="info-box-header">Run info</div>');
   else if(mutation==='duplicate-row'){const table=dom.querySelector('.testcase-run-info-table');const row=table.querySelectorAll('tr').find(item=>item.querySelector('th')?.textContent==='Harness elapsed to report');table.insertAdjacentHTML('beforeend',row.toString());}
   else if(mutation!=='duplicate-attribute'){const label=mutation==='visible-value'?'Harness elapsed to report':'Assurance timing scope';const row=dom.querySelector('.testcase-run-info-table').querySelectorAll('tr').find(item=>item.querySelector('th')?.textContent===label);row.querySelector('td').textContent='tampered';}
   const html=mutation==='duplicate-attribute'?originalHtml.replace('data-assurance-elapsed-ms="10480"','data-assurance-elapsed-ms="10480" data-assurance-elapsed-ms="10480"'):dom.toString();fs.writeFileSync(output(),html);record.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');
  }
  fs.writeFileSync(recordFile,JSON.stringify(record));assert.throws(()=>Reporter.validatePublicReport(),{message:'PUBLIC_ODHIN_INVALID_OR_INCOMPLETE'});fs.writeFileSync(recordFile,originalRecord);fs.writeFileSync(output(),originalHtml);
 }
 Reporter.validatePublicReport();
});

test('assurance timing old absent record retires and subsequent reports cannot reuse stale duration',async t=>{
 sandbox(t);const Reporter=await complete(),recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),record=JSON.parse(fs.readFileSync(recordFile)),dom=require('node-html-parser').parse(fs.readFileSync(output(),'utf8'));
 for(const row of dom.querySelector('.testcase-run-info-table').querySelectorAll('tr')){
  const label=row.querySelector('th')?.textContent;
  if(['Harness elapsed to report','Assurance timing scope','Assurance started at'].includes(label))row.remove();
  if(label==='Main native + evidence verification')row.querySelector('th').textContent='Native execution';
 }
 const html=dom.toString();record.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');fs.writeFileSync(recordFile,JSON.stringify(record));fs.writeFileSync(output(),html);Reporter.validatePublicReport();Reporter.resetPublicReport('harness');
 await complete('harness',[],'passed',0,assuranceTimingFixture());assert.equal(Reporter.validatePublicReport().assuranceTiming.elapsedMs,10480);await complete();assert.equal(Reporter.validatePublicReport().assuranceTiming,undefined);assert.match(require('node-html-parser').parse(fs.readFileSync(output(),'utf8')).querySelector('.testcase-run-info-table').textContent,/Harness elapsed to report.*Not recorded/s);
});

test('preparation version2 timing retains distinct labels and exact visible binding while version1 stays scoped',async t=>{
 sandbox(t);const timing=assuranceTimingFixture({schemaVersion:2,scope:'harness-preparation-start-to-report-snapshot',elapsedMs:329350});
 const Reporter=await complete('harness',[],'passed',0,timing),record=Reporter.validatePublicReport();assert.deepEqual(record.assuranceTiming,timing);
 const dom=require('node-html-parser').parse(fs.readFileSync(output(),'utf8')),run=dom.querySelector('#harness-public-run');assert.equal(run.getAttribute('data-assurance-version'),'2');
 const info=dom.querySelector('.testcase-run-info-table');assert.match(info.textContent,/Harness preparation → report snapshot.*5m 29\.350s/s);assert.match(info.textContent,/candidate build/i);assert.match(info.textContent,/earlier Jenkins shell\/bootstrap/);assert.match(info.textContent,/after snapshot/);
 const cards=assuranceDashboard(run);assert.equal(cards[4].children[0].textContent,'Harness preparation → report snapshot');assert.equal(cards[4].children[1].textContent,'5m 29.350s');assert.match(cards[4].children[2].textContent,/candidate build/i);
});

test('preparation timing rejects version/scope mismatch and coherently resealed legacy labels or altered visible binding',async t=>{
 sandbox(t);const timing=assuranceTimingFixture({schemaVersion:2,scope:'harness-preparation-start-to-report-snapshot'});
 for(const invalid of [{...timing,schemaVersion:1},{...timing,schemaVersion:3},{...timing,scope:'assurance-start-to-report-snapshot'},{...timing,extra:1}])await assert.rejects(complete('harness',[],'passed',0,invalid),/PUBLIC_ODHIN/);
 const Reporter=await complete('harness',[],'passed',0,timing),recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),originalRecord=fs.readFileSync(recordFile),originalHtml=fs.readFileSync(output(),'utf8');
 for(const mutation of ['version','scope','value','start','legacy-row','duplicate-row']){
  const record=JSON.parse(originalRecord),dom=require('node-html-parser').parse(originalHtml),table=dom.querySelector('.testcase-run-info-table'),row=table.querySelectorAll('tr').find(item=>item.querySelector('th')?.textContent==='Harness preparation → report snapshot');
  if(mutation==='version')dom.querySelector('#harness-public-run').setAttribute('data-assurance-version','1');
  else if(mutation==='scope')dom.querySelector('#harness-public-run').setAttribute('data-assurance-scope','assurance-start-to-report-snapshot');
  else if(mutation==='value')row.querySelector('td').textContent='0m 0.000s';
  else if(mutation==='start')table.querySelectorAll('tr').find(item=>item.querySelector('th')?.textContent==='Preparation started at').querySelector('td').textContent='Not recorded';
  else table.insertAdjacentHTML('beforeend',mutation==='legacy-row'?'<tr><th>Harness elapsed to report</th><td>0m 0.000s</td></tr>':row.toString());
  const html=dom.toString();fs.writeFileSync(output(),html);record.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');fs.writeFileSync(recordFile,JSON.stringify(record));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);fs.writeFileSync(recordFile,originalRecord);fs.writeFileSync(output(),originalHtml);
 }
 Reporter.validatePublicReport();await complete('harness',[],'passed',0,assuranceTimingFixture());assert.equal(Reporter.validatePublicReport().assuranceTiming.schemaVersion,1);await complete();assert.equal(Reporter.validatePublicReport().assuranceTiming,undefined);
});

test('public detail shows reviewed method and only actually recorded named check steps, never raw diagnostics', async t => {
  sandbox(t);const Reporter=api(),reporter=new Reporter({selection:'harness'}),tests=testsFor();
  const methodsFile=path.join(__dirname,'fixtures/harness-public-check-methods.json');
  const methods=fs.existsSync(methodsFile)?JSON.parse(fs.readFileSync(methodsFile)).checks:[];
  const first=methods.find(row=>row.file===titles.harness[0].file&&row.titlePath.at(-1)===titles.harness[0].titlePath.at(-1));
  const id=first?.steps[0].id??'parse-csrf-inputs';
  reporter.onBegin({}, {allTests:()=>tests});
  for(let index=0;index<tests.length;index++) {
    const observed=result(index===1?'failed':'passed',index);
    if(index===0)observed.steps=(first?.steps??[{id}]).map(step=>({title:'harness-check:'+step.id,category:'test.step',duration:7,startTime:new Date(),location:{file:canary},attachments:[{body:canary}],steps:step.id==='auth-basic-csrf'?['csrf-present','csrf-absent'].map(id=>({title:'harness-detail:'+id,category:'test.step',duration:2,steps:[]})):[{title:canary,category:'expect',duration:1}]}));
    if(index===1)observed.steps=[];
    reporter.onTestEnd(tests[index],observed);
  }
  await reporter.onEnd(fullResult('failed'));
  const html=fs.readFileSync(output(),'utf8'),dom=require('node-html-parser').parse(html);
  const info=dom.querySelector('#TabRunInfo-harness-0-0'),steps=dom.querySelector('#TabSteps-harness-0-0');
  assert.match(steps.textContent,/Recorded check steps/);
  assert.match(info.textContent,/What this check covers/);
  assert.match(info.textContent,/Framework reliability, not court-service product coverage/);
  assert.match(steps.textContent,/passed/);assert.match(steps.textContent,/7 ms/);
  assert.equal(steps.querySelectorAll('[data-check-step-id]').length,first?.steps.length??1);
  if(first)assert(steps.textContent.includes(first.steps[0].label));
  assert.match(dom.querySelector('#TabSteps-harness-1-0').textContent,/Not recorded/);
  assert(!html.includes(canary));
});

test('public method visibility covers every116diagnostic identity and coherent reseals cannot alter scope or step facts',async t=>{
  sandbox(t);const Reporter=await complete(),helper=require('./harness-public-check-steps.cjs');
  const recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),originalRecord=fs.readFileSync(recordFile),originalHtml=fs.readFileSync(output(),'utf8');
  const dom=require('node-html-parser').parse(originalHtml),record=Reporter.validatePublicReport();assert.equal(record.checkMethods.checks.length,116);
  for(const [index,entry] of titles.harness.entries()) {
    const modal=dom.querySelector(`#harness-${index}-0`),info=modal.querySelector('[data-harness-check-info]'),steps=modal.querySelector('[data-harness-check-steps]');
    assert(info.textContent.includes(helper.methodFor(entry).purpose));assert(info.textContent.includes(helper.methodFor(entry).boundary));
    assert.equal(steps.querySelectorAll('[data-check-step-id]').length,helper.methodFor(entry).steps.length);assert(steps.querySelectorAll('[data-check-step-id]').every(row=>row.querySelector('td').textContent==='passed'));
  }
  for(const mutate of [
    (page)=>{page.querySelector('[data-harness-check-info]').querySelector('p').textContent='This proves all deployed service behaviour';},
    (page)=>{page.querySelector('[data-harness-check-info]').setAttribute('data-check-boundary','aat');},
    (page)=>{page.querySelector('[data-harness-check-steps] tbody td').textContent='failed';},
    (page)=>{page.querySelector('[data-harness-check-steps] tbody tr').remove();},
    (page)=>{const pane=page.querySelector('#TabSteps-harness-0-0');pane.insertAdjacentHTML('beforeend',pane.innerHTML);},
    (_page,value)=>{value.checkMethods.checks[0].steps[0].durationMs=999;},
    (_page,value)=>{value.checkMethods.checks[0].file='foreign';},
    (_page,value)=>{delete value.checkMethods;},
  ]) {
    const page=require('node-html-parser').parse(originalHtml),value=JSON.parse(originalRecord);mutate(page,value);
    const html=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');fs.writeFileSync(output(),html);fs.writeFileSync(recordFile,JSON.stringify(value));
    assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);fs.writeFileSync(output(),originalHtml);fs.writeFileSync(recordFile,originalRecord);
  }
  Reporter.validatePublicReport();
});
test('passed missing or partial reviewed events fail publication while failed setup remains explicitly unrecorded',async t=>{
  sandbox(t);const Reporter=api(),tests=testsFor(),method=require('./harness-public-check-steps.cjs').methodFor(titles.harness[0]);
  for(const steps of [undefined,[],[{category:'expect',title:'harness-check:'+method.steps[0].id,duration:1}]]){
    const reporter=new Reporter({selection:'harness'});reporter.onBegin({}, {allTests:()=>tests});assert.throws(()=>reporter.onTestEnd(tests[0],{...result(),steps}),/PUBLIC_ODHIN/);
  }
  assert.equal(fs.existsSync(output()),false);
});
test('owned legacy report without method records can retire but cannot pass current public validation',async t=>{
  sandbox(t);const Reporter=await complete(),recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),record=JSON.parse(fs.readFileSync(recordFile)),page=require('node-html-parser').parse(fs.readFileSync(output(),'utf8'));
  page.querySelectorAll('[data-harness-check-info]').forEach(node=>node.remove());
  page.querySelectorAll('[data-harness-check-steps]').forEach(node=>{node.parentNode.innerHTML='<div class="row m-0 p-0"><div class="col m-0 p-0"></div></div>';});
  delete record.checkMethods;delete record.detailEvidence;const html=page.toString();record.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');fs.writeFileSync(output(),html);fs.writeFileSync(recordFile,JSON.stringify(record));
  assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);Reporter.resetPublicReport('harness');assert.equal(fs.existsSync(output()),false);
});

test('diagnostic worker observations distinguish equal indexes across trusted runners without peak claims',async t=>{
 sandbox(t);const Reporter=api(),reporter=new Reporter({selection:'local-aat'}),tests=require('./harness-public-overview.cjs').profiles['local-aat'].map(entry=>({location:{file:path.join(process.cwd(),entry.file)},titlePath:()=>entry.titlePath,retries:0,expectedStatus:'passed'}));
 reporter.onBegin({workers:1,harnessRunnerPhases:['offline','aat']},{allTests:()=>tests});
 for(let index=0;index<tests.length;index++){const observed=result('passed',index,'local-aat');observed.workerIndex=0;observed.parallelIndex=0;observed.runnerPhase=index<116?'offline':'aat';if(index>=116)observed.aatOutcome='response-passed';reporter.onTestEnd(tests[index],observed);}
 await reporter.onEnd(fullResult());const record=Reporter.validatePublicReport('local-aat');
 assert.deepEqual(record.diagnosticWorkers.observed,[{phase:'offline',workerIndex:0},{phase:'aat',workerIndex:0}]);
 assert.match(fs.readFileSync(output(),'utf8'),/2 observed across 2 runners; not peak parallelism/);
 const recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),original=fs.readFileSync(recordFile);
 for(const change of [r=>r.diagnosticWorkers.observed.pop(),r=>r.diagnosticWorkers.observed[0].phase=canary,r=>r.diagnosticWorkers.runners[0].configuredWorkers=99,r=>r.checkMethods.checks[0].runnerPhase='aat',r=>r.checkMethods.checks[0].workerIndex=99]){const changed=JSON.parse(original);change(changed);fs.writeFileSync(recordFile,JSON.stringify(changed));assert.throws(()=>Reporter.validatePublicReport('local-aat'),/PUBLIC_ODHIN/);fs.writeFileSync(recordFile,original);}

 for(const phase of ['foreign',canary]){const invalid=new Reporter({selection:'local-aat'});invalid.onBegin({workers:1,harnessRunnerPhases:['offline','aat']},{allTests:()=>tests});assert.throws(()=>invalid.onTestEnd(tests[0],{...result('passed',0,'local-aat'),runnerPhase:phase}),/PUBLIC_ODHIN/);}
 const invalid=new Reporter({selection:'local-aat'});invalid.onBegin({workers:1,harnessRunnerPhases:['offline','aat']},{allTests:()=>tests});assert.throws(()=>invalid.onTestEnd(tests[0],{...result('passed',0,'local-aat'),runnerPhase:'aat'}),/PUBLIC_ODHIN/);
});
test('native recorded stages remain visible and bound in the public report without changing diagnostic or catalogue totals',async t=>{
 const root=sandbox(t),Reporter=api(),reporter=new Reporter({selection:'harness'});
 await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);
 const {NativeStageRecorder}=require('./lib/exui-native-stage-telemetry.cjs');const recorder=new NativeStageRecorder(),r={duration:91},s={category:'test.step',title:'harness-assertion:family-membership',duration:3,annotations:[]};
 recorder.begin('wa-family-options',r,s);recorder.end('wa-family-options',r,s);
 reporter.nativeEvidence.phases.find(p=>p.phase==='family').baselineProofs[0].recordedExecution=recorder.finish('wa-family-options',r);
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,i)=>reporter.onTestEnd(item,result('passed',i)));await reporter.onEnd(fullResult());
 const before=Reporter.validatePublicReport();assert.equal(before.nativeEvidence.status,'PASS');assert.equal(before.nativeEvidence.phases[0].baselineProofs[0].recordedExecution.testDurationMs,91);
 const file=path.join(root,'functional-output/tests/harness/private/public-odhin-harness.json'),original=fs.readFileSync(file);
 const html=fs.readFileSync(path.join(root,'functional-output/tests/harness/public/odhin/index.html'),'utf8');assert.match(html,/Observed test duration: 91 ms/);assert.match(html,/Recorded named assertion stages/);
 const changed=JSON.parse(original);changed.nativeEvidence.phases[0].baselineProofs[0].recordedExecution.stages[0].durationMs=999;fs.writeFileSync(file,JSON.stringify(changed));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);
 fs.writeFileSync(file,original);
 for(const mutate of [page=>page.querySelector('[data-native-stage-proof] tbody tr td:nth-child(4)').textContent='Fabricated observed value',page=>page.querySelector('[data-native-stage-proof] tbody tr td:nth-child(5)').textContent='completed',page=>page.querySelector('[data-native-stage-note]').textContent='Every action and request passed',page=>page.querySelector('[data-native-stage-proof]').insertAdjacentHTML('afterend',page.querySelector('[data-native-stage-proof]').toString())]){const page=require('node-html-parser').parse(html),value=JSON.parse(original);mutate(page);const modified=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(modified).digest('hex');fs.writeFileSync(output(),modified);fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);fs.writeFileSync(output(),html);fs.writeFileSync(file,original);}
 fs.writeFileSync(file,original);const restored=Reporter.validatePublicReport();assert.deepEqual(restored.nativeEvidence.catalogueCoverage,before.nativeEvidence.catalogueCoverage);assert.equal(restored.tests,116);assert.equal(restored.tests,before.tests);assert.deepEqual(restored.counts,before.counts);for(const mutate of [x=>x.stages=[],x=>{x.testDurationMs=1;x.stages[0].durationMs=1000;}]){const invalid=structuredClone(before.nativeEvidence);mutate(invalid.phases[0].baselineProofs[0].recordedExecution);assert.throws(()=>require('./harness-native-report.cjs').renderNativeEvidence(invalid),/PUBLIC_NATIVE_STAGE/);}
});

test('native PCS routing rows retain their synthetic service attribution', async () => {
  const { parse } = require('node-html-parser');
  const { renderNativeEvidence } = require('./harness-native-report.cjs');
  const evidence = await nativePresentationFixture(false);
  const rows = parse(renderNativeEvidence(evidence)).querySelectorAll('tr[data-native-phase="routing"]');
  assert.equal(rows.length, 4);
  for (const row of rows) {
    const service = row.querySelector('td').textContent;
    assert.match(service, /Synthetic PCS routing fixture/);
    assert.doesNotMatch(service, /Private Law/);
  }
});


test('native interval unitemized difference is exact telemetry and tolerated negative rounding stays unknown',async t=>{
 sandbox(t);const Reporter=api();
 for(const [elapsed,duration,expected] of [[2500,1000,'Unitemized recorded interval: 0m 1s (1500 ms).'],[999,1000,'Unitemized recorded interval: Not recorded (listed phases exceed the interval by 1 ms within the 1-second rounding tolerance).'],[0,1000,'Unitemized recorded interval: Not recorded (listed phases exceed the interval by 1000 ms within the 1-second rounding tolerance).']]){
  const reporter=new Reporter({selection:'harness',nativeElapsedMs:elapsed,phaseTimings:[{label:'CCD runtime startup',status:'completed',startedAt:'2026-11-06T12:00:00.000Z',durationMs:duration}]});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter,{postalFailure:true});
  const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,index)=>reporter.onTestEnd(item,result('passed',index)));await reporter.onEnd(fullResult());Reporter.validatePublicReport();
  const dom=require('node-html-parser').parse(fs.readFileSync(output(),'utf8')),remainder=dom.querySelector('[data-native-unitemized]');assert(remainder.textContent.startsWith(expected));assert.equal(remainder.getAttribute('data-native-unitemized'),elapsed<duration?'unknown':String(elapsed-duration));
  const recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),original=fs.readFileSync(recordFile),html=fs.readFileSync(output(),'utf8');remainder.textContent='ST_CIC exact duration: 1 second';const changed=dom.toString(),record=JSON.parse(original);record.sha256=require('node:crypto').createHash('sha256').update(changed).digest('hex');fs.writeFileSync(recordFile,JSON.stringify(record));fs.writeFileSync(output(),changed);assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);fs.writeFileSync(recordFile,original);fs.writeFileSync(output(),html);Reporter.resetPublicReport('harness');
 }
});

test('native interval RunInfo binds unrecorded and not-run states and rejects coherent false-native rows',async t=>{
 sandbox(t);const Reporter=api();
 for(const selected of [false,true]){
  const reporter=new Reporter({selection:'harness'});if(selected)await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);const native=reporter.nativeEvidence;
  const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,index)=>reporter.onTestEnd(item,result('passed',index)));await reporter.onEnd(fullResult());Reporter.validatePublicReport();
  const recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),record=fs.readFileSync(recordFile),html=fs.readFileSync(output(),'utf8');
  const current=require('node-html-parser').parse(html).querySelector('.testcase-run-info-table').querySelectorAll('tr').find(row=>row.querySelector('th')?.textContent==='Recorded native interval');assert.match(current.querySelector('td').textContent,native?/PASS · duration not recorded/:/^Not run$/);
  for(const mutation of ['false-value','duplicate','duplicate-old-label','missing','old-label']){
   const dom=require('node-html-parser').parse(html),row=dom.querySelector('.testcase-run-info-table').querySelectorAll('tr').find(item=>item.querySelector('th')?.textContent==='Recorded native interval');
   if(mutation==='false-value')row.querySelector('td').textContent='PASS · 123.4 min · Fabricated native execution';
   if(mutation==='duplicate'||mutation==='duplicate-old-label')row.insertAdjacentHTML('afterend',mutation==='duplicate'?row.toString():row.toString().replace('Recorded native interval','Native execution'));
   if(mutation==='missing')row.remove();if(mutation==='old-label')row.querySelector('th').textContent='Main native + evidence verification';
   const changed=dom.toString(),rec=JSON.parse(record);rec.sha256=require('node:crypto').createHash('sha256').update(changed).digest('hex');fs.writeFileSync(output(),changed);fs.writeFileSync(recordFile,JSON.stringify(rec));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);fs.writeFileSync(output(),html);fs.writeFileSync(recordFile,record);
  }
  for(const label of ['Main native + evidence verification','Native execution']){
   const dom=require('node-html-parser').parse(html),row=dom.querySelector('.testcase-run-info-table').querySelectorAll('tr').find(item=>item.querySelector('th')?.textContent==='Recorded native interval');row.querySelector('th').textContent=label;row.querySelector('td').textContent=native?'PASS · duration not recorded':'Not run';const changed=dom.toString(),rec=JSON.parse(record);rec.sha256=require('node:crypto').createHash('sha256').update(changed).digest('hex');fs.writeFileSync(output(),changed);fs.writeFileSync(recordFile,JSON.stringify(rec));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);Reporter.resetPublicReport('harness');assert(!fs.existsSync(output()));fs.writeFileSync(output(),html);fs.writeFileSync(recordFile,record);
  }
  Reporter.resetPublicReport('harness');
 }
});

test('finite CSRF detail record binds actual child outcomes to its parent and exact public presentation',async t=>{
 sandbox(t);const Reporter=await complete(),recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),original=fs.readFileSync(recordFile),html=fs.readFileSync(output(),'utf8'),record=Reporter.validatePublicReport(),dom=require('node-html-parser').parse(html);
 assert.equal(record.checkMethods.checks.flatMap(row=>row.steps).length,119);assert.equal(record.detailEvidence.checks.length,1);assert.deepEqual(record.detailEvidence.checks[0].details.map(row=>[row.id,row.parentId,row.status,row.durationMs,row.order]),[['csrf-present','auth-basic-csrf','passed',1,1],['csrf-absent','auth-basic-csrf','passed',1,2]]);assert.equal(dom.querySelectorAll('[data-check-detail-id]').length,2);assert.match(dom.querySelector('[data-harness-check-details]').textContent,/Source-defined expected assertion/);assert(!html.includes(canary));
 for(const mutate of [
  (page)=>{page.querySelector('[data-check-detail-id] td:nth-child(3)').textContent='failed';},
  (page)=>{page.querySelector('[data-harness-check-details]').insertAdjacentHTML('beforeend',page.querySelector('[data-check-detail-id]').toString());},
  (page)=>{page.querySelector('[data-harness-check-details]').setAttribute('data-harness-check-details','foreign');},
  (_page,value)=>{value.detailEvidence.checks[0].details[0].id='foreign';},
  (page,value)=>{value.detailEvidence.checks[0].details[0].durationMs=999;page.querySelector('[data-check-detail-id] td:nth-child(4)').textContent='999 ms';},
  (_page,value)=>{value.detailEvidence.checks[0].details.pop();},
  (_page,value)=>{value.detailEvidence.checks[0].details[0].Authorization=canary;},
  (_page,value)=>{delete value.detailEvidence;},
 ]){const page=require('node-html-parser').parse(html),value=JSON.parse(original);mutate(page,value);const changed=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(changed).digest('hex');fs.writeFileSync(output(),changed);fs.writeFileSync(recordFile,JSON.stringify(value));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);fs.writeFileSync(output(),html);fs.writeFileSync(recordFile,original);}
 Reporter.validatePublicReport();
});
test('passed CSRF group cannot infer missing children; failed setup and historical absence have no child PASS',async t=>{
 sandbox(t);const Reporter=api(),tests=testsFor(),index=titles.harness.findIndex(entry=>entry.titlePath.at(-1)==='extractCsrf parses token and returns undefined when missing');assert(index>=0);
 for(const children of [[],[{title:'harness-detail:csrf-present',category:'test.step',duration:1}],undefined]){const reporter=new Reporter({selection:'harness'});reporter.onBegin({}, {allTests:()=>tests});const observed=result('passed',index);observed.steps[0].steps=children;assert.throws(()=>reporter.onTestEnd(tests[index],observed),/PUBLIC_ODHIN/);}
 const reporter=new Reporter({selection:'harness'});reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,i)=>{const observed=result(i===index?'failed':'passed',i);if(i===index)observed.steps=[];reporter.onTestEnd(item,observed);});await reporter.onEnd(fullResult('failed'));const value=Reporter.validatePublicReport(),page=require('node-html-parser').parse(fs.readFileSync(output(),'utf8'));assert.deepEqual(value.detailEvidence.checks[0].details,[]);assert.equal(page.querySelectorAll('[data-check-detail-id]').length,0);assert.match(page.querySelector('[data-harness-check-details]').textContent,/Not recorded/);
});
test('exact owned historical check report can retire without inferred CSRF details',async t=>{
 sandbox(t);const Reporter=await complete(),recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),value=JSON.parse(fs.readFileSync(recordFile)),page=require('node-html-parser').parse(fs.readFileSync(output(),'utf8'));delete value.detailEvidence;page.querySelectorAll('[data-harness-check-details]').forEach(node=>node.remove());const html=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');fs.writeFileSync(output(),html);fs.writeFileSync(recordFile,JSON.stringify(value));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);Reporter.resetPublicReport('harness');assert(!fs.existsSync(output()));
});

test('exact prior native stage tables may retire but changed legacy outcomes cannot authorize removal',async t=>{
 const root=sandbox(t),Reporter=api(),reporter=new Reporter({selection:'harness'});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);reporter.nativeEvidence.phases[0].baselineProofs[0].recordedExecution={schemaVersion:1,availability:'recorded',scope:'named-assertion-stages',testDurationMs:91,stages:[{stageId:'family-membership',instance:1,ordinal:1,outcome:'completed-without-reported-error',durationMs:3}]};
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,i)=>reporter.onTestEnd(item,result('passed',i)));await reporter.onEnd(fullResult());
 const file=path.join(root,'functional-output/tests/harness/private/public-odhin-harness.json'),value=JSON.parse(fs.readFileSync(file)),page=require('node-html-parser').parse(fs.readFileSync(output(),'utf8'));delete value.detailEvidence;page.querySelectorAll('[data-harness-check-details]').forEach(node=>node.remove());page.querySelectorAll('[data-native-stage-proof]').forEach(table=>{table.removeAttribute('data-native-stage-proof');table.querySelectorAll('tr').forEach(row=>row.childNodes.filter(node=>node.tagName==='TH'||node.tagName==='TD')[3]?.remove());table.querySelectorAll('thead th')[3].textContent='Recorded outcome';});page.querySelectorAll('[data-native-stage-note]').forEach(note=>{note.removeAttribute('data-native-stage-note');note.textContent=note.textContent.split(' Expected contracts below')[0];});
 const oldHtml=page.toString(),write=html=>{value.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');fs.writeFileSync(output(),html);fs.writeFileSync(file,JSON.stringify(value));};write(oldHtml);assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);
 for(const fault of ['table','note','both','orphan','proof-alias','invocation-alias','extra-note']){const legacy=require('node-html-parser').parse(oldHtml),rows=legacy.querySelectorAll('[data-native-kind="baseline"]');if(['table','both','orphan'].includes(fault)){const table=rows[0].querySelectorAll('table').find(node=>node.querySelectorAll('thead th').map(cell=>cell.textContent).join('|')==='Order|Assertion stage|Instance|Recorded outcome|Observed duration'),text=table.toString();table.remove();(fault==='orphan'?rows[0]:rows[1].querySelector('details')).insertAdjacentHTML('beforeend',text);}if(['note','both'].includes(fault)){const note=rows[0].querySelectorAll('p').find(node=>node.textContent.startsWith('Observed test duration:')),text=note.toString();note.remove();rows[1].querySelector('details').insertAdjacentHTML('afterbegin',text);}if(fault==='proof-alias')rows[0].querySelector('details dl dd').textContent=rows[1].querySelector('details dl dd').textContent;if(fault==='invocation-alias')rows[0].querySelectorAll('details dl dd')[1].textContent='foreign-invocation';if(fault==='extra-note')legacy.querySelector('#harness-native-evidence').insertAdjacentHTML('beforeend','<p>Observed test duration: 999 ms.</p>');write(legacy.toString());assert.throws(()=>Reporter.resetPublicReport('harness'),/PUBLIC_ODHIN/,fault);write(oldHtml);}
 const changed=require('node-html-parser').parse(oldHtml),oldTable=changed.querySelectorAll('table').find(table=>table.querySelectorAll('thead th').map(node=>node.textContent).join('|')==='Order|Assertion stage|Instance|Recorded outcome|Observed duration');oldTable.querySelector('tbody td:nth-child(4)').textContent='Fabricated';write(changed.toString());assert.throws(()=>Reporter.resetPublicReport('harness'),/PUBLIC_ODHIN/);write(oldHtml);Reporter.resetPublicReport('harness');assert(!fs.existsSync(output()));
});

test('fresh detail evidence cannot be removed and coherently downgraded to the exact Not recorded panel',async t=>{
 sandbox(t);const Reporter=await complete(),file=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),record=JSON.parse(fs.readFileSync(file)),page=require('node-html-parser').parse(fs.readFileSync(output(),'utf8')),index=record.checkMethods.checks.findIndex(check=>check.steps.some(step=>step.id==='auth-basic-csrf')),entry=require('./harness-public-overview.cjs').profiles.harness[index],check=record.checkMethods.checks[index];
 delete record.detailEvidence;page.querySelector(`#TabSteps-harness-${index}-0`).innerHTML=require('./harness-public-check-steps.cjs').renderSteps(entry,check.steps,check.status);const html=page.toString();record.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');fs.writeFileSync(output(),html);fs.writeFileSync(file,JSON.stringify(record));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);
});
test('native recorded table and note must stay in their exact proof and invocation details owner',async t=>{
 const root=sandbox(t),Reporter=api(),reporter=new Reporter({selection:'harness'});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);reporter.nativeEvidence.phases[0].baselineProofs[0].recordedExecution={schemaVersion:1,availability:'recorded',scope:'named-assertion-stages',testDurationMs:91,stages:[{stageId:'family-membership',instance:1,ordinal:1,outcome:'completed-without-reported-error',durationMs:3}]};const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,i)=>reporter.onTestEnd(item,result('passed',i)));await reporter.onEnd(fullResult());
 const file=path.join(root,'functional-output/tests/harness/private/public-odhin-harness.json'),original=fs.readFileSync(file),html=fs.readFileSync(output(),'utf8');
 for(const fault of ['table','note','both','orphan','proof-alias','invocation-alias']){const page=require('node-html-parser').parse(html),value=JSON.parse(original),rows=page.querySelectorAll('[data-native-kind="baseline"]');if(['table','both','orphan'].includes(fault)){const table=rows[0].querySelector('[data-native-stage-proof]'),text=table.toString();table.remove();(fault==='orphan'?rows[0]:rows[1].querySelector('details')).insertAdjacentHTML('beforeend',text);}if(['note','both'].includes(fault)){const note=rows[0].querySelector('[data-native-stage-note]'),text=note.toString();note.remove();rows[1].querySelector('details').insertAdjacentHTML('afterbegin',text);}if(fault==='proof-alias')rows[0].querySelector('details dl dd').textContent=rows[1].querySelector('details dl dd').textContent;if(fault==='invocation-alias')rows[0].querySelectorAll('details dl dd')[1].textContent='foreign-invocation';const changed=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(changed).digest('hex');fs.writeFileSync(output(),changed);fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/,fault);fs.writeFileSync(output(),html);fs.writeFileSync(file,original);}
});

test('canonical detail input bytes are rechecked after awaited rendering before any current publication',async t=>{
 const root=sandbox(t),Reporter=api(),reporter=new Reporter({selection:'harness'}),tests=testsFor(),Capture=require('./harness-public-detail-recorder.cjs'),directory=path.join(root,'detail-phase');fs.mkdirSync(directory);const request=Capture.preparePhase(directory,'offline',root),index=titles.harness.findIndex(entry=>entry.titlePath.at(-1)==='extractCsrf parses token and returns undefined when missing'),names=['HARNESS_DETAIL_REQUEST_PATH','HARNESS_DETAIL_REQUEST_DIGEST'],previous=names.map(name=>process.env[name]);
 try{process.env.HARNESS_DETAIL_REQUEST_PATH=request.path;process.env.HARNESS_DETAIL_REQUEST_DIGEST=request.digest;const recorder=new Capture();recorder.onBegin({}, {allTests:()=>[tests[index]]});recorder.onTestEnd(tests[index],result('passed',index));recorder.onEnd();}finally{names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];});}
 const jsonFile=path.join(directory,'playwright.json'),bytes='{"fixtureOnly":true}\n';fs.writeFileSync(jsonFile,bytes);reporter.detailPhaseCaptures=[Capture.holdPhase(request,jsonFile,'sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex'))];reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,i)=>reporter.onTestEnd(item,result('passed',i)));
 const overview=require('./harness-public-overview.cjs'),render=overview.renderOverview;try{overview.renderOverview=async(...args)=>{const html=await render(...args);fs.appendFileSync(jsonFile,' ');return html;};await assert.rejects(reporter.onEnd(fullResult()),/PUBLIC_ODHIN/);assert(!fs.existsSync(output()));}finally{overview.renderOverview=render;}
});

test('mandatory email public panel binds strict two-ID inclusion and recorded call timing without changing native interval', async t => {
 const f=await require('./fixtures/exui-mandatory-email-admission.mock.cjs').admissionPacket(t),{readNativeReportEvidence}=await import('./lib/exui-native-report-evidence.mjs');f.write(f.main.descriptorPath,f.descriptor);const evidence=await readNativeReportEvidence(f.main.descriptorPath);
 sandbox(t);const Reporter=api(),a=evidence.mandatoryEmailAdmission;
 const timing={schemaVersion:1,scope:'mandatory-email-admission-call',clock:'monotonic',startedAt:'2026-11-07T01:00:00.000Z',elapsedMs:222227,mainRunId:evidence.jobRunId,mandatoryRunId:a.runId,requestDigest:a.requestDigest};
 const labels=['WA family','Scope fault candidate preparation','WA organisation scope','CCD runtime startup','CCD configuration and access','CCD runtime cleanup','Source event CCD runtime startup','CCD source event permissions','Source event CCD runtime cleanup','Application routing','Recipient callback CCD runtime startup','Recipient callback validation and persistence','Recipient callback CCD runtime cleanup','Selector CCD baseline preparation','Selector baseline proof and cleanup','Selector CCD fault preparation','Selector fault proof and cleanup','Selector evidence verification','Selector final cleanup','Selector cohort admission'];
 const passed=new Set(['WA family','WA organisation scope','CCD configuration and access','CCD source event permissions','Application routing','Recipient callback validation and persistence','Selector evidence verification','Selector cohort admission']);
 const phaseTimings=labels.map((label,index)=>({label,status:passed.has(label)?'PASS':'completed',startedAt:new Date(Date.UTC(2026,10,7,0,0,index)).toISOString(),durationMs:1000}));
 const reporter=new Reporter({selection:'harness',nativeElapsedMs:60000,phaseTimings,mandatoryEmailTiming:timing});timing.elapsedMs=999999;await reporter.prepareNativeEvidence(f.main.descriptorPath);
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,index)=>reporter.onTestEnd(item,result('passed',index)));await reporter.onEnd(fullResult());
 const record=Reporter.validatePublicReport(),recordFile=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),originalRecord=fs.readFileSync(recordFile),html=fs.readFileSync(output(),'utf8'),parse=require('node-html-parser').parse;
 assert.deepEqual(record.phaseTimings,phaseTimings); assert.equal(record.nativeElapsedMs,60000);assert.equal(record.mandatoryEmailTiming.elapsedMs,222227);assert.deepEqual(record.nativeEvidence,evidence);assert.equal(record.nativeEvidence.catalogueCoverage.selected,112);
 assert.equal(parse(html).querySelectorAll('[id="harness-mandatory-email-admission"]').length,1);assert.match(html,/mandatory email admission, diagnostics/);assert.match(html,/3m 42.227s/);assert(!html.includes(f.root));
 const reseal=(page,value)=>{const changed=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(changed).digest('hex');fs.writeFileSync(output(),changed);fs.writeFileSync(recordFile,JSON.stringify(value));};
 for(const mutate of [
  (page)=>{const panel=page.querySelector('#harness-phase-timings');panel.innerHTML=panel.innerHTML.replace('mandatory email admission, ','');},
  (page)=>page.querySelector('#harness-mandatory-email-admission').remove(),
  (page)=>{const panel=page.querySelector('#harness-mandatory-email-admission');panel.insertAdjacentHTML('afterend',panel.toString());},
  (page)=>{const panel=page.querySelector('#harness-mandatory-email-admission'),copy=panel.toString();panel.remove();page.querySelector('#TabDashboard').insertAdjacentHTML('beforeend',copy);},
  (page)=>{const row=page.querySelectorAll('tr').find(row=>row.querySelector('th')?.textContent==='Mandatory email standalone executions');row.insertAdjacentHTML('afterend',row.toString());},
  (page)=>{const row=page.querySelectorAll('tr').find(row=>row.querySelector('th')?.textContent==='Mandatory email standalone executions');row.querySelector('td').textContent='4';},
  (page)=>page.querySelector('[data-mandatory-email-timing]').textContent='Admission call elapsed: 0m 0.000s',
  (page)=>page.querySelector('#harness-mandatory-email-admission').setAttribute('data-mandatory-email-credited','1'),
  (_page,value)=>{value.mandatoryEmailTiming.requestDigest='sha256:'+'e'.repeat(64);},
  (_page,value)=>{delete value.nativeEvidence.mandatoryEmailAdmission;},
 ]){const page=parse(html),value=JSON.parse(originalRecord);mutate(page,value);reseal(page,value);assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN|MANDATORY_EMAIL/);fs.writeFileSync(output(),html);fs.writeFileSync(recordFile,originalRecord);}
 // Missing telemetry is permitted and remains visibly unrecorded; admission itself is unchanged.
 const page=parse(html),value=JSON.parse(originalRecord);delete value.mandatoryEmailTiming;page.querySelector('#harness-mandatory-email-admission').replaceWith(require('./harness-mandatory-email-report.cjs').renderMandatoryEmailAdmission(value.nativeEvidence.mandatoryEmailAdmission));reseal(page,value);assert.equal(Reporter.validatePublicReport().mandatoryEmailTiming,undefined);assert.match(fs.readFileSync(output(),'utf8'),/Admission call elapsed: Not recorded/);
 fs.writeFileSync(output(),html);fs.writeFileSync(recordFile,originalRecord);Reporter.resetPublicReport('harness');
});

test('postal actual detail validates exact table note and proof owner against coherent HTML rewrites',async t=>{
 const root=sandbox(t),Reporter=api(),reporter=new Reporter({selection:'harness'});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);
 const phase=reporter.nativeEvidence.phases.find(p=>p.phase==='ccd'),postal=phase.baselineProofs.find(p=>p.proofId==='ccd-postal-two-roundtrip');
 postal.recordedDetail={schemaVersion:1,availability:'recorded',scope:'postal-action-check-groups',testDurationMs:90,groups:require('./fixtures/exui-native-stage-telemetry.mock.cjs').postalGroups.map((groupId,i)=>({ordinal:i+1,groupId,outcome:'completed-without-reported-error',durationMs:i+1}))};
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,i)=>reporter.onTestEnd(item,result('passed',i)));await reporter.onEnd(fullResult());
 const file=path.join(root,'functional-output/tests/harness/private/public-odhin-harness.json'),original=fs.readFileSync(file),html=fs.readFileSync(output(),'utf8');
 assert.equal(Reporter.validatePublicReport().nativeEvidence.status,'PASS');assert(!html.includes(canary));
 for(const fault of ['duration','outcome','method','table-move','note-move','orphan','unmarked-orphan','duplicate','missing']){
  const page=require('node-html-parser').parse(html),value=JSON.parse(original),table=page.querySelector('[data-native-postal-detail]'),owner=table.parentNode,other=page.querySelector('[data-native-kind="baseline"] details');
  if(fault==='duration')table.querySelector('tbody tr td:nth-child(5)').textContent='99999 ms';
  if(fault==='outcome')table.querySelector('tbody tr td:nth-child(4)').textContent='Passed';
  if(fault==='method')table.querySelector('tbody tr td:nth-child(2)').textContent='PRIVATE_COOKIE';
  if(fault==='table-move'){table.remove();other.insertAdjacentHTML('beforeend',table.toString());}
  if(fault==='note-move'){const note=owner.querySelector('[data-native-postal-note]');note.remove();other.insertAdjacentHTML('beforeend',note.toString());}
  if(['orphan','unmarked-orphan','duplicate'].includes(fault)){const copy=require('node-html-parser').parse(table.toString()).firstChild;if(fault==='unmarked-orphan')copy.removeAttribute('data-native-postal-detail');(fault==='duplicate'?owner:page.querySelector('#harness-native-evidence')).insertAdjacentHTML('beforeend',copy.toString());}
  if(fault==='missing')table.remove();
  const changed=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(changed).digest('hex');fs.writeFileSync(output(),changed);fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/,fault);fs.writeFileSync(output(),html);fs.writeFileSync(file,original);
 }
});

test('native proof owner groups contain one counted summary and one full-width semantic detail row',async()=>{
 const {renderNativeEvidence}=require(process.env.NATIVE_DETAIL_RENDERER_TEST_MODULE??'./harness-native-report.cjs'),{parse}=require('node-html-parser'),evidence=await nativePresentationFixture(false),dom=parse(renderNativeEvidence(evidence));
 const owners=dom.querySelectorAll('[data-native-row]');assert.equal(owners.length,46);
 assert.equal(dom.querySelectorAll('[data-native-table="baseline"] tr[data-native-phase]').length,23);
 assert.equal(dom.querySelectorAll('[data-native-table="fault"] tr[data-native-phase]').length,23);
 for(const owner of owners){assert.equal(owner.tagName,'TBODY');const rows=owner.children;assert.equal(rows.length,2);assert(rows.every(row=>row.tagName==='TR'));assert.equal(rows[0].children.length,5);assert.equal(rows[0].getAttribute('data-native-phase'),owner.getAttribute('data-native-phase'));assert.equal(rows[1].hasAttribute('data-native-phase'),false);assert.equal(rows[1].children.length,1);assert.equal(rows[1].children[0].getAttribute('colspan'),'5');assert.equal(rows[0].querySelectorAll('details').length,0);assert.equal(rows[1].querySelectorAll('details').length,1);assert.equal(owner.querySelectorAll('details dl').length,1);}
});

test('business scalar tables reject coherent observed rewrites swapped proof ownership and orphans',async t=>{
 const root=sandbox(t),Reporter=api(),reporter=new Reporter({selection:'harness'}),packet=await require('./fixtures/exui-native-report-packet.mock.cjs').fixture(t,{businessScalars:true});await reporter.prepareNativeEvidence(packet.descriptorPath);
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,i)=>reporter.onTestEnd(item,result('passed',i)));await reporter.onEnd(fullResult());
 const file=path.join(root,'functional-output/tests/harness/private/public-odhin-harness.json'),original=fs.readFileSync(file),html=fs.readFileSync(output(),'utf8');assert.equal(Reporter.validatePublicReport().nativeEvidence.status,'PASS');assert(!html.includes(packet.descriptorPath));
 for(const fault of ['value','status','note','move','orphan','unmarked-orphan','duplicate','missing','record-value','coherent-record','missing-held','wrong-held','crossjob-held','withdraw-all','withdraw-all-null','withdraw-values','null-held']){
  const page=require('node-html-parser').parse(html),value=JSON.parse(original),table=page.querySelector('[data-native-business-scalars]'),owner=table.parentNode;
  if(fault==='value')table.querySelector('tbody tr td:nth-child(3)').textContent='99';
  if(fault==='status')table.querySelector('tbody tr td:nth-child(4)').textContent='PASS';
  if(fault==='note')owner.querySelector('[data-native-business-note]').textContent='Business scalar observations: All services proved';
  if(fault==='move'){table.remove();page.querySelectorAll('[data-native-row] details').find(d=>d!==owner).insertAdjacentHTML('beforeend',table.toString());}
  if(['orphan','unmarked-orphan','duplicate'].includes(fault)){const copy=require('node-html-parser').parse(table.toString()).firstChild;if(fault==='unmarked-orphan')copy.removeAttribute('data-native-business-scalars');(fault==='duplicate'?owner:page.querySelector('#harness-native-evidence')).insertAdjacentHTML('beforeend',copy.toString());}
  if(fault==='missing')table.remove();
  if(fault==='record-value'){const phase=value.nativeEvidence.phases.find(p=>p.phase==='ccd');phase.baselineProofs.find(p=>p.proofId==='ccd-nested-roundtrip').businessScalars.scalars.recipientCount.value=2;}
  if(fault==='coherent-record'){value.nativeEvidence.phases.find(p=>p.phase==='ccd').baselineProofs.find(p=>p.proofId==='ccd-nested-roundtrip').businessScalars.scalars.recipientCount.value=2;page.querySelector('#harness-native-evidence').replaceWith(require('./harness-native-report.cjs').renderNativeEvidence(value.nativeEvidence));}
  if(fault==='withdraw-values'){for(const phase of value.nativeEvidence.phases)for(const proof of [...phase.baselineProofs,...phase.faults])delete proof.businessScalars;page.querySelector('#harness-native-evidence').replaceWith(require('./harness-native-report.cjs').renderNativeEvidence(value.nativeEvidence));}
  if(fault==='withdraw-all'){for(const phase of value.nativeEvidence.phases)for(const proof of [...phase.baselineProofs,...phase.faults])delete proof.businessScalars;delete value.nativeBusinessScalarHeld;page.querySelector('#harness-native-evidence').replaceWith(require('./harness-native-report.cjs').renderNativeEvidence(value.nativeEvidence));}
  if(fault==='withdraw-all-null'){for(const phase of value.nativeEvidence.phases)for(const proof of [...phase.baselineProofs,...phase.faults])delete proof.businessScalars;value.nativeBusinessScalarHeld=null;page.querySelector('#harness-native-evidence').replaceWith(require('./harness-native-report.cjs').renderNativeEvidence(value.nativeEvidence));}
  if(fault==='null-held')value.nativeBusinessScalarHeld=null;
  if(fault==='missing-held')delete value.nativeBusinessScalarHeld;
  if(fault==='wrong-held')value.nativeBusinessScalarHeld.digest='sha256:'+'f'.repeat(64);
  if(fault==='crossjob-held'){const foreign=await require('./fixtures/exui-native-report-packet.mock.cjs').fixture(t,{businessScalars:true});value.nativeBusinessScalarHeld={path:foreign.descriptorPath,digest:'sha256:'+require('node:crypto').createHash('sha256').update(fs.readFileSync(foreign.descriptorPath)).digest('hex')};}
  const modified=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(modified).digest('hex');fs.writeFileSync(output(),modified);fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/,fault);fs.writeFileSync(output(),html);fs.writeFileSync(file,original);
 }
 const run=JSON.parse(fs.readFileSync(path.join(packet.directory,'private/ccd/run.json'))),execution=JSON.parse(fs.readFileSync(path.join(packet.directory,'private/ccd',run.executionArtifacts[0].path))),raw=path.join(packet.directory,'private/ccd',execution.resultArtifact.path),bytes=fs.readFileSync(raw);fs.appendFileSync(raw,' ');assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);fs.writeFileSync(raw,bytes);Reporter.validatePublicReport();fs.unlinkSync(raw);Reporter.resetPublicReport('harness');assert(!fs.existsSync(output()));

});

test('current scalar intent binds absent historical attachments and required sealed denial observations',async t=>{
 const root=sandbox(t),Reporter=api(),reporter=new Reporter({selection:'harness'}),packet=await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,i)=>reporter.onTestEnd(item,result('passed',i)));await reporter.onEnd(fullResult());
 const file=path.join(root,'functional-output/tests/harness/private/public-odhin-harness.json'),bytes=fs.readFileSync(file),html=fs.readFileSync(output(),'utf8'),record=Reporter.validatePublicReport();
 assert(record.nativeBusinessScalarHeld);assert(record.nativeEvidence.phases.every(p=>[...p.baselineProofs,...p.faults].every(proof=>['ccd-role-policy','ccd-access-broadened','ccd-write-then-deny'].includes(proof.proofId)?proof.businessScalars?.availability==='recorded':proof.businessScalars===undefined)));assert(!html.includes(packet.descriptorPath));
 for(const mode of ['missing','null','invented']){const value=JSON.parse(bytes),page=require('node-html-parser').parse(html);if(mode==='missing')delete value.nativeBusinessScalarHeld;if(mode==='null')value.nativeBusinessScalarHeld=null;
  if(mode==='invented'){value.nativeEvidence.phases.find(p=>p.phase==='ccd').baselineProofs.find(p=>p.proofId==='ccd-nested-roundtrip').businessScalars=require('./fixtures/exui-business-scalar-detail.mock.cjs').recorded('ccd-nested-roundtrip');page.querySelector('#harness-native-evidence').replaceWith(require('./harness-native-report.cjs').renderNativeEvidence(value.nativeEvidence));}
  const changed=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(changed).digest('hex');fs.writeFileSync(output(),changed);fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/,mode);fs.writeFileSync(file,bytes);fs.writeFileSync(output(),html);
 }
 Reporter.validatePublicReport();const legacy=JSON.parse(bytes);delete legacy.nativeBusinessScalarHeld;for(const phase of legacy.nativeEvidence.phases)for(const proof of [...phase.baselineProofs,...phase.faults])delete proof.businessScalars;const oldPage=require('node-html-parser').parse(html);oldPage.querySelector('#harness-native-evidence').replaceWith(require('./harness-native-report.cjs').renderNativeEvidence(legacy.nativeEvidence));const oldHtml=oldPage.toString();legacy.sha256=require('node:crypto').createHash('sha256').update(oldHtml).digest('hex');fs.writeFileSync(output(),oldHtml);fs.writeFileSync(file,JSON.stringify(legacy));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);Reporter.resetPublicReport('harness');assert(!fs.existsSync(output()));
});
test('no Native current intent is explicit null; omission is retirement-only and never starts a metadata child',async t=>{
 const root=sandbox(t),Reporter=api(),reporter=new Reporter({selection:'harness'}),tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,i)=>reporter.onTestEnd(item,result('passed',i)));await reporter.onEnd(fullResult());
 const cp=require('node:child_process'),original=cp.spawnSync;let count=0;try{cp.spawnSync=()=>{count++;throw Error('NO_NATIVE_CHILD');};const record=Reporter.validatePublicReport();assert.equal(record.nativeBusinessScalarHeld,null);assert.equal(record.nativeEvidence,null);
 if(process.env.SELF_CHECK_COMPAT_NODE20){const code=`const cp=require('node:child_process');let calls=0;cp.spawnSync=()=>{calls++;throw Error('NO_METADATA_CHILD');};const value=require(${JSON.stringify(reporterPath)}).validatePublicReport('harness');if(value.nativeBusinessScalarHeld!==null||value.nativeEvidence!==null||calls)throw Error('NO_NATIVE_INTENT');console.log(JSON.stringify({node:process.version,metadataChildren:calls}));`;const result=JSON.parse(cp.execFileSync(process.env.SELF_CHECK_COMPAT_NODE20,['-e',code],{cwd:root,encoding:'utf8'}));assert.match(result.node,/^v20\./);assert.equal(result.metadataChildren,0);t.diagnostic(JSON.stringify(result));}
 const file=path.join(root,'functional-output/tests/harness/private/public-odhin-harness.json');delete record.nativeBusinessScalarHeld;fs.writeFileSync(file,JSON.stringify(record));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/);Reporter.resetPublicReport('harness');assert.equal(count,0);assert(!fs.existsSync(output()));}finally{cp.spawnSync=original;}
});


test('sealed denial scalar rows remain expected-observed comparisons and cannot be removed or coherently changed',async t=>{
 sandbox(t);const Reporter=api(),reporter=new Reporter({selection:'harness'});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,i)=>reporter.onTestEnd(item,result('passed',i)));await reporter.onEnd(fullResult());Reporter.validatePublicReport();
 const file=path.join(process.cwd(),'functional-output/tests/harness/private/public-odhin-harness.json'),original=fs.readFileSync(file),html=fs.readFileSync(output(),'utf8'),record=JSON.parse(original),{parse}=require('node-html-parser');
 const dom=parse(html),table=dom.querySelector('[data-native-business-scalars="ccd-role-policy"]');assert(table);assert.match(table.textContent,/403, 404.*403.*Matches displayed expectation/s);assert.match(dom.querySelector('[data-native-business-note="ccd-role-policy"]').textContent,/sealed CCD policy observations after the unchanged role replay/);
 for(const mode of ['change','drop']){
  const value=JSON.parse(original),proof=value.nativeEvidence.phases.find(p=>p.phase==='ccd').baselineProofs.find(p=>p.proofId==='ccd-role-policy');if(mode==='change')proof.businessScalars.scalars.deniedReadStatus.value=404;else delete proof.businessScalars;
  const page=parse(html);page.querySelector('#harness-native-evidence').replaceWith(require('./harness-native-report.cjs').renderNativeEvidence(value.nativeEvidence));const bytes=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(output(),bytes);fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/,mode);fs.writeFileSync(output(),html);fs.writeFileSync(file,original);
 }
});

test('CCD event preparation diagnostics render stable non-credit substeps and validate incomplete blocked prefixes',async t=>{
 sandbox(t);
 const {validateEventRuntimePreparationTimings,validateEventPreparationSummary,renderEventPreparationTimings}=require('./harness-event-preparation-report.cjs');
 const faults=[['judge-event-enabled','ccd-enable-judge-event'],['courtadmin-recipient-read-removed','ccd-remove-courtadmin-recipient-read'],['readonly-recipient-read-removed','ccd-remove-readonly-recipient-read'],['readonly-recipient-update-enabled','ccd-enable-readonly-recipient-update'],['courtadmin-event-create-removed','ccd-remove-courtadmin-event-create'],['recipient-collection-shape','ccd-shape-recipient-collection'],['case-field-recipient-selector-shape','ccd-shape-case-field-recipient-selector'],['required-delivery-radio-shape','ccd-shape-required-delivery-radio'],['conditional-email-complex-shape','ccd-shape-conditional-email-complex'],['postal-recipient-name-shape','ccd-shape-postal-recipient-name'],['optional-postal-line-two-shape','ccd-shape-optional-postal-line-two']],steps=['startup','definition-import','identity-verification','runtime-observation','ownership-capture','transition-identity'],runId='candidate-123e4567-e89b-12d3-a456-426614174000';
 const rows=()=>faults.flatMap(([,invocationId])=>steps.map((step,index)=>({sequence:1,runId,invocationId,step,status:'completed',startedAt:'2026-11-07T10:00:00.000Z',durationMs:index+1}))).map((row,index)=>({...row,sequence:index+1}));
 const Reporter=api(),reporter=new Reporter({selection:'harness',eventRuntimePreparationTimings:rows()});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);
 const summary=validateEventRuntimePreparationTimings(rows(),reporter.nativeEvidence),rendered=renderEventPreparationTimings(summary);assert.equal(summary.status,'complete');assert.equal(summary.completedSteps,66);assert.equal(summary.scenarios.length,11);assert.equal((rendered.match(/<tr /g)||[]).length,11);assert.match(rendered,/not additive/);assert.match(rendered,/no additional catalogue evidence/);assert(!rendered.includes(runId));assert(!rendered.includes('ccd-enable-judge-event'));
 const incomplete=rows().slice(0,3);incomplete[2]={...incomplete[2],status:'failed'};incomplete.forEach((row,index)=>row.sequence=index+1);
 const blockedReporter=new Reporter({selection:'harness',eventRuntimePreparationTimings:incomplete});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,blockedReporter,{unknownFailure:true});const blocked=validateEventRuntimePreparationTimings(incomplete,blockedReporter.nativeEvidence);assert.equal(blocked.status,'failed');assert.equal(blocked.failedSteps,1);assert.match(renderEventPreparationTimings(blocked),/Failed · 3 ms/);assert.match(renderEventPreparationTimings(blocked),/Not recorded/);
 const missingRow=rows();missingRow.splice(2,1);missingRow.forEach((row,index)=>row.sequence=index+1);assert.equal(validateEventRuntimePreparationTimings(missingRow,reporter.nativeEvidence).status,'partial');
 for(const mutate of [value=>{value[1]={...value[1],step:'startup'};},value=>{value.push({...value.at(-1),sequence:value.length+1,status:'completed'});},value=>{value.at(-1).runId='candidate-foreign';}]){const changed=rows();mutate(changed);assert.throws(()=>validateEventRuntimePreparationTimings(changed,reporter.nativeEvidence));}
 const passedEvidence=reporter.nativeEvidence;assert.equal(validateEventRuntimePreparationTimings(rows().slice(0,3),passedEvidence).status,'partial');
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,index)=>reporter.onTestEnd(item,result('passed',index)));await reporter.onEnd(fullResult());const record=Reporter.validatePublicReport();assert.equal(record.eventPreparationTimings.completedSteps,66);const html=fs.readFileSync(output(),'utf8'),dom=require('node-html-parser').parse(html),panel=dom.querySelector('#harness-event-preparation-timings');assert(panel);assert.equal(panel.querySelectorAll('tbody tr').length,11);assert.match(panel.textContent,/not additive/);assert(!html.includes(runId));Reporter.resetPublicReport('harness');
 const sparse=rows().filter((_,index)=>index!==2);sparse.forEach((row,index)=>row.sequence=index+1);const diagnosticOnly=new Reporter({selection:'harness',eventRuntimePreparationTimings:sparse});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,diagnosticOnly);const sparseSummary=validateEventRuntimePreparationTimings(sparse,diagnosticOnly.nativeEvidence);assert.equal(sparseSummary.phaseStatus,'PASS');assert.equal(sparseSummary.status,'partial');assert.equal(sparseSummary.completedSteps,2);
 const invalidSummary=structuredClone(sparseSummary);invalidSummary.scenarios[0].steps[3]={name:steps[3],status:'completed',durationMs:4};invalidSummary.completedSteps++;assert.throws(()=>validateEventPreparationSummary(invalidSummary,diagnosticOnly.nativeEvidence));
 const sparseTests=testsFor();diagnosticOnly.onBegin({}, {allTests:()=>sparseTests});sparseTests.forEach((item,index)=>diagnosticOnly.onTestEnd(item,result('passed',index)));await diagnosticOnly.onEnd(fullResult());const sparseRecord=Reporter.validatePublicReport();assert.equal(sparseRecord.status,'passed');assert.equal(sparseRecord.nativeEvidence.status,'PASS');assert.equal(sparseRecord.eventPreparationTimings.status,'partial');Reporter.resetPublicReport('harness');
 const malformedReporter=new Reporter({selection:'harness',eventRuntimePreparationTimings:[{malformed:true}]});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,malformedReporter);const malformedTests=testsFor();malformedReporter.onBegin({}, {allTests:()=>malformedTests});malformedTests.forEach((item,index)=>malformedReporter.onTestEnd(item,result('passed',index)));await malformedReporter.onEnd(fullResult());const malformedRecord=Reporter.validatePublicReport();assert.equal(malformedRecord.status,'passed');assert.equal(malformedRecord.nativeEvidence.status,'PASS');assert.equal(malformedRecord.eventPreparationTimings.status,'unavailable');assert.match(fs.readFileSync(output(),'utf8'),/Preparation timing records are unavailable; native evidence is unaffected/);
});

test('source-event lifecycle timings are diagnostic, include cleanup after proof failure, and never alter evidence',async t=>{
 sandbox(t);
 const {validateEventRuntimeLifecycleTimings,validateEventRuntimeLifecycleSummary,renderEventRuntimeLifecycleTimings,unavailableEventRuntimeLifecycleTimings}=require('./harness-event-preparation-report.cjs');
 const invocations=['baseline','ccd-enable-judge-event','ccd-remove-courtadmin-recipient-read','ccd-remove-readonly-recipient-read','ccd-enable-readonly-recipient-update','ccd-remove-courtadmin-event-create','ccd-shape-recipient-collection','ccd-shape-case-field-recipient-selector','ccd-shape-required-delivery-radio','ccd-shape-conditional-email-complex','ccd-shape-postal-recipient-name','ccd-shape-optional-postal-line-two'];
 const steps=['browser-provider-setup','candidate-runtime-setup','application-readiness','playwright-proof','post-proof-resource-observation','candidate-graceful-shutdown','provider-graceful-shutdown','resource-cleanup'],runId='candidate-123e4567-e89b-12d3-a456-426614174000';
 const rows=()=>invocations.flatMap(invocationId=>steps.map((step,index)=>({sequence:1,runId,invocationId,step,status:'completed',startedAt:'2026-11-07T10:00:00.000Z',durationMs:index+1}))).map((row,index)=>({...row,sequence:index+1}));
 const Reporter=api(),reporter=new Reporter({selection:'harness',eventRuntimeLifecycleTimings:rows()});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,reporter);
 const summary=validateEventRuntimeLifecycleTimings(rows(),reporter.nativeEvidence),html=renderEventRuntimeLifecycleTimings(summary);assert.equal(summary.status,'complete');assert.equal(summary.completedSteps,96);assert.equal(summary.invocations.length,12);assert.equal((html.match(/<tr>/g)||[]).length,13);assert.match(html,/12 rows cover one baseline and 11 fault scenarios/);assert.match(html,/non-additive/);assert.match(html,/no catalogue credit/);assert.match(html,/not browser-only timings/);assert(!html.includes(runId));assert(!html.includes('ccd-enable-judge-event'));
 const failed=rows().slice(0,4);failed[3]={...failed[3],status:'failed'};failed.push({...rows()[7],sequence:5});const failureSummary=validateEventRuntimeLifecycleTimings(failed,reporter.nativeEvidence);assert.deepEqual(validateEventRuntimeLifecycleSummary(failureSummary,reporter.nativeEvidence),failureSummary);assert.equal(failureSummary.status,'failed');assert.equal(failureSummary.invocations[0].steps[3].status,'failed');assert.equal(failureSummary.invocations[0].steps[7].status,'completed');
 const passed=reporter.nativeEvidence;const missing=unavailableEventRuntimeLifecycleTimings(passed);assert.equal(validateEventRuntimeLifecycleSummary(missing,passed).status,'unavailable');
 const gapped=rows().filter((_row,index)=>index!==10).map((row,index)=>({...row,sequence:index+1}));const gappedReporter=new Reporter({selection:'harness',eventRuntimeLifecycleTimings:gapped});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,gappedReporter);const gappedTests=testsFor();gappedReporter.onBegin({}, {allTests:()=>gappedTests});gappedTests.forEach((item,index)=>gappedReporter.onTestEnd(item,result('passed',index)));await gappedReporter.onEnd(fullResult());const gappedRecord=Reporter.validatePublicReport();assert.equal(gappedRecord.status,'passed');assert.equal(gappedRecord.nativeEvidence.status,'PASS');assert.equal(gappedRecord.eventRuntimeLifecycleSummary.status,'unavailable');
 const malformedReporter=new Reporter({selection:'harness',eventRuntimeLifecycleTimings:[{malformed:true}]});await require('./fixtures/exui-native-report-packet.mock.cjs').preparePublication(t,malformedReporter);const tests=testsFor();malformedReporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,index)=>malformedReporter.onTestEnd(item,result('passed',index)));await malformedReporter.onEnd(fullResult());const record=Reporter.validatePublicReport();assert.equal(record.status,'passed');assert.equal(record.nativeEvidence.status,'PASS');assert.equal(record.eventRuntimeLifecycleSummary.status,'unavailable');assert.match(fs.readFileSync(output(),'utf8'),/Lifecycle timings are unavailable; proof outcomes are unchanged/);
});
