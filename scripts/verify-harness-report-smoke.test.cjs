// Synthetic native fixtures test collection, not application behaviour or release readiness.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('real collection smoke joins Build, personal and mandatory evidence; corrupt evidence cannot publish', async t => {
  const root = fs.realpathSync(path.resolve(__dirname, '..'));
  assert.equal(fs.realpathSync(process.cwd()), root, 'Run from the Harness checkout');
  const checks = await import('./run-harness-self-check-evidence.mjs');
  const buildSelfCheckHeld = checks.holdBuildSelfChecks();
  assert(buildSelfCheckHeld, 'Run yarn lint once before this focused collection check');
  t.after(() => fs.rmSync(buildSelfCheckHeld.path, { force: true }));

  // shortcut: Use an idle checkout; use a separate worktree for concurrent collectors.
  const reportDirectory = path.join(root, 'functional-output/tests/harness');
  fs.mkdirSync(path.dirname(reportDirectory), { recursive: true });
  const backup = fs.mkdtempSync(path.join(path.dirname(reportDirectory), '.harness-report-smoke-'));
  const saved = path.join(backup, 'previous');
  if (fs.existsSync(reportDirectory)) fs.renameSync(reportDirectory, saved);
  let completed = false;
  t.after(() => {
    const failedOutput = path.join(backup, 'failed-output');
    if (!completed && fs.existsSync(reportDirectory)) fs.renameSync(reportDirectory, failedOutput);
    fs.rmSync(reportDirectory, { recursive: true, force: true });
    if (fs.existsSync(saved)) fs.renameSync(saved, reportDirectory);
    if (fs.existsSync(failedOutput)) console.error('[report-smoke] Private failure output retained in ' + path.basename(backup));
    else fs.rmSync(backup, { recursive: true, force: true });
  });

  const packet = await require('./fixtures/exui-mandatory-email-admission.mock.cjs')
    .admissionPacket(t, { personal: true });
  packet.write(packet.main.descriptorPath, packet.descriptor);
  const reader = await import('./lib/exui-native-report-evidence.mjs');
  const { runHarnessCollection } = require('./run-harness-local-aat.cjs');
  const Reporter = require('./harness-public-odhin-reporter.cjs');
  const options = {
    nativeEvidencePath: packet.main.descriptorPath,
    buildSelfCheckHeld,
    nativeElapsedMs: 60000,
    mandatoryEmailTiming: {
      schemaVersion: 1, scope: 'mandatory-email-admission-call', clock: 'monotonic',
      startedAt: '2026-11-07T01:00:00.000Z', elapsedMs: 222227,
      mainRunId: packet.expected.jobRunId, mandatoryRunId: packet.requestPin.runId,
      requestDigest: packet.requestPin.digest,
    },
    ...require('./lib/exui-jurisdiction-exclusion.cjs').knownJurisdictionDefectExclusions(),
  };
  try {
    const result = await runHarnessCollection(process.env, options);
    const report = Reporter.validatePublicReport();
    if (result.status !== 'passed') console.error(report.checkMethods.checks.filter(check => check.status !== 'passed').map(({file,titlePath,status}) => ({file,titlePath,status})));
    assert.equal(result.status, 'passed');
    assert.equal(result.exitCode, 0);
    assert.equal(result.personalServiceInclusion, 'included');
    assert.equal(result.mandatoryEmailInclusion, 'included');
    assert(report.buildSelfChecks);
    assert.equal(report.tests, 116);
    assert.equal(report.checkMethods.checks.length, 116);
    assert(report.checkMethods.checks.every(check => check.steps.length > 0));
    assert.equal(report.nativeEvidence.personalServiceAdmission.joint.status, 'included');
    assert.equal(report.nativeEvidence.mandatoryEmailAdmission.joint.status, 'included');
    assert.equal(report.cmcProfileAttempt.status, 'NOT_RUN');
    assert.equal(report.frProfileAttempt.status, 'NOT_RUN');
    assert.equal(report.nativeEvidence.releaseApproval, false);

    await require('./fixtures/exui-mandatory-email-admission.mock.cjs').resealPersonalHeaders(
      packet.personal, (variant, role) => variant === 'baseline' && role === 'courtadmin'
        ? packet.packets[0].input.credentials.judge.headers.Authorization
        : 'Bearer synthetic-personal-smoke-' + variant + '-' + role,
    );
    packet.write(packet.main.descriptorPath, packet.descriptor);
    await assert.rejects(runHarnessCollection(process.env, options), error =>
      reader.nativeReportFailureDetails(error)?.stage === 'mandatory-email-joint');
    assert.equal(fs.existsSync(path.join(reportDirectory, 'public/odhin/index.html')), false);

    const changed = structuredClone(packet.descriptor);
    changed.expected.candidateArtifactDigest = 'sha256:' + '0'.repeat(64);
    packet.write(packet.main.descriptorPath, changed);
    await assert.rejects(runHarnessCollection(process.env, options), /NATIVE_REPORT_/);
    assert.equal(fs.existsSync(path.join(reportDirectory, 'public/odhin/index.html')), false);
    completed = true;
  } catch (error) {
    console.error(reader.nativeReportFailureDetails(error) ?? { code: 'REPORT_SMOKE_FAILED' });
    throw error;
  }
});
