const {reviewedCsrfDetailChildren}=require('./fixtures/harness-reviewed-csrf-details.mock.cjs');
// Fake presentation events use the independently reviewed literal IDs, not validator output.
function reviewedFixtureSteps(test) {
  const path = require('node:path');
  const file = path.relative(process.cwd(), test.location.file).split(path.sep).join('/');
  const method = require('./fixtures/harness-public-check-methods.json').checks.find(row => row.file === file && JSON.stringify(row.titlePath.slice(3)) === JSON.stringify(test.titlePath().slice(3)));
  if (!method) throw new Error('REVIEWED_PRESENTATION_FIXTURE_IDENTITY_MISSING');
  return method.steps.map(({id}) => ({title:'harness-check:' + id, category:'test.step', duration:1, steps:reviewedCsrfDetailChildren(id)}));
}
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const api = () => import("./run-harness-assurance.mjs");
const passedProfileRequest = Object.freeze({path:'/private/profile.json',digest:'sha256:'+'a'.repeat(64),runId:'divorce-11111111-1111-4111-8111-111111111111'});

test("contradictory native status and missing diagnostic exit cannot become success", async () => {
  const { runAssuranceSequence } = await api();
  let prepared = false;
  await assert.rejects(
    () =>
      runAssuranceSequence({
        native: async () => ({ status: "BLOCKED", exitCode: 0, continuationSafe: true }),
        descriptor: async () => {
          prepared = true;
        },
        collect: async () => ({ status: "passed", exitCode: 0 }),
      }),
    /NATIVE_VERDICT_REQUIRED/,
  );
  assert.equal(prepared, false);
  await assert.rejects(
    () =>
      runAssuranceSequence({
        native: async () => ({ status: "PASS", exitCode: 0, continuationSafe: true }),
        descriptor: async () => "/owned/request.json",
        collect: async () => ({ status: "passed" }),
      }),
    /DIAGNOSTIC_VERDICT_REQUIRED/,
  );
});

test("blocked native policy remains blocked despite a passing diagnostic collection", async () => {
  const { runAssuranceSequence } = await api();
  const order = [];
  const phaseTimings = [{ label: "WA family", status: "PASS", startedAt: "2026-11-05T10:00:00.000Z", durationMs: 1000 }];
  const result = await runAssuranceSequence({
    native: async () => {
      order.push("native");
      return { status: "BLOCKED", exitCode: 2, continuationSafe: true, phaseTimings };
    },
    descriptor: async (verdict) => {
      assert.equal(verdict.status, "BLOCKED");
      order.push("descriptor");
      return "/owned/request.json";
    },
    collect: async (file, timing) => {
      assert.equal(file, "/owned/request.json");
      assert.ok(Number.isSafeInteger(timing.nativeElapsedMs) && timing.nativeElapsedMs >= 0);
      assert.equal(timing.phaseTimings, phaseTimings);
      order.push("collect");
      return { status: "passed", exitCode: 0 };
    },
  });
  assert.deepEqual(order, ["native", "descriptor", "collect"]);
  assert.deepEqual(result, {
    nativeStatus: "BLOCKED",
    diagnosticStatus: "passed",
    exitCode: 2,
    releaseApproval: false,
  });
});
test("nonpassing native execution without complete evidence still publishes diagnostics without native credit", async () => {
  const { runAssuranceSequence } = await api();
  for (const [status, exitCode] of [["BLOCKED", 2], ["FAIL", 1]]) {
    const result = await runAssuranceSequence({
      native: async () => ({ status, exitCode, continuationSafe: true }),
      descriptor: async () => { throw Error("INCOMPLETE"); },
      collect: async (file) => {
        assert.equal(file, undefined, "incomplete native evidence must receive no report credit");
        return { status: "passed", exitCode: 0 };
      },
    });
    assert.deepEqual(result, {
      nativeStatus: status,
      diagnosticStatus: "passed",
      exitCode,
      releaseApproval: false,
    });
  }
});

