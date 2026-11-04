const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const script = path.join(__dirname, 'observe-harness-worker.mjs');
async function load() {
  assert(fs.existsSync(script), 'worker capability observation helper is required');
  return import('./observe-harness-worker.mjs');
}
function temporary(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'worker-capabilities-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('worker observation admits only selected platform fields and fixed read-only Docker commands', async () => {
  const m = await load(), calls = [];
  const report = m.collectWorkerCapabilities({ host: { os: 'linux', architecture: 'x64', hostname: 'PRIVATE-CANARY' },
    run: (command, args, options) => {
      calls.push([command, args]);
      assert.deepEqual(Object.keys(options.env), ['PATH']);
      assert.equal(options.timeout, 5000);
      assert.equal(command, 'docker');
      if (args[0] === 'version') return { status: 0, stdout: JSON.stringify({ Os: 'linux', Arch: 'amd64', Name: 'PRIVATE-CANARY' }) };
      assert.deepEqual(args.slice(0, 2), ['image', 'inspect']);
      const reference = args[2], pin = reference.slice(reference.indexOf('sha256:'));
      const repository = reference.includes('@') ? reference.slice(0, reference.indexOf('@')) : 'private.invalid/repo';
      return { status: 0, stdout: JSON.stringify([{ Id: pin, Os: 'linux', Architecture: 'arm64', RepoDigests: [repository + '@' + pin], Config: { Env: ['PRIVATE-CANARY'] } }]) };
    } });
  assert.deepEqual(report.host, { os: 'linux', architecture: 'amd64' });
  assert.deepEqual(report.docker, { status: 'observed', os: 'linux', architecture: 'amd64' });
  assert.equal(calls.length, 11);
  assert(report.images.every(image => image.status === 'present' && image.pinnedIdentityMatched));
  assert.equal(report.nativeReady, false);
  assert.equal(report.releaseApproval, false);
  assert.equal(report.nativeExecution, 'not-run');
  assert(!report.reasons.includes('DOCKER_PLATFORM_UNSUPPORTED'));
  assert(report.reasons.includes('PINNED_IMAGES_NOT_VERIFIED'));
  assert(report.reasons.includes('NATIVE_INPUT_UNCONFIGURED'));
  assert(!JSON.stringify(report).includes('PRIVATE-CANARY'));
  assert(!JSON.stringify(report).includes('private.invalid'));
  m.validateCapabilityReport(report);
});

test('missing Docker and malformed responses remain explicit observations without leaking failure output', async () => {
  const m = await load();
  for (const result of [{ status: 1, stdout: 'PRIVATE-CANARY', stderr: 'SECRET' }, { status: 0, stdout: 'not-json SECRET' }]) {
    const report = m.collectWorkerCapabilities({ run: () => result });
    assert.equal(report.docker.status, 'unavailable');
    assert(report.images.every(image => image.status === 'not-checked'));
    assert(report.reasons.includes('DOCKER_UNAVAILABLE'));
    assert(!/SECRET|PRIVATE-CANARY/.test(JSON.stringify(report)));
  }
  const report = m.collectWorkerCapabilities({ run: () => { throw new Error('SECRET'); } });
  assert.equal(report.docker.status, 'unavailable');
});

test('only a declared strict native job is checked for input presence without accepting candidate integrity', async t => {
  const m = await load(), root = temporary(t);
  const candidate = path.join(root, 'candidate.json'), browser = path.join(root, 'browser'), job = path.join(root, 'job.json');
  fs.writeFileSync(candidate, 'PRIVATE-CANARY'); fs.mkdirSync(browser);
  const input = { schemaVersion: 1, candidateManifest: candidate, expectedArtifactDigest: 'sha256:' + 'a'.repeat(64), browserCache: browser, output: path.join(root, 'future-output') };
  fs.writeFileSync(job, JSON.stringify(input));
  const collect = () => m.collectWorkerCapabilities({ inputPath: job, run: () => ({ status: 1 }) });
  const report = collect();
  assert.deepEqual(report.inputs, { job: 'present', candidateManifest: 'present', browserCache: 'present', integrity: 'not-verified' });
  assert(!JSON.stringify(report).includes(root));
  assert(!JSON.stringify(report).includes('PRIVATE-CANARY'));
  fs.unlinkSync(candidate);
  assert.equal(collect().inputs.candidateManifest, 'unavailable');
  fs.writeFileSync(job, JSON.stringify({ ...input, secret: 'PRIVATE-CANARY' }));
  assert.equal(collect().inputs.job, 'invalid');
  assert(!JSON.stringify(collect()).includes('PRIVATE-CANARY'));
});

