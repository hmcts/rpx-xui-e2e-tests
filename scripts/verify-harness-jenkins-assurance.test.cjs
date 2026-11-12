const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");

const load = () => import(pathToFileURL(path.join(__dirname, "run-harness-jenkins-assurance.mjs")));

test("actual Jenkins CLI preserves private preparation evidence when a child fails", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jenkins-cli-retained-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(__dirname, path.join(root, "scripts"), { recursive: true });
  fs.symlinkSync(path.resolve(__dirname, "../node_modules"), path.join(root, "node_modules"), "dir");
  const preload = path.join(root, "children.cjs");
  fs.writeFileSync(preload, `
    const fs = require('node:fs');
    const path = require('node:path');
    require('node:child_process').spawnSync = (command, args) => {
      if (command === 'docker' && args[0] === 'version')
        return {status: 0, stdout: JSON.stringify({Os: 'linux', Arch: 'arm64'})};
      if (command === 'docker' && args[0] === 'image') {
        const reference = args[2], digest = reference.slice(reference.indexOf('sha256:'));
        return {status: 0, stdout: JSON.stringify([{Id: digest, Os: 'linux', Architecture: 'arm64', RepoDigests: [reference.includes('@') ? reference : 'registry/image@' + digest]}])};
      }
      if (command === 'git' && args[0] === 'clone') {
        fs.writeFileSync(path.join(path.dirname(args.at(-1)), 'preparation-evidence.txt'), 'child failed');
      }
      return {status: 1, stdout: ''};
    };
    require('node:module').syncBuiltinESMExports();
  `);
  const result = spawnSync(process.execPath, ["--require", preload, "scripts/run-harness-jenkins-assurance.mjs"], {
    cwd: root, env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stderr);
  const privateRoot = path.join(root, "functional-output/tests/harness/private/native-ci");
  const jobs = fs.readdirSync(privateRoot);
  assert.equal(jobs.length, 1);
  const job = path.join(privateRoot, jobs[0]);
  assert.equal(fs.statSync(job).mode & 0o777, 0o700);
  assert.equal(fs.readFileSync(path.join(job, "preparation-evidence.txt"), "utf8"), "child failed");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(job, "preparation-error.json"))), { stage: "webapp master fetch", reason: "HARNESS_JENKINS_ASSURANCE_COMMAND_FAILED" });
  const summary = JSON.parse(fs.readFileSync(path.join(root, "functional-output/tests/harness/public/release-assurance-summary.json"), "utf8"));
  assert.equal(summary.status, "BLOCKED");
});

test("job-local native evidence uses distinct private directories and preserves prior runs", async (t) => {
  const { createPrivateJobDirectory } = await load();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jenkins-retained-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = createPrivateJobDirectory(root);
  const evidence = path.join(first, "receipt.json");
  fs.writeFileSync(evidence, "preserved", { mode: 0o600 });
  const second = createPrivateJobDirectory(root);
  assert.notEqual(first, second);
  assert.equal(path.dirname(first), path.join(root, "functional-output/tests/harness/private/native-ci"));
  assert.equal(fs.readFileSync(evidence, "utf8"), "preserved");
  for (const directory of [first, second, path.dirname(first), path.dirname(path.dirname(first))])
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  fs.chmodSync(path.dirname(first), 0o755);
  assert.throws(() => createPrivateJobDirectory(root), /PRIVATE_JOB_DIRECTORY_REQUIRED/);
  assert.equal(fs.readFileSync(evidence, "utf8"), "preserved");
});

