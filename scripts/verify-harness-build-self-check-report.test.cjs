const {reviewedCsrfDetailChildren}=require('./fixtures/harness-reviewed-csrf-details.mock.cjs');
const test = require("node:test"),
  assert = require("node:assert/strict");
const api = require("./harness-build-self-check-report.cjs");
const fixture = () => ({
  schemaVersion: 2,
  kind: "harness-build-self-checks",
  runId: "self-check-00000000-0000-4000-8000-000000000001",
  status: "passed",
  reason: null,
  nodeVersion: "v24.22.2",
  selectedFiles: 2,
  configuredFileWorkers: 1,
  purposeMapDigest:'sha256:'+require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/harness-self-check-purpose-map.json'))).digest('hex'),
  fileResults:[{id:'unit-native-stage-telemetry',counts:{tests:10,passed:9,failed:0,cancelled:0,skipped:1,todo:0,suites:1,topLevel:2},nodeDurationMs:20},{id:'unit-worker-capabilities',counts:{tests:11,passed:11,failed:0,cancelled:0,skipped:0,todo:0,suites:1,topLevel:1},nodeDurationMs:25}],
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
    "source descriptions, not application/service coverage",
    "not per-assertion events",
    "are not summed",
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
    (v) => delete v.configuredFileWorkers,
    (v) => (v.configuredFileWorkers = null),
    (v) => (v.configuredFileWorkers = 3),
    (v) => (v.configuredFileWorkers = "2"),
    (v) => delete v.fileResults,
    (v) => (v.fileResults=null),
    (v) => v.fileResults.pop(),
    (v) => v.fileResults.reverse(),
    (v) => (v.fileResults[0].id="PRIVATE_CANARY"),
    (v) => (v.fileResults[0].id=v.fileResults[1].id),
    (v) => (v.fileResults[0].nodeDurationMs=NaN),
    (v) => (v.fileResults[0].counts.passed++),
    (v) => (v.purposeMapDigest="sha256:"+"f".repeat(64)),
    (v) => (v.schemaVersion=1),
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
  const f=await require('./fixtures/exui-build-self-check.mock.cjs').buildSelfCheckFixture(t);
  await f.api.runConfiguredSelfChecks();
  const held=f.api.holdBuildSelfChecks();
  const local=require('./fixtures/exui-build-self-check.mock.cjs').fixturePublicReporter(f),Reporter=local.Reporter;
  const root=f.root;
  const previous = process.cwd();
  process.chdir(root);
  t.after(() => {
    process.chdir(previous);

  });
  const source=Reporter.captureDiagnosticSource();
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
  await reporter.prepareBuildSelfChecks(held);
  const projected=reporter.buildSelfChecks;
  const reportApi=local.helper;
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
  assert.deepEqual(record.buildSelfCheckHeld,held);
  if(process.env.SELF_CHECK_COMPAT_NODE20){
    const code=`const Module=require('node:module'),load=Module._load;let calls=0;Module._load=function(name,...args){if(name.endsWith('run-harness-self-check-evidence.mjs'))calls++;return load.call(this,name,...args);};let rejected=false;try{require(${JSON.stringify(local.reporterFile)}).validatePublicReport('harness');}catch(e){if(e.message!=='PUBLIC_ODHIN_INVALID_OR_INCOMPLETE')throw e;rejected=true;}console.log(JSON.stringify({rejected,calls,node:process.version}));`;
    const observed=JSON.parse(require('node:child_process').execFileSync(process.env.SELF_CHECK_COMPAT_NODE20,['-e',code],{cwd:f.root,encoding:'utf8',env:{...process.env,NODE_PATH:path.resolve(__dirname,'../node_modules')}}));assert.equal(observed.rejected,true);assert.equal(observed.calls,0);assert.match(observed.node,/^v20\./);
  }

  assert.equal(record.buildSelfChecks.configuredFileWorkers,1);
  const fresh=JSON.parse(require('node:child_process').execFileSync(process.execPath,['-e',`const r=require(${JSON.stringify(local.reporterFile)}).validatePublicReport('harness');console.log(JSON.stringify({tests:r.buildSelfChecks.counts.tests,workers:r.buildSelfChecks.configuredFileWorkers}));`],{cwd:f.root,encoding:'utf8',env:{...process.env,NODE_PATH:path.resolve(__dirname,'../node_modules')}}));assert.deepEqual(fresh,{tests:2,workers:1});assert.equal(fs.readFileSync(f.callsPath,'utf8').split('spawn').length-1,1,'readback must not run the CLI or a second unit collection');

  assert(!html.includes(held.path));
  for(const change of [v=>{v.buildSelfChecks.counts.tests++;v.buildSelfChecks.counts.passed++;},v=>{delete v.buildSelfCheckHeld;},v=>{v.buildSelfCheckHeld=null;},v=>{v.buildSelfCheckHeld.digest='sha256:'+'f'.repeat(64);},v=>{v.buildSelfChecks.configuredFileWorkers=3;},v=>{v.buildSelfChecks.runId='self-check-11111111-1111-4111-8111-111111111111';},v=>{v.buildSelfChecks.source.selectionDigest='sha256:'+'f'.repeat(64);},v=>{delete v.buildSelfChecks;},v=>{delete v.buildSelfChecks.fileResults;},v=>{v.buildSelfChecks.fileResults[0].counts.tests++;v.buildSelfChecks.fileResults[0].counts.passed++;v.buildSelfChecks.counts.tests++;v.buildSelfChecks.counts.passed++;},v=>{v.buildSelfChecks.fileResults.reverse();}]){
    const value=JSON.parse(recordBytes);change(value);
    const page=require('node-html-parser').parse(html);
    try {
    page.querySelector('#harness-build-self-check-summary').replaceWith(reportApi.renderBuildSelfCheckSummary(value.buildSelfChecks));
    page.querySelector('#harness-build-self-check-details').replaceWith(reportApi.renderBuildSelfCheckDetails(value.buildSelfChecks));
    page.querySelector('[data-build-node-workers]').replaceWith(reportApi.renderBuildSelfCheckWorkers(value.buildSelfChecks));
    } catch(error){assert.match(error.message,/HARNESS_BUILD_SELF_CHECK_REPORT_INVALID/);}
    const forged=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(forged).digest('hex');fs.writeFileSync(htmlPath,forged);fs.writeFileSync(recordPath,JSON.stringify(value));
    assert.throws(()=>Reporter.validatePublicReport('harness'),/^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/);
    fs.writeFileSync(htmlPath,html);fs.writeFileSync(recordPath,recordBytes);
  }

  assert(html.includes("2 Node tests"));
  // Rehashing HTML does not transfer a file/group to another presentation owner.
  for(const mutate of [
    page=>{const row=page.querySelector('[data-build-self-check-file]');page.querySelector('body').appendChild(row.clone());},
    page=>{const row=page.querySelector('[data-build-self-check-file]');row.remove();page.querySelector('body').appendChild(row);},
    page=>{const group=page.querySelector('[data-build-self-check-group]');page.querySelector('body').appendChild(group.clone());},
    page=>{page.querySelector('[data-build-self-check-files]').setAttribute('data-build-self-check-map','sha256:'+'f'.repeat(64));},
    page=>{const row=page.querySelector('[data-build-self-check-file]');row.querySelectorAll('td')[0].set_content('999');},
  ]){
    const page=require('node-html-parser').parse(html);mutate(page);const changed=page.toString();
    const value=JSON.parse(recordBytes);value.sha256=require('node:crypto').createHash('sha256').update(changed).digest('hex');
    fs.writeFileSync(htmlPath,changed);fs.writeFileSync(recordPath,JSON.stringify(value));
    assert.throws(()=>Reporter.validatePublicReport('harness'),/^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/);
    assert.throws(()=>Reporter.resetPublicReport('harness'),/^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/);
  }
  fs.writeFileSync(htmlPath,html);fs.writeFileSync(recordPath,recordBytes);
  for(const name of ['current-request.json']){
    const file=path.join(f.privateRoot,name),original=fs.readFileSync(file);fs.appendFileSync(file,' ');assert.throws(()=>Reporter.validatePublicReport('harness'),/^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/);fs.writeFileSync(file,original);
  }
  const selected=path.join(f.root,f.unitFiles[1]),selectedBytes=fs.readFileSync(selected);fs.appendFileSync(selected,'\n// late selected source change');assert.throws(()=>Reporter.validatePublicReport('harness'),/^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/);fs.writeFileSync(selected,selectedBytes);
  assert(!html.includes(root));
  assert(html.includes("NOT RUN"));
  for (const changed of [
    html.replace('Configured Node file workers</th><td>1 maximum','Configured Node file workers</th><td>2 maximum'),
    html.replace('</body>','<table><tr><th>Configured Node file workers</th><td>999 observed</td></tr></table></body>'),
    html.replace("2 Node tests", "999 Node tests"),
    html.replace(
      "</body>",
      reportApi.renderBuildSelfCheckSummary(projected) + "</body>",
    ),
    html.replace("2 selected files", "3 selected files"),
    html.replace(
      'data-build-self-check-tests="2"',
      'data-build-self-check-tests="3"',
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
      JSON.stringify(pathToFileURL(relative==='./harness-public-odhin-reporter.cjs'?local.reporterFile:path.resolve(__dirname, relative)).href),
    );
  fs.mkdirSync(path.join(root, "scripts"),{recursive:true});
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
    local.collection().runHarnessCollection(
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

  // A new genuine unit run replaces current-request.json; old A must remain
  // invalid for adoption but its exact owned presentation must be retireable.
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(recordPath, recordBytes);
  await f.api.runConfiguredSelfChecks();
  assert.throws(()=>Reporter.validatePublicReport("harness"), /^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/);
  for(const change of [
    v=>{v.buildSelfCheckHeld.extra=true;},
    v=>{v.buildSelfCheckHeld.path=path.join(root,'foreign',path.basename(held.path));},
    v=>{v.buildSelfCheckHeld.path=path.dirname(held.path)+'/alias/../'+path.basename(held.path);},
    v=>{v.buildSelfCheckHeld.path=path.join(path.dirname(held.path),'held-invalid.json');},
    v=>{v.buildSelfCheckHeld.digest='invalid';},
    v=>{v.buildSelfCheckHeld=null;},
    v=>{delete v.buildSelfCheckHeld;},
    v=>{v.buildSelfChecks.counts.passed++;},
  ]){
    const changed=JSON.parse(recordBytes);change(changed);
    fs.writeFileSync(recordPath,JSON.stringify(changed));
    assert.throws(()=>Reporter.resetPublicReport('harness'),/^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/);
    assert(fs.existsSync(htmlPath),'invalid presentation must not be deleted');
  }
  fs.writeFileSync(recordPath,recordBytes);
  if(process.env.SELF_CHECK_COMPAT_NODE20){
    const code=`const Module=require('node:module'),load=Module._load;let calls=0;Module._load=function(name,...args){if(name.endsWith('run-harness-self-check-evidence.mjs')){calls++;throw Error('RETIREMENT_MUST_NOT_REQUIRE_ESM');}return load.call(this,name,...args);};require(${JSON.stringify(local.reporterFile)}).resetPublicReport('harness');console.log(JSON.stringify({calls}));`;
    const result=JSON.parse(require('node:child_process').execFileSync(process.env.SELF_CHECK_COMPAT_NODE20,['-e',code],{cwd:f.root,encoding:'utf8',env:{...process.env,NODE_PATH:path.resolve(__dirname,'../node_modules')}}));
    assert.deepEqual(result,{calls:0});assert(!fs.existsSync(htmlPath));
    fs.writeFileSync(htmlPath,html);fs.writeFileSync(recordPath,recordBytes);
  }
  Reporter.resetPublicReport("harness");
  assert(!fs.existsSync(htmlPath));
  assert(!fs.existsSync(recordPath));
  const nextReporter=new Reporter({selection:'harness',diagnosticSource:source});
  await nextReporter.prepareBuildSelfChecks(f.api.holdBuildSelfChecks());
  await nextReporter.onBegin({projects:[]},{allTests:()=>tests});
  for(let index=0;index<tests.length;index++)await nextReporter.onTestEnd(tests[index],{
    status:'passed',retry:0,duration:2,startTime:new Date('2026-11-06T10:00:00Z'),workerIndex:0,parallelIndex:0,
    steps:methods.methodFor(entries[index]).steps.map(step=>({title:'harness-check:'+step.id,category:'test.step',duration:1,steps:reviewedCsrfDetailChildren(step.id)})),
  });
  await nextReporter.onEnd({status:'passed',startTime:new Date('2026-11-06T10:00:00Z'),duration:1000});
  const next=Reporter.validatePublicReport('harness');
  assert.equal(next.tests,116);assert.notEqual(next.buildSelfChecks.runId,record.buildSelfChecks.runId);});

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
    "#TabDashboard": {after: (section) => { metrics.following = section; }},
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
        createElement: () => ({...make(), after: element => { movedTimeline = element; }}),
        querySelector: (selector) => elements[selector] ?? null,
        querySelectorAll: (selector) =>
          selector.includes("data-catalogue-kind")
            ? [{ dataset: { catalogueAccepted: "39" } }]
            : [],
      },
    },
  );
  return {
    metrics: metrics.following,
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
    fileResults: null,
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
  cancelled.fileResults[1].counts.passed--;
  cancelled.fileResults[1].counts.cancelled++;
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

test('only exact aggregate-only legacy Build report retires and never authenticates as current',async t=>{
 const fs=require('node:fs'),path=require('node:path'),previous=process.cwd(),mock=require('./fixtures/exui-build-self-check.mock.cjs'),f=await mock.buildSelfCheckFixture(t);await f.api.runConfiguredSelfChecks();process.chdir(f.root);t.after(()=>process.chdir(previous));
 const local=mock.fixturePublicReporter(f),Reporter=local.Reporter,source=Reporter.captureDiagnosticSource(),reporter=new Reporter({selection:'harness',diagnosticSource:source});await reporter.prepareBuildSelfChecks(f.api.holdBuildSelfChecks());
 const entries=require('./harness-public-overview.cjs').profiles.harness,methods=require('./harness-public-check-steps.cjs'),tests=entries.map(entry=>({location:{file:path.join(f.root,entry.file)},titlePath:()=>entry.titlePath,retries:0,expectedStatus:'passed'}));reporter.onBegin({}, {allTests:()=>tests});tests.forEach((item,index)=>reporter.onTestEnd(item,{status:'passed',retry:0,duration:2,startTime:new Date('2026-11-06T10:00:00Z'),workerIndex:0,parallelIndex:0,steps:methods.methodFor(entries[index]).steps.map(step=>({title:'harness-check:'+step.id,category:'test.step',duration:1,steps:reviewedCsrfDetailChildren(step.id)}))}));await reporter.onEnd({status:'passed',startTime:new Date('2026-11-06T10:00:00Z'),duration:1000});
 const htmlPath=path.join(f.root,'functional-output/tests/harness/public/odhin/index.html'),recordPath=path.join(f.root,'functional-output/tests/harness/private/public-odhin-harness.json'),value=JSON.parse(fs.readFileSync(recordPath)),page=require('node-html-parser').parse(fs.readFileSync(htmlPath,'utf8'));
 // The immediately previous bound aggregate-only format is retirement-only too.
 const oldBound=structuredClone(value);oldBound.buildSelfChecks.schemaVersion=1;delete oldBound.buildSelfChecks.fileResults;delete oldBound.buildSelfChecks.purposeMapDigest;
 const oldPage=require('node-html-parser').parse(page.toString());
 oldPage.querySelector('#harness-build-self-check-summary').replaceWith(local.helper.renderBuildSelfCheckSummary(oldBound.buildSelfChecks,{retiringPreviousRun:true}));
 oldPage.querySelector('#harness-build-self-check-details').replaceWith(local.helper.renderBuildSelfCheckDetails(oldBound.buildSelfChecks,{retiringPreviousRun:true}));
 const oldHtml=oldPage.toString();oldBound.sha256=require('node:crypto').createHash('sha256').update(oldHtml).digest('hex');
 fs.writeFileSync(htmlPath,oldHtml);fs.writeFileSync(recordPath,JSON.stringify(oldBound));
 assert.throws(()=>Reporter.validatePublicReport('harness'),/^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/);
 const badBound=structuredClone(oldBound);badBound.buildSelfCheckHeld.path=path.join(f.root,'foreign',path.basename(oldBound.buildSelfCheckHeld.path));fs.writeFileSync(recordPath,JSON.stringify(badBound));assert.throws(()=>Reporter.resetPublicReport('harness'),/^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/);
 fs.writeFileSync(recordPath,JSON.stringify(oldBound));Reporter.resetPublicReport('harness');assert(!fs.existsSync(htmlPath));
 // Synthetic exact previous presentation: remove only the two new rows and private binding fields.
 const rows=page.querySelectorAll('tr').filter(row=>row.querySelector('th')?.textContent==='Configured Node file workers');assert.equal(rows.length,2);rows.forEach(row=>row.remove());delete value.buildSelfCheckHeld;delete value.buildSelfChecks.configuredFileWorkers;value.buildSelfChecks.schemaVersion=1;delete value.buildSelfChecks.fileResults;delete value.buildSelfChecks.purposeMapDigest;page.querySelector('#harness-build-self-check-summary').replaceWith(local.helper.renderBuildSelfCheckSummary(value.buildSelfChecks,{retiringPreviousRun:true}));page.querySelector('#harness-build-self-check-details').replaceWith(local.helper.renderBuildSelfCheckDetails(value.buildSelfChecks,{retiringPreviousRun:true}));const html=page.toString();value.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');const record=JSON.stringify(value);fs.writeFileSync(htmlPath,html);fs.writeFileSync(recordPath,record);
 assert.throws(()=>Reporter.validatePublicReport('harness'),/^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/);
 if(process.env.SELF_CHECK_COMPAT_NODE20){const code=`const Module=require('node:module'),load=Module._load;let calls=0;Module._load=function(name,...args){if(name.endsWith('run-harness-self-check-evidence.mjs')){calls++;throw Error('LEGACY_MUST_NOT_REQUIRE_ESM');}return load.call(this,name,...args);};require(${JSON.stringify(local.reporterFile)}).resetPublicReport('harness');console.log(JSON.stringify({calls,removed:!require('node:fs').existsSync(${JSON.stringify(htmlPath)})}));`;const result=JSON.parse(require('node:child_process').execFileSync(process.env.SELF_CHECK_COMPAT_NODE20,['-e',code],{cwd:f.root,encoding:'utf8',env:{...process.env,NODE_PATH:path.resolve(__dirname,'../node_modules')}}));assert.deepEqual(result,{calls:0,removed:true});fs.writeFileSync(htmlPath,html);fs.writeFileSync(recordPath,record);}
 const changed=html.replace('2 Node tests','999 Node tests'),tampered=JSON.parse(record);tampered.sha256=require('node:crypto').createHash('sha256').update(changed).digest('hex');fs.writeFileSync(htmlPath,changed);fs.writeFileSync(recordPath,JSON.stringify(tampered));assert.throws(()=>Reporter.resetPublicReport('harness'),/^Error: PUBLIC_ODHIN_INVALID_OR_INCOMPLETE$/);
 fs.writeFileSync(htmlPath,html);fs.writeFileSync(recordPath,record);Reporter.resetPublicReport('harness');assert(!fs.existsSync(htmlPath));assert(!fs.existsSync(recordPath));
});

test('append-only purpose map retirement preserves genuine old schema2 report while current new Build stays strict',async t=>{
 const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),mock=require('./fixtures/exui-build-self-check.mock.cjs'),f=await mock.buildSelfCheckFixture(t),previous=process.cwd();process.chdir(f.root);t.after(()=>process.chdir(previous));
 const mapFile=path.join(f.root,'scripts/fixtures/harness-self-check-purpose-map.json'),unitFile=path.join(f.root,'scripts/fixtures/harness-unit-files.json');
 const map=JSON.parse(fs.readFileSync(mapFile));fs.writeFileSync(mapFile,JSON.stringify(map,null,2)+'\n');
 const git=()=>{cp.execFileSync('git',['add','scripts/fixtures'],{cwd:f.root});cp.execFileSync('git',['-c','user.name=Synthetic Fixture','-c','user.email=fixture@harness.example.com','commit','-qm','test: source-owned tiny unit selection'],{cwd:f.root});};git();
 const local=mock.fixturePublicReporter(f),Reporter=local.Reporter,entries=require('./harness-public-overview.cjs').profiles.harness,methods=require('./harness-public-check-steps.cjs'),tests=entries.map((entry,i)=>({id:String(i),titlePath:()=>entry.titlePath,location:{file:path.join(f.root,entry.file)},retries:0,expectedStatus:'passed'}));
 const publish=async held=>{const r=new Reporter({selection:'harness',diagnosticSource:Reporter.captureDiagnosticSource()});await r.prepareBuildSelfChecks(held);r.onBegin({}, {allTests:()=>tests});tests.forEach((item,i)=>r.onTestEnd(item,{status:'passed',retry:0,duration:2,startTime:new Date('2026-11-06T10:00:00Z'),workerIndex:0,parallelIndex:0,steps:methods.methodFor(entries[i]).steps.map(step=>({title:'harness-check:'+step.id,category:'test.step',duration:1,steps:reviewedCsrfDetailChildren(step.id)}))}));await r.onEnd({status:'passed',startTime:new Date('2026-11-06T10:00:00Z'),duration:1000});};
 await f.api.runConfiguredSelfChecks();const heldA=f.api.holdBuildSelfChecks(),oldProjection=f.api.readHeldBuildSelfChecks(heldA);await publish(heldA);
 const file=path.join(f.root,'functional-output/tests/harness/private/public-odhin-harness.json'),html=path.join(f.root,'functional-output/tests/harness/public/odhin/index.html'),oldRecord=fs.readFileSync(file),oldHtml=fs.readFileSync(html);
 const added='scripts/third-synthetic.test.cjs';fs.writeFileSync(path.join(f.root,added),"require('node:test').test('third synthetic',()=>{});");const files=JSON.parse(fs.readFileSync(unitFile));files.push(added);fs.writeFileSync(unitFile,JSON.stringify(files));map.files.push({file:added,id:'unit-fixture-2',label:'Third fixture',group:'fixture-checks',purpose:'Checks the appended synthetic unit body.'});fs.writeFileSync(mapFile,JSON.stringify(map,null,2)+'\n');git();
 await f.api.runConfiguredSelfChecks();const heldB=f.api.holdBuildSelfChecks();assert.equal(f.api.readHeldBuildSelfChecks(heldB).selectedFiles,3);assert.throws(()=>Reporter.validatePublicReport('harness'),/PUBLIC_ODHIN/);assert.throws(()=>local.helper.validateBuildSelfChecks(oldProjection),/HARNESS_BUILD_SELF_CHECK_REPORT_INVALID/);
 for(const change of [v=>v.files[0].label='Edited label',v=>v.groups[0].purpose='Edited group',v=>v.files.reverse()]){const bad=structuredClone(map);change(bad);fs.writeFileSync(mapFile,JSON.stringify(bad,null,2)+'\n');assert.throws(()=>Reporter.resetPublicReport('harness'),/PUBLIC_ODHIN/);assert(fs.existsSync(html));}
 fs.writeFileSync(mapFile,JSON.stringify(map,null,2)+'\n');
 // A foreign/noncanonical predecessor digest cannot be reconstructed by guessing.
 const forged=JSON.parse(oldRecord);forged.buildSelfChecks.purposeMapDigest='sha256:'+require('node:crypto').createHash('sha256').update(JSON.stringify({...map,files:map.files.slice(0,2)})).digest('hex');fs.writeFileSync(file,JSON.stringify(forged));assert.throws(()=>Reporter.resetPublicReport('harness'),/PUBLIC_ODHIN/);fs.writeFileSync(file,oldRecord);assert.deepEqual(fs.readFileSync(html),oldHtml);
 Reporter.resetPublicReport('harness');assert(!fs.existsSync(html));await publish(heldB);assert.equal(Reporter.validatePublicReport('harness').buildSelfChecks.selectedFiles,3);
});