test("passing native outcome with incomplete evidence cannot publish a green report", async () => {
  const { runAssuranceSequence } = await api();
  await assert.rejects(() => runAssuranceSequence({
    native: async () => ({ status: "PASS", exitCode: 0, continuationSafe: true }),
    descriptor: async () => { throw Error("INCOMPLETE"); },
    collect: async () => ({ status: "passed", exitCode: 0 }),
  }), /INCOMPLETE/);
});
test("diagnostic failure also prevents a passing combined command", async () => {
  const { runAssuranceSequence } = await api();
  const result = await runAssuranceSequence({
    native: async () => ({ status: "PASS", exitCode: 0, continuationSafe: true }),
    descriptor: async () => "/owned/request.json",
    collect: async () => ({ status: "failed", exitCode: 1 }),
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.releaseApproval, false);
});
test("contradictory diagnostic failure with exit zero is rejected", async () => {
  const { runAssuranceSequence } = await api();
  await assert.rejects(
    () =>
      runAssuranceSequence({
        native: async () => ({ status: "PASS", exitCode: 0, continuationSafe: true }),
        descriptor: async () => "/owned/request.json",
        collect: async () => ({ status: "failed", exitCode: 0 }),
      }),
    /DIAGNOSTIC_VERDICT_REQUIRED/,
  );
});

test("malformed job with valid CLI syntax withdraws the earlier owned report before blocking", async (t) => {
  const { spawnSync } = require("node:child_process");
  const { pathToFileURL } = require("node:url");
  const Reporter = require("./harness-public-odhin-reporter.cjs");
  const overview = require("./harness-public-overview.cjs");
  const previous = process.cwd();
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "assurance-invalid-job-"),
  );
  process.chdir(root);
  t.after(() => {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  });
  // Exercise the actual CLI and owned-report validator in a temporary root.
  // Only the native runner is replaced, so this regression cannot start Docker.
  fs.mkdirSync(path.join(root, "scripts/lib"), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, "run-harness-assurance.mjs"),
    path.join(root, "scripts/run-harness-assurance.mjs"),
  );
  for (const name of [
    "exui-divorce-native-binding.mjs",
    "exui-mandatory-email-event-contract.mjs",
    "exui-personal-service-admission.mjs",
    "exui-complex-email-admission.mjs",
    "exui-output-boundary.mjs",
    "exui-candidate-ci-inputs.mjs",
    "exui-candidate-artifact.mjs",
    "exui-release-policy.mjs",
    "exui-evidence-io.mjs",
    "exui-selector-event-row-evidence.mjs",
  ])
    fs.writeFileSync(
      path.join(root, "scripts/lib", name),
      `export * from ${JSON.stringify(pathToFileURL(path.join(__dirname, "lib", name)).href)};`,
    );
  fs.writeFileSync(
    path.join(root, "scripts/harness-public-odhin-reporter.cjs"),
    `module.exports = require(${JSON.stringify(path.join(__dirname, "harness-public-odhin-reporter.cjs"))});`,
  );
  fs.writeFileSync(path.join(root,'scripts/run-harness-complex-email-admission.mjs'), `export * from ${JSON.stringify(pathToFileURL(path.join(__dirname,'run-harness-complex-email-admission.mjs')).href)};`);
  fs.writeFileSync(path.join(root,'scripts/run-harness-personal-service-admission.mjs'), `export * from ${JSON.stringify(pathToFileURL(path.join(__dirname,'run-harness-personal-service-admission.mjs')).href)};`);
  fs.writeFileSync(path.join(root,'scripts/run-harness-divorce-profile-admission.mjs'), `export * from ${JSON.stringify(pathToFileURL(path.join(__dirname,'run-harness-divorce-profile-admission.mjs')).href)};`);
  fs.writeFileSync(path.join(root,'scripts/run-harness-mandatory-email-event-admission.mjs'), `export * from ${JSON.stringify(pathToFileURL(path.join(__dirname,'run-harness-mandatory-email-event-admission.mjs')).href)};`);
  fs.writeFileSync(path.join(root,'scripts/run-harness-st-cic-profile-admission.mjs'), `export * from ${JSON.stringify(pathToFileURL(path.join(__dirname,'run-harness-st-cic-profile-admission.mjs')).href)};`);
  fs.writeFileSync(path.join(root,'scripts/lib/exui-st-cic-profile-admission.mjs'), `export * from ${JSON.stringify(pathToFileURL(path.join(__dirname,'lib/exui-st-cic-profile-admission.mjs')).href)};`);
  fs.writeFileSync(
    path.join(root, "scripts/run-harness-ci.mjs"),
    `import fs from "node:fs"; export {reportNativeProgress} from ${JSON.stringify(pathToFileURL(path.join(__dirname,"run-harness-ci.mjs")).href)}; export async function runHarnessCi() { fs.writeFileSync("native-started", "unexpected"); throw Error("UNEXPECTED_NATIVE_RUN"); }`,
  );
  const reporter = new Reporter({ selection: "harness" });
  const tests = overview.entries.map((entry) => ({
    location: { file: path.join(root, entry.file) },
    titlePath: () => entry.titlePath,
    retries: 0,
    expectedStatus: "passed",
  }));
  reporter.onBegin({}, { allTests: () => tests });
  const startTime = new Date("2026-11-03T12:00:00Z");
  for (const testCase of tests)
    reporter.onTestEnd(testCase, {
      steps: reviewedFixtureSteps(testCase),
      status: "passed",
      retry: 0,
      duration: 1,
      startTime,
      workerIndex: 0,
      parallelIndex: 0,
    });
  await reporter.onEnd({ status: "passed", startTime, duration: 1000 });
  assert.equal(Reporter.validatePublicReport("harness").status, "passed");
  const jobPath = path.join(root, "invalid-job.json");
  fs.writeFileSync(jobPath, JSON.stringify({ schemaVersion: 1 }));
  const unrelated = path.join(root, "unrelated-marker");
  fs.writeFileSync(unrelated, "preserve");
  const terminal = spawnSync(
    process.execPath,
    [path.join(root, "scripts/run-harness-assurance.mjs"), "--input", jobPath],
    {
      cwd: root,
      env: { PATH: process.env.PATH },
      encoding: "utf8",
      timeout: 10000,
    },
  );
  assert.equal(terminal.status, 2);
  assert.equal(terminal.signal, null);
  assert.match(terminal.stderr, /\[harness-assurance\] BLOCKED/);
  for (const file of [
    "public/odhin/index.html",
    "private/public-odhin-harness.json",
  ])
    assert.equal(
      fs.existsSync(path.join(root, "functional-output/tests/harness", file)),
      false,
      `Earlier owned ${file} must be withdrawn`,
    );
  assert.equal(fs.existsSync(path.join(root, "native-started")), false);
  assert.equal(fs.readFileSync(unrelated, "utf8"), "preserve");
});
const {descriptorFixture:fixture}=require('./fixtures/exui-mandatory-email-assurance.mock.cjs');
test('default entrypoint does not attempt the explicitly qualified DIVORCE profile', async t => {
 const {runEntrypoint}=require('./fixtures/exui-mandatory-email-assurance.mock.cjs');
 const actual=runEntrypoint(fixture(t));
 assert.equal(actual.terminal.status,0,actual.terminal.stderr);
 assert.equal(actual.result.nativeStatus,'BLOCKED');
 assert.equal(actual.result.profileStatus,undefined);
 assert.equal(actual.calls.filter(x=>x==='profile').length,0);
 assert.equal(actual.calls.filter(x=>x==='personal').length,1);
 const collections=actual.calls.filter(x=>x.collect);
 assert.equal(collections.length,1);
 assert.equal(collections[0].collect.divorceProfileAttempt,undefined);
 assert.equal(actual.result.exitCode,2);
});
test('explicit profile output still attempts the strict profile and preserves its failure', async t => {
 const {runEntrypoint}=require('./fixtures/exui-mandatory-email-assurance.mock.cjs');
 const f=fixture(t),actual=runEntrypoint(f,{profileOutput:path.join(f.root,'profile')});
 assert.equal(actual.terminal.status,0,actual.terminal.stderr);
 assert.equal(actual.calls.filter(x=>x==='profile').length,1);
 assert.equal(actual.result.profileStatus,'BLOCKED');
 const collections=actual.calls.filter(x=>x.collect);
 assert.equal(collections.length,0);
 assert.equal(actual.result.diagnosticStatus,'not-run');
 assert.equal(actual.calls.filter(x=>x==='withdraw').length,2);
 assert.equal(actual.result.exitCode,2);
});
test('an invalid explicit profile path cannot silently select main-only execution', async t => {
 const {runEntrypoint}=require('./fixtures/exui-mandatory-email-assurance.mock.cjs');
 for(const profileOutput of ['', 'relative-profile']){
  const actual=runEntrypoint(fixture(t),{profileOutput});
  assert.equal(actual.terminal.status,0,actual.terminal.stderr);
  assert.equal(actual.calls.filter(x=>x==='withdraw').length,1);
  assert.equal(actual.result.error,'ASSURANCE_PROFILE_OUTPUT_REQUIRED');
  assert.equal(actual.calls.some(x=>x==='native'||x==='profile'||x.collect),false);
 }
});
test('default entrypoint cancellation withdraws the report and launches no profile or diagnostics', async t => {
 const {runEntrypoint}=require('./fixtures/exui-mandatory-email-assurance.mock.cjs');
 const actual=runEntrypoint(fixture(t),{cancelNative:true});
 assert.equal(actual.terminal.status,0,actual.terminal.stderr);
 assert.equal(actual.result.exitCode,2);
 assert.equal(actual.result.diagnosticStatus,'not-run');
 assert.equal(actual.calls.filter(x=>x==='withdraw').length,2);
 assert.equal(actual.calls.some(x=>x==='profile'||x.collect),false);
});
test("descriptor binds parent capture before gate and preserves blocked policy for strict raw reader", async (t) => {
  const { writeNativeDescriptor } = await api(),
    f = fixture(t);
  const output = writeNativeDescriptor(f.job, f.captured, f.verdict),
    d = JSON.parse(fs.readFileSync(output));
  assert.equal(d.expected.harnessCommit, f.captured.harnessCommit);
  assert.equal(d.expected.phases[2].terminal.code, 2);
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /EEXIST/,
  );
});
test("descriptor includes source inputs only when explicitly supplied by the job", async (t) => {
  const { writeNativeDescriptor } = await api(), f = fixture(t);
  f.job.candidateManifest = path.join(f.root, 'candidate-artifact.json');
  const inputs = { sourceArchive:path.join(f.root,'source.tar.gz'), javaHome:'/opt/java', gradleHome:'/opt/gradle', output:path.join(f.root,'source-proof') };
  const descriptor = JSON.parse(fs.readFileSync(writeNativeDescriptor(f.job,f.captured,f.verdict,inputs)));
  assert.deepEqual(descriptor.sharedRoleAdmission,{candidateArtifactPath:f.job.candidateManifest,sourceImageInputs:inputs});
});
test("post-execution identity cannot replace the independently captured expectation", async (t) => {
  const { writeNativeDescriptor } = await api(),
    f = fixture(t);
  const file = path.join(f.root, "private/family/promotion-expected.json"),
    changed = JSON.parse(fs.readFileSync(file));
  changed.harnessCommit = "c".repeat(40);
  fs.writeFileSync(file, JSON.stringify(changed));
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /EXPECTATION_CHANGED/,
  );
  assert.equal(
    fs.existsSync(path.join(f.root, "private/native-report-request.json")),
    false,
  );
});
test("missing preexecution capture and incomplete cleanup cannot publish a descriptor", async (t) => {
  const { writeNativeDescriptor } = await api(),
    f = fixture(t);
  const file = path.join(
      f.root,
      "private/family/independent-preexecution.json",
    ),
    pre = JSON.parse(fs.readFileSync(file));
  delete pre.capturedBeforeGate;
  fs.writeFileSync(file, JSON.stringify(pre));
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /PREEXECUTION_REQUIRED/,
  );
  fs.writeFileSync(file, JSON.stringify({ ...pre, capturedBeforeGate: true }));
  const terminal = path.join(f.root, "private/family/controller-terminal.json");
  fs.writeFileSync(
    terminal,
    JSON.stringify({
      status: "completed",
      cleanupComplete: false,
      exitCode: 0,
    }),
  );
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /CLEANUP_REQUIRED/,
  );
});

