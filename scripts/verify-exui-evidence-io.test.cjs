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