test('publication accepts only the fixed sanitized schema, resets stale output and rejects aliases', async t => {
  const m = await load(), root = temporary(t);
  const report = m.collectWorkerCapabilities({ run: () => ({ status: 1 }) });
  const file = m.writeCapabilityReport(report, root);
  assert.equal(file, path.join(root, 'functional-output/tests/harness/public/native-ci-capabilities.json'));
  assert.deepEqual(m.readCapabilityReport(root), report);
  assert.throws(() => m.validateCapabilityReport({ ...report, token: 'PRIVATE-CANARY' }), /INVALID_WORKER_CAPABILITIES/);
  assert.throws(() => m.validateCapabilityReport({ ...report, nativeReady: true }), /INVALID_WORKER_CAPABILITIES/);
  const leaked = structuredClone(report); leaked.docker.os = 'PRIVATE-CANARY';
  assert.throws(() => m.validateCapabilityReport(leaked), /INVALID_WORKER_CAPABILITIES/);
  m.resetCapabilityReport(root); assert(!fs.existsSync(file));
  const protectedFile = path.join(root, 'protected'); fs.writeFileSync(protectedFile, 'keep');
  fs.symlinkSync(protectedFile, file);
  assert.throws(() => m.writeCapabilityReport(report, root), /WORKER_CAPABILITY_OUTPUT_ALIAS/);
  assert.equal(fs.readFileSync(protectedFile, 'utf8'), 'keep');
  fs.unlinkSync(file);
  const publicDir = path.dirname(file), original = publicDir + '-original';
  fs.renameSync(publicDir, original); fs.symlinkSync(original, publicDir);
  assert.throws(() => m.writeCapabilityReport(report, root), /WORKER_CAPABILITY_OUTPUT_ALIAS/);
});

test('Tools provenance remains distinct while API, build and CCD images require their pinned digests', async () => {
  const m = await load();
  for (const repoDigests of [['synthetic.invalid/tools@sha256:' + 'f'.repeat(64)], []]) {
    const report = m.collectWorkerCapabilities({ run: (_command, args) => {
      if (args[0] === 'version') return { status: 0, stdout: JSON.stringify({ Os: 'linux', Arch: 'arm64' }) };
      const pin = args[2].slice(args[2].indexOf('sha256:'));
      return { status: 0, stdout: JSON.stringify([{ Id: pin, Os: 'linux', Architecture: 'arm64', RepoDigests: repoDigests }]) };
    } });
    assert.equal(report.images.find(image => image.service === 'tools').pinnedIdentityMatched, repoDigests.length > 0);
    assert.equal(report.images.find(image => image.service === 'build').pinnedIdentityMatched, false);
    assert(report.images.filter(image => !['api', 'tools'].includes(image.service)).every(image => image.pinnedIdentityMatched === false));
    assert.equal(report.nativeReady, false);
  }
});

test('candidate build image absence blocks native worker readiness', async () => {
  const m = await load();
  const { CANDIDATE_BUILD_IMAGE } = await import('./lib/exui-candidate-build.mjs');
  const report = m.collectWorkerCapabilities({ run: (_command, args) => {
    if (args[0] === 'version') return { status: 0, stdout: JSON.stringify({ Os: 'linux', Arch: 'arm64' }) };
    if (args[2] === CANDIDATE_BUILD_IMAGE) return { status: 1, stdout: '' };
    const pin = args[2].slice(args[2].indexOf('sha256:'));
    const reference = args[2];
    const repository = reference.includes('@') ? reference.slice(0, reference.indexOf('@')) : 'synthetic.invalid/repo';
    return { status: 0, stdout: JSON.stringify([{ Id: pin, Os: 'linux', Architecture: 'arm64', RepoDigests: [repository + '@' + pin] }]) };
  } });
  assert.deepEqual(report.docker, { status: 'observed', os: 'linux', architecture: 'arm64' });
  assert.equal(report.images.find(image => image.service === 'build').status, 'unavailable');
  assert(report.reasons.includes('PINNED_IMAGES_NOT_VERIFIED'));
  assert.equal(report.nativeReady, false);
});

test('verified AMD64 cached images remove platform gaps but grant no native execution credit',async()=>{
 const m=await load();
 const {nativeRuntimeImages}=await import('./lib/exui-native-containers.mjs');
 const {ccdImagePins}=await import('./lib/exui-ccd-runtime.mjs');
 const native=nativeRuntimeImages('linux/amd64'),pins={api:native.api,tools:native.browser,build:native.api,...ccdImagePins('linux/amd64')};
 const report=m.collectWorkerCapabilities({run:(_command,args)=>{
  if(args[0]==='version')return {status:0,stdout:JSON.stringify({Os:'linux',Arch:'amd64'})};
  const pin=Object.values(pins).find(pin=>pin.reference===args[2]);assert(pin);
  return {status:0,stdout:JSON.stringify([{Id:pin.configDigest,Os:'linux',Architecture:'amd64',RepoDigests:[pin.reference]}])};
 }});
 assert(report.images.every(image=>image.pinnedIdentityMatched));
 assert(!report.reasons.includes('DOCKER_PLATFORM_UNSUPPORTED'));
 assert(!report.reasons.includes('PINNED_IMAGES_NOT_VERIFIED'));
 assert.equal(report.nativeExecution,'not-run');assert.equal(report.nativeReady,false);assert.equal(report.releaseApproval,false);
});
