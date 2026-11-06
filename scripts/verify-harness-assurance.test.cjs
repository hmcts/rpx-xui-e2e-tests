const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const api = () => import("./run-harness-assurance.mjs");

test("contradictory native status and missing diagnostic exit cannot become success", async () => {
  const { runAssuranceSequence } = await api();
  let prepared = false;
  await assert.rejects(
    () =>
      runAssuranceSequence({
        native: async () => ({ status: "BLOCKED", exitCode: 0 }),
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
        native: async () => ({ status: "PASS", exitCode: 0 }),
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
      return { status: "BLOCKED", exitCode: 2, phaseTimings };
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
      native: async () => ({ status, exitCode }),
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
    native: async () => ({ status: "PASS", exitCode: 0 }),
    descriptor: async () => { throw Error("INCOMPLETE"); },
    collect: async () => ({ status: "passed", exitCode: 0 }),
  }), /INCOMPLETE/);
});
test("diagnostic failure also prevents a passing combined command", async () => {
  const { runAssuranceSequence } = await api();
  const result = await runAssuranceSequence({
    native: async () => ({ status: "PASS", exitCode: 0 }),
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
        native: async () => ({ status: "PASS", exitCode: 0 }),
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
    "exui-output-boundary.mjs",
    "exui-candidate-ci-inputs.mjs",
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
  fs.writeFileSync(path.join(root,'scripts/run-harness-divorce-profile-admission.mjs'), `export * from ${JSON.stringify(pathToFileURL(path.join(__dirname,'run-harness-divorce-profile-admission.mjs')).href)};`);
  fs.writeFileSync(
    path.join(root, "scripts/run-harness-ci.mjs"),
    'import fs from "node:fs"; export async function runHarnessCi() { fs.writeFileSync("native-started", "unexpected"); throw Error("UNEXPECTED_NATIVE_RUN"); }',
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
function fixture(t) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "assurance-descriptor-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "private"));
  const digest = "sha256:" + "a".repeat(64),
    commit = "b".repeat(40);
  const phases = ["family", "scope", "ccd", "eventCapability", "routing", "recipientCallback", "selectorEventRow"];
  const captured = { harnessCommit: commit, policies: {} };
  const write = (file, value) => {
    const bytes = JSON.stringify(value);
    fs.writeFileSync(path.join(root, "private", file), bytes);
    return (
      "sha256:" +
      require("node:crypto").createHash("sha256").update(bytes).digest("hex")
    );
  };
  for (const phase of phases) {
    fs.mkdirSync(path.join(root, "private", phase));
    captured.policies[phase] = { policyDigest: digest };
    const routingInterpreter =
      phase === "routing"
        ? { contract: { pinDigest: digest }, implementation: { apiBundle: { digest } } }
        : undefined;
    const pre = {
      harnessCommit: commit,
      identity: { artifactDigest: digest },
      policyDigest: digest,
      ...(routingInterpreter ? { routingInterpreter } : {}),
    };
    write(`${phase}/independent-preexecution.json`, {
      ...pre,
      capturedBeforeGate: true,
      capturedAt: "2026-11-03T12:00:00Z",
    });
    const transition =
      phase === "eventCapability"
        ? {
            path: "independent-transition.json",
            digest: write(`${phase}/independent-transition.json`, {
              capturedBeforeFault: true,
            }),
          }
        : undefined;
    const callbackTransition = phase === "recipientCallback"
      ? { path: "independent-callback-transition.json", digest: write(`${phase}/independent-callback-transition.json`, {
          capturedBeforeFault: true,
        }) }
      : undefined;
    let selectorAuthority;
    if(phase==='selectorEventRow'){
      selectorAuthority={...pre,
        selectorEventCapture:{path:'independent-selector-capture.json',digest:write(`${phase}/independent-selector-capture.json`,{schemaVersion:1})},
        selectorControllerTerminal:{path:'independent-controller-terminal.json',digest:write(`${phase}/independent-controller-terminal.json`,{schemaVersion:1,terminal:{code:0,signal:null}})}};
      write(`${phase}/independent-selector-admission.json`,{schemaVersion:1,completedAfterController:true,expected:selectorAuthority});
    }
    write(`${phase}/promotion-expected.json`, {
      ...(transition ? { eventTransition: transition } : {}),
      ...(callbackTransition ? { callbackTransition } : {}),
      ...pre,
      ...(selectorAuthority??{}),
      receiptArtifactDigest: digest,
      evidenceManifestDigest: digest,
    });
    write(`${phase}/controller-terminal.json`, {
      status: "completed",
      cleanupComplete: true,
      exitCode: phase === "ccd" ? 2 : 0,
    });
  }
  write("ci-result.json", {
    jobRunId: "ci-example",
    status: "BLOCKED",
    exitCode: 2,
    cleanupComplete: true,
    phaseResults: phases.map((phase) => ({
      phase,
      status: phase === "ccd" ? "BLOCKED" : "PASS",
      exitCode: phase === "ccd" ? 2 : 0,
      receiptArtifactDigest: digest,
      ...(phase === "eventCapability"
        ? {
            eventTransition: JSON.parse(
              fs.readFileSync(
                path.join(root, "private", phase, "promotion-expected.json"),
              ),
            ).eventTransition,
          }
        : phase === "recipientCallback" ? {
            callbackTransition: JSON.parse(fs.readFileSync(
              path.join(root, "private", phase, "promotion-expected.json"),
            )).callbackTransition,
          } : {}),
    })),
  });
  return {
    root,
    captured,
    job: { output: root, expectedArtifactDigest: digest },
    verdict: { status: "BLOCKED", exitCode: 2 },
    write,
  };
}
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
 const result=await runAssuranceSequence({clock:()=>now,native:async()=>{order.push('native');now+=100;return {status:'BLOCKED',exitCode:2,phaseTimings:[]};},prepare:async()=>{order.push('prepare');now+=10;},profile:async()=>{order.push('profile');now+=5000;return {status:'passed',reportRequest:request};},descriptor:async(verdict,actual)=>{order.push('descriptor');assert.equal(verdict.status,'BLOCKED');assert.equal(actual,request);now+=20;return '/private/native.json';},collect:async(file,timing)=>{order.push('collect');assert.equal(file,'/private/native.json');assert.equal(timing.nativeElapsedMs,130);assert.equal(timing.divorceProfileAttempt,undefined);return {status:'passed',exitCode:2,divorceProfileInclusion:'included'};}});
 assert.deepEqual(order,['native','prepare','profile','descriptor','collect']);assert.equal(result.nativeStatus,'BLOCKED');assert.equal(result.profileStatus,'PASS');assert.equal(result.exitCode,2);assert.equal(result.releaseApproval,false);
});

test('canonical joint profile failures remain explicit despite passing main and diagnostics',async()=>{
 const {runAssuranceSequence}=await api();
 for(const fault of ['setup','execution','admission','cleanup']){let collections=0;
  const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0}),prepare:async()=>{},profile:async()=>{throw Error('PRIVATE-CANARY-'+fault);},descriptor:async(verdict,request)=>{assert.equal(verdict.status,'PASS');assert.equal(request,undefined);return '/private/main.json';},collect:async(file,timing)=>{collections++;assert.equal(file,'/private/main.json');assert.equal(timing.divorceProfileAttempt.status,'BLOCKED');assert.equal(timing.divorceProfileAttempt.reason,'profile-not-admitted');assert(!JSON.stringify(timing).includes('PRIVATE-CANARY'));return {status:'passed',exitCode:0};}});
  assert.equal(collections,1);assert.equal(result.exitCode,2);assert.equal(result.nativeStatus,'PASS');assert.equal(result.profileStatus,'BLOCKED');
 }
});

