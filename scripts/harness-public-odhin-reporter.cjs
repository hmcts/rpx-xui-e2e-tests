/* Public Odhín accepts reviewed declarations and execution scalars only. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { setImmediate: nextTurn } = require("node:timers/promises");
const overview = require("./harness-public-overview.cjs");
const fixture = { selections: overview.profiles };
const Generate = require("odhin-reports-playwright/lib/generate").default;
const { parse } = require("node-html-parser");
const { applyPresentation } = require("./odhin-presentation/enhance.cjs");

const statuses = ["passed", "failed", "skipped", "timedOut"];
// Pinned odhin-reports-playwright 1.1.8 has callback loading, with no readiness promise.
const templateFields = [
  "base",
  "runInfo",
  "chart",
  "chartInfo",
  "chartStatus",
  "chartFile",
  "chartProject",
  "chartJs",
  "content",
  "summary",
  "summaryRow",
  "testCaseTemplate",
  "testCaseDetailsTemplate",
  "cssThemeLight",
  "cssThemeDark",
  "cssThemeCustom",
  "cssColors",
  "css",
  "jqueryDataTablesCss",
  "bootstrapCss",
  "prismCss",
  "imgComparisonSliderCss",
  "jQuery",
  "js",
  "themeJs",
  "chartJsLibrary",
  "jqueryDataTablesJs",
  "dataTables",
  "bootstrapJs",
  "prismJs",
  "imgComparisonSliderJs",
];
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const htmlEscape = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const key = (entry) => JSON.stringify([entry.file, entry.titlePath]);
const failure = () => new Error("PUBLIC_ODHIN_INVALID_OR_INCOMPLETE");

function paths(selection) {
  if (!Object.hasOwn(fixture.selections, selection)) throw failure();
  const root = process.cwd();
  if (fs.realpathSync(root) !== root) throw failure();
  const base = path.join(root, "functional-output/tests/harness");
  return {
    base,
    dir: path.join(base, "public", "odhin"),
    html: path.join(base, "public", "odhin", "index.html"),
    record: path.join(base, "private", "public-odhin-harness.json"),
    privateDir: path.join(base, "private"),
  };
}
function directory(target, create = false) {
  const parent = path.dirname(target);
  if (parent !== target) directory(parent, create);
  if (!fs.existsSync(target)) {
    // existsSync follows links: lstat also rejects a dangling symlink.
    try {
      fs.lstatSync(target);
      throw failure();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!create) return;
    fs.mkdirSync(target, { mode: 0o700 });
  }
  const stat = fs.lstatSync(target);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(target) !== target
  )
    throw failure();
}
function regular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file)
    throw failure();
  return stat;
}
function inventory(p) {
  directory(p.dir);
  directory(p.privateDir);
  if (
    fs.existsSync(p.dir) &&
    fs.readdirSync(p.dir).some((name) => name !== "index.html")
  )
    throw failure();
  for (const file of [p.html, p.record]) {
    try {
      regular(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw failure();
    }
  }
}
function validateHtml(html, record) {
  if (
    !html.startsWith("<!DOCTYPE html>") ||
    !html.includes("Final Outcomes") ||
    html.includes("{{.") ||
    html.includes("fonts.gstatic.com") ||
    /<(?:script|video|iframe)\b[^>]*\bsrc\s*=/i.test(html) ||
    /<img\b[^>]*\bsrc\s*=\s*["'](?!data:image\/(?:png|gif|jpeg);base64,)/i.test(
      html,
    ) ||
    /<link\b[^>]*\bhref\s*=\s*["'](?!data:)/i.test(html) ||
    /(?:screenshots|videos|traces)\//.test(html)
  )
    throw failure();
  const marker = `<section id="harness-public-run" data-selection="${record.selection}" data-status="${record.status}" data-run-id="${record.runId}">`;
  if (
    !html.includes(marker) ||
    !html.includes("no release credit") ||
    !html.includes('id="harness-overview"') ||
    !html.includes(record.startTime) ||
    !html.includes(
      new Date(
        new Date(record.startTime).getTime() + record.duration,
      ).toISOString(),
    ) ||
    !html.includes('<style id="webapp-report-theme">') ||
    !html.includes('<script id="webapp-report-ui">') ||
    !html.includes(`Global errors: ${record.globalErrors}`)
  )
    throw failure();
  for (const status of statuses) {
    const count = (
      html.match(
        new RegExp(
          `<tr class="test-row-result row-result-status-${status} result-status-${status}"`,
          "g",
        ),
      ) || []
    ).length;
    if (count !== record.counts[status]) throw failure();
  }
  for (const entry of fixture.selections[record.selection]) {
    if (!html.includes(htmlEscape(entry.titlePath.at(-1)))) throw failure();
  }
}
function validatePublicReport(selection) {
  try {
    const p = paths(selection || "harness");
    inventory(p);
    regular(p.html);
    regular(p.record);
    const record = JSON.parse(fs.readFileSync(p.record, "utf8"));
    selection ||= record.selection;
    if (!Object.hasOwn(fixture.selections, selection)) throw failure();
    if (
      record.schemaVersion !== 1 ||
      record.selection !== selection ||
      record.tests !== fixture.selections[selection].length ||
      typeof record.startTime !== "string" ||
      new Date(record.startTime).toISOString() !== record.startTime ||
      !Number.isFinite(record.duration) ||
      record.duration < 0 ||
      !Number.isFinite(
        new Date(
          new Date(record.startTime).getTime() + record.duration,
        ).getTime(),
      ) ||
      !["passed", "failed"].includes(record.status) ||
      !/^[a-f0-9-]{36}$/.test(record.runId) ||
      !/^[a-f0-9]{64}$/.test(record.sha256) ||
      !Number.isSafeInteger(record.globalErrors) ||
      record.globalErrors < 0 ||
      statuses.some(
        (status) =>
          !Number.isSafeInteger(record.counts?.[status]) ||
          record.counts[status] < 0,
      ) ||
      statuses.reduce((sum, status) => sum + record.counts[status], 0) !==
        record.tests ||
      (record.status === "passed" &&
        (record.globalErrors || record.counts.failed || record.counts.timedOut))
    )
      throw failure();
    const html = fs.readFileSync(p.html, "utf8");
    if (digest(html) !== record.sha256) throw failure();
    validateHtml(html, record);
    return record;
  } catch {
    throw failure();
  }
}
function resetPublicReport(selection) {
  try {
    const p = paths(selection);
    inventory(p);
    if (fs.existsSync(p.html)) {
      validatePublicReport();
      fs.unlinkSync(p.html);
    }
    if (fs.existsSync(p.record)) fs.unlinkSync(p.record);
  } catch {
    throw failure();
  }
}
function writeExclusive(file, bytes, owned) {
  const fd = fs.openSync(file, "wx", 0o600);
  owned.push({ file, stat: fs.fstatSync(fd) });
  try {
    fs.writeFileSync(fd, bytes);
  } finally {
    fs.closeSync(fd);
  }
}
function withdraw(owned) {
  for (const { file, stat } of owned.reverse()) {
    try {
      const current = fs.lstatSync(file);
      if (current.dev === stat.dev && current.ino === stat.ino)
        fs.unlinkSync(file);
    } catch {
      /* A failed producer never validates without its matching private record. */
    }
  }
}