test("job-local evidence rejects aliased ancestors without writing into their target", async (t) => {
  const { createPrivateJobDirectory } = await load();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jenkins-evidence-alias-")));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jenkins-evidence-outside-")));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.symlinkSync(outside, path.join(root, "functional-output"), "dir");
  assert.throws(() => createPrivateJobDirectory(root), /PRIVATE_JOB_ROOT_ALIAS/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("native preparation rejects unavailable or unsupported Docker without granting execution readiness", async () => {
  const { assertNativeWorkerPlatform } = await load();
  const { collectWorkerCapabilities } = await import(pathToFileURL(path.join(__dirname, "observe-harness-worker.mjs")));
  for (const server of [null, { Os: "linux", Arch: "amd64" }, { Os: "windows", Arch: "arm64" }, { Os: "linux", Arch: "arm64" }]) {
    const report = collectWorkerCapabilities({
      run: (_command, args) => ({
        status: server && args[0] === "version" ? 0 : 1,
        stdout: JSON.stringify(server),
      }),
    });
    if (server?.Os === "linux" && ["arm64", "amd64"].includes(server.Arch))
      assert.doesNotThrow(() => assertNativeWorkerPlatform(report));
    else
      assert.throws(() => assertNativeWorkerPlatform(report), /HARNESS_NATIVE_DOCKER_SUPPORTED_PLATFORM_REQUIRED/);
    assert.equal(report.nativeReady, false);
    assert.equal(report.releaseApproval, false);
  }
});

test("native job input stays private and only a real owned private directory is accepted", async (t) => {
  const { assertPrivateDirectory, writePrivateJob } = await load();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jenkins-assurance-private-")));
  const alias = `${root}-alias`;
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(alias, { force: true });
  });

  assert.equal(assertPrivateDirectory(root), root);
  fs.symlinkSync(root, alias, "dir");
  assert.throws(() => assertPrivateDirectory(alias), /PRIVATE_JOB_DIRECTORY_REQUIRED/);
  fs.unlinkSync(alias);

  const file = path.join(root, "job-input.json");
  const job = { schemaVersion: 1, candidateManifest: "/private/candidate.json" };
  writePrivateJob(file, job);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), job);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.throws(() => writePrivateJob(file, job), /EEXIST/);

  fs.chmodSync(root, 0o755);
  assert.throws(() => assertPrivateDirectory(root), /PRIVATE_JOB_DIRECTORY_REQUIRED/);
});

test('AMD64 provisioning pulls immutable images and removes temporary registry credentials on success and failure', async t => {
  const context=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'registry-existing-context-')));
  const previous=process.env.AZURE_CONFIG_DIR;process.env.AZURE_CONFIG_DIR=context;
  t.after(()=>{if(previous===undefined)delete process.env.AZURE_CONFIG_DIR;else process.env.AZURE_CONFIG_DIR=previous;fs.rmSync(context,{recursive:true,force:true});});
  const { provisionNativeImages } = await load();
  const { nativeRuntimeImages, nativeBrowserDonor } = await import('./lib/exui-native-containers.mjs');
  const { ccdImagePins } = await import('./lib/exui-ccd-runtime.mjs');
  const pins=[...Object.values(nativeRuntimeImages('linux/amd64')),nativeBrowserDonor('linux/amd64'),...Object.values(ccdImagePins('linux/amd64'))];
  for(const fail of [false,true]) {
    const present=new Set(),calls=[];let authDirectory;
    const runCommand=(command,args,options={})=>{
      calls.push({command,args,options});
      if(command==='az')return JSON.stringify({loginServer:'hmctsprod.azurecr.io',accessToken:'synthetic-private-registry-token'});
      if(args[0]==='image') {
        if(!present.has(args[2]))throw Error('not cached');
        const pin=pins.find(pin=>pin.reference===args[2]);
        return JSON.stringify([{Id:pin.configDigest,Os:'linux',Architecture:'amd64',RepoDigests:[pin.reference]}]);
      }
      if(args[0]==='login') {
        assert.equal(options.input,'synthetic-private-registry-token');
        authDirectory=options.env.DOCKER_CONFIG;
        assert.equal(fs.statSync(authDirectory).mode&0o777,0o700);
        fs.writeFileSync(path.join(authDirectory,'config.json'),'synthetic credential');
        return '';
      }
      if(args[0]==='pull') {
        assert.equal(args[args.indexOf('--platform')+1],'linux/amd64');
        assert.match(args.at(-1),/@sha256:[a-f0-9]{64}$/);
        if(fail&&args.at(-1).startsWith('hmctsprod.azurecr.io/'))throw Error('pull failed');
        present.add(args.at(-1));return '';
      }
      assert.fail('unexpected provisioning command');
    };
    if(fail)assert.throws(()=>provisionNativeImages('linux/amd64',{runCommand}),/NATIVE_DATA_PINNED_IMAGE_PULL_FAILED_UNKNOWN/);
    else {
      provisionNativeImages('linux/amd64',{runCommand});
      assert.deepEqual(calls.filter(call=>call.args[0]==='pull').map(call=>call.args.at(-1)),[...new Set(pins.map(pin=>pin.reference))]);
    }
    assert(authDirectory);
    assert.equal(fs.existsSync(authDirectory),false);
    assert(calls.every(call=>!JSON.stringify(call.args).includes('synthetic-private-registry-token')));
    const az=calls.find(call=>call.command==='az');
    assert(az.args.includes('--expose-token'));
    assert(!calls.some(call=>call.command==='az'&&call.args[0]==='login'));
  }
});