test('canonical joint skips ineligible profile and bad profile pins cannot replace main evidence',async()=>{
 const {runAssuranceSequence}=await api();let launches=0,collections=0;
 const skipped=await runAssuranceSequence({native:async()=>({status:'BLOCKED',exitCode:2}),prepare:async()=>{throw Error('PRIVATE-CLEANUP');},profile:async()=>{launches++;},descriptor:async()=>{throw Error('INCOMPLETE');},collect:async(file,timing)=>{collections++;assert.equal(file,undefined);assert.equal(timing.divorceProfileAttempt.status,'NOT_RUN');assert.equal(timing.divorceProfileAttempt.reason,'main-evidence-unavailable');return {status:'passed',exitCode:0};}});assert.equal(launches,0);assert.equal(collections,1);assert.equal(skipped.exitCode,2);
 let descriptors=0;collections=0;
 const mismatch=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0}),prepare:async()=>{},profile:async()=>({status:'passed',reportRequest:{path:'/stale/profile'}}),descriptor:async(verdict,request)=>{descriptors++;if(request)throw Error('BAD_PROFILE_PIN');return '/private/main.json';},collect:async(file,timing)=>{collections++;assert.equal(file,'/private/main.json');assert.equal(timing.divorceProfileAttempt.status,'BLOCKED');return {status:'passed',exitCode:0};}});assert.equal(descriptors,2);assert.equal(collections,1);assert.equal(mismatch.exitCode,2);
});