class HarnessPublicOdhinReporter {
  constructor({ selection } = {}) {
    this.selection = selection;
    this.paths = paths(selection);
    this.expected = new Map(
      fixture.selections[selection].map((entry) => [key(entry), entry]),
    );
    this.results = new Map();
    this.identities = new WeakMap();
    this.globalErrors = 0;
    this.invalid = false;
    this.begun = false;
    this.ended = false;
  }
  reject() {
    this.invalid = true;
    throw failure();
  }
  onBegin(_config, suite) {
    try {
      resetPublicReport(this.selection);
      if (this.begun) this.reject();
      const tests = suite.allTests();
      if (tests.length !== this.expected.size) this.reject();
      const seen = new Set();
      for (const test of tests) {
        const file = path
          .relative(process.cwd(), test.location.file)
          .split(path.sep)
          .join("/");
        const identity = key({
          file,
          titlePath: overview.normalize({ file, titlePath: test.titlePath() })
            .titlePath,
        });
        if (
          !this.expected.has(identity) ||
          seen.has(identity) ||
          test.retries !== 0 ||
          test.expectedStatus !== "passed"
        )
          this.reject();
        seen.add(identity);
        this.identities.set(test, identity);
      }
      this.begun = true;
    } catch {
      this.reject();
    }
  }
  onTestEnd(test, result) {
    if (!this.begun || this.ended || this.invalid) this.reject();
    const identity = this.identities.get(test);
    if (
      !identity ||
      this.results.has(identity) ||
      !statuses.includes(result.status) ||
      result.retry !== 0 ||
      !Number.isFinite(result.duration) ||
      result.duration < 0 ||
      !(result.startTime instanceof Date) ||
      !Number.isFinite(result.startTime.getTime()) ||
      !Number.isFinite(
        new Date(result.startTime.getTime() + result.duration).getTime(),
      ) ||
      !Number.isSafeInteger(result.workerIndex) ||
      result.workerIndex < -1 ||
      !Number.isSafeInteger(result.parallelIndex) ||
      result.parallelIndex < -1
    )
      this.reject();
    const isAat = overview.groupFor(this.expected.get(identity).file) === "aat";
    if (
      isAat &&
      (![
        "response-passed",
        "login-setup-blocked",
        "failure-unclassified",
        "service-family-contract-mismatch",
        "aat-profile-contract-mismatch",
        "skipped",
      ].includes(result.aatOutcome) ||
        (result.status === "passed" &&
          result.aatOutcome !== "response-passed") ||
        (result.status !== "passed" && result.aatOutcome === "response-passed"))
    )
      this.reject();
    if (
      isAat &&
      result.aatOutcome === "service-family-contract-mismatch" &&
      (this.expected.get(identity).titlePath.at(-1) !==
        "api/globalSearch/services contains the central must-run service-family set" ||
        !Array.isArray(result.aatMissingFamilies) ||
        !result.aatMissingFamilies.length ||
        new Set(result.aatMissingFamilies).size !==
          result.aatMissingFamilies.length ||
        result.aatMissingFamilies.some(
          (code) => !Object.hasOwn(overview.familyNames, code),
        ))
    )
      this.reject();
    if (
      isAat &&
      result.aatOutcome === "aat-profile-contract-mismatch" &&
      ![
        "api/globalSearch/services contains the central must-run service-family set",
        "api/wa-supported-jurisdiction/get contains the central WA must-run family set",
        "api/staff-supported-jurisdiction/get contains the central staff-supported must-run family set",
      ].includes(this.expected.get(identity).titlePath.at(-1))
    )
      this.reject();
    this.results.set(identity, {
      ...(isAat ? { aatOutcome: result.aatOutcome } : {}),
      ...(isAat && result.aatOutcome === "service-family-contract-mismatch"
        ? { aatMissingFamilies: [...result.aatMissingFamilies] }
        : {}),
      status: result.status,
      retry: 0,
      duration: result.duration,
      startTime: new Date(result.startTime.getTime()),
      workerIndex: result.workerIndex,
      parallelIndex: result.parallelIndex,
    });
  }
  onError() {
    this.globalErrors++;
  }
  async onEnd(result) {
    let stage;
    const owned = [];
    try {
      if (
        !this.begun ||
        this.ended ||
        this.invalid ||
        this.results.size !== this.expected.size ||
        !["passed", "failed"].includes(result.status) ||
        !(result.startTime instanceof Date) ||
        !Number.isFinite(result.startTime.getTime()) ||
        !Number.isFinite(result.duration) ||
        result.duration < 0 ||
        !Number.isFinite(
          new Date(result.startTime.getTime() + result.duration).getTime(),
        )
      )
        this.reject();
      this.ended = true;
      const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
      for (const record of this.results.values()) counts[record.status]++;
      if (
        result.status === "passed" &&
        (counts.failed || counts.timedOut || this.globalErrors)
      )
        this.reject();
      const p = this.paths;
      inventory(p);
      directory(p.privateDir, true);
      directory(p.dir, true);
      stage = fs.mkdtempSync(path.join(p.privateDir, ".public-odhin-"));
      fs.chmodSync(stage, 0o700);
      const renderDir = path.join(stage, "render");
      const renderer = new Generate({
        outputFolder: renderDir,
        indexFilename: "index.html",
        title: "EXUI Assurance Harness — supporting evidence",
        project: `Harness ${this.selection}`,
        testEnvironment: this.selection,
        release: "",
        testFolder: "src/tests/api",
        initialTheme: "light",
        embedAssets: true,
        embedAttachments: false,
        startServer: false,
        consoleLog: false,
        consoleError: false,
        consoleTestOutput: false,
        testOutput: false,
        testGroupOnConsole: false,
        testProjectOnConsole: false,
      });
      // Its string replacement corrupts bundled jQuery's literal $&. Keep bytes literal.
      renderer.help.updateHtml = (html, tag, content, type) =>
        html.replace(tag, () =>
          type === "css"
            ? `<style>${content}</style>`
            : `<script type='text/javascript'>${content}</script>`,
        );
      const deadline = Date.now() + 5000;
      while (
        !templateFields.every((field) => typeof renderer[field] === "string")
      ) {
        if (Date.now() >= deadline) this.reject();
        await nextTurn();
      }
      await renderer.onBegin(
        { projects: [{ name: `Harness ${this.selection}` }] },
        { allTests: () => [...this.expected.values()] },
      );
      let index = 0;
      for (const [identity, entry] of this.expected) {
        const observed = this.results.get(identity);
        await renderer.onTestEnd(
          {
            id: `harness-${index++}`,
            title: htmlEscape(entry.titlePath.at(-1)),
            filename: entry.file,
            projectId: this.selection,
            projectInfo: true,
            retries: 0,
            tags: [],
            annotations: [],
            titlePath: entry.titlePath.map(htmlEscape),
          },
          {
            ...observed,
            errors: [],
            stderr: [],
            stdout: [],
            steps: [],
            attachments: [],
          },
        );
      }
      // Replay updates counters correctly, but its clocks describe rendering rather than execution.
      renderer.execInfo.startTime = result.startTime.toISOString();
      renderer.execInfo.endTime = new Date(
        result.startTime.getTime() + result.duration,
      ).toISOString();
      const spans = new Map();
      let first = Infinity;
      let last = -Infinity;
      for (const [identity, entry] of this.expected) {
        const observed = this.results.get(identity);
        const start = observed.startTime.getTime();
        const end = start + observed.duration;
        const filename = renderer.help.getShortFilePath(
          entry.file,
          "src/tests/api",
        );
        const span = spans.get(filename) || { start: Infinity, end: -Infinity };
        span.start = Math.min(span.start, start);
        span.end = Math.max(span.end, end);
        spans.set(filename, span);
        first = Math.min(first, start);
        last = Math.max(last, end);
      }
      for (const file of renderer.execInfo.execFiles) {
        const span = spans.get(file.filename);
        if (!span) this.reject();
        file.startTime = new Date(span.start).toISOString();
        file.endTime = new Date(span.end).toISOString();
      }
      for (const project of renderer.execInfo.execProjects) {
        if (project.project !== this.selection) this.reject();
        project.startTime = new Date(first).toISOString();
        project.endTime = new Date(last).toISOString();
      }
      await renderer.onEnd();
      if (fs.readdirSync(renderDir).join() !== "index.html") this.reject();
      regular(path.join(renderDir, "index.html"));
      let html = fs.readFileSync(path.join(renderDir, "index.html"), "utf8");
      html = html.replace(
        '<link rel="preconnect" href="https://fonts.gstatic.com" />',
        "",
      );
      const record = {
        schemaVersion: 1,
        selection: this.selection,
        runId: crypto.randomUUID(),
        tests: this.results.size,
        counts,
        status: result.status,
        globalErrors: this.globalErrors,
        startTime: result.startTime.toISOString(),
        duration: result.duration,
      };
      const banner = `<section id="harness-public-run" data-selection="${record.selection}" data-status="${record.status}" data-run-id="${record.runId}"><div class="alert alert-secondary rounded-0 m-0 py-2 small"><strong>Checks: ${record.status}.</strong> Supporting diagnostics only; no release credit. Global errors: ${record.globalErrors}. Detailed diagnostics remain private.</div></section>`;
      html = html.replace(
        '<body id="body-content">',
        `<body id="body-content">${banner}`,
      );
      const presentation = parse(html);
      applyPresentation(
        presentation,
        [...this.expected].map(([identity, entry], index) => ({
          target: `#harness-${index}-0`,
          feature: overview.metadataFor(entry).slice.label,
          tags: [
            overview.metadataFor(entry).lane.label,
            ...overview.metadataFor(entry).jurisdictions,
            ...overview.metadataFor(entry).caseTypes,
          ],
          retry: 0,
          durationMs: this.results.get(identity).duration,
        })),
      );
      presentation.querySelector("#TabDashboard").insertAdjacentHTML(
        "afterbegin",
        await overview.renderOverview(
          [...this.expected].map(([identity, entry]) => ({
            entry,
            observed: this.results.get(identity),
          })),
          this.selection,
        ),
      );
      presentation
        .querySelector("head")
        .insertAdjacentHTML(
          "beforeend",
          `<style id="harness-coverage-theme">${fs.readFileSync(path.join(__dirname, "harness-report-coverage.css"), "utf8")}</style>`,
        );
      presentation
        .querySelector("body")
        .insertAdjacentHTML(
          "beforeend",
          `<script id="harness-coverage-ui">${fs.readFileSync(path.join(__dirname, "harness-report-coverage.js"), "utf8")}</script>`,
        );
      html = presentation.toString();
      validateHtml(html, record);
      record.sha256 = digest(html);
      fs.rmSync(stage, { recursive: true });
      stage = undefined;
      writeExclusive(p.record, `${JSON.stringify(record)}\n`, owned);
      writeExclusive(p.html, html, owned);
      validatePublicReport(this.selection);
    } catch {
      withdraw(owned);
      this.invalid = true;
      throw failure();
    } finally {
      if (stage) fs.rmSync(stage, { recursive: true, force: true });
    }
  }
}
HarnessPublicOdhinReporter.validatePublicReport = validatePublicReport;
HarnessPublicOdhinReporter.resetPublicReport = resetPublicReport;
module.exports = HarnessPublicOdhinReporter;