test('genuine held Build readback survives installed Playwright transforms and rejects raw drift', async t => {
  const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
  const mock = require('./fixtures/exui-build-self-check.mock.cjs');
  const f = await mock.buildSelfCheckFixture(t);
  await f.api.runConfiguredSelfChecks();
  const held = f.api.holdBuildSelfChecks(), expected = f.api.readHeldBuildSelfChecks(held);
  const local = mock.fixturePublicReporter(f);
  const helper = path.join(f.root, 'scripts/harness-build-self-check-report.cjs');
  const transform = path.resolve(__dirname, '../node_modules/playwright/lib/common/index.js');
  const callsBefore = fs.readFileSync(f.callsPath, 'utf8');
  const program = `const assert=require('node:assert/strict');const fs=require('node:fs');const held=${JSON.stringify(held)};const helper=require(${JSON.stringify(helper)});require(${JSON.stringify(transform)}).transform.installTransformIfNeeded();const actual=helper.readHeldBuildSelfChecksForReport(held);assert.deepEqual(actual,${JSON.stringify(expected)});console.log('INSTALLED_TRANSFORM_HELD_READBACK_PASSED');`;
  const result = cp.spawnSync(process.execPath, ['-e', program], { cwd:f.root, encoding:'utf8', timeout:20*1000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'INSTALLED_TRANSFORM_HELD_READBACK_PASSED');
  assert.equal(fs.readFileSync(f.callsPath, 'utf8'), callsBefore, 'metadata read never invokes the collector CLI or its owned test child');
  for (const fault of ['digest', 'path', 'raw']) {
    const value = structuredClone(held), request = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(held.path)).requestPath));
    const raw = path.join(request.directory, 'raw-junit.xml'), before = fs.readFileSync(raw);
    if (fault === 'digest') value.digest = 'sha256:'+'f'.repeat(64);
    if (fault === 'path') value.path = path.join(path.dirname(held.path), 'held-00000000-0000-4000-8000-000000000000.json');
    if (fault === 'raw') fs.appendFileSync(raw, ' ');
    try { assert.throws(() => local.helper.readHeldBuildSelfChecksForReport(value), /HARNESS_BUILD_SELF_CHECK_REPORT_INVALID/, fault); }
    finally { fs.writeFileSync(raw, before); }
  }
  assert.deepEqual(local.helper.readHeldBuildSelfChecksForReport(held), expected);
});