test('pin pull diagnostics expose only a fixed cause, never registry output', async () => {
  const { classifyPinPullFailure } = await load();
  for (const [message, expected] of [
    ['toomanyrequests: token=private', 'RATE_LIMIT'],
    ['unauthorized: token=private', 'ACCESS_DENIED'],
    ['manifest unknown: token=private', 'MANIFEST_UNAVAILABLE'],
    ['failed to resolve reference: no such manifest', 'MANIFEST_UNAVAILABLE'],
    ['context deadline exceeded: token=private', 'TIMEOUT'],
    ['TLS connection failed: token=private', 'NETWORK'],
    ['token=private', 'UNKNOWN'],
  ]) assert.equal(classifyPinPullFailure(message), expected);
});

test('browser donor pins match the observed official 1.65 platform manifests while tools pins stay fixed',async()=>{
 const {nativeBrowserDonor,nativeRuntimeImages}=await import('./lib/exui-native-containers.mjs');
 const pins=[
  ['linux/arm64','ccf917390e8eea6cad2bb493313b9d8db2856ed41c24db0a6727eacc766fd273','197b5df7a4651a463469f0e5473b59c0284f3802d915de304f1aeeb39ec03874'],
  ['linux/amd64','bc4fbb329a25287ed23e9216c97063646abdd1bf2da669a9895fa3e2078b2302','494de4cdb8f7edd16c6512c8bcae447cc477248c5b1c5d458b9fe85c67b04edf'],
 ];
 for(const [platform,manifest,config]of pins){
  assert.deepEqual(nativeBrowserDonor(platform),{reference:`mcr.microsoft.com/playwright@sha256:${manifest}`,manifestDigest:`sha256:${manifest}`,configDigest:`sha256:${config}`});
  assert.notEqual(nativeRuntimeImages(platform).browser.manifestDigest,`sha256:${manifest}`);
 }
 assert.equal(nativeRuntimeImages('linux/amd64').browser.manifestDigest,'sha256:ee15712262f017b8157421b212b12099146645f44b1bc5c0514cbbe6a229b1d0');
 assert.throws(()=>nativeBrowserDonor('linux/ppc64le'),/UNSUPPORTED_NATIVE_PLATFORM/);
});

function fakeBrowser(root, platform, { revision = '1254', executable = true, architecture = platform } = {}) {
 const relative = `chromium_headless_shell-${revision}/chrome-headless-shell-${platform === 'linux/arm64' ? 'linux-arm64' : 'linux64'}/chrome-headless-shell`;
 const file = path.join(root, 'browser-cache', relative);
 fs.mkdirSync(path.dirname(file), {recursive:true});
 const bytes=Buffer.alloc(20);bytes.set([0x7f,0x45,0x4c,0x46]);bytes.writeUInt16LE(architecture==='linux/arm64'?183:62,18);
 fs.writeFileSync(file,bytes,{mode:executable?0o755:0o644});
 return relative;
}

