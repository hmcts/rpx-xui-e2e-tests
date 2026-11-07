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
      ...(value.schemaVersion===2?["fileResults","purposeMapDigest"]:[]),
    ]);
    assert(value.schemaVersion===2 || retiringPreviousRun && value.schemaVersion===1);
    assert(value.schemaVersion===1&&retiringPreviousRun&&!Object.hasOwn(value,"configuredFileWorkers") || value.configuredFileWorkers===1 || value.configuredFileWorkers===2);
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
    if(value.schemaVersion===2){
      const map=readSelfCheckPurposeMap();assert.equal(value.purposeMapDigest,map.digest);
      if(value.counts===null)assert.equal(value.fileResults,null);
      else{
        assert(Array.isArray(value.fileResults)&&value.fileResults.length===value.selectedFiles);
        const ids=new Set();
        for(const row of value.fileResults){exact(row,['id','counts','nodeDurationMs']);assert(typeof row.id==='string'&&map.files.some(file=>file.id===row.id)&&!ids.has(row.id));ids.add(row.id);exact(row.counts,counters);assert(counters.every(key=>Number.isSafeInteger(row.counts[key])&&row.counts[key]>=0));assert.equal(row.counts.tests,['passed','failed','cancelled','skipped','todo'].reduce((n,key)=>n+row.counts[key],0));assert(Number.isFinite(row.nodeDurationMs)&&row.nodeDurationMs>=0);}
        for(const key of counters)assert.equal(value.fileResults.reduce((n,row)=>n+row.counts[key],0),value.counts[key]);
        assert.deepEqual(value.fileResults.map(row=>row.id),map.files.filter(row=>ids.has(row.id)).map(row=>row.id));
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
  return `<section id="harness-build-self-check-details" class="odhin-thin-border p-3 mt-3" data-build-self-check-run="${value.runId}"><h3>Build self-check evidence</h3><p>Node checks executed by the Build unit command. Status: <strong>${value.status.toUpperCase()}</strong>. ${value.reason ? "Evidence outcome: " + escape(value.reason) + ". " : ""}This is not the overall Build, application, native or release verdict.</p><p>Source-defined purpose: Harness evidence and admission guards, source-derived fixture contracts, runtime orchestration and cleanup contracts, and report validation. These are checks of Harness correctness; their count does not mean downstream services executed. This section represents the Build unit command, not the full Build or lint result. ${value.schemaVersion===1?"No per-feature counts or individual execution trace are recorded here.":"The primary-purpose groups below are source descriptions, not application/service coverage. Recorded rows contain actual Node summaries, not per-assertion events or individual setup, actions and request traces."}</p><div class="table-responsive"><table class="table"><tbody>${rows}<tr><th scope="row">Selected files</th><td>${value.selectedFiles}</td></tr>${value.configuredFileWorkers===undefined?"":`<tr><th scope="row">Configured Node file workers</th><td>${value.configuredFileWorkers} maximum; not observed concurrency or Playwright workers</td></tr>`}<tr><th scope="row">Node version</th><td>${value.nodeVersion}</td></tr><tr><th scope="row">Collector wall time (ms)</th><td>${value.wallDurationMs}</td></tr><tr><th scope="row">Node final-summary duration (ms)</th><td>${value.nodeDurationMs ?? "Not recorded"}</td></tr></tbody></table></div><p>Node test counts include parent tests. Suites and top-level entries are separate counters; do not add them to tests. Durations overlap and must not be summed. These counts do not add to diagnostic tests, native proof records or accepted catalogue rows.</p>${value.schemaVersion===2?renderSelfCheckFiles(value):""}<details><summary>Selected source and evidence identity</summary><dl><dt>Harness commit</dt><dd>${value.source.commit}</dd><dt>Source state</dt><dd>${value.source.state}</dd><dt>Selected source scope</dt><dd>Selected tests and collector controls; imported/transitive dependencies are not identified by this stamp.</dd><dt>Selection digest</dt><dd>${value.source.selectionDigest}</dd><dt>Held request digest</dt><dd>${value.requestDigest}</dd><dt>Private evidence digest</dt><dd>${value.evidenceDigest}</dd><dt>Private JUnit digest</dt><dd>${value.junitDigest}</dd></dl></details><p>Raw test names, JUnit, stdout, stderr, paths and errors remain private. TypeScript and ESLint results are not represented here.</p></section>`;
}
function readSelfCheckPurposeMap(){
  const file=require('node:path').join(__dirname,'fixtures/harness-self-check-purpose-map.json'),fs=require('node:fs');assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file);
  const bytes=fs.readFileSync(file),map=JSON.parse(bytes);exact(map,['schemaVersion','groups','files']);assert.equal(map.schemaVersion,1);assert(Array.isArray(map.groups)&&Array.isArray(map.files));
  const groups=new Set(),ids=new Set(),files=new Set();
  for(const group of map.groups){exact(group,['id','label','purpose']);assert(/^[a-z0-9-]+$/.test(group.id)&&!groups.has(group.id));groups.add(group.id);for(const key of ['label','purpose'])assert(typeof group[key]==='string'&&group[key].length>0&&group[key].length<=400);}
  for(const row of map.files){exact(row,['file','id','label','group','purpose']);assert(/^scripts\/[a-z0-9._/-]+\.cjs$/.test(row.file)&&!row.file.split('/').some(part=>part==='.'||part==='..')&&!files.has(row.file));files.add(row.file);assert(/^unit-[a-z0-9-]+$/.test(row.id)&&!ids.has(row.id)&&groups.has(row.group));ids.add(row.id);for(const key of ['label','purpose'])assert(typeof row[key]==='string'&&row[key].length>0&&row[key].length<=400);}
  return {...map,digest:'sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex')};
}
function renderSelfCheckFiles(value){
  if(value.fileResults===null)return '<p data-build-self-check-files="not-recorded">Per-file Node counts and durations: Not recorded. Incomplete evidence supplies no invented file/group outcome.</p>';
  const map=readSelfCheckPurposeMap(),cells=counts=>counters.map(key=>`<td>${counts[key]}</td>`).join('');
  return `<section data-build-self-check-files="recorded" data-build-self-check-map="${map.digest}"><h4>Node self-check files by source-defined primary purpose</h4><p>Purpose labels describe source checks; Node recorded the counters and file durations. These are not observed per-assertion or user-action traces. Source order is for reading, not execution order. File durations overlap under configured concurrency and are not summed into group, Node, Harness or collector elapsed time.</p>${map.groups.map(group=>{
    const members=value.fileResults.filter(row=>map.files.find(file=>file.id===row.id).group===group.id);if(!members.length)return '';
    const totals=Object.fromEntries(counters.map(key=>[key,members.reduce((n,row)=>n+row.counts[key],0)]));
    return `<details data-build-self-check-group="${group.id}"><summary>${escape(group.label)} — ${members.length} files, ${totals.tests} Node tests; ${totals.passed} passed, ${totals.failed} failed, ${totals.cancelled} cancelled, ${totals.skipped} skipped, ${totals.todo} todo</summary><p>Source-defined purpose: ${escape(group.purpose)}</p><div class="table-responsive"><table class="table"><thead><tr><th>Source-defined file purpose</th><th>Node tests</th><th>Passed</th><th>Failed</th><th>Cancelled</th><th>Skipped</th><th>Todo</th><th>Suites</th><th>Top-level entries</th><th>Node file duration (ms; overlaps)</th></tr></thead><tbody>${members.map(row=>{const definition=map.files.find(file=>file.id===row.id);return `<tr data-build-self-check-file="${row.id}"><th scope="row">${escape(definition.label)}<p>${escape(definition.purpose)}</p><small>Source ID: ${row.id}</small></th>${cells(row.counts)}<td>${row.nodeDurationMs}</td></tr>`;}).join('')}</tbody></table></div></details>`;
  }).join('')}</section>`;
}
function renderBuildSelfCheckWorkers(value,options){
  validateBuildSelfChecks(value,options);
  return `<tr data-build-node-workers="true"><th scope="row">Configured Node file workers</th><td>${value===undefined?'Not recorded (Build self-checks not collected)':value.configuredFileWorkers===undefined?'Not recorded':value.configuredFileWorkers+' maximum; not observed concurrency or Playwright workers'}</td></tr>`;
}
// Playwright transforms .mjs CJS requires and cannot compile import.meta. Read
// through the SAME fixed ESM reader in a bounded native Node metadata process.
function readHeldBuildSelfChecksForReport(held) {
  try {
    const path = require('node:path');
    assert.equal(process.versions.node.split('.')[0], '24');
    exact(held, ['path', 'digest']);
    assert(typeof held.path === 'string' && path.isAbsolute(held.path) &&
      path.normalize(held.path) === held.path &&
      path.dirname(held.path) === path.resolve(__dirname, '../.harness-build-self-check') &&
      /^held-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/.test(path.basename(held.path)) &&
      typeof held.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(held.digest));
    const input = JSON.stringify(held);
    assert(Buffer.byteLength(input) <= 4 * 1024);
    const reader = require('node:url').pathToFileURL(path.join(__dirname, 'run-harness-self-check-evidence.mjs')).href;
    const program = `import fs from 'node:fs';import {readHeldBuildSelfChecks} from ${JSON.stringify(reader)};const value=readHeldBuildSelfChecks(JSON.parse(fs.readFileSync(0,'utf8')));process.stdout.write(JSON.stringify({schemaVersion:1,value}));`;
    const result = require('node:child_process').spawnSync(process.execPath, ['--input-type=module', '-e', program], {
      cwd:path.resolve(__dirname, '..'), input, encoding:'utf8',
      env:{PATH:process.env.PATH ?? '', ...Object.fromEntries(['HOME','TMPDIR'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]])), NODE_DISABLE_COMPILE_CACHE:'1'},
      timeout:20 * 1000, maxBuffer:256 * 1024, windowsHide:true,
    });
    assert(!result.error && result.status === 0 && result.signal === null);
    assert(typeof result.stdout === 'string' && Buffer.byteLength(result.stdout) <= 256 * 1024);
    const envelope = JSON.parse(result.stdout);
    exact(envelope, ['schemaVersion', 'value']);
    assert.equal(envelope.schemaVersion, 1);
    validateBuildSelfChecks(envelope.value);
    return envelope.value;
  } catch {
    throw Error('HARNESS_BUILD_SELF_CHECK_REPORT_INVALID');
  }
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
  readSelfCheckPurposeMap,
  renderBuildSelfCheckSummary,
  renderBuildSelfCheckDetails,
  renderBuildSelfCheckWorkers,
  buildSelfCheckReporterOption,
  readHeldBuildSelfChecksForReport,
};