test("transition capture must match the separate parent pin and cannot relabel a partial job", async (t) => {
  const { writeNativeDescriptor } = await api();
  const f = fixture(t);
  const file = path.join(
    f.root,
    "private/eventCapability/independent-transition.json",
  );
  fs.writeFileSync(file, JSON.stringify({ capturedBeforeFault: false }));
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /TRANSITION/,
  );
  const g = fixture(t);
  const ci = JSON.parse(
    fs.readFileSync(path.join(g.root, "private/ci-result.json")),
  );
  ci.phaseResults.pop();
  g.write("ci-result.json", ci);
  assert.throws(
    () => writeNativeDescriptor(g.job, g.captured, g.verdict),
    /COMPLETE_NATIVE_RUN/,
  );
});

test("promotion cannot substitute a transition pin from a different parent capture", async (t) => {
  const { writeNativeDescriptor } = await api();
  const f = fixture(t);
  const file = path.join(
    f.root,
    "private/eventCapability/promotion-expected.json",
  );
  const promotion = JSON.parse(fs.readFileSync(file));
  promotion.eventTransition.digest = "sha256:" + "0".repeat(64);
  fs.writeFileSync(file, JSON.stringify(promotion));
  assert.throws(
    () => writeNativeDescriptor(f.job, f.captured, f.verdict),
    /TRANSITION_CHANGED/,
  );
});

test("callback transition must match the independently captured receipt", async (t) => {
  const { writeNativeDescriptor } = await api();
  const f = fixture(t);
  const file = path.join(f.root, "private/recipientCallback/promotion-expected.json");
  const promotion = JSON.parse(fs.readFileSync(file));
  promotion.callbackTransition.digest = "sha256:" + "0".repeat(64);
  fs.writeFileSync(file, JSON.stringify(promotion));
  assert.throws(() => writeNativeDescriptor(f.job, f.captured, f.verdict), /CALLBACK_TRANSITION_CHANGED/);
});
test('descriptor retains the preflight hash and actual wrapper request pins without adopting later replacements',async t=>{
 const {writeNativeDescriptor}=await api(),f=fixture(t),{digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const binding={syntheticPreflight:'held-before-phases'},file=path.join(f.root,'private/native-cohort-binding.json');fs.writeFileSync(file,JSON.stringify(binding));
 f.captured.nativeCohortCapture={binding,reference:{path:'private/native-cohort-binding.json',digest:digestBytes(fs.readFileSync(file))}};
 const requestFile=path.join(f.root,'profile-request.json'),runId='divorce-00000000-0000-4000-8000-000000000001';fs.writeFileSync(requestFile,JSON.stringify({expected:{runId}}));
 const request={path:requestFile,runId,digest:digestBytes(fs.readFileSync(requestFile))};
 const previous=fs.readFileSync(file);fs.writeFileSync(file,JSON.stringify({syntheticPreflight:'coherently-replaced'}));assert.throws(()=>writeNativeDescriptor(f.job,f.captured,f.verdict,undefined,request),/DIVORCE_NATIVE_BINDING_INVALID/);fs.writeFileSync(file,previous);
 const saved=fs.readFileSync(requestFile);fs.writeFileSync(requestFile,JSON.stringify({expected:{runId:'divorce-ffffffff-ffff-4fff-8fff-ffffffffffff'}}));assert.throws(()=>writeNativeDescriptor(f.job,f.captured,f.verdict,undefined,request),/ASSURANCE_PROFILE_REQUEST_CHANGED/);fs.writeFileSync(requestFile,saved);
 const descriptor=JSON.parse(fs.readFileSync(writeNativeDescriptor(f.job,f.captured,f.verdict,undefined,request)));assert.deepEqual(descriptor.expected.nativeCohortBinding,f.captured.nativeCohortCapture.reference);assert.deepEqual(descriptor.expected.divorceProfileRequest,{runId,digest:request.digest});assert.equal(descriptor.divorceProfileAdmission,requestFile);
});

test('canonical joint sequence runs profile after complete blocked main and collects once with disjoint time', async () => {
 const {runAssuranceSequence}=await api();const order=[];let now=0;const request={path:'/private/profile.json',runId:'profile',digest:'sha256:'+'a'.repeat(64)};
 const result=await runAssuranceSequence({clock:()=>now,native:async()=>{order.push('native');now+=100;return {status: 'BLOCKED', exitCode: 2, continuationSafe: true,phaseTimings:[]};},prepare:async()=>{order.push('prepare');now+=10;},profile:async()=>{order.push('profile');now+=5000;return {status:'passed',reportRequest:request};},descriptor:async(verdict,actual)=>{order.push('descriptor');assert.equal(verdict.status,'BLOCKED');assert.equal(actual,request);now+=20;return '/private/native.json';},collect:async(file,timing)=>{order.push('collect');assert.equal(file,'/private/native.json');assert.equal(timing.nativeElapsedMs,130);assert.equal(timing.divorceProfileAttempt,undefined);return {status:'passed',exitCode:2,divorceProfileInclusion:'included'};}});
 assert.deepEqual(order,['native','prepare','profile','descriptor','collect']);assert.equal(result.nativeStatus,'BLOCKED');assert.equal(result.profileStatus,'PASS');assert.equal(result.exitCode,2);assert.equal(result.releaseApproval,false);
});

test('every thrown profile failure stops before descriptor or diagnostics, including unobserved termination',async()=>{
 const {runAssuranceSequence}=await api();
 for(const fault of ['setup','execution','admission','cleanup','unobserved-termination','pending-create']){const calls=[];
  const result=await runAssuranceSequence({native:async()=>({status: 'PASS', exitCode: 0, continuationSafe: true}),prepare:async()=>{},profile:async()=>{throw Error('PRIVATE-CANARY-'+fault);},descriptor:async()=>{calls.push('descriptor');return '/private/main.json';},collect:async()=>{calls.push('collect');return {status:'passed',exitCode:0};},withdraw:()=>calls.push('withdraw'),publish:value=>calls.push({published:value})});
  assert.deepEqual(calls,['withdraw',{published:result}]);assert.equal(result.exitCode,2);assert.equal(result.nativeStatus,'PASS');assert.equal(result.profileStatus,'BLOCKED');assert.equal(result.diagnosticStatus,'not-run');assert(!JSON.stringify(result).includes('PRIVATE-CANARY'));
 }
});
test('missing or unsupported profile API results cannot launch downstream work',async()=>{
 const {runAssuranceSequence}=await api();
 for(const value of [undefined,null,{}, {status:'failed'}, {status:'passed'}, {status:'passed',reportRequest:{}}, {status:'passed',reportRequest:{...passedProfileRequest,path:'relative'}}, {status:'passed',reportRequest:{...passedProfileRequest,digest:'invalid'}}, {status:'passed',reportRequest:{...passedProfileRequest,digest:{toString:()=>passedProfileRequest.digest}}}, {status:'passed',reportRequest:{...passedProfileRequest,runId:''}}]){
  const calls=[];const result=await runAssuranceSequence({native:async()=>({status: 'PASS', exitCode: 0, continuationSafe: true}),profile:async()=>value,descriptor:async()=>{calls.push('descriptor');return '/private/native';},collect:async()=>{calls.push('collect');return {status:'passed',exitCode:0};},withdraw:()=>calls.push('withdraw')});
  assert.deepEqual(calls,['withdraw']);assert.equal(result.exitCode,2);assert.equal(result.diagnosticStatus,'not-run');assert.equal(result.profileStatus,'BLOCKED');
 }
});
test('native continuation requires the actual controller authority before any later work',async t=>{
 const {runAssuranceSequence}=await api(),{runNativeController}=require('./fixtures/exui-native-continuation.mock.cjs');
 for(const mode of ['no-start','clean-fail','remove-retry','uncertain-create','cancelled']){
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'native-continuation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const controller=await runNativeController(root,mode),calls=[],safe=['no-start','clean-fail'].includes(mode);
  assert.equal(controller.result.continuationSafe,safe,mode);
  if(mode==='remove-retry')assert.equal(controller.removals,2);
  const before=controller.privateResult;
  const result=await runAssuranceSequence({native:async()=>controller.result,prepare:async()=>calls.push('prepare'),descriptor:async()=>{calls.push('descriptor');return '/native';},collect:async()=>{calls.push('collect');return{status:'passed',exitCode:0};},withdraw:()=>calls.push('withdraw')});
  assert.deepEqual(calls,safe?['prepare','descriptor','collect']:['withdraw'],mode);
  assert.equal(fs.readFileSync(path.join(root,'output/private/ci-result.json'),'utf8'),before);
  if(!safe)assert.equal(result.diagnosticStatus,'not-run');
 }
});
test('started or create-attempted CCD requires a cleanup receipt before any downstream collector',async t=>{
 const {runAssuranceSequence,buildNativeDescriptor}=await api(),{runNativeController}=require('./fixtures/exui-native-continuation.mock.cjs');
 for(const phase of ['main','event','callback'])for(const state of ['started-missing','created-missing','started-incomplete','precreation-missing']){
  const mode=phase+'-'+state,root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'native-missing-cleanup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const controller=await runNativeController(root,mode),safe=state==='precreation-missing',calls=[];
  assert.equal(controller.result.continuationSafe,safe,mode);assert.equal(JSON.parse(controller.privateResult).cleanupComplete,safe,mode);
  assert(controller.calls.includes('start'),mode);assert.equal(controller.calls.includes('create'),state==='created-missing',mode);assert(controller.removals>0,mode);
  const job=JSON.parse(fs.readFileSync(path.join(root,'job.json'),'utf8'));
  const result=await runAssuranceSequence({native:async()=>controller.result,
   prepare:()=>{calls.push('prepare');return buildNativeDescriptor(job,{},controller.result);},
   personal:async()=>{calls.push('personal');throw Error('UNEXPECTED_PERSONAL');},
   descriptor:()=>{calls.push('descriptor');return buildNativeDescriptor(job,{},controller.result);},
   collect:async()=>{calls.push('collect');return{status:'passed',exitCode:0};},withdraw:()=>calls.push('withdraw')});
  assert.deepEqual(calls,safe?['prepare','descriptor','collect']:['withdraw'],mode);assert.equal(result.exitCode,2);
  if(!safe)assert.equal(result.diagnosticStatus,'not-run');
 }
});

test('initial CCD startup observes cancellation and dispatches no later create',async t=>{
 const {runNativeController}=require('./fixtures/exui-native-continuation.mock.cjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'native-start-cancel-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const observed=await runNativeController(root,'cancel-after-create');
 assert.equal(observed.result.continuationSafe,false);assert.equal(observed.result.status,'BLOCKED');
 assert(observed.calls.includes('runtime-cancelled:true'));assert(observed.calls.includes('cancel-error:CI_JOB_CANCELLED'));
 assert.equal(observed.calls.filter(call=>call==='create').length,1);assert.equal(observed.removals,1);
});

test('missing native continuation authority cannot be inferred from a native verdict',async()=>{
 const {runAssuranceSequence}=await api(),calls=[];
 const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0}),prepare:async()=>calls.push('prepare'),profile:async()=>calls.push('profile'),descriptor:async()=>calls.push('descriptor'),collect:async()=>calls.push('collect'),withdraw:()=>calls.push('withdraw')});
 assert.deepEqual(calls,['withdraw']);assert.equal(result.exitCode,2);assert.equal(result.profileStatus,'NOT_RUN');assert.equal(result.diagnosticStatus,'not-run');
});

