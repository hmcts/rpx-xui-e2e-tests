const test = require("node:test"),
  assert = require("node:assert/strict");
test("configured unit selection has one pipeline verifier and excludes generated evidence", async () => {
  const m = await import("./run-harness-self-check-evidence.mjs");
  const files = m.readConfiguredUnitFiles();
  assert.equal(
    files.filter((f) => f === "scripts/verify-playwright-pipeline.test.cjs")
      .length,
    1,
  );
  assert.equal(new Set(files).size, files.length);
  assert(!files.some((f) => f.includes(".harness-build-self-check")));
});
const fs = require("node:fs"),
  path = require("node:path");
const {
  buildSelfCheckFixture: fixture,
} = require("./fixtures/exui-build-self-check.mock.cjs");
test("one actual configured fixture run yields byte-bound held evidence and observed Node argv", async (t) => {
  const f = await fixture(t),
    result = await f.api.runConfiguredSelfChecks();
  assert.equal(result.status, "passed");
  assert.equal(result.counts.tests, 2);
  const argv = JSON.parse(fs.readFileSync(f.argvPath));
  assert.deepEqual(argv.args.slice(0, 2), ["--test", "--test-concurrency=1"]);
  assert.deepEqual(argv.args.slice(-2), f.unitFiles);
  const held = f.api.holdBuildSelfChecks(),
    observed = f.api.readHeldBuildSelfChecks(held);
  assert.equal(observed.counts.tests, 2);
  assert.equal(observed.status, "passed");
  assert.equal(observed.runtimeAcceptance, false);
  assert(!JSON.stringify(observed).includes(f.root));
  const request = path.join(f.privateRoot, "current-request.json");
  fs.appendFileSync(request, " ");
  assert.throws(
    () => f.api.readHeldBuildSelfChecks(held),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});
test("failed configured units retain failed evidence without reporting success", async (t) => {
  const f = await fixture(t, { failed: true }),
    result = await f.api.runConfiguredSelfChecks();
  assert.equal(result.status, "failed");
  assert.equal(result.counts.failed, 1);
  assert.equal(
    f.api.readHeldBuildSelfChecks(f.api.holdBuildSelfChecks()).status,
    "failed",
  );
});
test("required Jenkins context cannot use local or foreign build evidence", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  assert.throws(
    () => f.api.holdBuildSelfChecks({ required: true, env: {} }),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
  assert.throws(
    () =>
      f.api.holdBuildSelfChecks({
        required: true,
        env: { JOB_NAME: "foreign", BUILD_NUMBER: "3", BUILD_TAG: "foreign-3" },
      }),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});
test("only fixed canonical private output exception succeeds; aliases and stale child paths reject", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  const output = path.join(f.root, "arbitrary");
  await assert.rejects(
    f.api.collectNodeSelfCheckEvidence({ files: f.unitFiles, output }),
  );
  assert(!fs.existsSync(output));
  const request = JSON.parse(
    fs.readFileSync(path.join(f.privateRoot, "current-request.json")),
  );
  await assert.rejects(
    f.api.collectNodeSelfCheckEvidence({
      files: f.unitFiles,
      output: request.directory,
    }),
  );
});

test("Git state is descriptive while selected input and HEAD bindings remain strict", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  fs.writeFileSync(path.join(f.root, "unrelated-note"), "not selected");
  const held = f.api.holdBuildSelfChecks();
  assert.equal(f.api.readHeldBuildSelfChecks(held).status, "passed");
  fs.appendFileSync(
    path.join(f.root, f.unitFiles[1]),
    "\n// changed selected input",
  );
  assert.throws(
    () => f.api.readHeldBuildSelfChecks(held),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});
test("failed new startup retires current request instead of falling back to old pass", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    f.api.runConfiguredSelfChecks({ signal: controller.signal }),
  );
  assert.equal(f.api.holdBuildSelfChecks(), undefined);
});
test("actual public-report and worker reset callers preserve the held private unit bytes", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  const held = f.api.holdBuildSelfChecks(),
    before = fs.readFileSync(path.join(f.privateRoot, "current-request.json"));
  const { execFileSync } = require("node:child_process");
  execFileSync(
    process.execPath,
    [path.resolve("scripts/manage-harness-public-reports.cjs"), "--reset"],
    {
      cwd: f.root,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      stdio: "pipe",
    },
  );
  const worker = await import("./observe-harness-worker.mjs");
  worker.resetCapabilityReport(f.root);
  assert.deepEqual(
    fs.readFileSync(path.join(f.privateRoot, "current-request.json")),
    before,
  );
  assert.equal(f.api.readHeldBuildSelfChecks(held).status, "passed");
});