for(const platform of ['linux/amd64','linux/arm64']) test(`browser donor copy verifies ${platform} identity and receipts without changing tools runtime`,async t=>{
 const {prepareBrowserCache}=await load();
 const {nativeBrowserDonor,nativeRuntimeImages}=await import('./lib/exui-native-containers.mjs');
 const pin=nativeBrowserDonor(platform);
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'browser-copy-owner-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const calls=[];
 const browser=await prepareBrowserCache(root,platform,{runCommand:(command,args)=>{
  assert.equal(command,'docker');calls.push(args);
  if(args[0]==='image')return JSON.stringify([{Id:pin.configDigest,Os:'linux',Architecture:platform.split('/')[1],RepoDigests:[pin.reference]}]);
  assert.equal(args[0],'run');fakeBrowser(root,platform);
 }});
 assert.deepEqual(calls[0],['image','inspect',pin.reference]);
 const observed=calls[1];
 assert.equal(observed[observed.indexOf('--user')+1],`${process.getuid()}:${process.getgid()}`);
 assert.equal(observed[observed.indexOf('--network')+1],'none');
 assert(observed.includes('--read-only'));assert(observed.includes('no-new-privileges'));
 assert.equal(observed[observed.indexOf('--entrypoint')+1],'/bin/sh');
 assert(observed.includes(pin.reference));assert(!observed.includes(nativeRuntimeImages(platform).browser.reference));
 assert.match(observed.at(-1),/cp -a --no-preserve=ownership/);
 assert.equal(browser,path.join(root,'browser-cache'));assert.equal(fs.statSync(browser).mode&0o777,0o755);
 assert.equal(fs.statSync(root).mode&0o777,0o700);
 const receipt=JSON.parse(fs.readFileSync(path.join(root,'browser-cache-receipt.json')));
 assert.equal(receipt.platform,platform);assert.equal(receipt.playwrightVersion,'1.65.0');assert.equal(receipt.revision,'1254');
 assert.equal(receipt.kind,'browser-cache-preparation');
 assert.deepEqual(receipt.donor,pin);assert.equal(receipt.executableBytes,20);
 const {digestCandidateTree}=await import('./lib/exui-candidate-artifact.mjs');assert.equal(receipt.cacheDigest,await digestCandidateTree(browser));
 assert.equal(fs.statSync(path.join(root,'browser-cache-receipt.json')).mode&0o777,0o600);
});

test('browser donor rejects wrong platform, identity, revision and missing executable before acceptance',async t=>{
 const {prepareBrowserCache}=await load();
 const {nativeBrowserDonor}=await import('./lib/exui-native-containers.mjs');
 const platform='linux/amd64',pin=nativeBrowserDonor(platform);
 for(const [fault,reason] of [['platform',/NATIVE_RUNTIME_PLATFORM_MISMATCH/],['digest',/NATIVE_RUNTIME_IMAGE_MISMATCH/],['provenance',/NATIVE_RUNTIME_PROVENANCE_REQUIRED/],['revision',/ENOENT/],['missing',/NATIVE_BROWSER_CACHE_REQUIRED/],['not-executable',/NATIVE_BROWSER_EXECUTABLE_REQUIRED/],['binary-platform',/NATIVE_BROWSER_PLATFORM_MISMATCH/]]) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'browser-copy-negative-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  let copied=false;
  await assert.rejects(prepareBrowserCache(root,platform,{runCommand:(_command,args)=>{
   if(args[0]==='image')return JSON.stringify([{Id:fault==='digest'?'sha256:wrong':pin.configDigest,Os:'linux',Architecture:fault==='platform'?'arm64':'amd64',RepoDigests:fault==='provenance'?[]:[pin.reference]}]);
   copied=true;
   if(fault!=='missing')fakeBrowser(root,platform,{revision:fault==='revision'?'1248':'1254',executable:fault!=='not-executable',architecture:fault==='binary-platform'?'linux/arm64':platform});
  }}),reason);
  assert.equal(copied,!['platform','digest','provenance'].includes(fault));
  assert.equal(fs.existsSync(path.join(root,'browser-cache-receipt.json')),false);
 }
});

