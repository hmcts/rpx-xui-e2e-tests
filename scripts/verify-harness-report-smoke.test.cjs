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
  // Synthetic supervisor journals exercise the real descriptor producer; no native controller is launched.
  const captured = {
    harnessCommit: packet.expected.harnessCommit,
    policies: Object.fromEntries(packet.expected.phases.map(item => [item.phase, item.policy])),
    nativeCohortCapture: { binding: packet.native, reference: packet.expected.nativeCohortBinding },
    personalNativeCapture: packet.personal.capture,
    mandatoryEmailNativeCapture: packet.capture,
  };
  for (const item of packet.expected.phases) {
    const { receiptArtifactDigest, evidenceManifestDigest, eventTransition, callbackTransition,
      selectorEventCapture, selectorControllerTerminal, ...pre } = item.expected;
    const folder = path.join(packet.main.directory, 'private', item.phase);
    packet.write(path.join(folder, 'independent-preexecution.json'), {
      ...pre, capturedAt: '2026-11-03T12:00:00.000Z', capturedBeforeGate: true,
    });
    packet.write(path.join(folder, 'promotion-expected.json'), item.expected);
    if (item.phase === 'selectorEventRow') {
      const file = path.join(folder, 'independent-selector-admission.json');
      const admission = JSON.parse(fs.readFileSync(file, 'utf8'));
      admission.expected = { ...pre, selectorEventCapture, selectorControllerTerminal };
      packet.write(file, admission);
    }
    if (!fs.existsSync(path.join(folder, 'controller-terminal.json'))) packet.write(
      path.join(folder, 'controller-terminal.json'),
      { status: 'completed', cleanupComplete: true, exitCode: item.terminal.code },
    );
  }
  const { writeNativeDescriptor } = await import('./run-harness-assurance.mjs');
  packet.main.descriptorPath = writeNativeDescriptor(
    { output: packet.main.directory, expectedArtifactDigest: packet.expected.candidateArtifactDigest },
    captured, { status: 'PASS', exitCode: 0 }, undefined, undefined,
    { ...packet.personal.pin, path: packet.personal.requestPath }, undefined, undefined,
    { ...packet.requestPin, path: packet.requestPath },
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(packet.main.descriptorPath)).expected, packet.expected);
  const reader = await import('./lib/exui-native-report-evidence.mjs');
  const { runFixedCiPilots } = await import('./run-harness-ci.mjs');
  const selectorLabels = ['Selector CCD baseline preparation', 'Selector baseline proof and cleanup',
    'Selector CCD fault preparation', 'Selector fault proof and cleanup', 'Selector evidence verification',
    'Selector final cleanup', 'Selector cohort admission'];
  const work = async () => {
    const started = performance.now();
    while (performance.now() - started < 2.7) { /* Exercise real timer rounding without starting runtimes. */ }
  };
  const measured = await runFixedCiPilots({
    phase: async name => {
      await work();
      return { status: 'PASS', exitCode: 0, ...(name === 'selectorEventRow' ? {
        phaseTimings: selectorLabels.map(label => ({ label, status: label === 'Selector cohort admission' ? 'PASS' : 'completed',
          startedAt: new Date().toISOString(), durationMs: 0 })),
      } : {}) };
    },
    derive: work, start: work, stop: work, startEvent: work, stopEvent: work,
    startCallback: work, stopCallback: work,
  });
  const { runHarnessCollection } = require('./run-harness-local-aat.cjs');
  const Reporter = require('./harness-public-odhin-reporter.cjs');
  const options = {
    nativeEvidencePath: packet.main.descriptorPath,
    buildSelfCheckHeld,
    nativeElapsedMs: 60000,
    phaseTimings: measured.timings,
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

    const { chromium, expect } = require('@playwright/test');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      await page.route('**/*', route => route.abort());
      await page.setContent(fs.readFileSync(path.join(reportDirectory, 'public/odhin/index.html'), 'utf8'));
      await page.getByRole('button', { name: 'Tests', exact: true }).click();
      for (const title of ['stripTrailingSlash removes trailing slashes', 'Private Law replay pack is anchored to current central-assurance config']) {
        const search = page.locator('input[type=search]').first();
        await search.fill(title);
        await page.locator('#test-list-table .test-detail-link').filter({ hasText: title }).click();
        const modal = page.locator('.modal.show');
        await expect(modal).toBeVisible();
        await modal.getByRole('button', { name: 'Steps', exact: true }).click();
        await expect(modal.locator('[data-harness-check-steps]')).toBeVisible();
        assert(await modal.locator('[data-check-step-id]').count() > 0);
        await modal.getByRole('button', { name: /Back to filtered results/ }).click();
        await expect(search).toHaveValue(title);
      }
    } finally {
      await browser.close();
    }

    const overlapping = structuredClone(options.phaseTimings);
    const event = overlapping.find(row => row.label === 'CCD source event permissions');
    overlapping.find(row => row.label === 'Source event CCD runtime cleanup').startedAt =
      new Date(Date.parse(event.startedAt) + event.durationMs - 2).toISOString();
    await assert.rejects(runHarnessCollection(process.env, { ...options, phaseTimings: overlapping }), error =>
      Reporter.reportFailureDetails(error)?.stage === 'native-phase-timings');
    assert.equal(fs.existsSync(path.join(reportDirectory, 'public/odhin/index.html')), false);

    await require('./fixtures/exui-mandatory-email-admission.mock.cjs').resealPersonalHeaders(
      packet.personal, (variant, role) => variant === 'baseline' && role === 'courtadmin'
        ? packet.packets[0].input.credentials.judge.headers.Authorization
        : 'Bearer synthetic-personal-smoke-' + variant + '-' + role,
    );
    packet.write(packet.main.descriptorPath, packet.descriptor);
    await assert.rejects(runHarnessCollection(process.env, options), error =>
      reader.nativeReportFailureDetails(error)?.stage === 'mandatory-email-joint');
    assert.equal(fs.existsSync(path.join(reportDirectory, 'public/odhin/index.html')), false);

    await require('./fixtures/exui-mandatory-email-admission.mock.cjs').resealPersonalHeaders(
      packet.personal, (variant, role) => 'Bearer synthetic-personal-smoke-' + variant + '-' + role,
    );
    packet.write(packet.main.descriptorPath, packet.descriptor);
    assert.equal((await reader.readNativeReportEvidence(packet.main.descriptorPath))
      .mandatoryEmailAdmission.joint.status, 'included');

    const changed = structuredClone(packet.descriptor);
    changed.expected.candidateArtifactDigest = 'sha256:' + '0'.repeat(64);
    packet.write(packet.main.descriptorPath, changed);
    await assert.rejects(runHarnessCollection(process.env, options), error =>
      reader.nativeReportFailureDetails(error)?.code === 'NATIVE_REPORT_CANDIDATE_MISMATCH');
    assert.equal(fs.existsSync(path.join(reportDirectory, 'public/odhin/index.html')), false);
    completed = true;
  } catch (error) {
    console.error(reader.nativeReportFailureDetails(error) ?? { code: 'REPORT_SMOKE_FAILED' });
    throw error;
  }
});
