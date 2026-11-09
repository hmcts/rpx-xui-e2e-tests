const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Module } = require('node:module');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const pin = hash('synthetic-input');
const job = {
  schemaVersion: 1,
  candidateManifest: '/synthetic/candidate-artifact.json',
  expectedArtifactDigest: pin,
  browserCache: '/synthetic/browser',
  output: '/synthetic/output',
};

// Execute whole production modules, following the existing startupModule test pattern.
// Only the two fixed modules and the finite in-memory mutants below are permitted.
async function loadCaptureModule(relative, overrides) {
  assert(['scripts/lib/exui-candidate-ci-inputs.mjs', 'scripts/run-harness-ci.mjs'].includes(relative));
  const file = path.join(root, relative);
  let source = fs.readFileSync(file, 'utf8');
  if (relative === 'scripts/run-harness-ci.mjs') {
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const cli = parsed.statements.at(-1);
    assert(ts.isIfStatement(cli) && cli.getText(parsed).includes('process.argv[1]'), 'FIXED_CI_CLI_BOUNDARY');
    // The CLI's top-level await cannot compile as CommonJS. All exported functions remain intact.
    source = source.slice(0, cli.getStart(parsed));
  }
  const mutation = process.env.ST_CIC_CAPTURE_TEST_MUTATION;
  const changes = {
    gate: ['if(stCicProfile) context.stCicNativeCapture', 'if(true) context.stCicNativeCapture'],
    clone: ['captureStCicNative?.(structuredClone(context.stCicNativeCapture));', 'captureStCicNative?.(context.stCicNativeCapture);'],
  };
  if (mutation !== undefined) {
    assert(Object.hasOwn(changes, mutation), 'UNKNOWN_CAPTURE_TEST_MUTATION');
    const [before, after] = changes[mutation];
    if (relative === (mutation === 'gate' ? 'scripts/lib/exui-candidate-ci-inputs.mjs' : 'scripts/run-harness-ci.mjs')) {
      assert.equal(source.split(before).length, 2, 'EXACT_CAPTURE_MUTATION_TARGET');
      source = source.replace(before, after);
    }
  }
  source = source.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(file).href));
  const loaded = { ...overrides };
  for (const [, name] of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    if (!Object.hasOwn(loaded, name)) loaded[name] = await import(pathToFileURL(path.resolve(path.dirname(file), name)).href);
  }
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = new Module(file);
  mod.filename = file + '.capture-test.cjs';
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const originalRequire = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(loaded, name) ? loaded[name] : originalRequire(name);
  mod._compile(code, mod.filename);
  return mod.exports;
}

