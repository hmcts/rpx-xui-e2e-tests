const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = path.resolve('scripts/write-exui-release-assurance-summary.mjs');

test('checked-in catalogue claims without run evidence cannot approve release or publish secrets', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-summary-'));
  try {
    fs.mkdirSync(path.join(directory, 'src/data'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'src/data/exui-central-assurance-source.json'), '{}');
    fs.writeFileSync(path.join(directory, 'src/data/exui-release-assurance-evidence.json'), JSON.stringify({
      mutationEvidence: { status: 'passed', requiredCommands: [] },
      releaseGate: { warnReasons: [], acceptedWarnings: [] },
      harnessProofLanes: [{ description: 'synthetic-secret-canary' }]
    }));
    const result = spawnSync(process.execPath, [cli], { cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(result.status, 2, result.stderr);
    const publicSummary = fs.readFileSync(path.join(directory, 'functional-output/tests/harness/public/release-assurance-summary.json'), 'utf8');
    const summary = JSON.parse(publicSummary);
    assert.equal(summary.status, 'BLOCKED');
    assert.equal(summary.releaseApproval, false);
    assert.doesNotMatch(publicSummary + result.stdout + result.stderr, /synthetic-secret-canary/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const hash = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const moduleUrl = (name) => pathToFileURL(path.resolve('scripts/lib', name)).href;
const evidence = () => import(moduleUrl('exui-evidence-io.mjs'));

function runProbe(directory, probe, context, requireReport = true) {
  const { completeRun } = require('./fixtures/exui-release-evidence.mock.cjs');
  const { reportContext } = require('./fixtures/exui-evidence-bundle.mock.cjs');
  const input = completeRun();
  const contextPath = path.join(directory, probe + '-context.json');
  fs.writeFileSync(contextPath, JSON.stringify(context ?? reportContext(input.manifest, input.executions[0])));
  const reportPath = path.join(directory, probe + '.json');
  const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '-c', 'scripts/fixtures/evidence-probe.config.cjs', '--output', path.join(directory, probe + '-output')], {
    cwd: path.resolve('.'), encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, EXUI_EVIDENCE_REPORT: reportPath, EXUI_EVIDENCE_CONTEXT: contextPath, EVIDENCE_PROBE: probe }
  });
  assert.equal(result.error, undefined, String(result.error));
  if (requireReport) assert.ok(fs.existsSync(reportPath), result.stderr + result.stdout);
  return { exitCode: result.status, signal: result.signal, reportPath, report: fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null };
}

test('real Playwright reports preserve clean completion, global teardown, assertion attribution and retries', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-framework-'));
  try {
    const clean = runProbe(directory, 'clean');
    assert.equal(clean.exitCode, 0);
    assert.equal(clean.report.complete, true);
    assert.deepEqual(clean.report.globalErrors, []);
    const teardown = runProbe(directory, 'teardown');
    assert.equal(teardown.report.tests[0].status, 'passed');
    assert.equal(teardown.exitCode, 1);
    assert.ok(teardown.report.globalErrors.length > 0);
    const assertion = runProbe(directory, 'assertion');
    assert.equal(assertion.report.tests[0].failureId, 'family-membership');
    const hook = runProbe(directory, 'hook');
    assert.equal(hook.report.tests[0].failureId, null, 'setup hook cannot kill a product mutant');
    const setup = runProbe(directory, 'setup');
    assert.equal(setup.report.tests[0].failureId, null);
    const contaminated = runProbe(directory, 'contaminated');
    assert.equal(contaminated.report.tests[0].failureId, null);
    const retry = runProbe(directory, 'retry');
    assert.deepEqual(retry.report.tests.map((result) => result.retry), [0, 1]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('artifact loading verifies digests and refuses traversal and resolved symlink escapes', async () => {
  const { readEvidenceArtifact } = await evidence();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-artifacts-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-outside-'));
  try {
    fs.writeFileSync(path.join(directory, 'record.json'), '{}');
    assert.deepEqual(readEvidenceArtifact(directory, { path: 'record.json', digest: hash('{}') }).value, {});
    assert.throws(() => readEvidenceArtifact(directory, { path: 'record.json', digest: hash('tampered') }));
    fs.writeFileSync(path.join(outside, 'secret.json'), '{}');
    fs.symlinkSync(path.join(outside, 'secret.json'), path.join(directory, 'escape.json'));
    assert.throws(() => readEvidenceArtifact(directory, { path: 'escape.json', digest: hash('{}') }));
    assert.throws(() => readEvidenceArtifact(directory, { path: '../record.json', digest: hash('{}') }));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

const { writeRunBundle } = require('./fixtures/exui-evidence-bundle.mock.cjs');
const policy = async () => (await import(moduleUrl('exui-release-policy.mjs'))).getReleasePolicy('exui-wa-family-pilot');

async function summaryBundle(directory, status = 'PASS') {
  const { getReleasePolicy } = await import(moduleUrl('exui-release-policy.mjs'));
  const releasePolicy = getReleasePolicy(status === 'FAIL' ? 'exui-wa-scope-pilot' : 'exui-wa-family-pilot');
  let bundle;
  if (status === 'FAIL') {
    const source = writeRunBundle(directory, releasePolicy);
    const report = structuredClone(source.baselineReport);
    report.status = 'failed';
    report.tests.push({ ...report.tests[0], proofId: 'wa-org-scope-civil', status: 'failed', failureId: 'organisation-scope' });
    bundle = writeRunBundle(directory, releasePolicy, { baselineReport: report, baselineExit: 1 });
  } else bundle = writeRunBundle(directory, releasePolicy, status === 'BLOCKED' ? { runtimeMetadata: { harnessSourceState: 'dirty-diagnostic' } } : {});
  const evaluated = (await evidence()).loadRunEvidence(bundle.runPath, releasePolicy).receipt;
  assert.equal(evaluated.verdict.status, status, 'the raw bundle must reach the intended evaluator outcome');
  return { ...bundle, receipt: evaluated };
}

function summaryChild(directory, runPath, fault = null) {
  directory = fs.realpathSync(directory);
  runPath = fs.realpathSync(runPath);
  const publicPath = path.join(directory, 'functional-output/tests/harness/public/release-assurance-summary.json');
  const gatePath = path.join(path.dirname(runPath), 'gate.json');
  const events = path.join(directory, 'publication-events.jsonl');
  const preload = path.join(directory, 'publication-probe.cjs');
  fs.writeFileSync(preload, `const fs=require('node:fs');const path=require('node:path');const rename=fs.renameSync;fs.renameSync=function(from,to){const destination=path.resolve(String(to));const publicFile=${JSON.stringify(publicPath)};const gateFile=${JSON.stringify(gatePath)};if(destination!==publicFile&&destination!==gateFile)return rename.call(this,from,to);const value=JSON.parse(fs.readFileSync(from,'utf8'));const kind=destination===publicFile?'public':'gate';const status=kind==='public'?value.status:value.verdict.status;fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({kind,status})+'\\n');if(${JSON.stringify(fault)}==='public-pass'&&kind==='public'&&status==='PASS')throw Error('synthetic-publication-secret-canary');const result=rename.call(this,from,to);if(${JSON.stringify(fault)}==='gate-after-rename'&&kind==='gate')throw Error('synthetic-publication-secret-canary');return result;};`);
  const child = spawnSync(process.execPath, ['--require', preload, cli, '--run', runPath], { cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(child.error, undefined);
  assert.doesNotMatch(child.stdout + child.stderr, /synthetic-publication-secret-canary/);
  return { child, gatePath, publicPath, events: fs.existsSync(events) ? fs.readFileSync(events, 'utf8').trim().split('\n').map(JSON.parse) : [] };
}

test('summary publication failure cannot leave a new gate PASS or stale public PASS', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-summary-public-fault-'));
  try {
    const bundle = await summaryBundle(directory);
    const io = await evidence();
    io.writeJsonAtomic(path.join(directory, 'gate.json'), bundle.receipt);
    io.writePublicSummary(path.join(directory, 'functional-output/tests/harness/public/release-assurance-summary.json'), bundle.receipt.verdict, true);
    const result = summaryChild(directory, bundle.runPath, 'public-pass');
    assert.equal(result.child.status, 2, result.child.stderr);
    assert.equal(fs.existsSync(result.gatePath), false, 'failed publication must withdraw every PASS receipt');
    assert.equal(io.validatePublicSummary(result.publicPath).status, 'BLOCKED');
    assert.equal(io.validatePublicSummary(result.publicPath).receiptAvailable, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

for (const status of ['PASS', 'FAIL', 'BLOCKED']) test('summary CLI finalizes evaluator/public/machine parity for ' + status + ' with the machine receipt last', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-summary-parity-'));
  try {
    const bundle = await summaryBundle(directory, status);
    const result = summaryChild(directory, bundle.runPath);
    assert.equal(result.child.status, bundle.receipt.verdict.exitCode, result.child.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(result.gatePath)), bundle.receipt);
    const summary = (await evidence()).validatePublicSummary(result.publicPath);
    assert.equal(summary.status, status);
    assert.equal(summary.receiptAvailable, true);
    assert.deepEqual(result.events, [{ kind: 'public', status: 'BLOCKED' }, { kind: 'public', status }, { kind: 'gate', status }]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('late receipt write failure retracts an already renamed PASS and restores safe public BLOCKED', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-summary-gate-fault-'));
  try {
    const bundle = await summaryBundle(directory);
    const result = summaryChild(directory, bundle.runPath, 'gate-after-rename');
    assert.equal(result.child.status, 2);
    assert.equal(fs.existsSync(result.gatePath), false);
    const summary = (await evidence()).validatePublicSummary(result.publicPath);
    assert.equal(summary.status, 'BLOCKED');
    assert.equal(summary.receiptAvailable, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('invalid rerun withdraws a prior PASS receipt and public artifact before evidence parsing', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-summary-stale-'));
  try {
    const bundle = await summaryBundle(directory);
    assert.equal(summaryChild(directory, bundle.runPath).child.status, 0);
    fs.writeFileSync(bundle.runPath, '{"private":"synthetic-publication-secret-canary"');
    const result = summaryChild(directory, bundle.runPath);
    assert.equal(result.child.status, 2);
    assert.equal(fs.existsSync(result.gatePath), false);
    const summary = (await evidence()).validatePublicSummary(result.publicPath);
    assert.equal(summary.status, 'BLOCKED');
    assert.equal(summary.receiptAvailable, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('unsupported argument sets cannot claim ownership of a supplied receipt path', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-summary-arguments-'));
  try {
    const bundle = await summaryBundle(directory);
    const io = await evidence();
    const gatePath = path.join(directory, 'gate.json');
    io.writeJsonAtomic(gatePath, bundle.receipt);
    const original = fs.readFileSync(gatePath);
    const child = spawnSync(process.execPath, [cli, '--run', bundle.runPath, '--unsupported'], { cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(child.status, 2);
    assert.deepEqual(fs.readFileSync(gatePath), original);
    assert.equal(io.validatePublicSummary(path.join(directory, 'functional-output/tests/harness/public/release-assurance-summary.json')).status, 'BLOCKED');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('summary recomputation cannot turn dirty source evidence into approval or relabel its raw provenance', async () => {
  const { loadRunEvidence } = await evidence();
  const releasePolicy = await policy();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-source-gate-'));
  try {
    const { runPath, run } = writeRunBundle(directory, releasePolicy, { runtimeMetadata: { harnessSourceState: 'dirty-diagnostic' } });
    assert.equal(loadRunEvidence(runPath, releasePolicy).receipt.verdict.status, 'BLOCKED');
    const result = spawnSync(process.execPath, [cli, '--run', runPath], { cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'gate.json'))).verdict.status, 'BLOCKED');
    run.manifest.runtimeMetadata.harnessSourceState = 'clean';
    fs.writeFileSync(runPath, JSON.stringify(run));
    assert.throws(() => loadRunEvidence(runPath, releasePolicy), /REPORT_CONTEXT/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('verified bundle drives the same gate and CLI; tampering or self-supplied policy blocks', async () => {
  const { loadRunEvidence } = await evidence();
  const releasePolicy = await policy();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-bundle-'));
  try {
    const { runPath, run } = writeRunBundle(directory, releasePolicy);
    const evaluated = loadRunEvidence(runPath, releasePolicy);
    assert.equal(evaluated.receipt.verdict.status, 'PASS');
    const result = spawnSync(process.execPath, [cli, '--run', runPath], { cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'gate.json'), 'utf8'));
    assert.deepEqual(receipt, evaluated.receipt);
    run.policy = { requiredObligationIds: [] };
    fs.writeFileSync(runPath, JSON.stringify(run));
    const invalid = spawnSync(process.execPath, [cli, '--run', runPath], { cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(invalid.status, 2);
    assert.equal(fs.existsSync(path.join(directory, 'gate.json')), false, 'invalid rerun cannot leave an old PASS receipt');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('whole-invocation teardown failure and interrupted finalization block real passed assertions', async () => {
  const { loadRunEvidence } = await evidence();
  const releasePolicy = await policy();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-teardown-gate-'));
  try {
    const source = writeRunBundle(path.join(directory, 'source'), releasePolicy);
    const observed = runProbe(directory, 'teardown', source.baselineReport.context);
    const { runPath } = writeRunBundle(path.join(directory, 'teardown'), releasePolicy, { baselineReport: observed.report, baselineExit: observed.exitCode });
    assert.equal(loadRunEvidence(runPath, releasePolicy).receipt.verdict.status, 'BLOCKED');
    const interrupted = writeRunBundle(path.join(directory, 'interrupted'), releasePolicy, { terminalState: 'interrupted' });
    assert.equal(loadRunEvidence(interrupted.runPath, releasePolicy).receipt.verdict.status, 'BLOCKED');
    fs.unlinkSync(path.join(directory, 'interrupted', 'baseline-execution.json'));
    assert.throws(() => loadRunEvidence(interrupted.runPath, releasePolicy));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('failed and retried extra framework results cannot disappear from an invocation', async () => {
  const { loadRunEvidence } = await evidence();
  const releasePolicy = await policy();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-extra-proof-'));
  try {
    const clean = writeRunBundle(path.join(directory, 'source'), releasePolicy);
    const extra = structuredClone(clean.baselineReport);
    extra.tests.push({ ...extra.tests[0], proofId: 'unregistered', status: 'failed', failureId: 'unknown' });
    const unknown = writeRunBundle(path.join(directory, 'unknown'), releasePolicy, { baselineReport: extra, baselineExit: 1 });
    assert.throws(() => loadRunEvidence(unknown.runPath, releasePolicy));
    const retried = structuredClone(clean.baselineReport);
    retried.tests.push({ ...retried.tests[0], retry: 1 });
    const retry = writeRunBundle(path.join(directory, 'retry'), releasePolicy, { baselineReport: retried });
    assert.throws(() => loadRunEvidence(retry.runPath, releasePolicy), /RETRIED/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('public artifact validation rejects unknown fields and secret-bearing status/reason values', async () => {
  const { writePublicSummary, validatePublicSummary } = await evidence();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-public-'));
  try {
    const file = path.join(directory, 'summary.json');
    writePublicSummary(file, { status: 'BLOCKED', reasons: ['synthetic-secret-canary'] });
    assert.equal(validatePublicSummary(file).status, 'BLOCKED');
    const safe = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(safe, /synthetic-secret-canary/);
    fs.writeFileSync(file, safe.replace('{', '{\"status\":\"synthetic-secret-canary\",'));
    assert.throws(() => validatePublicSummary(file), /UNSAFE_PUBLIC_BYTES/);
    for (const unsafe of [{ ...JSON.parse(safe), raw: 'secret' }, { ...JSON.parse(safe), status: 'secret' }, { ...JSON.parse(safe), reasonCodes: ['secret'] }]) {
      fs.writeFileSync(file, JSON.stringify(unsafe));
      assert.throws(() => validatePublicSummary(file));
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('public blocked summary can explain the bounded FR jurisdiction mismatch without raw responses', async () => {
  const { writePublicSummary, validatePublicSummary } = await evidence();
  const { SOURCE_JURISDICTIONS } = await import('./lib/exui-source-profile-jurisdictions.mjs');
  assert.equal(Object.isFrozen(SOURCE_JURISDICTIONS), true);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-public-fr-diagnostic-'));
  try {
    const file = path.join(directory, 'summary.json');
    const diagnostic = {
      schemaVersion: 1,
      kind: 'fr-jurisdiction-filter-diagnostic',
      reasonCode: 'FR_PROFILE_OBSERVATIONS',
      expectedIds: [...SOURCE_JURISDICTIONS].sort(),
      observedIds: ['CIVIL', 'CMC', 'DIVORCE', 'EMPLOYMENT', 'FR', 'HRS', 'IA', 'PCS', 'PRIVATELAW', 'PROBATE', 'PUBLICLAW', 'SSCS', 'ST_CIC', 'UNREVIEWED'],
      unexpectedIds: ['ST_CIC', 'UNREVIEWED'],
      missingIds: [],
    };
    writePublicSummary(file, { status: 'BLOCKED', exitCode: 2, frProfileDiagnostic: diagnostic });
    assert.deepEqual(validatePublicSummary(file).frProfileDiagnostic, diagnostic);
    const unsafe = { ...diagnostic, observedIds: [...diagnostic.observedIds, 'private-user@example.invalid'] };
    assert.throws(() => writePublicSummary(file, { status: 'BLOCKED', exitCode: 2, frProfileDiagnostic: unsafe }), /UNSAFE_PUBLIC_FR_DIAGNOSTIC/);
    assert.throws(() => writePublicSummary(file, { status: 'BLOCKED', exitCode: 2, frProfileDiagnostic: { ...diagnostic, expectedIds: ['FR'], missingIds: [], unexpectedIds: ['ST_CIC'] } }), /UNSAFE_PUBLIC_FR_DIAGNOSTIC/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('a previous raw report cannot be rewrapped as evidence for a new run', async () => {
  const { loadRunEvidence } = await evidence();
  const releasePolicy = await policy();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-report-provenance-'));
  try {
    const { runPath, run } = writeRunBundle(directory, releasePolicy);
    run.manifest.runId = 'new-run';
    for (const reference of run.executionArtifacts) {
      const file = path.join(directory, reference.path);
      const execution = JSON.parse(fs.readFileSync(file, 'utf8'));
      execution.runId = 'new-run';
      const bytes = JSON.stringify(execution);
      fs.writeFileSync(file, bytes);
      reference.digest = hash(bytes);
    }
    fs.writeFileSync(runPath, JSON.stringify(run));
    assert.throws(() => loadRunEvidence(runPath, releasePolicy), /REPORT_CONTEXT/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('termination after tests leaves no finalized report and cannot authorize promotion', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-killed-'));
  try {
    const result = runProbe(directory, 'terminated', undefined, false);
    assert.equal(result.signal, 'SIGKILL');
    assert.equal(result.report, null);
    const denied = spawnSync(process.execPath, [path.resolve('scripts/verify-exui-release-gate.mjs'), '--receipt', path.join(directory, 'gate.json'), '--expected', path.join(directory, 'expected.json')], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(denied.status, 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('promotion rejects matching but unregistered scope or policy identities', async () => {
  const { loadRunEvidence, writeJsonAtomic } = await evidence();
  const releasePolicy = await policy();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-policy-consumer-'));
  try {
    const { runPath } = writeRunBundle(directory, releasePolicy);
    const original = loadRunEvidence(runPath, releasePolicy).receipt;
    for (const [label, changes, status] of [
      ['registered', {}, 0],
      ['unknown scope', { releaseScopeId: 'unregistered-exui-release' }, 2],
      ['wrong registered policy', { policyDigest: 'sha256:' + '9'.repeat(64) }, 2],
    ]) {
      const receipt = { ...original, ...changes };
      const receiptPath = path.join(directory, 'gate.json');
      const expectedPath = path.join(directory, 'expected.json');
      writeJsonAtomic(receiptPath, receipt);
      const { verdict, schemaVersion, ...expected } = receipt;
      expected.receiptArtifactDigest = hash(fs.readFileSync(receiptPath));
      writeJsonAtomic(expectedPath, expected);
      const result = spawnSync(process.execPath, [path.resolve('scripts/verify-exui-release-gate.mjs'), '--receipt', receiptPath, '--expected', expectedPath], { encoding: 'utf8', env: { PATH: process.env.PATH } });
      assert.equal(result.status, status, label);
      assert.equal(result.stdout.trim(), `[harness-release-gate] ${status === 0 ? 'PASS' : 'BLOCKED'}`, label);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('promotion verifies independent deployment identity and immutable receipt bytes', async () => {
  const { loadRunEvidence, writeJsonAtomic } = await evidence();
  const releasePolicy = await policy();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-promotion-'));
  try {
    const { runPath } = writeRunBundle(directory, releasePolicy);
    const { receipt } = loadRunEvidence(runPath, releasePolicy);
    const receiptPath = path.join(directory, 'gate.json');
    const expectedPath = path.join(directory, 'deployment-expectations.json');
    writeJsonAtomic(receiptPath, receipt);
    const { verdict, schemaVersion, ...expected } = receipt;
    expected.receiptArtifactDigest = hash(fs.readFileSync(receiptPath));
    fs.writeFileSync(expectedPath, JSON.stringify(expected));
    const command = () => spawnSync(process.execPath, [path.resolve('scripts/verify-exui-release-gate.mjs'), '--receipt', receiptPath, '--expected', expectedPath], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(command().status, 0);
    fs.writeFileSync(expectedPath, JSON.stringify({ ...expected, releaseScopeId: 'full-exui-release' }));
    assert.equal(command().status, 2);
    fs.writeFileSync(expectedPath, JSON.stringify(expected));
    writeJsonAtomic(receiptPath, { ...receipt, verdict: { status: 'FAIL', exitCode: 1, reasons: ['tampered'] } });
    assert.equal(command().status, 2, 'verdict tampering must invalidate the immutable artifact digest');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
