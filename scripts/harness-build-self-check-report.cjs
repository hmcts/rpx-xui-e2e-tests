const assert = require("node:assert/strict");
const { escape } = require("./harness-report-coverage.cjs");
const counters = [
  "tests",
  "passed",
  "failed",
  "cancelled",
  "skipped",
  "todo",
  "suites",
  "topLevel",
];
const reasons = [
  "CHILD_INTERRUPTED",
  "SUMMARY_MISSING",
  "SUMMARY_DUPLICATE",
  "FILE_SUMMARY_INVALID",
  "SUMMARY_INVALID",
  "SUMMARY_COUNTS_CONTRADICTORY",
  "FILE_SELECTION_UNCONFIRMED",
  "NO_DECLARED_TESTS",
  "CHILD_SUMMARY_CONTRADICTORY",
  "TESTS_CANCELLED",
];
const exact = (value, keys) =>
  assert(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join() === keys.slice().sort().join(),
  );
function validateBuildSelfChecks(value, {retiringPreviousRun=false} = {}) {
  if (value === undefined) return;
  try {
    exact(value, [
      "schemaVersion",
      "kind",
      "runId",
      "status",
      "reason",
      "nodeVersion",
      "selectedFiles",
      "source",
      "counts",
      "nodeDurationMs",
      "wallDurationMs",
      "requestDigest",
      "evidenceDigest",
      "junitDigest",
      "runtimeAcceptance",
      "catalogueCredit",
      "releaseApproval",
      ...(Object.hasOwn(value,"configuredFileWorkers")?["configuredFileWorkers"]:[]),
    ]);
    assert.equal(value.schemaVersion, 1);
    assert(retiringPreviousRun&&!Object.hasOwn(value,"configuredFileWorkers") || value.configuredFileWorkers===1 || value.configuredFileWorkers===2);
    assert.equal(value.kind, "harness-build-self-checks");
    assert(
      typeof value.runId === "string" &&
        /^self-check-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          value.runId,
        ),
    );
    assert(
      typeof value.nodeVersion === "string" &&
        /^v24\.\d+\.\d+$/.test(value.nodeVersion),
    );
    assert(
      Number.isSafeInteger(value.selectedFiles) && value.selectedFiles > 0,
    );
    exact(value.source, ["commit", "state", "scope", "selectionDigest"]);
    assert(
      typeof value.source.commit === "string" &&
        /^[a-f0-9]{40}$/.test(value.source.commit),
    );
    assert(["clean", "modified"].includes(value.source.state));
    assert.equal(value.source.scope, "selected-tests-and-collector");
    for (const digest of [
      value.source.selectionDigest,
      value.requestDigest,
      value.evidenceDigest,
      value.junitDigest,
    ])
      assert(
        typeof digest === "string" && /^sha256:[a-f0-9]{64}$/.test(digest),
      );
    assert(["passed", "failed", "incomplete"].includes(value.status));
    assert(Number.isFinite(value.wallDurationMs) && value.wallDurationMs >= 0);
    if (value.counts === null) {
      assert.equal(value.status, "incomplete");
      assert(reasons.includes(value.reason));
      assert.equal(value.nodeDurationMs, null);
    } else {
      exact(value.counts, counters);
      assert(
        counters.every(
          (key) =>
            Number.isSafeInteger(value.counts[key]) && value.counts[key] >= 0,
        ),
      );
      assert(value.counts.tests > 0);
      assert.equal(
        value.counts.tests,
        ["passed", "failed", "cancelled", "skipped", "todo"].reduce(
          (sum, key) => sum + value.counts[key],
          0,
        ),
      );
      assert(
        Number.isFinite(value.nodeDurationMs) && value.nodeDurationMs >= 0,
      );
      if (value.status === "passed") {
        assert.equal(value.counts.failed, 0);
        assert.equal(value.counts.cancelled, 0);
        assert.equal(value.reason, null);
      } else if (value.status === "failed") {
        assert(value.counts.failed > 0);
        assert.equal(value.counts.cancelled, 0);
        assert.equal(value.reason, null);
      } else {
        assert(value.counts.cancelled > 0);
        assert.equal(value.reason, "TESTS_CANCELLED");
      }
    }
    for (const flag of [
      "runtimeAcceptance",
      "catalogueCredit",
      "releaseApproval",
    ])
      assert.equal(value[flag], false);
  } catch {
    throw Error("HARNESS_BUILD_SELF_CHECK_REPORT_INVALID");
  }
}
function renderBuildSelfCheckSummary(value, options) {
  validateBuildSelfChecks(value, options);
  const status = value?.status ?? "not-collected";
  const text = value
    ? `${value.status.toUpperCase()} · ${value.counts ? value.counts.tests + " Node tests; " + value.counts.passed + " passed, " + value.counts.failed + " failed, " + value.counts.cancelled + " cancelled, " + value.counts.skipped + " skipped, " + value.counts.todo + " todo" : "counts not recorded"} · ${value.selectedFiles} selected files`
    : "Not collected for this invocation";
  const attributes =
    value === undefined
      ? ""
      : ` data-build-self-check-wall-ms="${value.wallDurationMs}"${value.counts === null ? "" : ["tests", "passed", "failed", "cancelled", "skipped", "todo"].map((key) => ` data-build-self-check-${key}="${value.counts[key]}"`).join("")}`;
  return `<section id="harness-build-self-check-summary" class="odhin-thin-border p-3 mt-3" data-build-self-check-status="${status}"${attributes}><h2 class="h5">Build self-checks</h2><p>${escape(text)}</p><p>Separate from Playwright diagnostics, native executions and catalogue requirements. TypeScript and ESLint results are not represented here.</p></section>`;
}
function renderBuildSelfCheckDetails(value, options) {
  validateBuildSelfChecks(value, options);
  if (value === undefined)
    return '<section id="harness-build-self-check-details" class="odhin-thin-border p-3 mt-3"><h3>Build self-check evidence</h3><p>Not collected for this invocation. No Node self-check execution or Build result is inferred.</p></section>';
  const rows = value.counts
    ? counters
        .map(
          (key) =>
            `<tr><th scope="row">${key === "topLevel" ? "Top-level entries" : key[0].toUpperCase() + key.slice(1)}</th><td>${value.counts[key]}</td></tr>`,
        )
        .join("")
    : '<tr><th scope="row">Node counts</th><td>Not recorded</td></tr>';
  return `<section id="harness-build-self-check-details" class="odhin-thin-border p-3 mt-3" data-build-self-check-run="${value.runId}"><h3>Build self-check evidence</h3><p>Node checks executed by the Build unit command. Status: <strong>${value.status.toUpperCase()}</strong>. ${value.reason ? "Evidence outcome: " + escape(value.reason) + ". " : ""}This is not the overall Build, application, native or release verdict.</p><p>Source-defined purpose: Harness evidence and admission guards, source-derived fixture contracts, runtime orchestration and cleanup contracts, and report validation. These are checks of Harness correctness; their count does not mean downstream services executed. This section represents the Build unit command, not the full Build or lint result. No per-feature counts or individual execution trace are recorded here.</p><div class="table-responsive"><table class="table"><tbody>${rows}<tr><th scope="row">Selected files</th><td>${value.selectedFiles}</td></tr>${value.configuredFileWorkers===undefined?"":`<tr><th scope="row">Configured Node file workers</th><td>${value.configuredFileWorkers} maximum; not observed concurrency or Playwright workers</td></tr>`}<tr><th scope="row">Node version</th><td>${value.nodeVersion}</td></tr><tr><th scope="row">Collector wall time (ms)</th><td>${value.wallDurationMs}</td></tr><tr><th scope="row">Node final-summary duration (ms)</th><td>${value.nodeDurationMs ?? "Not recorded"}</td></tr></tbody></table></div><p>Node test counts include parent tests. Suites and top-level entries are separate counters; do not add them to tests. Durations overlap and must not be summed. These counts do not add to diagnostic tests, native proof records or accepted catalogue rows.</p><details><summary>Selected source and evidence identity</summary><dl><dt>Harness commit</dt><dd>${value.source.commit}</dd><dt>Source state</dt><dd>${value.source.state}</dd><dt>Selected source scope</dt><dd>Selected tests and collector controls; imported/transitive dependencies are not identified by this stamp.</dd><dt>Selection digest</dt><dd>${value.source.selectionDigest}</dd><dt>Held request digest</dt><dd>${value.requestDigest}</dd><dt>Private evidence digest</dt><dd>${value.evidenceDigest}</dd><dt>Private JUnit digest</dt><dd>${value.junitDigest}</dd></dl></details><p>Raw test names, JUnit, stdout, stderr, paths and errors remain private. TypeScript and ESLint results are not represented here.</p></section>`;
}
function renderBuildSelfCheckWorkers(value,options){
  validateBuildSelfChecks(value,options);
  return `<tr data-build-node-workers="true"><th scope="row">Configured Node file workers</th><td>${value===undefined?'Not recorded (Build self-checks not collected)':value.configuredFileWorkers===undefined?'Not recorded':value.configuredFileWorkers+' maximum; not observed concurrency or Playwright workers'}</td></tr>`;
}
function buildSelfCheckReporterOption(env) {
  const file = env.HARNESS_BUILD_SELF_CHECK_PATH,
    digest = env.HARNESS_BUILD_SELF_CHECK_DIGEST;
  if (file === undefined && digest === undefined) return undefined;
  if (
    typeof file !== "string" ||
    !require("node:path").isAbsolute(file) ||
    typeof digest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(digest)
  )
    throw Error("HARNESS_BUILD_SELF_CHECK_REPORT_INVALID");
  return { path: file, digest };
}
module.exports = {
  validateBuildSelfChecks,
  renderBuildSelfCheckSummary,
  renderBuildSelfCheckDetails,
  renderBuildSelfCheckWorkers,
  buildSelfCheckReporterOption,
};
