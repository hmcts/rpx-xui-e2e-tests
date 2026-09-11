import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { loadConfigAt } from '../../../utils/api/playwrightConfigUtils';

const require = createRequire(import.meta.url);
const reporterModule = require('../../common/reporters/ci-evidence.reporter.cjs') as {
  default?: new (options?: Record<string, unknown>) => EvidenceReporter;
  __test__: {
    assertSafeEvidence: (value: unknown) => void;
    buildSafeLoadProfile: (summary: Record<string, unknown>, samples: unknown[]) => Record<string, unknown> & {
      timeline: Array<Record<string, unknown>>;
    };
    createSystemSampler: (
      metadata: Record<string, unknown>,
      readCpuTimes?: () => { idle: number; all: number },
      readLoadAverage?: () => number,
      readCgroupCpuUsageNs?: () => number | undefined,
      readClock?: () => bigint
    ) => (elapsedMs: number) => Record<string, unknown>;
    projectApiEntries: (entries: unknown[]) => unknown[];
    sanitizeDiagnostic: (value: unknown) => string | undefined;
    sanitizeUrl: (value: unknown) => { host: string; path: string } | undefined;
  };
} & (new (options?: Record<string, unknown>) => EvidenceReporter);

type EvidenceReporter = {
  onBegin: (config: Record<string, unknown>, suite?: { allTests: () => unknown[] }) => void;
  onError: (error: Record<string, unknown>) => void;
  onTestBegin: (testCase: Record<string, unknown>, result: Record<string, unknown>) => void;
  onTestEnd: (testCase: Record<string, unknown>, result: Record<string, unknown>) => void;
  onEnd: (result: Record<string, unknown>) => Promise<void> | void;
};

const EvidenceReporter = reporterModule.default ?? reporterModule;
const helpers = reporterModule.__test__;

const testCase = (overrides: Record<string, unknown> = {}) => ({
  id: 'case-1',
  title: 'shows the case list',
  titlePath: () => ['API', 'Case list', 'shows the case list'],
  location: { file: path.join(process.cwd(), 'src/tests/api/case-list.api.ts'), line: 42, column: 7 },
  annotations: [{ type: 'owner', description: 'xui' }],
  retries: 1,
  repeatEachIndex: 0,
  expectedStatus: 'passed',
  parent: { project: () => ({ name: 'api' }) },
  ...overrides,
});

const result = (overrides: Record<string, unknown> = {}) => ({
  status: 'passed',
  retry: 0,
  duration: 250,
  startTime: new Date('2026-09-11T08:00:00.000Z'),
  errors: [],
  steps: [],
  attachments: [],
  ...overrides,
});

const createReporter = (
  options: Record<string, unknown> = {},
  config: Record<string, unknown> = { workers: 4, shard: null },
  allTests: unknown[] = [{}]
) => {
  const outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'xui-ci-evidence-'));
  const reporter = new EvidenceReporter({
    outputFolder,
    repository: 'rpx-xui-e2e-tests',
    suite: 'api',
    env: {},
    now: () => new Date('2026-09-11T08:01:00.000Z'),
    sampleIntervalMs: 60_000,
    sample: (elapsedMs: number) => ({
      elapsedMs,
      cpuPercent: 20,
      memoryUsedPercent: 40,
      load1PerCore: 0.2,
      processCounts: { node: 1, chrome: 0, playwright: 1, total: 10 },
    }),
    loadMetadata: { effectiveCpuCount: 4, memoryLimitBytes: 8_000_000_000 },
    ...options,
  });
  reporter.onBegin(config, { allTests: () => allTests });
  return { outputFolder, reporter };
};

const readEvidence = (outputFolder: string) =>
  JSON.parse(fs.readFileSync(path.join(outputFolder, 'xui-ci-evidence.json'), 'utf8'));

