const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const api = import('./lib/exui-harness-failure-report.mjs');
const canary = 'PRIVATE_TOKEN_https://private.example/case?secret=<script>';
function sandbox(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'failure-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function input() {
  return { commit: 'a'.repeat(40), buildNumber: '306', primary: { phase: 'native', failure: { reason: 'CI_SELECTOR_NATIVE_PHASE_REQUIRED' }, child: { reason: 'NATIVE_OPERATION_FAILED', code: 'ENOENT', source: 'run-harness-ci.mjs', line: 12 }, cleanup: 'incomplete' }, reportedPhases: [{ phase: 'family', status: 'PASS' }], reportingFailure: { reason: 'NATIVE_OPERATION_FAILED', code: 'EACCES' } };
}

test('independent report explains cause, wrapper, cleanup and unverified statuses without raw data', async t => {
  const { writeFailureReport, validateFailureReport } = await api;
  const directory = path.join(sandbox(t), 'failure');
  const value = input();
  value.primary.failure.message = canary;
  value.primary.child.stack = canary;
  value.reportingFailure.url = canary;
  value.privateLog = canary;
  const written = writeFailureReport(directory, value);
  assert.deepEqual(validateFailureReport(directory), written);
  assert.equal(written.status, 'BLOCKED');
  assert.equal(written.releaseApproval, false);
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  assert.match(html, /Cause classification: NATIVE_OPERATION_FAILED \(ENOENT\) — run-harness-ci.mjs:12/);
  assert.match(html, /Wrapper classification: CI_SELECTOR_NATIVE_PHASE_REQUIRED/);
  assert.match(html, /Cleanup was reported incomplete/);
  assert.match(html, /Even PASS adds no assurance credit/);
  assert.match(html, /secondary failure does not replace the primary failure/);
  assert.ok(!html.includes(canary));
  assert.ok(!fs.readFileSync(path.join(directory, 'failure.json'), 'utf8').includes(canary));
});

test('reporting and diagnostic primary failures remain reportable without native evidence', async t => {
  const { writeFailureReport } = await api;
  const directory = path.join(sandbox(t), 'failure');
  for (const phase of ['reporting', 'diagnostics', 'preparation', 'unknown', 'mandatoryEmail']) {
    const value = writeFailureReport(directory, { primary: { phase, failure: { message: canary }, cleanup: 'unknown' } });
    assert.equal(value.primary.failure.reason, 'NATIVE_OPERATION_FAILED');
    assert.deepEqual(value.reportedPhases, []);
    assert.match(fs.readFileSync(path.join(directory, 'index.html'), 'utf8'), /No native phase status was recorded/);
  }
});

test('validator rejects injected JSON fields, invalid classifications and altered HTML', async t => {
  const { writeFailureReport, validateFailureReport } = await api;
  const directory = path.join(sandbox(t), 'failure');
  for (const mutate of [
    value => { value.raw = canary; },
    value => { value.primary.failure.message = canary; },
    value => { value.primary.failure.reason = canary; },
    value => { value.primary.child.code = canary; },
    value => { value.primary.child.source = '../../private'; },
    value => { value.primary.child.line = 100000; },
    value => { value.primary.child.reason = 42; },
    value => { value.reportingFailure.source = canary; value.reportingFailure.line = 1; },
    value => { value.primary.cleanup = canary; },
    value => { value.reportedPhases[0].phase = canary; },
    value => { value.reportedPhases[0].status = 'passed'; },
    value => { value.reportedPhases.push(value.reportedPhases[0]); },
    value => { value.releaseApproval = true; },
    value => { value.commit = canary; },
    value => { value.buildNumber = '0'; },
  ]) {
    const value = structuredClone(writeFailureReport(directory, input()));
    mutate(value);
    fs.writeFileSync(path.join(directory, 'failure.json'), JSON.stringify(value, null, 2) + '\n');
    assert.throws(() => validateFailureReport(directory));
  }
  writeFailureReport(directory, input());
  fs.appendFileSync(path.join(directory, 'index.html'), canary);
  assert.throws(() => validateFailureReport(directory));
  writeFailureReport(directory, input());
  const jsonFile = path.join(directory, 'failure.json');
  fs.writeFileSync(jsonFile, fs.readFileSync(jsonFile, 'utf8').replace('"schemaVersion": 1,', '"schemaVersion": 1, "schemaVersion": 1,'));
  assert.throws(() => validateFailureReport(directory));
});

