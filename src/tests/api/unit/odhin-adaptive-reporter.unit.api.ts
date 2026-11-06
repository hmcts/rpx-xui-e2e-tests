import { createRequire } from 'node:module';

import { expect, test } from '@playwright/test';

const require = createRequire(import.meta.url);
const OdhinAdaptiveReporter = require('../../common/reporters/odhin-adaptive.reporter.cjs');
const enhancerModule = require('../../common/reporters/odhin-report-enhancer.cjs');

const createEmptyFeatureStat = enhancerModule.createEmptyFeatureStat as (name: string) => { name: string; totalTests: number };
const deriveFeatureName = enhancerModule.deriveFeatureName as (filePath: string) => string;

const odhinAdaptiveTest = OdhinAdaptiveReporter.__test__ as {
  isFinalResult: (status: string, retry: number, retries: number) => boolean;
  normalizeFinalStatus: (status: string, retry: number) => string;
  normalizeTestOutputMode: (raw: unknown) => true | false | 'only-on-failure';
  normalizeRuntimeHookTimeoutMs: (raw: unknown, fallbackMs: number) => number;
  withTimeout: <T>(promise: Promise<T>, timeoutMs: number) => Promise<T>;
  trimResult: (
    result: Record<string, unknown>,
    options: { lightweight: boolean; testOutputMode: true | false | 'only-on-failure' }
  ) => {
    nextResult: Record<string, unknown>;
    trimmedCounts: { output: number; heavyArtifacts: number };
  };
};

test.describe('odhin adaptive reporter', { tag: '@svc-internal' }, () => {
  test('always keeps Odhín attachments external, even when embedding is requested', async () => {
    await test.step('harness-check:reporter-external-attachments', async () => {
      let receivedOptions: Record<string, unknown> | undefined;
      new OdhinAdaptiveReporter({
        embedAttachments: true,
        createInnerReporter: (options: Record<string, unknown>) => {
          receivedOptions = options;
          return {};
        }
      });

      expect(receivedOptions?.embedAttachments).toBe(false);
    });
  });

  test('normalizes test output mode inputs', async () => {
    await test.step('harness-check:reporter-output-mode', async () => {
      expect(odhinAdaptiveTest.normalizeTestOutputMode(undefined)).toBe('only-on-failure');
      expect(odhinAdaptiveTest.normalizeTestOutputMode('true')).toBe(true);
      expect(odhinAdaptiveTest.normalizeTestOutputMode('false')).toBe(false);
      expect(odhinAdaptiveTest.normalizeTestOutputMode('junk')).toBe('only-on-failure');
    });
  });

  test('normalizes runtime hook timeout inputs', async () => {
    await test.step('harness-check:reporter-hook-timeout-settings', async () => {
      expect(odhinAdaptiveTest.normalizeRuntimeHookTimeoutMs(undefined, 15000)).toBe(15000);
      expect(odhinAdaptiveTest.normalizeRuntimeHookTimeoutMs('2500', 15000)).toBe(2500);
      expect(odhinAdaptiveTest.normalizeRuntimeHookTimeoutMs('junk', 15000)).toBe(15000);
    });
  });

  test('normalizes final status and final-attempt detection for grouped feature stats', async () => {
    await test.step('harness-check:reporter-final-attempt', async () => {
      expect(odhinAdaptiveTest.normalizeFinalStatus('passed', 0)).toBe('passed');
      expect(odhinAdaptiveTest.normalizeFinalStatus('passed', 1)).toBe('flaky');
      expect(odhinAdaptiveTest.isFinalResult('failed', 0, 1)).toBe(false);
      expect(odhinAdaptiveTest.isFinalResult('failed', 1, 1)).toBe(true);
      expect(deriveFeatureName('/tmp/playwright_tests_new/integration/test/caseLinking/caseLinking.positive.spec.ts')).toBe(
        'caseLinking'
      );
      expect(createEmptyFeatureStat('caseFileView')).toMatchObject({ name: 'caseFileView', totalTests: 0 });
    });
  });

  test('trims passed-test output and heavy artifacts in lightweight mode', async () => {
    await test.step('harness-check:reporter-trim-passed', async () => {
      const { nextResult, trimmedCounts } = odhinAdaptiveTest.trimResult(
        {
          status: 'passed',
          stdout: [{ text: 'pass out' }],
          stderr: [{ text: 'pass err' }],
          steps: [{ title: 'step' }],
          attachments: [{ name: 'trace' }],
        },
        { lightweight: true, testOutputMode: 'only-on-failure' }
      );

      expect(nextResult.stdout).toEqual([]);
      expect(nextResult.stderr).toEqual([]);
      expect(nextResult.steps).toEqual([]);
      expect(nextResult.attachments).toEqual([]);
      expect(trimmedCounts).toEqual({ output: 1, heavyArtifacts: 1 });
    });
  });

  test('keeps failure artifacts when only-on-failure mode is used', async () => {
    await test.step('harness-check:reporter-keep-failed', async () => {
      const originalResult = {
        status: 'failed',
        stdout: [{ text: 'fail out' }],
        stderr: [{ text: 'fail err' }],
        steps: [{ title: 'step' }],
        attachments: [{ name: 'trace' }],
      };
      const { nextResult, trimmedCounts } = odhinAdaptiveTest.trimResult(originalResult, {
        lightweight: true,
        testOutputMode: 'only-on-failure',
      });

      expect(nextResult).toEqual(originalResult);
      expect(trimmedCounts).toEqual({ output: 0, heavyArtifacts: 0 });
    });
  });

  test('times out stalled runtime hook promises', async () => {
    await test.step('harness-check:reporter-stalled-promise', async () => {
      const stalledPromise = new Promise<never>(() => {});

      await expect(odhinAdaptiveTest.withTimeout(stalledPromise, 10)).rejects.toMatchObject({
        code: 'ODHIN_TIMEOUT',
      });
    });
  });

  test('adaptive reporter bounds stalled runtime hooks and still reaches onEnd', async () => {
    await test.step('harness-check:reporter-stalled-hook-finalization', async () => {
      let onEndCalls = 0;
      const reporter = new OdhinAdaptiveReporter({
        profile: false,
        runtimeHookTimeoutMs: 20,
        createInnerReporter: () => ({
          onTestEnd: async () => new Promise(() => {}),
          onEnd: async () => {
            onEndCalls += 1;
          },
        }),
      });
      const stderrWrites: string[] = [];
      const originalWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = ((chunk: string | Uint8Array) => {
        stderrWrites.push(String(chunk));
        return true;
      }) as typeof process.stderr.write;

      try {
        await reporter.onTestEnd({ title: 'stalled test' }, { status: 'passed' });
        await reporter.onEnd({ status: 'passed' });
      } finally {
        process.stderr.write = originalWrite;
      }

      expect(onEndCalls).toBe(1);
      expect(reporter.runtimeHookStats).toMatchObject({
        queued: 1,
        completed: 0,
        timedOut: 1,
        failed: 0,
      });
      expect(stderrWrites.some((entry) => entry.includes('onTestEnd timed out'))).toBe(true);
    });
  });
});