test('canonical joint skips ineligible profile and bad profile pins cannot replace main evidence',async()=>{
 const {runAssuranceSequence}=await api();let launches=0,collections=0;
 const skipped=await runAssuranceSequence({native:async()=>({status: 'BLOCKED', exitCode: 2, continuationSafe: true}),prepare:async()=>{throw Error('PRIVATE-CLEANUP');},profile:async()=>{launches++;},descriptor:async()=>{throw Error('INCOMPLETE');},collect:async(file,timing)=>{collections++;assert.equal(file,undefined);assert.equal(timing.divorceProfileAttempt.status,'NOT_RUN');assert.equal(timing.divorceProfileAttempt.reason,'main-evidence-unavailable');return {status:'passed',exitCode:0};}});assert.equal(launches,0);assert.equal(collections,1);assert.equal(skipped.exitCode,2);
 let descriptors=0;collections=0;
 const mismatch=await runAssuranceSequence({native:async()=>({status: 'PASS', exitCode: 0, continuationSafe: true}),prepare:async()=>{},profile:async()=>({status:'passed',reportRequest:{...passedProfileRequest,path:'/stale/profile'}}),descriptor:async(verdict,request)=>{descriptors++;if(request)throw Error('BAD_PROFILE_PIN');return '/private/main.json';},collect:async(file,timing)=>{collections++;assert.equal(file,'/private/main.json');assert.equal(timing.divorceProfileAttempt.status,'BLOCKED');return {status:'passed',exitCode:0};}});assert.equal(descriptors,2);assert.equal(collections,1);assert.equal(mismatch.exitCode,2);
});

test('canonical joint cancellation prohibits every later child and withdraws report',async()=>{
 const {runAssuranceSequence}=await api();
 for(const stop of ['preflight','native','prepare','profile','descriptor','collect']){
  const controller=new AbortController(),calls=[];let withdrawn=0;if(stop==='preflight')controller.abort();
  const stage=async name=>{calls.push(name);if(stop===name)controller.abort();};
  const result=await runAssuranceSequence({signal:controller.signal,withdraw:()=>withdrawn++,native:async()=>{await stage('native');return {status: 'PASS', exitCode: 0, continuationSafe: true};},prepare:async()=>{await stage('prepare');},profile:async()=>{await stage('profile');return {status:'passed',reportRequest:passedProfileRequest};},descriptor:async()=>{await stage('descriptor');return '/native';},collect:async()=>{await stage('collect');return {status:'passed',exitCode:0,divorceProfileInclusion:'included'};}});
  assert.equal(result.exitCode,2);assert.equal(result.diagnosticStatus,'not-run');assert.equal(withdrawn,1);const expected=['native','prepare','profile','descriptor','collect'];assert.deepEqual(calls,stop==='preflight'?[]:expected.slice(0,expected.indexOf(stop)+1));
 }
});

test('canonical joint publishes whole-command BLOCKED without changing passing main receipts',async t=>{
 const {runAssuranceSequence,publishAssuranceSummary}=await api();const {digestBytes,validatePublicSummary}=await import('./lib/exui-evidence-io.mjs');
 for(const profileFails of [true,false]){
  const output=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'assurance-overall-')));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));fs.mkdirSync(path.join(output,'private'));
  const binding={synthetic:'parent-captured-output'},bytes=Buffer.from(JSON.stringify(binding));fs.writeFileSync(path.join(output,'private/native-cohort-binding.json'),bytes);
  const captured={nativeCohortCapture:{binding,reference:{path:'private/native-cohort-binding.json',digest:digestBytes(bytes)}}},job={output};
  const main=JSON.stringify({status:'PASS',phaseResults:[{phase:'family',status:'PASS'}]});fs.writeFileSync(path.join(output,'private/ci-result.json'),main);let published=0,collections=0;
  const result=await runAssuranceSequence({native:async()=>({status: 'PASS', exitCode: 0, continuationSafe: true}),prepare:async()=>{},profile:async()=>{if(profileFails)throw Error('PRIVATE-CANARY');return {status:'passed',reportRequest:passedProfileRequest};},descriptor:async()=>'/native',collect:async()=>{collections++;return {status:'passed',exitCode:0,divorceProfileInclusion:profileFails?undefined:'included'};},publish:value=>{published++;publishAssuranceSummary(job,captured,value);}});
  assert.equal(published,1);assert.equal(collections,profileFails?0:1);assert.equal(result.exitCode,profileFails?2:0);assert.equal(fs.readFileSync(path.join(output,'private/ci-result.json'),'utf8'),main);
  const summary=validatePublicSummary(path.join(output,'public/release-assurance-summary.json'));assert.equal(summary.status,profileFails?'BLOCKED':'PASS');assert.equal(summary.releaseApproval,false);
 }
 const foreign=fs.mkdtempSync(path.join(os.tmpdir(),'assurance-unowned-'));t.after(()=>fs.rmSync(foreign,{recursive:true,force:true}));fs.writeFileSync(path.join(foreign,'canary'),'untouched');publishAssuranceSummary({output:foreign},{},{exitCode:2});assert.deepEqual(fs.readdirSync(foreign),['canary']);
});

