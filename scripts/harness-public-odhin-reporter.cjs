/* Public Odhín accepts reviewed declarations and execution scalars only. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { setImmediate: nextTurn } = require("node:timers/promises");
const overview = require("./harness-public-overview.cjs");
const checkMethods = require("./harness-public-check-steps.cjs");
const fixture = { selections: overview.profiles };
const Generate = require("odhin-reports-playwright/lib/generate").default;
const { parse } = require("node-html-parser");
const { applyPresentation } = require("./odhin-presentation/enhance.cjs");

const statuses = ["passed", "failed", "skipped", "timedOut"];
const nativePhaseLabels = ["WA family", "Scope fault candidate preparation", "WA organisation scope", "CCD runtime startup", "CCD configuration and access", "CCD runtime cleanup", "Source event CCD runtime startup", "CCD source event permissions", "Source event CCD runtime cleanup", "Application routing", "Recipient callback CCD runtime startup", "Recipient callback validation and persistence", "Recipient callback CCD runtime cleanup", "Selector CCD baseline preparation", "Selector baseline proof and cleanup", "Selector CCD fault preparation", "Selector fault proof and cleanup", "Selector evidence verification", "Selector final cleanup", "Selector cohort admission", "Native evidence and interpreter verification"];
const proofPhases = new Map([["WA family", "family"], ["WA organisation scope", "scope"], ["CCD configuration and access", "ccd"], ["CCD source event permissions", "eventCapability"], ["Application routing", "routing"], ["Recipient callback validation and persistence", "recipientCallback"], ["Selector cohort admission", "selectorEventRow"]]);
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
function validatePhaseTimings(timings, evidence, elapsed) {
  if (!Array.isArray(timings) || !timings.length || !evidence || !Number.isSafeInteger(elapsed)) throw failure();
  let prior = -1;
  let total = 0;
  for (const item of timings) {
    const index = nativePhaseLabels.indexOf(item.label);
    if (index <= prior || !["PASS", "FAIL", "BLOCKED", "completed", "stopped"].includes(item.status) ||
      !Number.isSafeInteger(item.durationMs) || item.durationMs < 0 || item.durationMs > 7_200_000 ||
      typeof item.startedAt !== "string" || new Date(item.startedAt).toISOString() !== item.startedAt) throw failure();
    const phase = evidence.phases.find((row) => row.phase === proofPhases.get(item.label));
    if (phase && item.status !== phase.status) throw failure();
    prior = index;
    total += item.durationMs;
  }
  if (total > elapsed + 1000 || (evidence.status === "PASS" && timings.filter(item=>item.label!=="Native evidence and interpreter verification").length !== nativePhaseLabels.length-1)) throw failure();
}
function renderPhaseTimings(timings, elapsed, legacy = false) {
  const duration = (ms) => `${Math.floor(ms / 60000)}m ${Math.floor(ms % 60000 / 1000)}s`;
  return `<section id="harness-phase-timings" aria-labelledby="harness-phase-timings-title"><div class="harness-phase-heading"><div><h2 id="harness-phase-timings-title">What ran during native assurance</h2><p>Native controller timings and collector evidence checks, in execution order. These are timing telemetry, not additional catalogue credit. Diagnostic Playwright time and Jenkins checkout/build time are separate.</p></div><strong>${duration(elapsed)} native run and evidence preparation</strong></div><div class="table-responsive"><table class="table"><thead><tr><th>Phase</th><th>Kind</th><th>Outcome</th><th>Started (UTC)</th><th>Duration</th></tr></thead><tbody>${timings.map((item) => `<tr${legacy?'':` data-phase-duration-ms="${item.durationMs}" data-phase-started-at="${item.startedAt}"`}><th scope="row">${htmlEscape(item.label)}</th><td>${['Native evidence and interpreter verification','Selector evidence verification','Selector cohort admission'].includes(item.label)?'Evidence verification':['Selector baseline proof and cleanup','Selector fault proof and cleanup'].includes(item.label) ? 'Proof + setup / cleanup' : proofPhases.has(item.label) ? 'Proof' : 'Setup / cleanup'}</td><td><span class="harness-phase-status" data-status="${item.status}">${item.status}</span></td><td>${item.startedAt.slice(0, 19).replace('T', ' ')} UTC</td><td>${duration(item.durationMs)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function workerEvidence(runners, checks) {
  const observed=[];
  for (const check of checks) {
    if (!runners.some(row=>row.phase===check.runnerPhase) || !Number.isSafeInteger(check.workerIndex) || check.workerIndex < -1 || (check.runnerPhase!=='direct' && (overview.groupFor(check.file)==='aat')!==(check.runnerPhase==='aat'))) throw failure();
    if(check.workerIndex>=0 && !observed.some(row=>row.phase===check.runnerPhase&&row.workerIndex===check.workerIndex)) observed.push({phase:check.runnerPhase,workerIndex:check.workerIndex});
  }
  return {schemaVersion:1,runners,observed};
}
function renderWorkers(value) {
  const runners=value.runners.map(row=>`${row.phase}: ${row.configuredWorkers??'Not recorded'} configured`).join(' · ');
  return `<tr data-harness-diagnostic-workers="true"><th scope="row">Playwright diagnostic workers</th><td>${runners} · ${value.observed.length} observed across ${value.runners.length} runners; not peak parallelism</td></tr>`;
}
function validateWorkers(value, checks) {
  if(!value||Object.keys(value).sort().join()!=='observed,runners,schemaVersion'||value.schemaVersion!==1||!Array.isArray(value.runners)||!['direct','offline','offline,aat'].includes(value.runners.map(row=>row.phase).join())||value.runners.some(row=>Object.keys(row).sort().join()!=='configuredWorkers,phase'||!(row.configuredWorkers===null||Number.isSafeInteger(row.configuredWorkers)&&row.configuredWorkers>0)))throw failure();
  if(JSON.stringify(value)!==JSON.stringify(workerEvidence(value.runners,checks)))throw failure();
}

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
function validateHtml(html, record, retiringPreviousRun = false) {
  const complexAdmission = record.nativeEvidence?.complexEmailAdmission;
  const complexDom = parse(html);
  const entries = fixture.selections[record.selection];
  const detailMarkers = complexDom.querySelectorAll('[data-harness-check-info], [data-harness-check-steps]');
  if (retiringPreviousRun && record.checkMethods === undefined) {
    if (detailMarkers.length) throw failure();
  } else {
    checkMethods.validateMethodEvidence(record.checkMethods, entries, record.counts);
    validateWorkers(record.diagnosticWorkers,record.checkMethods.checks);
    const workers=complexDom.querySelectorAll('[data-harness-diagnostic-workers]');
    if(workers.length!==1||workers[0].toString()!==parse(renderWorkers(record.diagnosticWorkers)).toString())throw failure();
    if (detailMarkers.length !== entries.length * 2) throw failure();
    record.checkMethods.checks.forEach((check,index) => {
      const modal = complexDom.querySelector(`#harness-${index}-0`);
      const info = modal?.querySelector(`#TabRunInfo-harness-${index}-0 [data-harness-check-info]`);
      const steps = modal?.querySelector(`#TabSteps-harness-${index}-0`);
      const label = modal?.querySelector('.modal-title label');
      const expectedInfo = parse(checkMethods.renderInfo(entries[index],check.steps,check.status)).toString();
      const expectedSteps = parse(checkMethods.renderSteps(entries[index],check.steps,check.status)).toString();
      if (!info || !steps || label?.textContent.trim() !== check.status || info.toString() !== expectedInfo || steps.innerHTML !== expectedSteps) throw failure();
    });
  }
  const complexPanels = complexDom.querySelectorAll('[id="harness-complex-email-admission"]').length;
  const complexAttemptPanels = complexDom.querySelectorAll('[id="harness-complex-email-attempt"]').length;
  if (complexPanels !== (complexAdmission ? 1 : 0) || complexAttemptPanels !== (record.complexEmailAttempt ? 1 : 0)) throw failure();
  if (complexAdmission && !html.includes(require('./harness-complex-email-report.cjs').renderComplexEmailAdmission(complexAdmission))) throw failure();

  if (record.complexEmailAttempt && record.nativeEvidence?.complexEmailAdmission) throw failure();
  if (Boolean(record.complexEmailAttempt) !== html.includes('id="harness-complex-email-attempt"')) throw failure();
  if (record.complexEmailAttempt && !html.includes(require('./harness-complex-email-report.cjs').renderComplexEmailAttempt(record.complexEmailAttempt))) throw failure();
  if(record.personalServiceAttempt&&record.nativeEvidence?.personalServiceAdmission)throw failure();
  if(Boolean(record.personalServiceAttempt)!==html.includes('id="harness-personal-service-attempt"'))throw failure();
  if(record.personalServiceAttempt&&!html.includes(require('./harness-personal-service-report.cjs').renderPersonalServiceAttempt(record.personalServiceAttempt)))throw failure();
  if (!retiringPreviousRun && !html.includes(require('./harness-native-report.cjs').renderNativeExecutionInfo(record.nativeEvidence))) throw failure();
  if(record.divorceProfileAttempt&&record.nativeEvidence?.divorceProfileAdmission)throw failure();
  if(Boolean(record.divorceProfileAttempt)!==html.includes('id="harness-divorce-profile-attempt"'))throw failure();
  if(record.divorceProfileAttempt&&!html.includes(require('./harness-divorce-profile-report.cjs').renderDivorceProfileAttempt(record.divorceProfileAttempt)))throw failure();
  if(Boolean(record.sharedNestedAttemptEvidence)!==html.includes('id="harness-shared-nested-attempt"'))throw failure();
  if(record.sharedNestedAttemptEvidence&&!html.includes(require('./harness-shared-nested-report.cjs').renderSharedNestedAttempt(record.sharedNestedAttemptEvidence)))throw failure();
  if (Boolean(record.compatibilityEvidence) !== html.includes('id="harness-applicant-compatibility"')) throw failure();
  if (record.compatibilityEvidence) {
    if (!record.nativeEvidence || !html.includes(require("./harness-applicant-results-report.cjs").renderApplicantCompatibility(record.compatibilityEvidence))) throw failure();
  }
  if (record.nativeElapsedMs !== undefined && (!Number.isSafeInteger(record.nativeElapsedMs) || record.nativeElapsedMs < 0 || !html.includes(`data-native-elapsed-ms="${record.nativeElapsedMs}"`))) throw failure();
  if (record.phaseTimings !== undefined) {
    validatePhaseTimings(record.phaseTimings, record.nativeEvidence, record.nativeElapsedMs);
    const panels = complexDom.querySelectorAll('[id="harness-phase-timings"]');
    if (panels.length !== 1 || panels[0].toString() !== parse(renderPhaseTimings(record.phaseTimings, record.nativeElapsedMs, retiringPreviousRun && record.checkMethods === undefined)).toString()) throw failure();
  } else if (html.includes('id="harness-phase-timings"')) throw failure();
  if (
    Boolean(record.nativeEvidence) !==
      html.includes('id="harness-native-evidence"') ||
    Boolean(record.diagnosticSource) !==
      html.includes('class="harness-diagnostic-source"')
  )
    throw failure();
  if (record.diagnosticSource) {
    validateDiagnosticSource(record.diagnosticSource);
    if (
      !html.includes(
        `data-diagnostic-source-sha256="${digest(JSON.stringify(record.diagnosticSource))}"`,
      ) ||
      !html.includes(record.diagnosticSource.capturedAt) ||
      (record.diagnosticSource.commit &&
        !html.includes(record.diagnosticSource.commit))
    )
      throw failure();
  }
  if (record.nativeEvidence) {
    require("./harness-native-report.cjs").renderNativeEvidence(
      record.nativeEvidence,
    );
    if (
      !html.includes(`data-native-status="${record.nativeEvidence.status}"`) ||
      !html.includes(
        `data-native-evidence-sha256="${digest(JSON.stringify(record.nativeEvidence))}"`,
      ) ||
      !html.includes(record.nativeEvidence.descriptorDigest) ||
      !html.includes(
        `Diagnostics ${record.status} / Native ${record.nativeEvidence.status}`,
      )
    )
      throw failure();
  }
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
  const marker = `<section id="harness-public-run" data-selection="${record.selection}" data-status="${record.status}" data-run-id="${record.runId}"${record.nativeElapsedMs === undefined ? '' : ` data-native-elapsed-ms="${record.nativeElapsedMs}"`}>`;
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
function validateOwnedReport(selection, retiringPreviousRun = false) {
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
    validateHtml(html, record, retiringPreviousRun);
    return record;
  } catch {
    throw failure();
  }
}
function validatePublicReport(selection) {
  return validateOwnedReport(selection);
}
function resetPublicReport(selection) {
  try {
    const p = paths(selection);
    inventory(p);
    if (fs.existsSync(p.html)) {
      // Retirement keeps ownership/privacy checks but permits the previous RunInfo layout.
      validateOwnedReport(undefined, true);
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

function captureDiagnosticSource() {
  const capturedAt = new Date().toISOString();
  try {
    const { execFileSync } = require("node:child_process");
    const options = {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    };
    const commit = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
    const state = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=normal"],
      options,
    ).trim()
      ? "modified"
      : "clean";
    if (!/^[a-f0-9]{40}$/.test(commit)) throw failure();
    return { commit, state, capturedAt };
  } catch {
    return { commit: null, state: "unavailable", capturedAt };
  }
}
function validateDiagnosticSource(source) {
  if (
    !source ||
    !["clean", "modified", "unavailable"].includes(source.state) ||
    (source.state === "unavailable"
      ? source.commit !== null
      : !/^[a-f0-9]{40}$/.test(source.commit)) ||
    new Date(source.capturedAt).toISOString() !== source.capturedAt
  )
    throw failure();
}
class HarnessPublicOdhinReporter {
  constructor({ selection, diagnosticSource, nativeElapsedMs, phaseTimings, divorceProfileAttempt, personalServiceAttempt, complexEmailAttempt } = {}) {
    this.diagnosticSource = diagnosticSource;
    this.nativeElapsedMs = nativeElapsedMs;
    this.phaseTimings = phaseTimings;
    if(divorceProfileAttempt)require('./harness-divorce-profile-report.cjs').renderDivorceProfileAttempt(divorceProfileAttempt);
    this.divorceProfileAttempt = divorceProfileAttempt;
    if(personalServiceAttempt)require('./harness-personal-service-report.cjs').renderPersonalServiceAttempt(personalServiceAttempt);
    this.personalServiceAttempt=personalServiceAttempt;
    if (complexEmailAttempt) require('./harness-complex-email-report.cjs').renderComplexEmailAttempt(complexEmailAttempt);
    this.complexEmailAttempt = complexEmailAttempt;
    this.nativeEvidence = null;
    this.compatibilityEvidence = null;
    this.sharedNestedAttemptEvidence = null;
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
  async prepareNativeEvidence(descriptorPath) {
    if (this.begun || this.nativeEvidence) this.reject();
    const { readNativeReportEvidence } =
      await import("./lib/exui-native-report-evidence.mjs");
    this.nativeEvidence = await readNativeReportEvidence(descriptorPath);
    // Validate all display labels before starting collection, never silently omit an unknown proof.
    require("./harness-native-report.cjs").renderNativeEvidence(
      this.nativeEvidence,
    );
  }
  async prepareCompatibilityEvidence(descriptorPath) {
    if (this.begun || this.compatibilityEvidence || !this.nativeEvidence) this.reject();
    const { readApplicantCompatibilityEvidence } = await import("./lib/exui-applicant-results-report-evidence.mjs");
    this.compatibilityEvidence = readApplicantCompatibilityEvidence(descriptorPath);
    require("./harness-applicant-results-report.cjs").renderApplicantCompatibility(this.compatibilityEvidence);
  }
  async prepareSharedNestedAttempt(descriptorPath) {
    if(this.begun||this.sharedNestedAttemptEvidence)this.reject();
    const {readSharedNestedAttempt}=await import('./lib/exui-shared-nested-attempt.mjs');
    const started=performance.now(),observed=await readSharedNestedAttempt(descriptorPath);
    this.sharedNestedAttemptEvidence={...observed,collectorVerificationMs:Math.round(performance.now()-started)};
    require('./harness-shared-nested-report.cjs').renderSharedNestedAttempt(this.sharedNestedAttemptEvidence);
  }
  reject() {
    this.invalid = true;
    throw failure();
  }
  onBegin(_config, suite) {
    try {
      this.runnerPhases=_config?.harnessRunnerPhases??['direct'];
      if(!Array.isArray(this.runnerPhases)||!['direct','offline','offline,aat'].includes(this.runnerPhases.join()))this.reject();
      this.configuredWorkers = Number.isSafeInteger(_config?.workers) && _config.workers > 0 ? _config.workers : null;
      this.diagnosticSource ||= captureDiagnosticSource();
      validateDiagnosticSource(this.diagnosticSource);
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
    const runnerPhase=result.runnerPhase??'direct';
    if(!this.runnerPhases.includes(runnerPhase)||(runnerPhase!=='direct'&&isAat!==(runnerPhase==='aat')))this.reject();
    let recordedCheckSteps;
    try {
      recordedCheckSteps = checkMethods.validateCheckSteps(this.expected.get(identity), result.checkSteps === undefined
        ? checkMethods.extractCheckSteps(this.expected.get(identity), result.steps, 'framework')
        : result.checkSteps, result.status);
    } catch { this.reject(); }
    this.results.set(identity, {
      ...(isAat ? { aatOutcome: result.aatOutcome } : {}),
      ...(isAat && result.aatOutcome === "service-family-contract-mismatch"
        ? { aatMissingFamilies: [...result.aatMissingFamilies] }
        : {}),
      checkSteps: recordedCheckSteps,
      runnerPhase,
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
      if (this.nativeElapsedMs !== undefined && (!this.nativeEvidence || !Number.isSafeInteger(this.nativeElapsedMs) || this.nativeElapsedMs < 0)) this.reject();
      if(this.personalServiceAttempt&&this.nativeEvidence?.personalServiceAdmission)throw failure();
      if (this.complexEmailAttempt && this.nativeEvidence?.complexEmailAdmission) throw failure();
      if(this.divorceProfileAttempt&&this.nativeEvidence?.divorceProfileAdmission)throw failure();
      if (this.phaseTimings !== undefined) validatePhaseTimings(this.phaseTimings, this.nativeEvidence, this.nativeElapsedMs);
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
        title: "EXUI Assurance Harness",
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
            steps: observed.checkSteps.map(step => ({
              title: htmlEscape(checkMethods.methodFor(entry).steps.find(declared => declared.id === step.id).label),
              duration: step.durationMs ?? 0,
              ...(step.status === 'passed' ? {} : {error:{message:'Recorded stage did not pass'}}),
              steps: [],
            })),
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
        checkMethods: checkMethods.methodEvidence([...this.expected.values()], this.results),
        diagnosticWorkers: workerEvidence(this.runnerPhases.map(phase=>({phase,configuredWorkers:this.configuredWorkers})),checkMethods.methodEvidence([...this.expected.values()], this.results).checks),
        counts,
        status: result.status,
        globalErrors: this.globalErrors,
        diagnosticSource: this.diagnosticSource,
        nativeEvidence: this.nativeEvidence,
        compatibilityEvidence: this.compatibilityEvidence,
        sharedNestedAttemptEvidence:this.sharedNestedAttemptEvidence,
        nativeElapsedMs: this.nativeElapsedMs,
        phaseTimings: this.phaseTimings,
        divorceProfileAttempt: this.divorceProfileAttempt,
        personalServiceAttempt:this.personalServiceAttempt,
        complexEmailAttempt:this.complexEmailAttempt,
        startTime: result.startTime.toISOString(),
        duration: result.duration,
      };
      const banner = `<section id="harness-public-run" data-selection="${record.selection}" data-status="${record.status}" data-run-id="${record.runId}"${record.nativeElapsedMs === undefined ? '' : ` data-native-elapsed-ms="${record.nativeElapsedMs}"`}><div class="alert alert-secondary rounded-0 m-0 py-2 small"><strong>Diagnostics ${record.status}${record.nativeEvidence ? ` / Native ${record.nativeEvidence.status}` : ""}${record.personalServiceAttempt?` / Personal event row ${record.personalServiceAttempt.status}`:""}${record.divorceProfileAttempt?` / DIVORCE profile ${record.divorceProfileAttempt.status}`:""}${record.complexEmailAttempt?` / ComplexTypes ${record.complexEmailAttempt.status}`:''}${record.sharedNestedAttemptEvidence?` / Additional nested attempt ${record.sharedNestedAttemptEvidence.status}`:''}.</strong> ${record.nativeEvidence ? "Separate native execution attached;" : "Supporting diagnostics only;"} no release credit. Global errors: ${record.globalErrors}. Detailed diagnostics remain private.</div></section>`;
      html = html.replace(
        '<body id="body-content">',
        `<body id="body-content">${banner}`,
      );
      const presentation = parse(html);
      const runInfo = [...presentation.querySelectorAll('.info-box-header')]
        .find((header) => header.textContent.trim() === 'Run info')?.parentNode;
      if (!runInfo) this.reject();
      const runRows = [...runInfo.querySelectorAll('tr')];
      const setRunInfo = (label, value, renamed = label) => {
        const row = runRows.find((item) => item.querySelector('th')?.textContent.trim() === label);
        if (!row) this.reject();
        row.querySelector('th').textContent = renamed;
        row.querySelector('td').textContent = value;
      };
      const harnessRevision = this.diagnosticSource.commit?.slice(0, 12) || 'unavailable';
      const candidateRevision = this.nativeEvidence?.source.webappCommit?.slice(0, 12);
      setRunInfo('Project', 'EXUI Assurance Harness');
      setRunInfo('Release', candidateRevision ? `EXUI candidate ${candidateRevision} · Harness ${harnessRevision}` : `Harness ${harnessRevision} · candidate not run`, 'Source revisions');
      setRunInfo('Test Environment', this.selection === 'local-aat' ? 'AAT endpoint probes + local diagnostics' : this.nativeEvidence ? 'Isolated local EXUI candidate + CCD; local diagnostics' : 'Local Harness diagnostics only', 'Execution environment');
      for (const [from, to] of [['Execution Start Time', 'Diagnostic start'], ['Execution End Time', 'Diagnostic end']]) {
        const row = runRows.find((item) => item.querySelector('th')?.textContent.trim() === from);
        if (!row) this.reject();
        row.querySelector('th').textContent = to;
      }
      setRunInfo('Total Execution Time', runRows.find((item) => item.querySelector('th')?.textContent.trim() === 'Total Execution Time')?.querySelector('td')?.textContent.trim() || 'Not recorded', 'Diagnostic execution time');
      const nativeDuration = this.nativeElapsedMs === undefined ? 'duration not recorded' : `${(this.nativeElapsedMs / 60000).toFixed(1)} min native run + evidence preparation`;
      runInfo.querySelector('table').insertAdjacentHTML('beforeend', `${renderWorkers(record.diagnosticWorkers)}<tr><th scope="row">Native execution</th><td>${this.nativeEvidence ? `${this.nativeEvidence.status} · ${nativeDuration}` : 'Not run'}</td></tr>`);
      runInfo.querySelector('table').insertAdjacentHTML('beforeend', require('./harness-native-report.cjs').renderNativeExecutionInfo(this.nativeEvidence));
      [...this.expected].forEach(([identity,entry],index) => {
        const observed = this.results.get(identity);
        const info = presentation.querySelector(`#TabRunInfo-harness-${index}-0`);
        const steps = presentation.querySelector(`#TabSteps-harness-${index}-0`);
        if (!info || !steps) this.reject();
        info.insertAdjacentHTML('beforeend',checkMethods.renderInfo(entry,observed.checkSteps,observed.status));
        steps.innerHTML = checkMethods.renderSteps(entry,observed.checkSteps,observed.status);
      });
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
        "beforeend",
        await overview.renderOverview(
          [...this.expected].map(([identity, entry]) => ({
            entry,
            observed: this.results.get(identity),
          })),
          this.selection,
          {
            nativeEvidence: this.nativeEvidence,
            diagnosticSource: this.diagnosticSource,
          },
        ),
      );
      if (this.compatibilityEvidence) presentation.querySelector("#harness-native-evidence").insertAdjacentHTML("afterend", require("./harness-applicant-results-report.cjs").renderApplicantCompatibility(this.compatibilityEvidence));
      if(this.personalServiceAttempt)presentation.querySelector('#TabDashboard').insertAdjacentHTML('beforeend',require('./harness-personal-service-report.cjs').renderPersonalServiceAttempt(this.personalServiceAttempt));
      if (this.complexEmailAttempt) presentation.querySelector('#TabDashboard').insertAdjacentHTML('beforeend', require('./harness-complex-email-report.cjs').renderComplexEmailAttempt(this.complexEmailAttempt));
      if(this.divorceProfileAttempt)presentation.querySelector('#TabDashboard').insertAdjacentHTML('beforeend',require('./harness-divorce-profile-report.cjs').renderDivorceProfileAttempt(this.divorceProfileAttempt));
      if(this.sharedNestedAttemptEvidence)presentation.querySelector('#TabDashboard').insertAdjacentHTML('beforeend',require('./harness-shared-nested-report.cjs').renderSharedNestedAttempt(this.sharedNestedAttemptEvidence));
      if (this.phaseTimings) presentation.querySelector("#TabDashboard").insertAdjacentHTML("beforeend", renderPhaseTimings(this.phaseTimings, this.nativeElapsedMs));
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
      presentation
        .querySelector("body")
        .insertAdjacentHTML(
          "beforeend",
          `<script id="harness-dashboard-ui">${fs.readFileSync(path.join(__dirname, "harness-public-dashboard.js"), "utf8")}</script>`,
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
HarnessPublicOdhinReporter.captureDiagnosticSource = captureDiagnosticSource;
HarnessPublicOdhinReporter.validatePublicReport = validatePublicReport;
HarnessPublicOdhinReporter.resetPublicReport = resetPublicReport;
module.exports = HarnessPublicOdhinReporter;