test('reset removes only fixed regular artifacts and refuses unexpected stale files', async t => {
  const { writeFailureReport, validateFailureReport, resetFailureReport } = await api;
  const directory = path.join(sandbox(t), 'failure');
  writeFailureReport(directory, input());
  fs.writeFileSync(path.join(directory, 'failure.json'), canary);
  resetFailureReport(directory);
  assert.deepEqual(fs.readdirSync(directory), []);
  assert.throws(() => validateFailureReport(directory));
  fs.writeFileSync(path.join(directory, 'private.log'), canary);
  assert.throws(() => resetFailureReport(directory));
  assert.throws(() => writeFailureReport(directory, input()));
  assert.equal(fs.readFileSync(path.join(directory, 'private.log'), 'utf8'), canary);
});

test('symlink directories, artifact links and hard links never read, overwrite or delete their targets', async t => {
  const { writeFailureReport, validateFailureReport, resetFailureReport } = await api;
  const root = sandbox(t), target = path.join(root, 'private.txt');
  fs.writeFileSync(target, canary);
  const directory = path.join(root, 'failure');
  fs.mkdirSync(directory);
  for (const kind of ['symlink', 'hardlink', 'directory']) {
    const artifact = path.join(directory, 'failure.json');
    if (kind === 'symlink') fs.symlinkSync(target, artifact);
    else if (kind === 'hardlink') fs.linkSync(target, artifact);
    else fs.mkdirSync(artifact);
    assert.throws(() => writeFailureReport(directory, input()));
    assert.throws(() => validateFailureReport(directory));
    assert.throws(() => resetFailureReport(directory));
    assert.equal(fs.readFileSync(target, 'utf8'), canary);
    fs.rmSync(artifact, { recursive: true });
  }
  const link = path.join(root, 'link');
  fs.symlinkSync(directory, link);
  assert.throws(() => writeFailureReport(path.join(link, 'nested'), input()));
  assert.throws(() => resetFailureReport(link));
  fs.symlinkSync(path.join(root, 'missing'), path.join(root, 'dangling'));
  assert.throws(() => writeFailureReport(path.join(root, 'dangling'), input()));
});

test('CLI validates, resets and fails closed for bad arguments', async t => {
  const { writeFailureReport } = await api;
  const directory = path.join(sandbox(t), 'failure');
  writeFailureReport(directory, input());
  const cli = path.join(__dirname, 'manage-harness-failure-report.mjs');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(run('--validate', directory).status, 0);
  assert.equal(run('--validate', directory, 'extra').status, 1);
  assert.equal(run('--write', directory).status, 1);
  assert.equal(run('--reset', directory).status, 0);
  assert.equal(run('--validate', directory).status, 1);
});

