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
function output(_selection = "harness") {
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
    /<td data-report-metadata>Retained Harness framework checks<\/td>/,
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
    ["catalogue", 26],
    ["replay", 12],
    ["framework", 78],
  ]) {
    const group = root.querySelector(`[data-harness-group="${id}"]`);
    assert.equal(group.getAttribute("data-checks"), String(checks));
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