test('native completion exposes assertion codes while withholding multiline private differences',async t=>{
 const {logNativeCompletion}=await load();
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-safe-code-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'private'));
 fs.writeFileSync(path.join(root,'private/ci-result.json'),JSON.stringify({status:'BLOCKED',phaseResults:[],cleanupComplete:true}));
 fs.writeFileSync(path.join(root,'private/orchestration-error.json'),JSON.stringify({message:'CI_CLEAN_HARNESS_REQUIRED\n+ PRIVATE-CANARY credentials\n- expected'}));
 const messages=[];t.mock.method(console,'log',message=>messages.push(message));
 logNativeCompletion(root);
 assert.equal(messages.length,1);assert.match(messages[0],/CI_CLEAN_HARNESS_REQUIRED/);
 assert.doesNotMatch(messages[0],/PRIVATE-CANARY|credentials|expected/);
});

test('shared Jenkins generated files do not dirty source while tracked code and audit policy still do',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jenkins-generated-source-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
 fs.copyFileSync(path.resolve(__dirname,'../.gitignore'),path.join(root,'.gitignore'));
 fs.writeFileSync(path.join(root,'source.mjs'),'export const value=1;');
 fs.writeFileSync(path.join(root,'yarn-audit-known-issues'),'{}');
 git(['init','--quiet']);git(['add','.gitignore','source.mjs','yarn-audit-known-issues']);
 git(['-c','user.name=fixture','-c','user.email=fixture@harness.invalid','commit','--quiet','-m','fixture']);
 const generated=['.yarn_dependencies_installed','version','security.sh','prettyPrintAudit.sh','transform-v4-to-v3-audit.cjs','yarn-audit-with-suppressions.sh','yarn-audit-result','yarn-audit-result-formatted','yarn-audit-known-issues-formatted','yarn-audit-known-issues-result','yarn-audit-issues-result','yarn-audit-issues-result-summary','yarn-audit-issues-advisories','sorted-yarn-audit-issues','sorted-yarn-audit-known-issues','unneeded_suppressions','new_vulnerabilities','active_suppressions'];
 for(const file of generated)fs.writeFileSync(path.join(root,file),'fixture');
 assert.equal(git(['status','--porcelain']),'');
 fs.writeFileSync(path.join(root,'source.mjs'),'changed');
 fs.writeFileSync(path.join(root,'yarn-audit-known-issues'),'changed');
 fs.mkdirSync(path.join(root,'scripts'));fs.writeFileSync(path.join(root,'scripts/transform-v4-to-v3-audit.cjs'),'new code');
 const status=git(['status','--porcelain']);
 assert.match(status,/ M source\.mjs/);assert.match(status,/ M yarn-audit-known-issues/);assert.match(status,/\?\? scripts\//);
});