test("same Jenkins Build can hold evidence; another Build cannot relabel it", async (t) => {
  const f = await fixture(t),
    keys = ["JOB_NAME", "BUILD_NUMBER", "BUILD_TAG"];
  const before = keys.map((key) => process.env[key]);
  Object.assign(process.env, {
    JOB_NAME: "synthetic-build",
    BUILD_NUMBER: "12",
    BUILD_TAG: "synthetic-build-12",
  });
  t.after(() =>
    keys.forEach((key, index) =>
      before[index] === undefined
        ? delete process.env[key]
        : (process.env[key] = before[index]),
    ),
  );
  await f.api.runConfiguredSelfChecks();
  const held = f.api.holdBuildSelfChecks({ required: true });
  assert.equal(f.api.readHeldBuildSelfChecks(held).status, "passed");
  assert.throws(
    () =>
      f.api.holdBuildSelfChecks({
        required: true,
        env: { ...process.env, BUILD_NUMBER: "13" },
      }),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});

test("coherently resealed outcome cannot replace actual structured Node counts", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  const requestPath = path.join(f.privateRoot, "current-request.json");
  const request = JSON.parse(fs.readFileSync(requestPath));
  const evidencePath = path.join(request.directory, "self-check-evidence.json");
  const evidence = JSON.parse(fs.readFileSync(evidencePath));
  evidence.counts.tests++;
  evidence.counts.passed++;
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  request.files["self-check-evidence.json"] =
    "sha256:" +
    require("node:crypto")
      .createHash("sha256")
      .update(fs.readFileSync(evidencePath))
      .digest("hex");
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(
    () => f.api.holdBuildSelfChecks(),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});

test("private root permissions and request symlinks reject before attachment", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  fs.chmodSync(f.privateRoot, 0o755);
  assert.throws(
    () => f.api.holdBuildSelfChecks(),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
  fs.chmodSync(f.privateRoot, 0o700);
  const current = path.join(f.privateRoot, "current-request.json"),
    moved = path.join(f.privateRoot, "saved-request.json");
  fs.renameSync(current, moved);
  fs.symlinkSync(moved, current);
  assert.throws(
    () => f.api.holdBuildSelfChecks(),
    /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
  );
});

test("actual timed parent forwards only explicit held receipt flags to the assurance child", async () => {
  const { runTimedAssuranceChild } =
    await import("./run-harness-jenkins-assurance.mjs");
  const { EventEmitter } = require("node:events");
  for (const held of [
    undefined,
    {
      path: "/private/tmp/synthetic-held.json",
      digest: "sha256:" + "a".repeat(64),
    },
  ]) {
    const child = new EventEmitter(),
      signals = new EventEmitter();
    let called;
    child.kill = () => {
      throw Error("unexpected cancellation");
    };
    child.send = (message, done) => {
      done?.();
      queueMicrotask(() =>
        message.kind === "harness-preparation-init"
          ? child.emit("message", {
              kind: "harness-preparation-snapshot",
              token: message.token,
            })
          : child.emit("close", 0, null),
      );
    };
    const running = runTimedAssuranceChild("/private/tmp/synthetic-job.json", {
      snapshotAssuranceTiming: () => ({}),
      signals,
      env: {},
      buildSelfCheckHeld: held,
      forkChild: (file, args, options) => {
        called = { file, args, options };
        queueMicrotask(() =>
          child.emit("message", { kind: "harness-preparation-ready" }),
        );
        return child;
      },
    });
    assert.equal((await running).status, 0);
    assert.deepEqual(called.args, [
      "--input",
      "/private/tmp/synthetic-job.json",
      "--parent-timing",
      ...(held
        ? [
            "--build-self-check-held",
            held.path,
            "--build-self-check-digest",
            held.digest,
          ]
        : []),
    ]);
    assert.deepEqual(called.options.env, {});
    assert.equal(signals.listenerCount("SIGTERM"), 0);
  }
});

test("actual diagnostics fallback forwards held bytes explicitly and rejects partial pairs before launching", (t) => {
  const os = require("node:os"),
    { spawnSync } = require("node:child_process");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "self-check-fallback-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const preload = path.join(root, "capture.mjs"),
    capture = path.join(root, "calls.json");
  fs.writeFileSync(
    preload,
    `import cp from 'node:child_process';import fs from 'node:fs';import{EventEmitter}from'node:events';import{syncBuiltinESMExports}from'node:module';cp.spawn=(command,args,options)=>{fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({command,args,heldPath:options.env.HARNESS_BUILD_SELF_CHECK_PATH,heldDigest:options.env.HARNESS_BUILD_SELF_CHECK_DIGEST}));const child=new EventEmitter();queueMicrotask(()=>child.emit('exit',0));return child;};syncBuiltinESMExports();`,
  );
  const runner = path.resolve("scripts/run-harness-local-poc.mjs"),
    digest = "sha256:" + "a".repeat(64),
    held = "/private/tmp/synthetic-held.json";
  const run = (args) =>
    spawnSync(process.execPath, ["--import", preload, runner, ...args], {
      cwd: root,
      encoding: "utf8",
      env: { PATH: process.env.PATH },
      timeout: 5000,
    });
  let result = run([
    "--ci",
    "--odhin",
    "--build-self-check=" + held,
    "--build-self-check-sha256=" + digest,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const observed = JSON.parse(fs.readFileSync(capture));
  assert.equal(observed.heldPath, held);
  assert.equal(observed.heldDigest, digest);
  assert(observed.args.includes("--config=playwright.harness-ci.config.ts"));
  assert.match(result.stdout, /no release credit/i);
  for (const args of [
    ["--ci", "--odhin", "--build-self-check=" + held],
    [
      "--ci",
      "--build-self-check=" + held,
      "--build-self-check-sha256=" + digest,
    ],
  ]) {
    fs.rmSync(capture, { force: true });
    result = run(args);
    assert.equal(result.status, 2);
    assert(!fs.existsSync(capture));
  }
});

test("held receipt reopens actual JUnit and stderr bytes instead of trusting evidence labels", async (t) => {
  const f = await fixture(t);
  await f.api.runConfiguredSelfChecks();
  const held = f.api.holdBuildSelfChecks();
  const request = JSON.parse(
    fs.readFileSync(path.join(f.privateRoot, "current-request.json")),
  );
  for (const name of ["raw-junit.xml", "stderr.log"]) {
    const file = path.join(request.directory, name),
      before = fs.readFileSync(file);
    fs.appendFileSync(file, "\n");
    assert.throws(
      () => f.api.readHeldBuildSelfChecks(held),
      /^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/,
    );
    fs.writeFileSync(file, before);
    assert.equal(f.api.readHeldBuildSelfChecks(held).status, "passed");
  }
});

test("configured self-check concurrency 2 is explicit and retains one byte-bound structured run", async (t) => {
  const f = await fixture(t);
  const result = await f.api.runConfiguredSelfChecks({ testConcurrency: 2 });
  assert.equal(result.status, "passed");
  const argv = JSON.parse(fs.readFileSync(f.argvPath));
  assert.deepEqual(argv.args.slice(0, 2), ["--test", "--test-concurrency=2"]);
  assert.deepEqual(argv.args.slice(-2), f.unitFiles);
  assert.equal(
    f.api.readHeldBuildSelfChecks(f.api.holdBuildSelfChecks()).counts.tests,
    2,
  );
});


test('configured Node file-worker maximum comes from sealed input for modes1and2',async t=>{
 for(const testConcurrency of [1,2]){const f=await fixture(t);await f.api.runConfiguredSelfChecks({testConcurrency});const held=f.api.holdBuildSelfChecks(),value=f.api.readHeldBuildSelfChecks(held);assert.equal(value.configuredFileWorkers,testConcurrency);const argv=JSON.parse(fs.readFileSync(f.argvPath));assert.equal(argv.args[1],'--test-concurrency='+testConcurrency);const request=JSON.parse(fs.readFileSync(path.join(f.privateRoot,'current-request.json')));const input=path.join(request.directory,'source-input.json'),data=JSON.parse(fs.readFileSync(input));data.testConcurrency=testConcurrency===1?2:1;fs.writeFileSync(input,JSON.stringify(data));assert.throws(()=>f.api.readHeldBuildSelfChecks(held),/^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/);}
});
test('unchanged CLI completes actual tiny configured pass failure and invalid invocation after sync bridge',async t=>{
 const {spawnSync}=require('node:child_process');for(const failed of [false,true]){const f=await fixture(t,{failed});const actual=spawnSync(process.execPath,[f.modulePath],{cwd:f.root,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR},encoding:'utf8',timeout:10000});assert.equal(actual.signal,null);assert.equal(actual.status,failed?1:0,actual.stderr);assert.match(actual.stdout,failed?/failed; tests 2/:/passed; tests 2/);assert.equal(f.api.readHeldBuildSelfChecks(f.api.holdBuildSelfChecks()).status,failed?'failed':'passed');}
 const f=await fixture(t),invalid=spawnSync(process.execPath,[f.modulePath,'--unknown'],{cwd:f.root,encoding:'utf8',timeout:10000});assert.equal(invalid.status,2);assert.equal(invalid.signal,null);assert.match(invalid.stderr,/Evidence incomplete/);
});


test('CLI bridge preserves repeated-cancellation settlement and incomplete result',async t=>{
 const {spawn}=require('node:child_process');
 {
  const f=await fixture(t),ready=path.join(f.parent,'ready.json');
  fs.writeFileSync(path.join(f.root,f.unitFiles[1]),`const{test}=require('node:test'),fs=require('node:fs');test('owned pending fixture',async()=>{fs.writeFileSync(${JSON.stringify(ready)},'ready');await new Promise(r=>setTimeout(r,5000));});`);
  const child=spawn(process.execPath,[f.modulePath],{cwd:f.root,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR},stdio:'ignore'});let poll,deadline;
  const terminal=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  try{await new Promise((resolve,reject)=>{poll=setInterval(()=>{if(fs.existsSync(ready)){clearInterval(poll);resolve();}},10);deadline=setTimeout(()=>reject(Error('OWNED_CLI_NOT_READY')),5000);});clearTimeout(deadline);child.kill('SIGTERM');child.kill('SIGTERM');const actual=await terminal;assert.deepEqual(actual,{code:2,signal:null});const request=JSON.parse(fs.readFileSync(path.join(f.privateRoot,'current-request.json'))),evidence=JSON.parse(fs.readFileSync(path.join(request.directory,'self-check-evidence.json')));assert.equal(evidence.status,'incomplete');assert.equal(evidence.terminal.observed,true);assert.equal(evidence.terminal.cancelled,true);assert.equal(evidence.terminal.forced,false);}
  finally{clearInterval(poll);clearTimeout(deadline);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await terminal;}}
 }
});

