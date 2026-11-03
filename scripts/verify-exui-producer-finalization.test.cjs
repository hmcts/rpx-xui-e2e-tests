const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { completeRun } = require('./fixtures/exui-release-evidence.mock.cjs');
const digest = letter => 'sha256:' + letter.repeat(64);
function probe(kind, fault) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'producer-finalization-'));
  const output = path.join(root, 'output'), stage = path.join(root, 'stage'), candidate = path.join(root, 'candidate'), browser = path.join(root, 'browser');
  for (const directory of [stage, path.join(candidate, 'config'), browser]) fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(path.join(stage, 'scripts/lib'), { recursive: true });
  fs.copyFileSync('scripts/lib/exui-runtime-network-guard.cjs', path.join(stage, 'scripts/lib/exui-runtime-network-guard.cjs'));
  fs.writeFileSync(path.join(candidate, 'config/default.json'), JSON.stringify({ services: { idam: {} }, feature: {}, waSupportedJurisdictions: 'IA,CIVIL' }));
  const revision = JSON.parse(fs.readFileSync('node_modules/playwright-core/browsers.json')).browsers.find(x => x.name === 'chromium-headless-shell').revision;
  const binary = path.join(browser, `chromium_headless_shell-${revision}/chrome-headless-shell-linux-arm64/chrome-headless-shell`);
  fs.mkdirSync(path.dirname(binary), { recursive: true }); const bytes = Buffer.alloc(20); bytes.write('ELF', 1); bytes[0] = 0x7f; bytes.writeUInt16LE(183, 18); fs.writeFileSync(binary, bytes);
  const artifact = { candidateRoot: candidate, identity: completeRun().manifest.identity, payloadDigest: digest('a'), provenance: { runtimeNodeVersion: 'v24.22.1', buildRuntime: { nodeVersion: 'v24.22.1' } } };
  const descriptor = { schemaVersion: 1, registry: 'synthetic.invalid', repository: 'fixture/candidate', digest: digest('a'), imageReference: 'synthetic.invalid/fixture/candidate@' + digest('a'), sourceCommit: 'a'.repeat(40), sourceTree: 'c'.repeat(40), producerJob: 'synthetic/job', producerBuild: '1', invocationId: '11111111-1111-4111-8111-111111111111', buildTag: 'synthetic', platform: 'linux/arm64', observedImageId: digest('d') };
  const config = { output, fault, kind, artifact, descriptor, expected: path.join(root, 'expected.json'), events: path.join(root, 'events.jsonl') };
  const configPath = path.join(root, 'probe.json'); fs.writeFileSync(configPath, JSON.stringify(config));
  let args;
  if (kind === 'native') {
    fs.mkdirSync(output);
    fs.writeFileSync(path.join(output, 'input.json'), JSON.stringify({ releaseScopeId: 'exui-wa-family-pilot', artifact, browserRoot: browser, runId: 'candidate-11111111-1111-4111-8111-111111111111', harnessCommit: 'b'.repeat(40), harnessSourceState: 'clean', harnessSourceDigest: digest('9'), browserDigest: digest('8'), harnessDependencies: { digest: digest('7'), playwrightVersion: '1.64.1' } }));
    const driver = path.join(root, 'driver.mjs'); fs.writeFileSync(driver, `import {runNativeHostPhase} from ${JSON.stringify(pathToFileURL(path.resolve('scripts/lib/exui-native-host.mjs')).href)};try{process.exitCode=(await runNativeHostPhase(${JSON.stringify(output)},${JSON.stringify(stage)})).exitCode}catch{process.exitCode=2}`);
    args = [driver];
  } else {
    const descriptorPath = path.join(root, 'descriptor.json'); fs.writeFileSync(descriptorPath, JSON.stringify(descriptor));
    args = [path.resolve('scripts/run-harness-oci-candidate.mjs'), '--candidate', descriptorPath, '--browser', browser, '--output', output];
  }
  const child = spawnSync(process.execPath, ['--import', path.resolve('scripts/fixtures/exui-producer-finalization-probe.mjs'), ...args], { encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH, TMPDIR: fs.realpathSync(os.tmpdir()), PRODUCER_PROBE_CONFIG: configPath } });
  fs.writeFileSync(path.join(root, 'process-terminal.json'), JSON.stringify({ code: child.status, signal: child.signal, stdout: child.stdout, stderr: child.stderr }, null, 2));
  const events = fs.existsSync(config.events) ? fs.readFileSync(config.events, 'utf8').trim().split('\n').map(JSON.parse) : [];
  return { root, output, child, events, config, dispose() {
    for (const event of events.filter(x => x.type === 'owned-temporary')) {
      assert.equal(path.dirname(event.path), fs.realpathSync(os.tmpdir()));
      assert(/^(harness-native-state-|harness-oci-(payload|sources)-)/.test(path.basename(event.path)));
      fs.rmSync(event.path, { recursive: true, force: true });
    }
    fs.rmSync(root, { recursive: true, force: true });
  } };
}
for (const kind of ['native', 'oci']) for (const fault of [null, 'public', 'gate-after-rename', ...(kind === 'native' ? ['controller', 'source-record', 'cancel-exit', 'cleanup', 'cleanup-source-record'] : ['source-cleanup', 'source-record', 'payload-cleanup', 'retain-source'])])
  test(`support only: actual ${kind} producer finalizes ${fault ?? 'clean'} after valid synthetic proof`, async () => {
    const p = probe(kind, fault);
    try {
      assert.equal(p.child.error, undefined, p.child.stderr);
      const positive = fault === null || fault === 'retain-source';
      assert.equal(p.child.status, positive ? 0 : 2, p.child.stderr + JSON.stringify(p.events));
      if (fault) {
        const index = p.events.findIndex(x => x.type === 'fault' && x.name === fault);
        assert(index > 0, 'intended exact-path filesystem fault must fire');
        assert.equal(p.events[index - 1].type, 'evaluated');
        assert.equal(p.events[index - 1].status, 'PASS');
      }
      assert.equal(p.events.filter(x => x.type === 'proof').length, 2);
      const gate = path.join(p.output, 'gate.json');
      if (positive) {
        assert.equal(JSON.parse(fs.readFileSync(gate)).verdict.status, 'PASS');
        if (fault === 'retain-source') {
          const snapshot = JSON.parse(fs.readFileSync(path.join(p.output, 'source-snapshot.json')));
          assert.equal(snapshot.retained, true);
          assert(fs.existsSync(snapshot.path));
        }
        const consumer = spawnSync(process.execPath, [path.resolve('scripts/verify-exui-release-gate.mjs'), '--receipt', gate, '--expected', p.config.expected], { encoding: 'utf8', env: { PATH: process.env.PATH } });
        assert.equal(consumer.status, 0, consumer.stderr);
        fs.writeFileSync(path.join(p.root, 'consumer-terminal.json'), JSON.stringify({ code: consumer.status, stdout: consumer.stdout, stderr: consumer.stderr }));
        const gateEvent = p.events.findLastIndex(x => x.type === 'write' && x.name === 'gate.json');
        assert(gateEvent >= 0);
        assert(!p.events.slice(gateEvent + 1).some(x => ['source-cleanup', 'payload-cleanup', 'resource-cleanup', 'write'].includes(x.type)), 'machine gate must commit after all required output/cleanup');
      } else {
        assert.equal(fs.existsSync(gate), false, 'failed producer cannot leave a current PASS gate');
        const rawRun = ['run.json', 'interrupted-run.json', 'incomplete-cleanup-run.json'].map(name => path.join(p.output, name)).find(file => fs.existsSync(file));
        const io = await import('./lib/exui-evidence-io.mjs'), policy = (await import('./lib/exui-release-policy.mjs')).getReleasePolicy('exui-wa-family-pilot');
        assert.equal(io.loadRunEvidence(rawRun, policy).receipt.verdict.status, 'PASS', 'finalization failure must retain the original valid raw proof facts');
        const terminalPath = path.join(p.output, 'controller-terminal.json');
        if (kind === 'native' && fs.existsSync(terminalPath)) {
          const terminal = JSON.parse(fs.readFileSync(terminalPath));
          assert(terminal.status === 'interrupted' || terminal.exitCode === 2);
        }
        const summaryPath = path.join(p.output, 'public/release-assurance-summary.json');
        if (fs.existsSync(summaryPath)) { assert.equal((await import('./lib/exui-evidence-io.mjs')).validatePublicSummary(summaryPath).status, 'BLOCKED'); assert.doesNotMatch(fs.readFileSync(summaryPath, 'utf8'), /synthetic-finalization-canary/); }
        const consumer = spawnSync(process.execPath, [path.resolve('scripts/verify-exui-release-gate.mjs'), '--receipt', gate, '--expected', p.config.expected], { encoding: 'utf8', env: { PATH: process.env.PATH } });
        assert.equal(consumer.status, 2);
        fs.writeFileSync(path.join(p.root, 'consumer-terminal.json'), JSON.stringify({ code: consumer.status, stdout: consumer.stdout, stderr: consumer.stderr }));
        if (fault === 'cancel-exit') assert(p.events.some(x => x.type === 'exit' && x.code === 2));
        if (fault === 'cleanup' || fault === 'cleanup-source-record') {
          assert.equal(JSON.parse(fs.readFileSync(path.join(p.output, 'controller-terminal.json'))).cleanupComplete, false);
          assert(fs.existsSync(path.join(p.output, 'incomplete-cleanup-run.json')));
          assert.equal(p.events.filter(x => x.type === 'resource-cleanup').length, 2);
        }
        if (kind === 'oci') assert.equal(p.events.filter(x => x.type === 'payload-cleanup').length, p.events.filter(x => x.type === 'owned-temporary' && path.basename(x.path).startsWith('harness-oci-payload-')).length);
      }
      assert(!JSON.stringify(fs.existsSync(gate) ? JSON.parse(fs.readFileSync(gate)) : {}).includes('synthetic-finalization-canary'));
    } finally {
      if (process.env.PRODUCER_PROBE_ARTIFACTS) fs.cpSync(p.root, path.join(process.env.PRODUCER_PROBE_ARTIFACTS, `${kind}-${fault ?? "clean"}`), { recursive: true });
      p.dispose();
    }
  });

test('support only: OCI preserves original proof exception while still attempting source and payload cleanup', () => {
  const p = probe('oci', 'proof-throw');
  try {
    assert.equal(p.child.status, 2);
    assert.match(p.child.stderr, /synthetic-original-proof-error/);
    assert.equal(fs.existsSync(path.join(p.output, 'gate.json')), false);
    assert(p.events.some(x => x.type === 'source-cleanup'));
    assert(p.events.some(x => x.type === 'payload-cleanup'));
    assert(fs.existsSync(path.join(p.output, 'baseline/report.json')));
    assert(fs.existsSync(path.join(p.output, 'wa-drop-family/report.json')));
  } finally {
    if (process.env.PRODUCER_PROBE_ARTIFACTS) fs.cpSync(p.root, path.join(process.env.PRODUCER_PROBE_ARTIFACTS, 'oci-proof-throw'), { recursive: true });
    p.dispose();
  }
});
