const { test } = require("node:test");
const assert = require("node:assert/strict");
const api = () => require("./lib/exui-native-stage-telemetry.cjs");
function step(id, duration = 1, error) {
  return {
    category: "test.step",
    title: "harness-assertion:" + id,
    duration,
    error,
    annotations: [],
    steps: [],
  };
}
function record(id, steps, duration = 100) {
  const { NativeStageRecorder } = api(),
    r = new NativeStageRecorder(),
    result = { duration };
  for (const s of steps) {
    r.begin(id, result, s);
    r.end(id, result, s);
  }
  return r.finish(id, result);
}
test("WA repeated stage instances preserve actual order/duration without adding tests or duration sums", () => {
  const stages = [
    step("family-membership", 2),
    ...Array.from({ length: 7 }, (_, i) => step("family-filter", i + 3)),
  ];
  const got = record("wa-family-options", stages, 90);
  assert.equal(got.availability, "recorded");
  assert.equal(got.testDurationMs, 90);
  assert.equal(got.stages.length, 8);
  assert.deepEqual(
    got.stages.map((s) => s.ordinal),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.deepEqual(
    got.stages.slice(1).map((s) => s.instance),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.deepEqual(
    got.stages.map((s) => s.durationMs),
    [2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert(
    got.stages.every((s) => s.outcome === "completed-without-reported-error"),
  );
});
test("expected fault retains actual failed stage and never fabricates unreached filter stages", () => {
  const got = record("wa-missing-family", [
    step("family-membership", 12, {
      message: "PRIVATE_COOKIE_CANARY",
      stack: "PRIVATE_STACK",
    }),
  ]);
  assert.equal(got.stages.length, 1);
  assert.equal(got.stages[0].outcome, "reported-error");
  assert.equal(got.stages[0].stageId, "family-membership");
  assert(!JSON.stringify(got).includes("PRIVATE"));
});
test("unknown malformed duplicate and unfinished events fail closed for display, while legacy remains absent", () => {
  const { NativeStageRecorder, readStageTelemetry, assertStageTelemetry } =
    api();
  assert.equal(readStageTelemetry("wa-family-options", undefined), undefined);
  for (const s of [
    step("PRIVATE_COOKIE_CANARY"),
    step("family-filter", -1),
    step("family-filter", NaN),
  ])
    assert.equal(record("wa-family-options", [s]).availability, "unavailable");
  const r = new NativeStageRecorder(),
    result = { duration: 0 },
    s = step("family-filter", 0);
  r.begin("wa-family-options", result, s);
  r.end("wa-family-options", result, s);
  r.end("wa-family-options", result, s);
  assert.equal(
    r.finish("wa-family-options", result).availability,
    "unavailable",
  );
  const unfinished = new NativeStageRecorder();
  unfinished.begin("wa-family-options", result, s);
  assert.equal(
    unfinished.finish("wa-family-options", result).availability,
    "unavailable",
  );
  const good = record("wa-family-options", [step("family-filter", 0)], 0);
  assert.equal(good.testDurationMs, 0);
  assertStageTelemetry("wa-family-options", good);
  for (const mutate of [
    (x) => (x.stages[0].ordinal = 2),
    (x) => (x.stages[0].instance = 2),
    (x) => (x.stages[0].stageId = "PRIVATE_COOKIE_CANARY"),
    (x) => (x.stages[0].raw = "PRIVATE_COOKIE_CANARY"),
    (x) => (x.testDurationMs = -1),
    (x) => (x.stages = []),
    (x) => {
      x.testDurationMs = 0;
      x.stages[0].durationMs = 2;
    },
    (x) => (x.stages[0].outcome = "passed"),
  ]) {
    const x = structuredClone(good);
    mutate(x);
    assert.throws(() => assertStageTelemetry("wa-family-options", x));
    assert.equal(
      readStageTelemetry("wa-family-options", x).availability,
      "unavailable",
    );
  }
});
test("hook/fixture ancestry and arbitrary API metadata stay excluded; skipped annotation is explicit", () => {
  const s = step("family-filter");
  s.parent = { category: "hook" };
  s.params = { cookie: "PRIVATE_COOKIE_CANARY" };
  s.attachments = [{ body: "PRIVATE_BODY" }];
  assert.equal(record("wa-family-options", [s]).reason, "NO_NAMED_STAGES");
  const skipped = step("family-filter");
  skipped.annotations = [{ type: "skip", description: "PRIVATE_REASON" }];
  const got = record("wa-family-options", [skipped]);
  assert.equal(got.stages[0].outcome, "skipped");
  assert(!JSON.stringify(got).includes("PRIVATE"));
});
test("actual browser-free Playwright1.65 events preserve completed/skipped/error stages and existing failure attribution", (t) => {
  const fs = require("node:fs"),
    path = require("node:path"),
    os = require("node:os"),
    { spawnSync } = require("node:child_process");
  const root = path.resolve(__dirname, ".."),
    dir = fs.mkdtempSync(
      path.join(root, "scripts/fixtures/stage-smoke-owned-"),
    ),
    privateRoot = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "stage-smoke-output-"),
    );
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(privateRoot, { recursive: true, force: true });
  });
  const reporter = path.join(
      root,
      "scripts/lib/exui-playwright-evidence-reporter.mjs",
    ),
    report = path.join(privateRoot, "report.json"),
    context = path.join(privateRoot, "context.json");
  fs.writeFileSync(context, JSON.stringify({runId:"synthetic-event-run",invocationId:"synthetic-event-invocation"}), { mode: 0o600 });
  fs.writeFileSync(
    path.join(dir, "smoke.spec.cjs"),
    require("./fixtures/exui-native-stage-telemetry.mock.cjs").browserFreeSpec + require("./fixtures/exui-native-stage-telemetry.mock.cjs").postalBrowserFreeSpec + require("./fixtures/exui-native-stage-telemetry.mock.cjs").scalarBrowserFreeSpec,
  );
  const config = path.join(dir, "playwright.config.cjs");
  fs.writeFileSync(
    config,
    "module.exports=" +
      JSON.stringify({
        testDir: dir,
        testMatch: "smoke.spec.cjs",
        outputDir: path.join(privateRoot, "output"),
        workers: 1,
        retries: 0,
        reporter: [[reporter]],
      }) +
      ";",
  );
  const terminal = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/playwright/cli.js"),
      "test",
      "--config",
      config,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 20 * 1000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        EXUI_EVIDENCE_CONTEXT: context,
        EXUI_EVIDENCE_REPORT: report,
      },
    },
  );
  assert.equal(terminal.signal, null);
  assert.equal(terminal.status, 1);
  assert(!terminal.error);
  const raw = JSON.parse(fs.readFileSync(report));
  assert.deepEqual(raw.globalErrors, []);
  assert.equal(raw.tests.length, 11);
  const [healthy, fault, unknown] = raw.tests;
  assert.equal(healthy.status, "passed");
  assert.equal(healthy.recordedExecution.stages.length, 9);
  assert(healthy.recordedExecution.testDurationMs >= 0);
  assert(
    healthy.recordedExecution.stages
      .slice(0, 8)
      .every((s) => s.outcome === "completed-without-reported-error"),
  );
  assert.equal(healthy.recordedExecution.stages[8].outcome, "skipped");
  assert.equal(healthy.recordedExecution.stages[8].instance, 8);
  assert.equal(fault.failureId, "family-membership");
  assert.equal(fault.unattributedErrors, 0);
  assert.equal(fault.status, "failed");
  assert.equal(fault.recordedExecution.stages.length, 1);
  assert.equal(fault.recordedExecution.stages[0].outcome, "reported-error");
  assert.equal(unknown.recordedExecution.availability, "unavailable");
  assert.equal(unknown.recordedExecution.reason, "UNKNOWN_STAGE");
  assert(!JSON.stringify(raw).includes("PRIVATE_"));
  const [postal,postalFault,actionFault,skipped,wholeSkip]=raw.tests.slice(3);
  assert.equal(postal.recordedDetail.groups.length,12);assert.equal(postal.status,'passed');
  assert.equal(postalFault.failureId,'postal-persistence');assert.equal(postalFault.unattributedErrors,0);assert.equal(postalFault.recordedDetail.groups.at(-1).outcome,'reported-error');
  assert.equal(actionFault.failureId,null);assert.equal(actionFault.unattributedErrors,1);assert.equal(actionFault.recordedDetail.groups.length,1);
  assert.equal(skipped.recordedDetail.groups[0].outcome,'skipped');assert.equal(skipped.recordedDetail.groups[1].outcome,'reported-error');
  assert.equal(wholeSkip.status,'skipped');assert.equal(wholeSkip.recordedDetail.availability,'unavailable');
  const [scalar,missingScalar]=raw.tests.slice(8);
  assert.equal(scalar.failureId,'nested-persistence');assert.equal(scalar.businessScalars.scalars.recipientCount.value,1);assert.equal(scalar.businessScalars.scalars.emailAddressPresent.value,false);assert.equal(missingScalar.businessScalars.availability,'unavailable');
  const measuredIa=raw.tests[10];assert.equal(measuredIa.failureId,'organisation-scope');assert.deepEqual(measuredIa.businessScalars.scalars.visibleServices.value,['IA','CIVIL']);assert.equal(measuredIa.businessScalars.scalars.responseStatus.state,'not-reached');
  assert.equal(require("@playwright/test/package.json").version, "1.65.0");
});
test("finite stage catalogue covers exactly the current core baseline and mutation proof inventory", async () => {
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { assertStageTelemetry } = api();
  for (const scope of [
    "exui-wa-family-pilot",
    "exui-wa-scope-pilot",
    "exui-ccd-pilot",
    "exui-ccd-event-capability-pilot",
    "exui-decentralised-routing-pilot",
    "exui-ccd-recipient-callback-pilot",
    "exui-ccd-selector-event-row-pilot",
  ]) {
    const p = getReleasePolicy(scope);
    for (const id of [
      ...p.obligations.flatMap((o) => o.requiredProofIds),
      ...p.mutationDefinitions.map((d) => d.mutantProofId),
    ])
      assertStageTelemetry(id, {
        schemaVersion: 1,
        availability: "unavailable",
        reason: "NO_NAMED_STAGES",
      });
  }
});