test('configured purpose map covers the exact source-owned selection with unique stable IDs',()=>{
 const api=require('./harness-build-self-check-report.cjs'),map=api.readSelfCheckPurposeMap(),selected=require('./fixtures/harness-unit-files.json');assert.deepEqual(map.files.map(row=>row.file),selected);assert.equal(map.files.length,selected.length);assert.equal(new Set(map.files.map(row=>row.id)).size,selected.length);assert.equal(new Set(map.groups.map(row=>row.id)).size,map.groups.length);for(const row of map.files){assert(map.groups.some(group=>group.id===row.group));assert(row.purpose.startsWith('Checks '));assert(!row.purpose.includes('PRIVATE_CANARY'));}
});
test('actual configured file projection binds safe IDs counts metadata digest and sealed workers',async t=>{
 const f=await fixture(t);await f.api.runConfiguredSelfChecks({testConcurrency:2});const value=f.api.readHeldBuildSelfChecks(f.api.holdBuildSelfChecks());assert.equal(value.schemaVersion,2);assert.equal(value.configuredFileWorkers,2);assert.deepEqual(value.fileResults.map(row=>row.id),['unit-fixture-0','unit-fixture-1']);assert.deepEqual(value.fileResults.map(row=>row.counts.tests),[1,1]);for(const key of Object.keys(value.counts))assert.equal(value.fileResults.reduce((n,row)=>n+row.counts[key],0),value.counts[key]);assert(!JSON.stringify(value).includes(f.root));assert(!JSON.stringify(value).includes('synthetic unit'));const bytes=fs.readFileSync(path.join(f.root,'scripts/fixtures/harness-self-check-purpose-map.json'));assert.equal(value.purposeMapDigest,'sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex'));
});
test('coherently resealed per-file counts or swapped identities cannot replace the actual Node summary',async t=>{
 for(const change of [e=>{e.fileResults[0].counts.tests++;e.fileResults[0].counts.passed++;e.counts.tests++;e.counts.passed++;},e=>{[e.fileResults[0].file,e.fileResults[1].file]=[e.fileResults[1].file,e.fileResults[0].file];}]){
  const f=await fixture(t);await f.api.runConfiguredSelfChecks();const requestPath=path.join(f.privateRoot,'current-request.json'),request=JSON.parse(fs.readFileSync(requestPath)),file=path.join(request.directory,'self-check-evidence.json'),value=JSON.parse(fs.readFileSync(file));change(value);fs.writeFileSync(file,JSON.stringify(value));request.files['self-check-evidence.json']='sha256:'+require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');fs.writeFileSync(requestPath,JSON.stringify(request));assert.throws(()=>f.api.holdBuildSelfChecks(),/^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/);
 }
});
test('purpose map drift and incomplete selection reject before another unit spawn and never reuse old pass',async t=>{
 const f=await fixture(t);await f.api.runConfiguredSelfChecks();const held=f.api.holdBuildSelfChecks(),mapFile=path.join(f.root,'scripts/fixtures/harness-self-check-purpose-map.json'),original=fs.readFileSync(mapFile),map=JSON.parse(original),before=fs.readFileSync(f.callsPath);map.files[0].purpose='Changed source purpose';fs.writeFileSync(mapFile,JSON.stringify(map));assert.throws(()=>f.api.readHeldBuildSelfChecks(held),/^Error: HARNESS_SELF_CHECK_EVIDENCE_INVALID$/);map.files.pop();fs.writeFileSync(mapFile,JSON.stringify(map));await assert.rejects(()=>f.api.runConfiguredSelfChecks(),/^AssertionError/);assert.deepEqual(fs.readFileSync(f.callsPath),before);assert.equal(fs.existsSync(path.join(f.privateRoot,'current-request.json')),false);fs.writeFileSync(mapFile,original);
});