test('native diagnostics preserve known failures and owned source lines without publishing private error data', async () => {
 const {classifyNativeFailure,nativePhaseFailure,formatNativeFailure,readChildFailure,nativeFailurePrefix}=await import('./lib/exui-native-failure-diagnostics.mjs');
 for (const value of [null, undefined, 42, 'PRIVATE-CANARY']) { assert.deepEqual(classifyNativeFailure(value), {reason:'NATIVE_OPERATION_FAILED'}); assert.doesNotMatch(formatNativeFailure(value), /PRIVATE-CANARY/); }
 const secret='PRIVATE-CANARY credentials /private/secret';
 for(const code of ['ENOENT','ETIMEDOUT','ENOBUFS','ERR_ASSERTION']){
  const error=Object.assign(new Error(secret),{code,stack:`Error: ${secret}\n    at run (file://${path.resolve('scripts/run-harness-ci.mjs')}:123:4)\n    at ${secret}`});
  const classified=classifyNativeFailure(error);
  assert.deepEqual(classified,{reason:'NATIVE_OPERATION_FAILED',code,source:'run-harness-ci.mjs',line:123});
  const child=readChildFailure(`${secret}\n${nativeFailurePrefix}${JSON.stringify({reason:'EVENT_TRANSITION_ACK_TIMEOUT',message:secret})}\n`);
  const diagnostic=nativePhaseFailure(error,'eventCapability',{code:2,signal:null},{run:false,gate:false,baselineReport:true},child);
  const output=formatNativeFailure(diagnostic);
  assert.match(output,/EVENT_TRANSITION_ACK_TIMEOUT/);assert.match(output,/"baselineReport":true/);assert.match(output,/"code":2/);
  assert.doesNotMatch(output,/PRIVATE-CANARY|credentials|\/private|message|stack/);
 }
 assert.deepEqual(classifyNativeFailure({message:'PRIVATE_UPPERCASE_CANARY',code:'PRIVATE_CODE',stack:'Error\n at /foreign/exui-native-host.mjs:25:1'}),{reason:'NATIVE_OPERATION_FAILED'});
 assert.match(formatNativeFailure(nativePhaseFailure(new Error('CI_EVENT_TRANSITION_CANCELLED'), 'eventCapability', {code:2,signal:null}, {}, {reason:'EVENT_TRANSITION_ACK_TIMEOUT'})), /CI_EVENT_TRANSITION_CANCELLED.*EVENT_TRANSITION_ACK_TIMEOUT/);
 const forged=formatNativeFailure({reason:'PRIVATE_UPPERCASE_CANARY',code:'PRIVATE_CODE',source:'PRIVATE_SOURCE',line:1,phase:'PRIVATE_PHASE',terminal:{code:'PRIVATE_CODE',signal:'PRIVATE_SIGNAL'},artifacts:{run:'PRIVATE_PATH'},child:{reason:'PRIVATE_CHILD'}});
 assert.doesNotMatch(forged,/PRIVATE_/);
});

test('native completion publishes sanitized child failure with phase terminal and required artifact presence',async t=>{
 const {logNativeCompletion}=await load();
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-child-code-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'private'));
 fs.writeFileSync(path.join(root,'private/ci-result.json'),JSON.stringify({status:'BLOCKED',phaseResults:[{phase:'family',status:'PASS'},{phase:'recipientCallback',status:'PASS'}],cleanupComplete:true}));
 fs.writeFileSync(path.join(root,'private/orchestration-error.json'),JSON.stringify({message:'PRIVATE-CANARY',diagnostic:{reason:'NATIVE_OPERATION_FAILED',code:'ENOENT',phase:'eventCapability',terminal:{code:2,signal:null},artifacts:{run:false,gate:false,baselineReport:true},child:{reason:'EVENT_TRANSITION_ACK_TIMEOUT',message:'PRIVATE-CANARY'}}}));
 const messages=[];t.mock.method(console,'log',message=>messages.push(message));logNativeCompletion(root);
 assert.equal(messages.length,1);assert.match(messages[0],/EVENT_TRANSITION_ACK_TIMEOUT/);assert.match(messages[0],/eventCapability/);assert.match(messages[0],/recipientCallback PASS/);assert.match(messages[0],/"code":2/);assert.doesNotMatch(messages[0],/PRIVATE-CANARY|NATIVE_PREFLIGHT_FAILED/);
});