async function preparation() {
  const events = [];
  const captures = [];
  const image = reference => ({ Id: pin, Os: 'linux', Architecture: 'arm64', RepoDigests: [reference + '@' + pin] });
  const elf = Buffer.alloc(24);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(elf);
  elf.writeUInt16LE(183, 18);
  const reads = new Map([
    [path.join(root, 'package.json'), JSON.stringify({ engines: { node: '>=24' } })],
    [path.join(root, 'scripts/fixtures/exui-configuration-review.json'), '{}'],
    [path.join(root, 'node_modules/playwright-core/browsers.json'), '{}'],
    [path.join(root, 'synthetic-source.mjs'), 'synthetic source'],
    ['/synthetic/browser/chromium', elf],
  ]);
  const fakeFs = {
    realpathSync: file => file,
    readFileSync: file => {
      assert(reads.has(file), 'UNEXPECTED_PREFLIGHT_READ: ' + file);
      return reads.get(file);
    },
  };
  const capture = name => context => {
    if (name !== 'common') assert.equal(context.nativeCohortCapture, captures[0], 'COMMON_CAPTURE_MUST_PRECEDE_PROFILE');
    const value = { binding: { name, nested: { digest: pin } }, reference: { path: name, digest: pin } };
    events.push(name);
    captures.push(value);
    return value;
  };
  const module = await loadCaptureModule('scripts/lib/exui-candidate-ci-inputs.mjs', {
    'node:fs': fakeFs,
    'node:child_process': {
      spawnSync: (command, args) => {
        if (command === 'git') {
          assert(['rev-parse HEAD', 'status --porcelain'].includes(args.join(' ')));
          return { status: 0, stdout: args[0] === 'rev-parse' ? 'a'.repeat(40) : '' };
        }
        assert.equal(command, 'docker');
        if (args[0] === 'version') return { status: 0, stdout: JSON.stringify({ Os: 'linux', Arch: 'arm64', Version: 'synthetic' }) };
        assert.deepEqual(args.slice(0, 2), ['image', 'inspect']);
        assert(['browser-ref', 'api-ref', 'ccd-ref'].includes(args[2]));
        return { status: 0, stdout: JSON.stringify([image(args[2])]) };
      },
    },
    './exui-candidate-artifact.mjs': {
      verifyCandidateArtifact: async () => {
        events.push('artifact');
        return { candidateRoot: '/synthetic/candidate', identity: { artifactDigest: pin }, provenance: { platform: 'linux/arm64' } };
      },
      digestCandidateTree: async () => pin,
    },
    './exui-candidate-runtime.mjs': { HARNESS_SOURCE_FILES: ['synthetic-source.mjs'], effectiveCandidateConfiguration: () => ({ digest: pin }) },
    './exui-ccd-browser-runtime.mjs': { CCD_HARNESS_SOURCE_FILES: ['synthetic-source.mjs'] },
    './exui-harness-dependencies.mjs': { verifyHarnessDependencies: async () => ({ digest: pin, playwrightVersion: '1.65.0' }) },
    './exui-configuration-catalogue.mjs': { assertCandidateConfigurationSources: () => events.push('source-checked') },
    './exui-ccd-runtime.mjs': { ccdImagePins: () => ({ data: { reference: 'ccd-ref', manifestDigest: pin } }), assertCcdImageIdentity: () => undefined },
    './exui-oci-runtime.mjs': { ARM64_BROWSER_RUNTIME: 'browser-ref', assertBrowserRuntime: () => undefined, assertReadOnlyMountIsolation: () => events.push('isolation-checked'), browserExecutable: () => 'chromium' },
    './exui-native-containers.mjs': { nativeRuntimeImages: () => ({ api: { reference: 'api-ref', manifestDigest: pin } }) },
    './exui-evidence-io.mjs': { digestBytes: hash, writeJsonAtomic: file => { assert.equal(file, '/synthetic/output/private/toolchain.json'); events.push('toolchain-written'); } },
    './exui-divorce-native-binding.mjs': { captureDivorceNativeBinding: capture('common') },
    './exui-st-cic-profile-admission.mjs': { captureStCicNativeBinding: capture('st-cic') },
    './exui-personal-service-admission.mjs': { capturePersonalNativeBinding: capture('personal') },
    './exui-complex-email-admission.mjs': { captureComplexNativeBinding: capture('complex') },
  });
  return { ...module, events, captures };
}

test('actual prepareCiJob does not capture ST_CIC with absent or false opt-in', async () => {
  for (const options of [undefined, { stCicProfile: false }]) {
    const p = await preparation();
    const context = await p.prepareCiJob(job, job.output, options);
    assert.equal(Object.hasOwn(context, 'stCicNativeCapture'), false);
    assert.deepEqual(p.events, ['artifact', 'source-checked', 'isolation-checked', 'toolchain-written', 'common', 'personal', 'complex']);
  }
});

test('actual prepareCiJob captures ST_CIC only after trusted preflight and common capture', async () => {
  const p = await preparation();
  const context = await p.prepareCiJob(job, job.output, { stCicProfile: true });
  assert.deepEqual(p.events, ['artifact', 'source-checked', 'isolation-checked', 'toolchain-written', 'common', 'st-cic', 'personal', 'complex']);
  assert.equal(context.stCicNativeCapture, p.captures[1]);
});

test('actual prepareCiJob rejects nonboolean opt-in before any preparation', async () => {
  for (const value of [null, 0, 1, 'true', {}, []]) {
    const p = await preparation();
    await assert.rejects(p.prepareCiJob(job, job.output, { stCicProfile: value }), /ST_CIC_PROFILE_OPT_IN/);
    assert.deepEqual(p.events, []);
  }
});