test('canonical joint cancellation prohibits every later child and withdraws report',async()=>{
 const {runAssuranceSequence}=await api();
 for(const stop of ['preflight','native','prepare','profile','descriptor','collect']){
  const controller=new AbortController(),calls=[];let withdrawn=0;if(stop==='preflight')controller.abort();
  const stage=async name=>{calls.push(name);if(stop===name)controller.abort();};
  const result=await runAssuranceSequence({signal:controller.signal,withdraw:()=>withdrawn++,native:async()=>{await stage('native');return {status:'PASS',exitCode:0};},prepare:async()=>{await stage('prepare');},profile:async()=>{await stage('profile');return {status:'passed',reportRequest:{path:'/profile'}};},descriptor:async()=>{await stage('descriptor');return '/native';},collect:async()=>{await stage('collect');return {status:'passed',exitCode:0,divorceProfileInclusion:'included'};}});
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
  const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0}),prepare:async()=>{},profile:async()=>{if(profileFails)throw Error('PRIVATE-CANARY');return {status:'passed',reportRequest:{path:'/profile'}};},descriptor:async()=>'/native',collect:async()=>{collections++;return {status:'passed',exitCode:0,divorceProfileInclusion:profileFails?undefined:'included'};},publish:value=>{published++;publishAssuranceSummary(job,captured,value);}});
  assert.equal(published,1);assert.equal(collections,1);assert.equal(result.exitCode,profileFails?2:0);assert.equal(fs.readFileSync(path.join(output,'private/ci-result.json'),'utf8'),main);
  const summary=validatePublicSummary(path.join(output,'public/release-assurance-summary.json'));assert.equal(summary.status,profileFails?'BLOCKED':'PASS');assert.equal(summary.releaseApproval,false);
 }
 const foreign=fs.mkdtempSync(path.join(os.tmpdir(),'assurance-unowned-'));t.after(()=>fs.rmSync(foreign,{recursive:true,force:true}));fs.writeFileSync(path.join(foreign,'canary'),'untouched');publishAssuranceSummary({output:foreign},{},{exitCode:2});assert.deepEqual(fs.readdirSync(foreign),['canary']);
});

test('canonical joint abort after observed profile cleanup cannot start descriptor or diagnostics',async()=>{
 const {runAssuranceSequence}=await api(),controller=new AbortController(),order=[];
 const result=await runAssuranceSequence({signal:controller.signal,native:async()=>({status:'PASS',exitCode:0}),prepare:async()=>{},profile:async()=>{order.push('profile');order.push('cleanup-observed');controller.abort();return {status:'passed',reportRequest:{path:'/profile'}};},descriptor:async()=>{order.push('descriptor');},collect:async()=>{order.push('diagnostics');},withdraw:()=>order.push('withdraw')});assert.deepEqual(order,['profile','cleanup-observed','withdraw']);assert.equal(result.exitCode,2);assert.equal(result.diagnosticStatus,'not-run');
});