test('CLI ensure creates only absent reports, preserving existing primary and rejecting partial or tampered output', async t => {
  const { writeFailureReport, validateFailureReport } = await api;
  const directory = path.join(sandbox(t), 'failure');
  const cli = path.join(__dirname, 'manage-harness-failure-report.mjs');
  const ensure = (env = {}) => spawnSync(process.execPath, [cli, '--ensure', directory], { encoding: 'utf8', env: { ...process.env, GIT_COMMIT: canary, BUILD_NUMBER: canary, ...env } });
  assert.equal(ensure().status, 0);
  assert.equal(validateFailureReport(directory).primary.phase, 'preparation');
  assert.equal(validateFailureReport(directory).commit, undefined);
  const original = writeFailureReport(directory, input());
  assert.equal(ensure().status, 0);
  assert.deepEqual(validateFailureReport(directory), original);
  fs.appendFileSync(path.join(directory, 'index.html'), canary);
  assert.equal(ensure().status, 1);
  fs.unlinkSync(path.join(directory, 'index.html'));
  assert.equal(ensure().status, 1);
  fs.unlinkSync(path.join(directory, 'failure.json'));
  assert.equal(ensure({ GIT_COMMIT: 'c'.repeat(40), BUILD_NUMBER: '42' }).status, 0);
  assert.equal(validateFailureReport(directory).commit, 'c'.repeat(40));
  assert.equal(validateFailureReport(directory).buildNumber, '42');
});

test('image pull cause is explained in plain language with no product failure claim', async t => {
  const { writeFailureReport } = await api;
  const directory = path.join(sandbox(t), 'failure');
  for (const [cause, words] of [['NETWORK_DNS', 'name resolution failed'], ['ACCESS_DENIED', 'registry denied access'], ['MANIFEST_UNAVAILABLE', 'manifest was unavailable'], ['UNKNOWN', 'did not match a known cause']]) {
    const value = input();
    value.primary.child.reason = `NATIVE_DEFINITION_NATIVE_PINNED_IMAGE_PULL_FAILED_${cause}`;
    writeFailureReport(directory, value);
    const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
    assert.ok(html.includes(words));
    assert.match(html, /classified startup failure, not a product assertion result/);
  }
});

test('mandatory email and identity profile failures have bounded plain-language explanations', async t => {
  const { writeFailureReport } = await api;
  const directory = path.join(sandbox(t), 'failure');
  for (const [reason, words] of [
    ['MANDATORY_EMAIL_CHILD_ENVIRONMENT_KEYS', 'did not contain exactly the required configuration keys'],
    ['MANDATORY_EMAIL_CONTROLLER_NOT_CLOSED_SUCCESSFULLY', 'controller did not reach the required successful termination state'],
    ['IDAM_PROFILE_DIGEST_MISMATCH', 'file contents did not match the expected digest'],
  ]) {
    const value = input();
    value.primary.child.reason = reason;
    writeFailureReport(directory, value);
    assert.ok(fs.readFileSync(path.join(directory, 'index.html'), 'utf8').includes(words));
  }
});

test('CLI reporting hint creates a publication failure and preserves existing evidence', async t => {
  const { writeFailureReport, validateFailureReport } = await api;
  const directory = path.join(sandbox(t), 'failure');
  const cli = path.join(__dirname, 'manage-harness-failure-report.mjs');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(run('--ensure', directory, 'invalid').status, 1);
  assert.equal(run('--ensure', directory, 'reporting', 'extra').status, 1);
  assert.equal(run('--ensure', directory, 'reporting').status, 0);
  const value = validateFailureReport(directory);
  assert.equal(value.primary.phase, 'reporting');
  assert.equal(value.primary.failure.reason, 'HARNESS_REPORT_PUBLICATION_FAILED');
  assert.equal(value.primary.cleanup, 'unknown');
  const original = writeFailureReport(directory, input());
  assert.equal(run('--ensure', directory, 'reporting').status, 0);
  const updated = validateFailureReport(directory);
  assert.deepEqual(updated, { ...original, reportingFailure: { reason: 'HARNESS_REPORT_PUBLICATION_FAILED' } });
  const before = ['failure.json', 'index.html'].map(name => fs.readFileSync(path.join(directory, name), 'utf8'));
  assert.equal(run('--ensure', directory, 'reporting').status, 0);
  assert.deepEqual(['failure.json', 'index.html'].map(name => fs.readFileSync(path.join(directory, name), 'utf8')), before);
  assert.equal(run('--validate', directory, 'reporting').status, 1);
  assert.equal(run('--reset', directory, 'reporting').status, 1);
});