test('canonical joint abort after observed profile cleanup cannot start descriptor or diagnostics',async()=>{
 const {runAssuranceSequence}=await api(),controller=new AbortController(),order=[];
 const result=await runAssuranceSequence({signal:controller.signal,native:async()=>({status: 'PASS', exitCode: 0, continuationSafe: true}),prepare:async()=>{},profile:async()=>{order.push('profile');order.push('cleanup-observed');controller.abort();return {status:'passed',reportRequest:passedProfileRequest};},descriptor:async()=>{order.push('descriptor');},collect:async()=>{order.push('diagnostics');},withdraw:()=>order.push('withdraw')});assert.deepEqual(order,['profile','cleanup-observed','withdraw']);assert.equal(result.exitCode,2);assert.equal(result.diagnosticStatus,'not-run');
});
test('invalid personal-only preflight preserves valid main and DIVORCE facts and overwrites stale PASS summary with BLOCKED',async t=>{
 const {runAssuranceSequence,buildNativeDescriptor,writeNativeDescriptor,publishAssuranceSummary}=await api(),f=fixture(t),{digestBytes,validatePublicSummary}=await import('./lib/exui-evidence-io.mjs');
 const native={held:'native-preflight'},nativeBytes=Buffer.from(JSON.stringify(native));fs.writeFileSync(path.join(f.root,'private/native-cohort-binding.json'),nativeBytes);f.captured.nativeCohortCapture={binding:native,reference:{path:'private/native-cohort-binding.json',digest:digestBytes(nativeBytes)}};
 publishAssuranceSummary(f.job,f.captured,{exitCode:0});
 const capsule={held:'personal-only'},capsuleBytes=Buffer.from(JSON.stringify(capsule));fs.writeFileSync(path.join(f.root,'private/personal-service-native-binding.json'),capsuleBytes);f.captured.personalNativeCapture={binding:capsule,reference:{path:'private/personal-service-native-binding.json',digest:digestBytes(capsuleBytes)}};fs.writeFileSync(path.join(f.root,'private/personal-service-native-binding.json'),JSON.stringify({changed:'after-main'}));
 const mainFile=path.join(f.root,'private/ci-result.json'),ci=JSON.parse(fs.readFileSync(mainFile));ci.status='PASS';ci.exitCode=0;for(const phase of ci.phaseResults){phase.status='PASS';phase.exitCode=0;}f.write('ci-result.json',ci);f.write('ccd/controller-terminal.json',{status:'completed',cleanupComplete:true,exitCode:0});f.verdict={status:'PASS',exitCode:0,continuationSafe:true};
 const main=fs.readFileSync(mainFile),requestPath=path.join(f.root,'profile-request.json'),runId='divorce-00000000-0000-4000-8000-000000000001';fs.writeFileSync(requestPath,JSON.stringify({expected:{runId}}));const request={path:requestPath,runId,digest:digestBytes(fs.readFileSync(requestPath))};let profiles=0,personalProofs=0;
 const result=await runAssuranceSequence({native:async()=>f.verdict,prepare:()=>buildNativeDescriptor(f.job,f.captured,f.verdict),profile:async()=>{profiles++;return {status:'passed',reportRequest:request};},personal:async()=>{const {runPersonalServiceAdmission}=await import('./run-harness-personal-service-admission.mjs');return runPersonalServiceAdmission({nativeOutput:f.root,nativeContext:{capture:f.captured.personalNativeCapture}});},descriptor:(v,p,r)=>writeNativeDescriptor(f.job,f.captured,v,undefined,p,r),collect:async(file,timing)=>{assert.equal(typeof file,'string','personal-only corruption must not suppress valid main evidence');const descriptor=JSON.parse(fs.readFileSync(file));assert.equal(descriptor.divorceProfileAdmission,requestPath);assert.equal(descriptor.personalServiceAdmission,undefined);assert.deepEqual(descriptor.expected.personalServiceNativeBinding,f.captured.personalNativeCapture.reference);assert.equal(descriptor.expected.personalServiceRequest,undefined);assert.equal(timing.personalServiceAttempt.status,'BLOCKED');return {status:'passed',exitCode:0,divorceProfileInclusion:'included'};},publish:value=>publishAssuranceSummary(f.job,f.captured,value)});
 assert.equal(profiles,1);assert.equal(personalProofs,0);assert.equal(result.personalStatus,'BLOCKED');assert.equal(result.profileStatus,'PASS');assert.equal(result.exitCode,2);assert.deepEqual(fs.readFileSync(path.join(f.root,'private/ci-result.json')),main);const summary=validatePublicSummary(path.join(f.root,'public/release-assurance-summary.json'));assert.equal(summary.status,'BLOCKED');assert.equal(summary.releaseApproval,false);
});
test('late personal capture replacement cannot leave a stale public PASS after collector inclusion',async t=>{
 const {publishAssuranceSummary}=await api(),f=fixture(t),{digestBytes,validatePublicSummary}=await import('./lib/exui-evidence-io.mjs');
 const binding={held:'native'},bytes=Buffer.from(JSON.stringify(binding));fs.writeFileSync(path.join(f.root,'private/native-cohort-binding.json'),bytes);f.captured.nativeCohortCapture={binding,reference:{path:'private/native-cohort-binding.json',digest:digestBytes(bytes)}};publishAssuranceSummary(f.job,f.captured,{exitCode:0});
 f.captured.personalNativeCapture={binding:{held:'personal'},reference:{path:'private/personal-service-native-binding.json',digest:'sha256:'+'a'.repeat(64)}};fs.writeFileSync(path.join(f.root,'private/personal-service-native-binding.json'),JSON.stringify({late:'change'}));
 assert.throws(()=>publishAssuranceSummary(f.job,f.captured,{exitCode:0,personalStatus:'PASS'}));assert.equal(validatePublicSummary(path.join(f.root,'public/release-assurance-summary.json')).status,'BLOCKED');
});
test('controlled former profile wiring cannot satisfy default personal order',t=>{
 const {runEntrypoint}=require('./fixtures/exui-mandatory-email-assurance.mock.cjs');
 for(const mutation of ['unconditional-profile','profile-only-preparation']){
  const actual=runEntrypoint(fixture(t),{mutation});assert.equal(actual.terminal.status,0,actual.terminal.stderr);
  if(mutation==='unconditional-profile')assert.equal(actual.calls.filter(x=>x==='profile').length,1);
  else assert.equal(actual.calls.filter(x=>x==='personal').length,0,'missing main preparation must prevent personal');
  assert.equal(actual.calls.filter(x=>x.collect).length,0);
 }
});


test('fixed parent progress exposes only stage lifecycle and preserves closed failure identity',t=>{
 const {runEntrypoint}=require('./fixtures/exui-mandatory-email-assurance.mock.cjs');
 for(const closedPersonalFailure of [false,true]){
  const actual=runEntrypoint(fixture(t),{closedPersonalFailure});assert.equal(actual.terminal.status,0,actual.terminal.stderr);
  assert.deepEqual(actual.progress.map(line=>line.replace(/ \(\d+s elapsed\)\.$/,'')),[
   '[harness-native] Personal-service preparation, proofs and cleanup: started',
   '[harness-native] Personal-service preparation, proofs and cleanup: '+(closedPersonalFailure?'stopped; details remain private':'completed'),
   '[harness-native] Evidence replay and diagnostic report: started',
   '[harness-native] Evidence replay and diagnostic report: completed']);
  assert.equal(actual.calls.filter(x=>x==='personal').length,1);assert.equal(actual.calls.filter(x=>x.collect).length,1);
  assert.doesNotMatch(actual.terminal.stdout+actual.terminal.stderr,/PRIVATE-PROGRESS|https?:|\/personal|\/private/);
 }
});

test('controlled old callback omission fails the fixed progress lifecycle expectation',t=>{
 const {runEntrypoint}=require('./fixtures/exui-mandatory-email-assurance.mock.cjs');
 for(const mutation of ['omit-personal-progress','omit-collector-progress']){
  const actual=runEntrypoint(fixture(t),{mutation});assert.equal(actual.terminal.status,0,actual.terminal.stderr);
  assert.equal(actual.calls.filter(x=>x==='personal').length,1);assert.equal(actual.calls.filter(x=>x.collect).length,1);
  assert.equal(actual.progress.length,2);assert.throws(()=>assert.equal(actual.progress.length,4));
 }
});