test.describe('CI evidence reporter', { tag: '@svc-internal' }, () => {
  test('keeps a clean pass compact', async () => {
    const { outputFolder, reporter } = createReporter();

    reporter.onTestEnd(testCase(), result());
    await reporter.onEnd({ status: 'passed' });

    const evidence = readEvidence(outputFolder);
    expect(evidence.schema_version).toBe('xui-playwright-evidence/v1');
    expect(evidence.document.producer.version).toBe('2');
    expect(evidence.run.outcome).toBe('CLEAN_PASS');
    expect(evidence.run).toMatchObject({ discovered_tests: 1, attempt_count: 1, retry_attempt_count: 0 });
    expect(evidence.run.counts).toMatchObject({ total: 1, passed: 1, flaky: 0, failed: 0 });
    expect(evidence.exceptional_tests).toEqual([]);
    expect(evidence.system_load).toMatchObject({
      sample_interval_ms: 60000,
      worker_count: 4,
    });
    expect(evidence.system_load.sample_count).toBeGreaterThan(0);
    expect(evidence.document.content_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('uses Playwright FullResult timing as the run authority', async () => {
    const { outputFolder, reporter } = createReporter();
    reporter.onTestEnd(testCase(), result());

    await reporter.onEnd({
      status: 'passed',
      startTime: new Date('2026-09-11T08:00:00.000Z'),
      duration: 5000,
    });

    expect(readEvidence(outputFolder).run).toMatchObject({
      started_at: '2026-09-11T08:00:00.000Z',
      ended_at: '2026-09-11T08:00:05.000Z',
      duration_ms: 5000,
    });
  });

  test('retains every attempt when a test passes on retry', async () => {
    const { outputFolder, reporter } = createReporter();
    const flaky = testCase();

    reporter.onTestEnd(
      flaky,
      result({
        status: 'failed',
        errors: [{ message: 'Expected 200 but received 504', location: { file: '/workspace/api.ts', line: 9, column: 3 } }],
      })
    );
    reporter.onTestEnd(flaky, result({ status: 'passed', retry: 1, duration: 100 }));
    await reporter.onEnd({ status: 'passed' });

    const evidence = readEvidence(outputFolder);
    expect(evidence.run.outcome).toBe('PASSED_WITH_FLAKES');
    expect(evidence.run.counts).toMatchObject({ total: 1, passed: 0, flaky: 1, failed: 0 });
    expect(evidence.exceptional_tests).toHaveLength(1);
    expect(evidence.exceptional_tests[0].attempts.map((attempt: { retry: number }) => attempt.retry)).toEqual([0, 1]);
    expect(evidence.exceptional_tests[0].location.file).toBe('src/tests/api/case-list.api.ts');
  });

  test('treats an expected failure as a successful test outcome', async () => {
    const { outputFolder, reporter } = createReporter();
    const expectedFailure = testCase({ expectedStatus: 'failed', outcome: () => 'expected' });

    reporter.onTestEnd(expectedFailure, result({ status: 'failed', errors: [{ message: 'expected failure' }] }));
    await reporter.onEnd({ status: 'passed' });

    const evidence = readEvidence(outputFolder);
    expect(evidence.run.outcome).toBe('CLEAN_PASS');
    expect(evidence.run.counts).toMatchObject({ total: 1, passed: 1, failed: 0 });
    expect(evidence.exceptional_tests).toEqual([]);
  });

  test('counts repeatEach executions separately while keeping one stable test fingerprint', async () => {
    const { outputFolder, reporter } = createReporter();

    reporter.onTestEnd(testCase({ id: 'repeat-0', repeatEachIndex: 0 }), result());
    reporter.onTestEnd(testCase({ id: 'repeat-1', repeatEachIndex: 1 }), result());
    await reporter.onEnd({ status: 'passed' });

    const evidence = readEvidence(outputFolder);
    expect(evidence.run.counts).toMatchObject({ total: 2, passed: 2 });
  });

  test('marks an attempt and collection partial when onTestEnd never arrives', async () => {
    const { outputFolder, reporter } = createReporter();

    reporter.onTestBegin(testCase(), result({ status: 'running' }));
    await reporter.onEnd({ status: 'interrupted' });

    const evidence = readEvidence(outputFolder);
    expect(evidence.run.outcome).toBe('FAILED');
    expect(evidence.run.collection_outcome).toBe('PARTIAL');
    expect(evidence.run.counts).toMatchObject({ total: 1, interrupted: 1 });
    expect(evidence.capture).toMatchObject({ test_begin_callbacks: 1, test_end_callbacks: 0, open_attempts: 1 });
    expect(evidence.exceptional_tests[0].attempts[0].status).toBe('interrupted');
  });

  test('keeps the observed pass separate from an incomplete collection', async () => {
    const completed = testCase({ id: 'completed' });
    const missing = testCase({ id: 'missing' });
    const { outputFolder, reporter } = createReporter({}, { workers: 4, shard: null }, [completed, missing]);

    reporter.onTestEnd(completed, result());
    await reporter.onEnd({ status: 'passed' });

    const evidence = readEvidence(outputFolder);
    expect(evidence.run.outcome).toBe('CLEAN_PASS');
    expect(evidence.run.collection_outcome).toBe('PARTIAL');
    expect(evidence.run.discovered_tests).toBe(2);
  });

  test('counts a global runner error without retaining its text', async () => {
    const { outputFolder, reporter } = createReporter();

    reporter.onError({ message: 'Authorization: Bearer must-never-be-written' });
    await reporter.onEnd({ status: 'failed' });

    const evidence = readEvidence(outputFolder);
    expect(evidence.run.outcome).toBe('FAILED');
    expect(evidence.capture.global_errors).toBe(1);
    expect(JSON.stringify(evidence)).not.toContain('must-never-be-written');
  });

  test('keeps failed steps and source locations without stdout or arbitrary attachments', async () => {
    const { outputFolder, reporter } = createReporter();

    reporter.onTestEnd(
      testCase(),
      result({
        status: 'timedOut',
        errors: [{ message: 'locator.waitFor: timeout 30000ms', location: { file: '/workspace/task-list.ts', line: 20, column: 2 } }],
        stdout: ['secret output'],
        stderr: ['secret error'],
        steps: [
          { title: 'open task list', category: 'test.step', duration: 120, error: { message: 'timeout 30000ms' } },
          { title: 'fixture', category: 'fixture', duration: 10 },
        ],
        attachments: [{ name: 'trace.zip', path: '/tmp/trace.zip', contentType: 'application/zip' }],
      })
    );
    await reporter.onEnd({ status: 'failed' });

    const attempt = readEvidence(outputFolder).exceptional_tests[0].attempts[0];
    expect(attempt.status).toBe('timed_out');
    expect(attempt.failed_steps).toEqual([
      expect.objectContaining({ title: 'open task list', category: 'test.step', duration_ms: 120 }),
    ]);
    expect(attempt.signals).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'runner', category: 'test_timeout' })])
    );
    expect(attempt).not.toHaveProperty('stdout');
    expect(attempt).not.toHaveProperty('stderr');
    expect(JSON.stringify(attempt)).not.toContain('trace.zip');
  });

  test('emits an assertion fact without inventing a downstream service', async () => {
    const { outputFolder, reporter } = createReporter();

    reporter.onTestEnd(
      testCase(),
      result({ status: 'failed', errors: [{ message: 'expect(received).toBe(expected)' }] })
    );
    await reporter.onEnd({ status: 'failed' });

    const signals = readEvidence(outputFolder).exceptional_tests[0].attempts[0].signals;
    expect(signals).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'assertion', category: 'expectation_mismatch' })])
    );
    expect(signals.some((signal: { host?: string }) => signal.host)).toBe(false);
  });

  test('projects only safe API facts and templates dynamic URL segments', () => {
    const projected = helpers.projectApiEntries([
      {
        method: 'GET',
        url: 'https://ccd-data-store-api.aat.platform.hmcts.net/cases/1712345678901234/events/4?token=secret',
        status: 504,
        durationMs: 31_250,
        error: 'ETIMEDOUT',
        request: { headers: { authorization: 'Bearer secret' }, data: { name: 'private' } },
        response: { body: { private: true } },
        rawResponse: 'private',
      },
    ]);

    expect(projected).toEqual([
      expect.objectContaining({
        type: 'network',
        method: 'GET',
        host: 'ccd-data-store-api.aat.platform.hmcts.net',
        path: '/cases/:id/events/4',
        status: 504,
        duration_ms: 31250,
        transport_error: 'ETIMEDOUT',
      }),
    ]);
    expect(projected[0]).toMatchObject({ signal_id: expect.stringMatching(/^[a-f0-9]{64}$/), event_order: 0 });
    expect(JSON.stringify(projected)).not.toContain('authorization');
    expect(JSON.stringify(projected)).not.toContain('private');
  });

  test('does not retain transport-error prose', () => {
    const projected = helpers.projectApiEntries([
      {
        method: 'GET',
        url: 'https://service.test/health',
        error: 'request failed for https://service.test/health?session=secret-value',
      },
      {
        method: 'GET',
        url: 'https://service.test/health',
        error: 'UND_ERR_SECRET_VALUE',
      },
    ]);

    expect(projected.every((entry) => !('transport_error' in entry))).toBe(true);
    expect(JSON.stringify(projected)).not.toContain('secret-value');
  });

  test('uses fractional cgroup CPU usage for scoped CPU telemetry', () => {
    const usage = [0, 500_000_000];
    const clocks = [0n, 1_000_000_000n];
    const sampler = helpers.createSystemSampler(
      { effectiveCpuCount: 0.5, logicalCpuCount: 2, memoryLimitBytes: 100, memoryLimitSource: 'host' },
      () => ({ idle: 0, all: 0 }),
      () => 2,
      () => usage.shift(),
      () => clocks.shift()
    );

    sampler(0);
    const sample = sampler(1000);

    expect(sample.cpuPercent).toBe(100);
    expect(sample.load1PerCore).toBe(1);
  });

  test('preserves allowlisted Odhín diagnosis and its named downstream evidence', async () => {
    const { outputFolder, reporter } = createReporter();
    const failureData = {
      failureType: 'DOWNSTREAM_API_5XX',
      phaseMarker: 'backend-api-response',
      setupMarker: 'test-body',
      backendWait: 'yes',
      likelyRootCause: 'CCD Data Store returned a downstream 504 response.',
      failureLocation: path.join(process.cwd(), 'src/tests/e2e/case-list.spec.ts:42'),
      actionableError: 'GET case details returned HTTP 504.',
      executionSignals: {
        lastMainFrameUrl: 'https://manage-case.aat.platform.hmcts.net/cases/1712345678901234',
        mainFrameNavigationCount: 2,
        totalRequestsObserved: 12,
        backendRequestsObserved: 4,
      },
      topSuspect: 'CCD Data Store',
      slowEndpointSummary: ['GET /data/cases/:id count=2 max=31000ms'],
      apiErrors: [
        {
          method: 'GET',
          url: 'https://ccd-data-store-api.aat.platform.hmcts.net/cases/1712345678901234',
          status: 504,
          duration: 31000,
        },
      ],
      networkTimeout: true,
      ignoredRawBody: { private: true },
    };

    reporter.onTestEnd(
      testCase(),
      result({
        status: 'failed',
        attachments: [
          { name: 'failure-data.json', body: Buffer.from(JSON.stringify(failureData)), contentType: 'application/json' },
        ],
      })
    );
    await reporter.onEnd({ status: 'failed' });

    const signals = readEvidence(outputFolder).exceptional_tests[0].attempts[0].signals;
    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'source_assessment',
          category: 'DOWNSTREAM_API_5XX',
          backend_wait: 'yes',
          network_timeout: true,
        }),
        expect.objectContaining({
          type: 'network',
          host: 'ccd-data-store-api.aat.platform.hmcts.net',
          path: '/cases/:id',
          status: 504,
        }),
      ])
    );
    expect(JSON.stringify(signals)).not.toContain('ignoredRawBody');
    expect(JSON.stringify(signals)).not.toContain('likelyRootCause');
    expect(JSON.stringify(signals)).not.toContain('case details');
  });

  test('rejects credential-like diagnostics and invalid URLs', () => {
    expect(helpers.sanitizeDiagnostic('Authorization: Bearer abc.def.ghi')).toBeUndefined();
    expect(helpers.sanitizeDiagnostic('Cookie: session=abc123')).toBeUndefined();
    expect(helpers.sanitizeDiagnostic('X-XSRF-TOKEN: anti-forgery-value')).toBeUndefined();
    expect(helpers.sanitizeDiagnostic('user@example.test failed to sign in')).toBeUndefined();
    expect(helpers.sanitizeUrl('not a URL')).toBeUndefined();
    expect(() => helpers.assertSafeEvidence({ request: { headers: { 'x-xsrf-token': 'value' } } })).toThrow(
      'xui-ci-allowlist/v1'
    );
  });

  test('does not persist arbitrary failure prose that may contain case data', async () => {
    const { outputFolder, reporter } = createReporter();
    reporter.onTestEnd(
      testCase(),
      result({
        status: 'failed',
        errors: [{ message: 'Expected Jane Doe in case Smith v Jones but received another claimant' }],
        attachments: [{
          name: 'failure-data.json',
          body: Buffer.from(JSON.stringify({
            failureType: 'ASSERTION_FAILURE',
            likelyRootCause: 'Jane Doe was not visible',
            actionableError: 'Smith v Jones failed',
            topSuspect: 'Jane Doe',
          })),
          contentType: 'application/json',
        }],
      })
    );
    await reporter.onEnd({ status: 'failed' });

    const serialized = JSON.stringify(readEvidence(outputFolder));
    expect(serialized).not.toContain('Jane Doe');
    expect(serialized).not.toContain('Smith v Jones');
    expect(serialized).toContain('expectation_mismatch');
  });

  test('bounds and allowlists the existing load profile', () => {
    const samples = Array.from({ length: 1201 }, (_, index) => ({
      timestamp: new Date().toISOString(),
      elapsedMs: index * 2000,
      cpuPercent: index % 100,
      memoryUsedPercent: 50,
      load1PerCore: 0.5,
      memoryUsedBytes: 10,
      processCounts: { node: 2, chrome: 4, playwright: 1, total: 90 },
      hostname: 'forbidden',
      command: ['forbidden'],
    }));
    const profile = helpers.buildSafeLoadProfile(
      {
        sampleIntervalMs: 2000,
        durationMs: 2_400_000,
        sampleCount: 1201,
        effectiveCpuCount: 4,
        cgroupMemoryLimitBytes: 8_000_000_000,
        workers: '4',
        cpu: { min: 0, average: 49, p95: 95, max: 99 },
        memory: { min: 50, average: 50, p95: 50, max: 50 },
        load1PerCore: { min: 0.5, average: 0.5, p95: 0.5, max: 0.5 },
        pressureSignals: { cpuSaturated: false, loadSaturated: false, memoryPressure: false },
        hostname: 'forbidden',
        pid: 12,
        command: ['forbidden'],
      },
      samples
    );

    expect(profile.timeline).toHaveLength(600);
    expect(profile).toMatchObject({ sample_interval_ms: 2000, sample_count: 1201, worker_count: 4 });
    expect(profile).not.toHaveProperty('effective_cpu_count');
    expect(profile).not.toHaveProperty('memory_limit_bytes');
    expect(JSON.stringify(profile)).not.toContain('forbidden');
    expect(JSON.stringify(profile)).not.toContain('timestamp');
    expect(profile.timeline[0]).toEqual({
      seq: 0,
      elapsed_ms: 0,
      cpu_percent: 0,
      memory_percent: 50,
      load1_per_core: 0.5,
    });
  });

  test('binds document identity to shard and makes the content hash reproducible', async () => {
    const first = createReporter({}, { workers: 2, shard: { current: 1, total: 2 } });
    const second = createReporter({}, { workers: 2, shard: { current: 2, total: 2 } });
    first.reporter.onTestEnd(testCase(), result());
    second.reporter.onTestEnd(testCase(), result());
    await first.reporter.onEnd({ status: 'passed' });
    await second.reporter.onEnd({ status: 'passed' });

    const evidence = readEvidence(first.outputFolder);
    const expectedHash = evidence.document.content_sha256;
    delete evidence.document.content_sha256;

    expect(expectedHash).toBe(createHash('sha256').update(JSON.stringify(evidence)).digest('hex'));
    expect(readEvidence(first.outputFolder).document.document_id).not.toBe(
      readEvidence(second.outputFolder).document.document_id
    );
  });

  test('registers the reporter for Jenkins and explicit local evidence runs', async () => {
    const main = await loadConfigAt('playwright.config.ts');
    const integration = await loadConfigAt('playwright.integration.config.ts');
    const nightly = await loadConfigAt('playwright-nightly.config.ts');
    const reporterPath = './src/tests/common/reporters/ci-evidence.reporter.cjs';
    const hasEvidenceReporter = (config: { reporter: Array<[string, unknown?]> }) =>
      config.reporter.some(([name]) => name === reporterPath);

    expect(hasEvidenceReporter(main.__test__.buildConfig({ JENKINS_URL: 'https://build.hmcts.net' }) as never)).toBe(true);
    expect(hasEvidenceReporter(integration.__test__.buildConfig({ BUILD_NUMBER: '10' }) as never)).toBe(true);
    expect(hasEvidenceReporter(nightly.__test__.buildConfig({ CI: 'true' }) as never)).toBe(true);
    expect(hasEvidenceReporter(main.__test__.buildConfig({ PLAYWRIGHT_CI_EVIDENCE: 'true' }) as never)).toBe(true);
    expect(hasEvidenceReporter(main.__test__.buildConfig({}) as never)).toBe(false);
  });

  test('does not write evidence for an accessibility suite', async () => {
    const { outputFolder, reporter } = createReporter({ suite: 'a11y' });
    await reporter.onEnd({ status: 'passed' });
    expect(fs.existsSync(path.join(outputFolder, 'xui-ci-evidence.json'))).toBe(false);

    const accessibilityProject = testCase({ id: 'a11y-project', title: 'normal journey', titlePath: () => ['normal journey'], parent: { project: () => ({ name: 'accessibility-chromium' }) } });
    const projectRun = createReporter({ suite: 'e2e' }, { workers: 4, shard: null }, [accessibilityProject]);
    projectRun.reporter.onTestEnd(accessibilityProject, result());
    await projectRun.reporter.onEnd({ status: 'passed' });
    expect(fs.existsSync(path.join(projectRun.outputFolder, 'xui-ci-evidence.json'))).toBe(false);
  });

  test('classifies smoke output and cross-browser smoke projects as the smoke suite', async () => {
    const smokeOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-smoke-'));
    const smokeReporter = new EvidenceReporter({ outputFolder: smokeOutput, repository: 'rpx-xui-e2e-tests', env: {} });
    smokeReporter.onBegin({}, { allTests: () => [] });
    await smokeReporter.onEnd({ status: 'passed' });
    expect(readEvidence(smokeOutput).run.suite).toBe('smoke');

    const smokeProject = testCase({ id: 'cross-browser-smoke', title: 'normal journey', titlePath: () => ['normal journey'], parent: { project: () => ({ name: 'cross-browser-smoke' }) } });
    const projectOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'xui-ci-evidence-'));
    const projectReporter = new EvidenceReporter({ outputFolder: projectOutput, repository: 'rpx-xui-e2e-tests', suite: 'e2e', env: {} });
    projectReporter.onBegin({}, { allTests: () => [smokeProject] });
    projectReporter.onTestEnd(smokeProject, result());
    await projectReporter.onEnd({ status: 'passed' });
    expect(readEvidence(projectOutput).run.suite).toBe('smoke');
  });
});