async function relay({ optIn, callbackThrows = false, timingWriteThrows = false }) {
  const p = await preparation();
  const capture = name => ({ binding: { name, nested: { digest: pin } }, reference: { path: name, digest: pin } });
  const context = { nativeCohortCapture: capture('common'), stCicNativeCapture: capture('st-cic'), personalNativeCapture: capture('personal'), complexNativeCapture: capture('complex') };
  const held = structuredClone(context);
  const events = [];
  const writes = [];
  const module = await loadCaptureModule('scripts/run-harness-ci.mjs', {
    'node:fs': { readFileSync: file => { assert([job.candidateManifest, '/synthetic/job.json'].includes(file)); return JSON.stringify(file === job.candidateManifest ? { candidateRoot: '/synthetic/candidate' } : job); } },
    './lib/exui-candidate-ci-inputs.mjs': {
      validateCiJob: p.validateCiJob,
      createCiOutput: output => output,
      prepareCiJob: async (_job, _output, options) => {
        assert.equal(options.stCicProfile, optIn);
        events.push('prepare');
        return context;
      },
      writeCiPublicSummary: (_output, verdict, passed) => { assert.equal(verdict.status, 'BLOCKED'); assert.equal(passed, false); events.push('summary'); },
    },
    './lib/exui-candidate-ci-process.mjs': { installCiCancellation: ({ resources }) => { assert.equal(resources.size, 0); return () => events.push('uninstall'); } },
    './lib/exui-configuration-runtime-coverage.mjs': {
      writeConfigurationCoverage: () => { events.push('coverage-boundary'); throw Error('STOP_AFTER_CAPTURE_BOUNDARY'); },
    },
    './lib/exui-native-failure-diagnostics.mjs': { nativePhaseFailure: () => ({ classification: 'controlled-unit-boundary' }) },
    './lib/exui-evidence-io.mjs': { writeJsonAtomic: (file, value) => { writes.push({ file, value }); if (timingWriteThrows && file.endsWith('/public/native-stage-timings.json')) throw Error('TIMING_WRITE_FAILED'); } },
  });
  const options = {
    captureNativeCohort: () => events.push('common'),
    capturePersonalNative: () => events.push('personal'),
    captureComplexNative: () => events.push('complex'),
  };
  if (optIn) options.captureStCicNative = value => {
    events.push('st-cic');
    assert.deepEqual(value, held.stCicNativeCapture);
    value.binding.nested.digest = 'caller-mutation';
    value.reference.path = 'caller-mutation';
    if (callbackThrows) throw Error('CONTROLLED_CAPTURE_CALLBACK_FAILURE');
  };
  const result = await module.runHarnessCi('/synthetic/job.json', options);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.exitCode, 2);
  assert.equal(result.continuationSafe, true);
  assert.deepEqual(context, held, 'caller must not mutate held native capture');
  const failure = writes.find(row => row.file.endsWith('/orchestration-error.json'));
  assert.equal(failure.value.message, callbackThrows ? 'CONTROLLED_CAPTURE_CALLBACK_FAILURE' : 'STOP_AFTER_CAPTURE_BOUNDARY');
  const final = writes.find(row => row.file.endsWith('/ci-result.json'));
  assert.deepEqual(final.value.phaseResults, []);
  assert.equal(writes.find(row => row.file.endsWith('/public/native-stage-timings.json')).value.catalogueCredit, false);
  return events;
}

test('actual runHarnessCi relays explicit opt-in and cloned capture before any pilot work', async () => {
  assert.deepEqual(await relay({ optIn: true }), ['prepare', 'common', 'st-cic', 'personal', 'complex', 'coverage-boundary', 'uninstall', 'summary']);
});

test('actual runHarnessCi leaves ST_CIC disabled when no callback is supplied', async () => {
  assert.deepEqual(await relay({ optIn: false }), ['prepare', 'common', 'personal', 'complex', 'coverage-boundary', 'uninstall', 'summary']);
});

test('actual runHarnessCi does not advance after capture callback failure', async () => {
  assert.deepEqual(await relay({ optIn: true, callbackThrows: true }), ['prepare', 'common', 'st-cic', 'uninstall', 'summary']);
});

test('native timing artifact write failure cannot mask the CI result or prevent its private record', async () => {
  assert.deepEqual(await relay({ optIn: false, timingWriteThrows: true }), ['prepare', 'common', 'personal', 'complex', 'coverage-boundary', 'uninstall', 'summary']);
});