test('actual native preflight rejection reports fixed progress without later runtime launch or private data',async t=>{
 const {runNativeController}=require('./fixtures/exui-native-continuation.mock.cjs');
 const messages=[];t.mock.method(console,'log',line=>messages.push(line));
 const source=fs.readFileSync(path.join(__dirname,'run-harness-ci.mjs'),'utf8');
 for(const omitProgress of [false,true]){
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'native-progress-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  // Remove only the progress wrapper, preserving every current preflight input.
  const old=source.replace(/context = await reportNativeProgress\('Native candidate preflight', \(\) => (prepareCiJob\([^\n]+\))\);/,'context = await $1;');
  assert.notEqual(old,source);messages.length=0;const observed=await runNativeController(root,'no-start',omitProgress?old:source);
  assert.equal(observed.result.status,'BLOCKED');assert.equal(observed.result.continuationSafe,true);assert.deepEqual(observed.calls,[]);
  const expected=['[harness-native] Native candidate preflight: started','[harness-native] Native candidate preflight: stopped; details remain private'];
  const actual=messages.map(line=>line.replace(/ \(\d+s elapsed\)\.$/,''));
  if(omitProgress){assert.deepEqual(actual,[]);assert.throws(()=>assert.deepEqual(actual,expected));}else assert.deepEqual(actual,expected);
  assert.doesNotMatch(messages.join('\n'),/PRIVATE-PROGRESS|https?:|\/private|\/artifact/);
 }
});
test('unused Complex capsule drift cannot poison the actual main descriptor or NOT_RUN collector',async t=>{
 const {runAssuranceSequence,buildNativeDescriptor,writeNativeDescriptor}=await api(),{digestBytes}=await import('./lib/exui-evidence-io.mjs');
 for(const reason of ['SOURCE_INPUTS_NOT_CONFIGURED','SOURCE_PROOF_PLATFORM_UNSUPPORTED'])for(const change of ['missing','changed']){
  const f=fixture(t),binding={held:'unused-complex'},bytes=Buffer.from(JSON.stringify(binding)),file=path.join(f.root,'private/complex-email-native-binding.json');
  fs.writeFileSync(file,bytes);f.captured.complexNativeCapture={binding,reference:{path:'private/complex-email-native-binding.json',digest:digestBytes(bytes)}};
  const held=structuredClone(f.captured.complexNativeCapture.reference);if(change==='missing')fs.unlinkSync(file);else fs.writeFileSync(file,JSON.stringify({foreign:'replacement'}));
  const original=fs.readFileSync(path.join(f.root,'private/ci-result.json'));let collections=0;
  const before=buildNativeDescriptor(f.job,f.captured,f.verdict);assert.deepEqual(before.expected.complexEmailNativeBinding,held);assert.equal(before.complexEmailAdmission,undefined);
  const result=await runAssuranceSequence({native:async()=>f.verdict,prepare:()=>buildNativeDescriptor(f.job,f.captured,f.verdict),complexAttempt:{schemaVersion:1,kind:'complex-email-attempt',status:'NOT_RUN',reason},descriptor:v=>writeNativeDescriptor(f.job,f.captured,v),collect:async(descriptorPath,options)=>{collections++;const descriptor=JSON.parse(fs.readFileSync(descriptorPath));assert.deepEqual(descriptor.expected.complexEmailNativeBinding,held);assert.equal(descriptor.expected.complexEmailRequest,undefined);assert.equal(descriptor.complexEmailAdmission,undefined);assert.equal(options.complexEmailAttempt.reason,reason);return{status:'passed',exitCode:0};}});
  assert.equal(collections,1);assert.equal(result.complexStatus,'NOT_RUN');assert.equal(result.diagnosticStatus,'passed');assert.deepEqual(fs.readFileSync(path.join(f.root,'private/ci-result.json')),original);
  assert.throws(()=>buildNativeDescriptor(f.job,f.captured,f.verdict,undefined,undefined,undefined,{path:'/unused-request',digest:'sha256:'+'a'.repeat(64),runId:'complex-00000000-0000-4000-8000-000000000000'}));
 }
});

test('assurance timing snapshot uses the owner clock through supplementary stages and collection', async () => {
  const {runAssuranceSequence}=await api();let now=0;
  const request=runId=>({path:'/private/'+runId+'.json',runId,digest:'sha256:'+'a'.repeat(64)});
  const before=Date.now();let measured;
  const value=await runAssuranceSequence({clock:()=>now,
    native:async()=>{now+=100;return {status:'PASS',exitCode:0,continuationSafe:true};},
    prepare:async()=>{now+=10;},
    profile:async()=>{now+=5000;return {status:'passed',reportRequest:request('profile')};},
    personal:async()=>{now+=2000;return {status:'passed',reportRequest:request('personal')};},
    complex:async()=>{now+=3000;return {status:'passed',reportRequest:request('complex-00000000-0000-4000-8000-000000000001')};},
    descriptor:async()=>{now+=20;return '/private/native.json';},
    collect:async(_file,timing)=>{
      assert.equal(timing.nativeElapsedMs,130);assert.equal(typeof timing.snapshotAssuranceTiming,'function');
      now+=50;now+=300;measured=timing.snapshotAssuranceTiming();
      return {status:'passed',exitCode:0,divorceProfileInclusion:'included',personalServiceInclusion:'included',complexEmailInclusion:'included'};
    },
  });
  assert.deepEqual(Object.keys(measured).sort(),['clock','elapsedMs','schemaVersion','scope','startedAt']);
  assert.equal(measured.elapsedMs,10480);assert.equal(measured.schemaVersion,1);assert.equal(measured.scope,'assurance-start-to-report-snapshot');assert.equal(measured.clock,'monotonic');
  assert.equal(new Date(measured.startedAt).toISOString(),measured.startedAt);assert(Date.parse(measured.startedAt)>=before&&Date.parse(measured.startedAt)<=Date.now());
  assert.equal(value.exitCode,0);assert.equal(value.releaseApproval,false);
});

test('assurance timing rejects owner clock backsteps and nonfinite values without changing withdrawal contracts', async () => {
  const {runAssuranceSequence}=await api();
  for(const invalid of [-0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'10480',null,undefined]){
    let now=0;
    await assert.rejects(runAssuranceSequence({clock:()=>now,native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),descriptor:async()=>'/private/native.json',collect:async(_file,timing)=>{now=invalid;timing.snapshotAssuranceTiming();return {status:'passed',exitCode:0};}}),/ASSURANCE_TIMING/);
  }
});

test('assurance timing records safe FAIL or BLOCKED without changing verdicts and skips already aborted work',async()=>{
 const {runAssuranceSequence}=await api();
 for(const [status,exitCode] of [['FAIL',1],['BLOCKED',2]]){
  let now=0;const result=await runAssuranceSequence({clock:()=>now,native:async()=>{now+=100;return {status,exitCode,continuationSafe:true};},descriptor:async()=>'/private/native.json',collect:async(_file,timing)=>{now+=300;assert.equal(timing.snapshotAssuranceTiming().elapsedMs,400);return {status:'passed',exitCode:0};}});
  assert.equal(result.nativeStatus,status);assert.equal(result.exitCode,exitCode);assert.equal(result.releaseApproval,false);
 }
 const controller=new AbortController();controller.abort();let withdrew=false;
 const result=await runAssuranceSequence({signal:controller.signal,clock:()=>assert.fail('aborted work has no timing origin'),native:()=>assert.fail('aborted native'),descriptor:()=>assert.fail('aborted descriptor'),collect:()=>assert.fail('aborted collection'),withdraw:()=>{withdrew=true;}});
 assert.equal(result.nativeStatus,'NOT_RUN');assert.equal(result.exitCode,2);assert.equal(withdrew,true);
});