test('native completion logs all seven fixed phases and rejects foreign phase names',async t=>{
 const {logNativeCompletion}=await load();
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-seven-completion-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'private'));
 const phases=['family','scope','ccd','eventCapability','routing','recipientCallback','selectorEventRow'];
 const result={status:'PASS',phaseResults:phases.map(phase=>({phase,status:'PASS',privateDetail:'PRIVATE-CANARY'})),cleanupComplete:true};
 const write=()=>fs.writeFileSync(path.join(root,'private/ci-result.json'),JSON.stringify(result));
 const messages=[];t.mock.method(console,'log',message=>messages.push(message));write();logNativeCompletion(root);
 assert.equal(messages.length,1);assert.match(messages[0],/Native PASS/);for(const phase of phases)assert(messages[0].includes(phase+' PASS'));assert.match(messages[0],/cleanup complete/);assert.doesNotMatch(messages[0],/PRIVATE-CANARY/);
 result.status='BLOCKED';result.phaseResults[6].status='BLOCKED';write();logNativeCompletion(root);assert.equal(messages.length,2);assert.match(messages[1],/Native BLOCKED/);assert.match(messages[1],/selectorEventRow BLOCKED/);
 result.phaseResults.push({phase:'PRIVATE-CANARY\nforeign',status:'PASS'});write();logNativeCompletion(root);assert.equal(messages.length,2);
});

test('native completion labels blocked profile gates beside a passing core result without exposing profile diagnostics',async t=>{
 const {logNativeCompletion}=await load();const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'native-profile-completion-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'private'),{mode:0o700});
 fs.writeFileSync(path.join(root,'private/ci-result.json'),JSON.stringify({status:'PASS',phaseResults:[{phase:'family',status:'PASS'}],cleanupComplete:true}));fs.writeFileSync(path.join(root,'private/assurance-profile-attempts.json'),JSON.stringify({schemaVersion:1,kind:'assurance-profile-attempts',cmcProfileAttempt:{status:'BLOCKED',reason:'CMC_PROFILE_OBSERVATIONS',diagnostic:{kind:'cmc-jurisdiction-filter-diagnostic',reasonCode:'CMC_PROFILE_OBSERVATIONS',expectedIds:['CMC'],observedIds:['CMC','ST_CIC','UNREVIEWED'],unexpectedIds:['ST_CIC','UNREVIEWED'],missingIds:[],privateDetail:'PRIVATE-CANARY'}},frProfileAttempt:{status:'BLOCKED',reason:'FR_PROFILE_COMPANION_BLOCKED'}}),{mode:0o600});
 const messages=[];t.mock.method(console,'log',message=>messages.push(message));logNativeCompletion(root);assert.match(messages[0],/Native core PASS/);assert.match(messages[0],/profile gates: CMC profile BLOCKED \(CMC_PROFILE_OBSERVATIONS\); expected 1 jurisdictions, observed 3; unexpected: ST_CIC, UNREVIEWED, FR profile BLOCKED \(FR_PROFILE_COMPANION_BLOCKED\)/);assert.doesNotMatch(messages[0],/PRIVATE-CANARY|privateDetail|expectedIds/);
});

test('Jenkins overall failure cannot publish a passing main-only summary',async t=>{
 const {publishSummary}=await load();const {writeHarnessPublicSummary}=await import('./lib/exui-output-boundary.mjs'),{validatePublicSummary}=await import('./lib/exui-evidence-io.mjs');
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'jenkins-overall-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));writeHarnessPublicSummary(root,{status:'PASS',exitCode:0},true);
 const target=path.resolve(__dirname,'../functional-output/tests/harness/public/release-assurance-summary.json'),prior=fs.existsSync(target)?fs.readFileSync(target):null;fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});t.after(()=>{if(prior)fs.writeFileSync(target,prior);else fs.rmSync(target,{force:true});});
 assert.equal(publishSummary(root,2),'BLOCKED');assert.equal(validatePublicSummary(target).status,'BLOCKED');assert.equal(validatePublicSummary(target).receiptAvailable,false);assert.equal(validatePublicSummary(path.join(root,'public/release-assurance-summary.json')).status,'PASS');
 assert.equal(publishSummary(root,0),'PASS');assert.equal(validatePublicSummary(target).releaseApproval,false);assert.throws(()=>publishSummary(root,7),/ASSURANCE_EXIT_REQUIRED/);
});
