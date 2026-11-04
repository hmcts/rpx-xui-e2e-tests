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
  const { nativeRuntimeImages } = await import('./lib/exui-native-containers.mjs');
  const { ccdImagePins } = await import('./lib/exui-ccd-runtime.mjs');
  const pins=[...Object.values(nativeRuntimeImages('linux/amd64')),...Object.values(ccdImagePins('linux/amd64'))];
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
    if(fail)assert.throws(()=>provisionNativeImages('linux/amd64',{runCommand}),/pull failed/);
    else provisionNativeImages('linux/amd64',{runCommand});
    assert(authDirectory);
    assert.equal(fs.existsSync(authDirectory),false);
    assert(calls.every(call=>!JSON.stringify(call.args).includes('synthetic-private-registry-token')));
    const az=calls.find(call=>call.command==='az');
    assert(az.args.includes('--expose-token'));
    assert(!calls.some(call=>call.command==='az'&&call.args[0]==='login'));
  }
});

test('browser cache copy uses controller identity without preserving image ownership or widening its private root',async t=>{
 const {prepareBrowserCache}=await load();
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'browser-copy-owner-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let observed;
 const browser=prepareBrowserCache(root,'linux/amd64',{runCommand:(command,args)=>{
  assert.equal(command,'docker');observed=args;
  const output=path.join(root,'browser-cache');fs.writeFileSync(path.join(output,'synthetic-browser'),'fixture');fs.chmodSync(output,0o755);
 }});
 assert.equal(observed[observed.indexOf('--user')+1],`${process.getuid()}:${process.getgid()}`);
 assert.equal(observed[observed.indexOf('--network')+1],'none');
 assert(observed.includes('--read-only'));assert(observed.includes('no-new-privileges'));
 assert.match(observed.at(-1),/cp -a --no-preserve=ownership/);
 assert.equal(browser,path.join(root,'browser-cache'));assert.equal(fs.statSync(browser).mode&0o777,0o755);
 assert.equal(fs.statSync(root).mode&0o777,0o700);
});