test('preparation timing snapshot retains parent clock including candidate build rather than child origin',async()=>{
 const {runAssuranceSequence}=await api();let parent=5000,child=900000,samples=0;const start=parent;parent+=329000;
 const expected={schemaVersion:2,scope:'harness-preparation-start-to-report-snapshot',clock:'monotonic',startedAt:'2026-11-06T12:00:00.000Z',elapsedMs:329350};
 await runAssuranceSequence({clock:()=>child,snapshotAssuranceTiming:async()=>{samples++;return {...expected,elapsedMs:parent-start};},native:async()=>{parent+=100;child+=100;return {status:'PASS',exitCode:0,continuationSafe:true};},descriptor:async()=>'/private/native.json',collect:async(_file,timing)=>{parent+=250;child+=250;assert.deepEqual(await timing.snapshotAssuranceTiming(),expected);return {status:'passed',exitCode:0};}});
 assert.equal(samples,1);
});

test('preparation IPC rejects missing, malformed, stale or disconnected replies without local timing fallback',async()=>{
 const {connectPreparationTiming}=await api(),{EventEmitter}=require('node:events');const token='00000000-0000-4000-8000-000000000001';
 await assert.rejects(connectPreparationTiming({connected:false}),/PARENT_TIMING/);
 for(const fault of ['missing','missing-reply','malformed-init','duplicate-init','duplicate-reply','stale-reply','invalid-timing','disconnect','send-error',null]){
  const channel=new EventEmitter();channel.connected=true;channel.send=(message,done)=>{done?.(fault==='send-error'?Error('PRIVATE-CANARY'):undefined);queueMicrotask(()=>{
   if(fault==='missing' || (fault==='missing-reply'&&message.kind!=='harness-preparation-ready'))return;
   if(message.kind==='harness-preparation-ready')channel.emit('message',fault==='malformed-init'?{kind:'harness-preparation-init',token,extra:1}:{kind:'harness-preparation-init',token});
   else if(fault==='disconnect')channel.emit('disconnect');
   else channel.emit('message',{kind:'harness-preparation-timing',token:fault==='stale-reply'?'stale':token,timing:{schemaVersion:2,scope:'harness-preparation-start-to-report-snapshot',clock:'monotonic',startedAt:'2026-11-06T12:00:00.000Z',elapsedMs:fault==='invalid-timing'?-1:0}});
   if((fault==='duplicate-init'&&message.kind==='harness-preparation-ready')||(fault==='duplicate-reply'&&message.kind==='harness-preparation-snapshot'))channel.emit('message',{kind:'duplicate'});
  });};
  if(['missing','malformed-init','send-error'].includes(fault))await assert.rejects(connectPreparationTiming(channel,{timeoutMs:10}),/PARENT_TIMING/);
  else {const snapshot=await connectPreparationTiming(channel,{timeoutMs:10});if(fault)await assert.rejects(snapshot(),/PARENT_TIMING/);else {assert.equal((await snapshot()).elapsedMs,0);await assert.rejects(snapshot(),/PARENT_TIMING/);}snapshot.dispose();}
  assert.equal(channel.listenerCount('message'),0);assert.equal(channel.listenerCount('disconnect'),0);
 }
});

test('ST_CIC descriptor pins the captured capsule and rejects changed request bytes', async t => {
 const {buildNativeDescriptor}=await api(),f=fixture(t);
 const {stCicProfileContractDigest}=await import('./lib/exui-st-cic-profile-contract.mjs');
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const binding={schemaVersion:1,kind:'st-cic-native-binding',policy:'st-cic-profile-joint-v1',contractDigest:stCicProfileContractDigest(),nativeBindingDigest:'sha256:'+'a'.repeat(64)};
 const bytes=JSON.stringify(binding,null,2)+'\n',file=path.join(f.root,'private/st-cic-native-binding.json');fs.writeFileSync(file,bytes);
 f.captured.stCicNativeCapture={binding,reference:{path:'private/st-cic-native-binding.json',digest:digestBytes(bytes)}};
 const runId='st-cic-10000000-0000-4000-8000-000000000000',requestFile=path.join(f.root,'request.json'),requestBytes=JSON.stringify({expected:{runId}});fs.writeFileSync(requestFile,requestBytes);
 const request={path:requestFile,digest:digestBytes(requestBytes),runId};
 const render=()=>buildNativeDescriptor(f.job,f.captured,f.verdict,undefined,undefined,undefined,undefined,request);
 const descriptor=render();assert.equal(descriptor.stCicProfileAdmission,requestFile);assert.deepEqual(descriptor.expected.stCicNativeBinding,f.captured.stCicNativeCapture.reference);assert.deepEqual(descriptor.expected.stCicProfileRequest,{runId,digest:request.digest});
 fs.writeFileSync(requestFile,JSON.stringify({expected:{runId:'foreign-run'}}));assert.throws(render,/ASSURANCE_ST_CIC_REQUEST_CHANGED/);
 fs.writeFileSync(requestFile,requestBytes);fs.writeFileSync(file,bytes+' ');assert.throws(render);
});

test('late ST_CIC capture replacement withdraws a stale public PASS',async t=>{
 const {publishAssuranceSummary}=await api(),f=fixture(t),{digestBytes,validatePublicSummary}=await import('./lib/exui-evidence-io.mjs');
 const binding={held:'native'},bytes=Buffer.from(JSON.stringify(binding));fs.writeFileSync(path.join(f.root,'private/native-cohort-binding.json'),bytes);f.captured.nativeCohortCapture={binding,reference:{path:'private/native-cohort-binding.json',digest:digestBytes(bytes)}};publishAssuranceSummary(f.job,f.captured,{exitCode:0});
 f.captured.stCicNativeCapture={binding:{held:'st-cic'},reference:{path:'private/st-cic-native-binding.json',digest:'sha256:'+'a'.repeat(64)}};fs.writeFileSync(path.join(f.root,'private/st-cic-native-binding.json'),JSON.stringify({late:'change'}));
 assert.throws(()=>publishAssuranceSummary(f.job,f.captured,{exitCode:0,stCicStatus:'PASS'}));assert.equal(validatePublicSummary(path.join(f.root,'public/release-assurance-summary.json')).status,'BLOCKED');
});

test('ST_CIC CLI bridge parses only finite opt-in flags and preserves legacy arguments',async()=>{
 const {parseAssuranceCli}=await api();
 assert.deepEqual(parseAssuranceCli(['--input','/private/job.json']),{jobPath:'/private/job.json',aat:false,parentTiming:false,stCic:false});
 assert.deepEqual(parseAssuranceCli(['--','--input','/private/job.json','--st-cic','--aat','--parent-timing']),{jobPath:'/private/job.json',aat:true,parentTiming:true,stCic:true});
 for(const args of [['--input','relative'],['--input','/private/job.json','--st-cic','--st-cic'],['--input','/private/job.json','--unknown'],['--input','/private/job.json','--st-cic-output','/foreign'],['--input','/private/job.json','--aat','--aat']])assert.throws(()=>parseAssuranceCli(args),/ASSURANCE_INPUT_REQUIRED/);
});

test('ST_CIC CLI bridge allocates owned external output and rejects stale or aliased inputs before execution',async t=>{
 const {createStCicCliOutput}=await api();
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'st-cic-cli-output-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const candidate=path.join(root,'candidate'),browser=path.join(root,'browser');fs.mkdirSync(candidate);fs.mkdirSync(browser);
 const manifest=path.join(root,'candidate.json'),jobPath=path.join(root,'job.json'),output=path.join(root,'native-output');
 fs.writeFileSync(manifest,JSON.stringify({candidateRoot:candidate}));
 const job={schemaVersion:1,candidateManifest:manifest,browserCache:browser,output,expectedArtifactDigest:'sha256:'+'a'.repeat(64)};
 const write=()=>fs.writeFileSync(jobPath,JSON.stringify(job));write();
 const created=await createStCicCliOutput(jobPath),directory=path.dirname(created);t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 assert.equal(path.dirname(directory),fs.realpathSync(os.tmpdir()));assert.equal(path.basename(created),'profile');assert.equal(fs.statSync(directory).mode&0o777,0o700);
 assert.equal(fs.existsSync(created),false);assert.equal(fs.existsSync(output),false);
 const receipt=path.join(root,'st-cic-cli-output.json');assert.equal(fs.statSync(receipt).mode&0o777,0o600);
 assert.deepEqual(JSON.parse(fs.readFileSync(receipt)),{schemaVersion:1,kind:'st-cic-cli-owned-output',directory,output:created});
 await assert.rejects(()=>createStCicCliOutput(jobPath),/ASSURANCE_ST_CIC_OUTPUT_ALREADY_OWNED/);
 fs.unlinkSync(receipt);const alias=path.join(root,'alias');fs.symlinkSync(root,alias);job.output=path.join(alias,'native-output');write();await assert.rejects(()=>createStCicCliOutput(jobPath),/ASSURANCE_ST_CIC_OUTPUT_ALIAS/);
 job.output=output;write();fs.writeFileSync(manifest,JSON.stringify({candidateRoot:root}));
 // A failed overlap may not leave an unrecorded owned empty temp directory.
 const before=fs.readdirSync(root).sort();
 const realMkdtemp=fs.mkdtempSync;fs.mkdtempSync=prefix=>realMkdtemp(path.join(root,path.basename(prefix)));
 try{await assert.rejects(()=>createStCicCliOutput(jobPath),/ASSURANCE_ST_CIC_OUTPUT_OVERLAP/);}finally{fs.mkdtempSync=realMkdtemp;}
 assert.deepEqual(fs.readdirSync(root).sort(),before);
 assert.equal(fs.existsSync(receipt),false);assert.equal(fs.existsSync(output),false);
});