test('held Build metadata transport is fixed bounded and rejects malformed or interrupted child output', async t => {
  const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
  const mock = require('./fixtures/exui-build-self-check.mock.cjs'), f = await mock.buildSelfCheckFixture(t);
  await f.api.runConfiguredSelfChecks();
  const held = f.api.holdBuildSelfChecks(), expected = f.api.readHeldBuildSelfChecks(held), local = mock.fixturePublicReporter(f);
  const original = cp.spawnSync, healthy = {status:0,signal:null,stdout:JSON.stringify({schemaVersion:1,value:expected})};
  let reply = healthy, calls = 0;
  try {
    cp.spawnSync = (command, argv, options) => {
      calls++;
      assert.equal(command, process.execPath);assert.deepEqual(argv.slice(0,2), ['--input-type=module','-e']);assert.equal(argv.length,3);
      assert(argv[2].includes('readHeldBuildSelfChecks'));assert(!argv[2].includes(held.path));
      assert.deepEqual(JSON.parse(options.input),held);assert.equal(options.cwd,f.root);
      assert.equal(options.timeout,20*1000);assert.equal(options.maxBuffer,256*1024);assert.equal(options.shell,undefined);
      assert.deepEqual(Object.keys(options.env).sort(),['NODE_DISABLE_COMPILE_CACHE','PATH',...['HOME','TMPDIR'].filter(key=>process.env[key]!==undefined)].sort());
      for(const key of ['HOME','TMPDIR'])assert.equal(options.env[key],process.env[key]);
      return reply;
    };
    assert.deepEqual(local.helper.readHeldBuildSelfChecksForReport(held),expected);
    for (const bad of [
      {...healthy,error:Error('private canary')}, {...healthy,status:1,stderr:'private canary'},
      {...healthy,signal:'SIGTERM'}, {...healthy,stdout:'not JSON'},
      {...healthy,stdout:JSON.stringify({schemaVersion:1,value:expected,extra:true})},
      {...healthy,stdout:JSON.stringify({schemaVersion:2,value:expected})},
      {...healthy,stdout:JSON.stringify({schemaVersion:1,value:{...expected,selectedFiles:0}})},
      {...healthy,stdout:'x'.repeat(256*1024+1)},
    ]) {
      reply=bad;assert.throws(()=>local.helper.readHeldBuildSelfChecksForReport(held),e=>e.message==='HARNESS_BUILD_SELF_CHECK_REPORT_INVALID');
    }
    const before=calls;assert.throws(()=>local.helper.readHeldBuildSelfChecksForReport({...held,extra:true}),/HARNESS_BUILD_SELF_CHECK_REPORT_INVALID/);assert.equal(calls,before);
  } finally { cp.spawnSync=original; }
});