test("at most one millisecond of independently measured step/test rounding is accepted, never summed", () => {
  const { readStageTelemetry } = api();
  const borderline = record("wa-family-options", [step("family-filter", 1)], 0);
  assert.equal(borderline.availability, "recorded");
  const tooLarge = record("wa-family-options", [step("family-filter", 2)], 0);
  assert.equal(tooLarge.availability, "unavailable");
  assert.equal(tooLarge.reason, "INVALID_STAGE_TELEMETRY");
  const nested = record(
    "wa-family-options",
    [step("family-membership", 10), step("family-filter", 10)],
    10,
  );
  assert.equal(
    readStageTelemetry("wa-family-options", nested).availability,
    "recorded",
  );
});

test('postal detail records finite actual groups independently of assertion authority and legacy absence',()=>{
 const {PostalDetailRecorder,readPostalDetail}=api(),{postalGroups,postalStep}=require('./fixtures/exui-native-stage-telemetry.mock.cjs');
 const result={duration:100,status:'passed'},r=new PostalDetailRecorder();
 postalGroups.forEach(id=>{const s=postalStep(id);r.begin('ccd-postal-two-roundtrip',result,s);r.end('ccd-postal-two-roundtrip',result,s);});
 const got=r.finish('ccd-postal-two-roundtrip',result);
 assert.equal(got.availability,'recorded');assert.deepEqual(got.groups.map(g=>g.groupId),postalGroups);
 assert(got.groups.every(g=>g.outcome==='completed-without-reported-error'));assert.equal(readPostalDetail('ccd-postal-two-roundtrip',undefined),undefined);
 assert.equal(r.finish('wa-family-options',result),undefined);
 const {renderNativeEvidence}=require('./harness-native-report.cjs');assert.equal(typeof renderNativeEvidence,'function');
});
test('postal detail retains only real failed prefix and skip/error outcomes without secrets',()=>{
 const {PostalDetailRecorder}=api(),{postalGroups,postalStep}=require('./fixtures/exui-native-stage-telemetry.mock.cjs');
 const result={duration:10,status:'failed'},r=new PostalDetailRecorder();
 postalGroups.slice(0,5).forEach((id,i)=>{const s=postalStep(id,i===2?{annotations:[{type:'skip',description:'PRIVATE_COOKIE'}]}:i===4?{error:{message:'PRIVATE_TOKEN',stack:'PRIVATE_STACK'}}:{});r.begin('ccd-postal-child-loss',result,s);r.end('ccd-postal-child-loss',result,s);});
 const got=r.finish('ccd-postal-child-loss',result);assert.equal(got.availability,'recorded');assert.equal(got.groups.length,5);assert.equal(got.groups[2].outcome,'skipped');assert.equal(got.groups[4].outcome,'reported-error');assert(!JSON.stringify(got).includes('PRIVATE'));
});
test('postal detail rejects missing lifecycle duplicate unknown nested reordered malformed and passed partial events',()=>{
 const {PostalDetailRecorder,readPostalDetail,assertPostalDetail}=api(),{postalGroups,postalStep}=require('./fixtures/exui-native-stage-telemetry.mock.cjs');
 const proof='ccd-postal-two-roundtrip';
 for(const mode of ['no-events','end-only','unfinished','duplicate-begin','duplicate-end','unknown','wrong-order','nested','negative','nan','oversized','prefix-lookalike','passed-partial']){
  const r=new PostalDetailRecorder(),result={duration:10,status:mode==='passed-partial'?'passed':'failed'},s=postalStep(postalGroups[0]);
  if(mode==='unknown')s.title='harness-detail:PRIVATE_UNKNOWN';if(mode==='wrong-order')s.title='harness-detail:'+postalGroups[1];if(mode==='negative')s.duration=-1;if(mode==='nan')s.duration=NaN;if(mode==='oversized')s.duration=12;if(mode==='prefix-lookalike')s.title='harness-detail:postal-required-fields';
  if(!['no-events','end-only'].includes(mode))r.begin(proof,result,s);
  if(mode==='duplicate-begin')r.begin(proof,result,s);
  if(mode==='nested')r.begin(proof,result,postalStep(postalGroups[1]));
  if(!['no-events','unfinished'].includes(mode))r.end(proof,result,s);
  if(mode==='duplicate-end')r.end(proof,result,s);
  assert.equal(r.finish(proof,result).availability,'unavailable',mode);
 }
 const good={schemaVersion:1,availability:'recorded',scope:'postal-action-check-groups',testDurationMs:5,groups:[{ordinal:1,groupId:postalGroups[0],outcome:'reported-error',durationMs:1}]};assertPostalDetail(proof,good);
 for(const mutate of [v=>v.groups[0].ordinal=2,v=>v.groups[0].groupId='PRIVATE_FOREIGN',v=>v.groups[0].outcome='passed',v=>v.groups[0].raw='PRIVATE_TOKEN',v=>v.groups.push({...v.groups[0],ordinal:2}),v=>v.testDurationMs=-1,v=>v.groups=[]]){const v=structuredClone(good);mutate(v);assert.equal(readPostalDetail(proof,v).availability,'unavailable');}
 assert.equal(readPostalDetail('wa-family-options',good).availability,'unavailable');
});

