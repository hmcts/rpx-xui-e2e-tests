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
function result(status = "passed", index = 0) {
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
) {
  const Reporter = api();
  const reporter = new Reporter({
    selection,
    outputFolder: canary,
    release: canary,
  });
  const tests = testsFor(selection);
  await reporter.onBegin(
    { projects: [{ name: canary }], metadata: { canary } },
    { allTests: () => tests },
  );
  for (let i = 0; i < tests.length; i++)
    await reporter.onTestEnd(tests[i], result(statuses[i] || "passed", i));
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
          await reporter.onTestEnd(testCase, result());
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
  await assert.rejects(() => complete(), /PUBLIC_ODHIN/);
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
  await assert.rejects(() => complete(), /PUBLIC_ODHIN/);
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
  for (const testCase of tests.slice(1)) reporter.onTestEnd(testCase, result());
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
    const observed = result();
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
    for (const testCase of tests) reporter.onTestEnd(testCase, result());
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
  assert.match(info.textContent, /Playwright diagnostic workers.*Not recorded configured · 1 observed/s);
  assert.match(info.textContent, /Native execution.*Not run/s);
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
        baselineProofs: policy.obligations
          .flatMap((item) => item.requiredProofIds)
          .map((proofId) => ({
            proofId,
            invocationId: "baseline",
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
          invocationId: item.mutationId,
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
  reporter.nativeEvidence = await nativePresentationFixture();
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
      ...result("passed", index),
      ...(entries[index].file.includes("/diagnostic/")
        ? { aatOutcome: "response-passed" }
        : {}),
    });
  await reporter.onEnd(fullResult());
  const html = fs.readFileSync(output(), "utf8");
  const dom = require("node-html-parser").parse(html);
  assert.equal(dom.querySelector('#harness-public-run').getAttribute('data-native-elapsed-ms'), '1920000');
  assert.match(dom.querySelector('.testcase-run-info-table').textContent, /32\.0 min native run \+ evidence preparation/);
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
  reporter.nativeEvidence = await nativePresentationFixture();
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
 reporter.nativeEvidence=await nativePresentationFixture(false);
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
 reporter.nativeEvidence=await nativePresentationFixture(true);const primary=structuredClone(reporter.nativeEvidence);
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
 };
 const render=(supplements,main=true)=>{
  const metrics=make();metrics.querySelector=selector=>({textContent:selector.includes('metric-0')?'116':selector.includes('metric-1')?'100%':'0'});metrics.replaceChildren=()=>{metrics.children=[]};
  const elements={'#harness-public-run':{dataset:{nativeElapsedMs:'60000'}},'#harness-application-coverage':{dataset:{runtimeObligations:'112'}},'.report-metrics':metrics,...(main?{'#harness-native-evidence':{dataset:{nativeStatus:'PASS'},querySelectorAll:()=>[{},{}]}}:{}),...supplements};
  const document={createElement:make,querySelector:selector=>elements[selector]||null,querySelectorAll:selector=>selector.includes('data-catalogue-kind')?[{dataset:{catalogueAccepted:'35'}}]:[]};
  vm.runInNewContext(script,{document});return metrics;
 };
 const text=node=>[node.textContent||'',...node.children.map(text)].join(' ');
 const plain=render({});assert.equal(plain.children[1].children[0].textContent,'Native proof outcomes');assert(!plain.children.some(x=>x.className==='report-supplement-summary'));
 const metrics=render(panels),summary=metrics.children[4];
 assert.equal(metrics.children[0].children[1].textContent,'35 / 112');assert.equal(metrics.children[1].children[1].textContent,'2 + 2');assert.equal(metrics.children[2].children[1].textContent,'116');assert.equal(metrics.children[3].children[1].textContent,'Unavailable');
 assert.equal(metrics.children[1].children[0].textContent,'Main native proof outcomes');assert.equal(summary.className,'report-supplement-summary');
 const links=summary.children.find(x=>x.className==='report-supplement-links').children;
 assert.deepEqual(links.map(x=>x.href),Object.keys(panels));
 assert.match(text(links[0]),/BLOCKED/);assert.match(text(links[0]),/4 baseline facets completed/);assert.match(text(links[0]),/2 passed.*2 failed/);assert.match(text(links[0]),/0 effective faults.*3 not run/);
 assert.match(text(links[1]),/6 baseline.*6 effective faults/);assert.match(text(links[1]),/1 \/ 1.*separate/);
 assert.match(text(links[2]),/1 baseline.*3 effective faults/);assert.match(text(links[2]),/Corrected local ARM64 CCD/);
 assert.match(text(metrics.children[1]),/1\.0 min main native \+ evidence verification/);
 assert.match(text(links[1]),/Separate profile interval: 2m 5s.*excluded from main native duration/);
 assert.match(text(summary),/Separate execution counts and durations/);assert.match(text(summary),/Supplementary requirements enter the catalogue total only when jointly admitted/);assert.doesNotMatch(text(summary),/excluded from the main totals/);
 const unknown=render({'#harness-divorce-profile-admission':{dataset:{...panels['#harness-divorce-profile-admission'].dataset,profileDurationMs:undefined}}});assert.match(text(unknown.children[4]),/Separate profile interval: not recorded/);
 const included=render({'#harness-divorce-profile-admission':{dataset:{...panels['#harness-divorce-profile-admission'].dataset,profileInclusion:'included'}}});assert.match(text(included.children[4]),/already included in main candidate coverage/);assert.match(text(included.children[4]),/2m 5s.*excluded from main native duration/);assert.equal(included.children[0].children[1].textContent,'35 / 112');
 const zero=render({'#harness-divorce-profile-admission':{dataset:{...panels['#harness-divorce-profile-admission'].dataset,profileDurationMs:'0'}}});assert.match(text(zero.children[4]),/Separate profile interval: 0m 0s/);
 const standalone=render({'#harness-shared-nested-attempt':panels['#harness-shared-nested-attempt']},false);
 assert.equal(standalone.children[1].children[1].textContent,'Not run');assert.equal(standalone.children[1].dataset.nativeStatus,'NOT_RUN');assert.equal(standalone.children[2].children[1].textContent,'116');assert.match(text(standalone.children[4]),/BLOCKED/);
 for(const [selector,panel]of Object.entries(panels)){const one=render({[selector]:panel});assert.equal(one.children[4].children.find(x=>x.className==='report-supplement-links').children.length,1);}
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
 const reporter=new Reporter({selection:'harness',nativeElapsedMs:20000,phaseTimings});reporter.nativeEvidence=await nativePresentationFixture(false);
 const tests=testsFor();reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,index)=>reporter.onTestEnd(item,result('passed',index)));await reporter.onEnd(fullResult());
 assert.equal(Reporter.validatePublicReport('harness').status,'passed');
 const dom=require('node-html-parser').parse(fs.readFileSync(output(),'utf8')),table=dom.querySelector('#harness-phase-timings');
 assert.equal(table.querySelectorAll('tbody tr').length,20);assert.match(table.textContent,/0m 20s native run/);
 for(const label of labels.slice(-7))assert.equal(table.querySelectorAll('tbody tr').filter(row=>row.textContent.includes(label)).length,1);
 assert.match(table.textContent,/Selector baseline proof and cleanupProof \+ setup \/ cleanup/);
 assert(!table.textContent.includes('Selector Page2 preparation, proofs and cleanup'));
});