test('ST_CIC CLI bridge actual entry forwards parsed options and blocks collisions before the fake assurance boundary',async t=>{
 const {spawnSync}=require('node:child_process');
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'st-cic-cli-entry-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),scripts=path.join(source,'scripts');fs.mkdirSync(scripts,{recursive:true});
 const original=fs.readFileSync(path.join(__dirname,'run-harness-assurance.mjs'),'utf8'),needle='const result = await runHarnessAssurance(cli.jobPath, {';
 assert.equal(original.split(needle).length,2);
 // Only the expensive assurance API is a fake; run the real CLI parser/output preflight.
 const edited=original.replace(needle,"const result = await (async (jobPath, options) => { fs.writeFileSync(path.join(ROOT,'cli-call.json'),JSON.stringify({jobPath,options})); return {nativeStatus:'PASS',diagnosticStatus:'passed',exitCode:0}; })(cli.jobPath, {");
 fs.writeFileSync(path.join(scripts,'run-harness-assurance.mjs'),edited);
 for(const name of fs.readdirSync(__dirname))if(name!=='run-harness-assurance.mjs')fs.symlinkSync(path.join(__dirname,name),path.join(scripts,name));
 const fakeDeps=path.join(root,'fake-deps');fs.mkdirSync(fakeDeps);fs.symlinkSync(fakeDeps,path.join(source,'node_modules'));
 const candidate=path.join(root,'candidate'),browser=path.join(root,'browser');fs.mkdirSync(candidate);fs.mkdirSync(browser);
 const jobDirectory=path.join(source,'functional-output/tests/harness/private/native-ci/job');fs.mkdirSync(jobDirectory,{recursive:true,mode:0o700});
 const manifest=path.join(root,'candidate.json'),jobPath=path.join(jobDirectory,'job.json'),output=path.join(jobDirectory,'native-output');
 fs.writeFileSync(manifest,JSON.stringify({candidateRoot:candidate}));fs.writeFileSync(jobPath,JSON.stringify({schemaVersion:1,candidateManifest:manifest,browserCache:browser,output,expectedArtifactDigest:'sha256:'+'a'.repeat(64)}));
 const launch=(flags,{tmpdir,preload}={})=>spawnSync(process.execPath,[...(preload?['--require',preload]:[]),'scripts/run-harness-assurance.mjs','--input',jobPath,...flags],{cwd:source,env:{PATH:process.env.PATH,...(tmpdir?{TMPDIR:tmpdir}:{})},encoding:'utf8',timeout:10_000});
 for(const flags of [[],['--mandatory-email'],['--st-cic','--mandatory-email','--aat']]){
  const terminal=launch(flags);assert.equal(terminal.status,0,terminal.stderr);assert.equal(terminal.signal,null);
  const receipt=flags.includes('--st-cic')?JSON.parse(fs.readFileSync(path.join(jobDirectory,'st-cic-cli-output.json'))):undefined;
  if(receipt)t.after(()=>fs.rmSync(receipt.directory,{recursive:true,force:true}));
  const mandatoryReceipt=flags.includes('--mandatory-email')?JSON.parse(fs.readFileSync(path.join(jobDirectory,'mandatory-email-cli-output.json'))):undefined;
  if(mandatoryReceipt)t.after(()=>fs.rmSync(mandatoryReceipt.directory,{recursive:true,force:true}));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(source,'cli-call.json'))),{jobPath,options:{aat:flags.includes('--aat'),...(receipt?{stCicOutput:receipt.output}:{}),...(mandatoryReceipt?{mandatoryEmailOutput:mandatoryReceipt.output}:{})}});
  if(mandatoryReceipt)fs.unlinkSync(path.join(jobDirectory,'mandatory-email-cli-output.json'));
  fs.unlinkSync(path.join(source,'cli-call.json'));
 }
 const terminal=launch(['--st-cic']);assert.equal(terminal.status,2);assert.match(terminal.stderr,/BLOCKED/);assert.equal(fs.existsSync(path.join(source,'cli-call.json')),false);assert.equal(fs.existsSync(output),false);
 fs.unlinkSync(path.join(jobDirectory,'st-cic-cli-output.json'));
 const allocations=path.join(root,'allocations.txt'),preload=path.join(root,'count-allocation.cjs');
 fs.writeFileSync(preload,`const fs=require('node:fs'),actual=fs.mkdtempSync;fs.mkdtempSync=(...args)=>{fs.appendFileSync(${JSON.stringify(allocations)},'called');return actual(...args);};`);
 const badTmp=path.join(fakeDeps,'tmp');fs.mkdirSync(badTmp);const dependencyBefore=fs.readdirSync(fakeDeps).sort();
 for(const flag of ['--st-cic','--mandatory-email']){const unsafe=launch([flag],{tmpdir:badTmp,preload});assert.equal(unsafe.status,2,unsafe.stderr);}
 assert.equal(fs.existsSync(allocations),false,'reject before any mkdtemp under dependency input');assert.deepEqual(fs.readdirSync(fakeDeps).sort(),dependencyBefore);assert.deepEqual(fs.readdirSync(badTmp),[]);
 assert.equal(fs.existsSync(path.join(source,'cli-call.json')),false);assert.equal(fs.existsSync(path.join(jobDirectory,'st-cic-cli-output.json')),false);
 fs.unlinkSync(path.join(source,'node_modules'));const safeTmp=path.join(root,'safe-tmp');fs.mkdirSync(safeTmp);
 for(const flag of ['--st-cic','--mandatory-email']){const missing=launch([flag],{tmpdir:safeTmp,preload});assert.equal(missing.status,2,missing.stderr);}assert.equal(fs.existsSync(allocations),false,'missing dependency root must fail before allocation');assert.deepEqual(fs.readdirSync(safeTmp),[]);
});

test('combined assurance CLI preserves ST_CIC and the explicit held Build receipt without accepting malformed suffixes',async()=>{
 const {parseAssuranceCli}=await api(),held={path:'/private/held.json',digest:'sha256:'+'a'.repeat(64)};
 for(const flags of [[],['--st-cic'],['--aat','--parent-timing','--st-cic']]){
  const cli=parseAssuranceCli(['--input','/private/job.json',...flags,'--build-self-check-held',held.path,'--build-self-check-digest',held.digest]);
  assert.deepEqual(cli,{jobPath:'/private/job.json',aat:flags.includes('--aat'),parentTiming:flags.includes('--parent-timing'),stCic:flags.includes('--st-cic'),buildSelfCheckHeld:held});
 }
 for(const suffix of [['--build-self-check-held','relative.json','--build-self-check-digest',held.digest],['--build-self-check-held',held.path,'--build-self-check-digest','bad'],['--build-self-check-held',held.path,'--build-self-check-digest',held.digest,'--st-cic'],['--build-self-check-digest',held.digest]]){
  assert.throws(()=>parseAssuranceCli(['--input','/private/job.json','--st-cic',...suffix]));
 }
 assert.throws(()=>parseAssuranceCli(['--input','/private/job.json','--st-cic','--st-cic','--build-self-check-held',held.path,'--build-self-check-digest',held.digest]));
});