test('sequential postal durations cannot multiply the measured enclosing test duration',()=>{
 const {readPostalDetail,assertPostalDetail}=api(),ids=require('./fixtures/exui-native-stage-telemetry.mock.cjs').postalGroups;
 const value={schemaVersion:1,availability:'recorded',scope:'postal-action-check-groups',testDurationMs:1000,groups:ids.map((groupId,i)=>({ordinal:i+1,groupId,outcome:'completed-without-reported-error',durationMs:1000}))};
 assert.throws(()=>assertPostalDetail('ccd-postal-two-roundtrip',value),/PUBLIC_POSTAL_DETAIL_SEQUENTIAL_DURATION/);
 assert.equal(readPostalDetail('ccd-postal-two-roundtrip',value).availability,'unavailable');
});
test('sequential postal duration bound allows conservative integer rounding and rejects the next millisecond',()=>{
 const {readPostalDetail}=api(),ids=require('./fixtures/exui-native-stage-telemetry.mock.cjs').postalGroups;
 const value={schemaVersion:1,availability:'recorded',scope:'postal-action-check-groups',testDurationMs:1000,groups:ids.map((groupId,i)=>({ordinal:i+1,groupId,outcome:'completed-without-reported-error',durationMs:i===11?89:84}))};
 // 1013 = 1000 enclosing +12 independently rounded step deltas +1 truncated test delta.
 assert.equal(value.groups.reduce((n,g)=>n+g.durationMs,0),1013);
 assert.equal(readPostalDetail('ccd-postal-two-roundtrip',value).availability,'recorded');
 value.groups[11].durationMs++;assert.equal(readPostalDetail('ccd-postal-two-roundtrip',value).availability,'unavailable');
 const zero={...value,testDurationMs:0,groups:value.groups.map(g=>({...g,durationMs:1}))};assert.equal(readPostalDetail('ccd-postal-two-roundtrip',zero).availability,'recorded');
 zero.groups[0].durationMs=2;assert.equal(readPostalDetail('ccd-postal-two-roundtrip',zero).availability,'unavailable');
 const prefix={...value,testDurationMs:10,groups:[{...value.groups[0],durationMs:11,outcome:'reported-error'}]};assert.equal(readPostalDetail('ccd-postal-child-loss',prefix).availability,'recorded');
});

test('public native renderer rejects impossible postal sequential duration while raw projection is unavailable',async t=>{
 const f=await require('./fixtures/exui-native-report-packet.mock.cjs').fixture(t,{postalDetail:true});
 const evidence=await(await import('./lib/exui-native-report-evidence.mjs')).readNativeReportEvidence(f.descriptorPath);
 const proof=evidence.phases.find(p=>p.phase==='ccd').baselineProofs.find(p=>p.proofId==='ccd-postal-two-roundtrip');
 const forged=structuredClone(proof.recordedDetail);forged.testDurationMs=1000;forged.groups.forEach(g=>g.durationMs=1000);
 assert.equal(api().readPostalDetail(proof.proofId,forged).availability,'unavailable');proof.recordedDetail=forged;
 assert.throws(()=>require('./harness-native-report.cjs').renderNativeEvidence(evidence),/PUBLIC_POSTAL_DETAIL_SEQUENTIAL_DURATION/);
});
