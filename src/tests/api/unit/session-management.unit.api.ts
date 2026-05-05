import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { __test__ as sessionCaptureTest } from '../../common/sessionCapture.js';
import { __test__ as sessionStorageTest } from '../../e2e/utils/session-storage.utils.js';
import { resolveUiStoragePathForUser, writeUiStorageMetadata } from '../../e2e/utils/storage-state.utils.js';

test.describe('Session management hardening unit tests', { tag: '@svc-internal' }, () => {
  test('confirmAuthenticatedLogin accepts auth-cookie based success for fallback IDAM login', async () => {
    const infoCalls: Array<Record<string, unknown>> = [];

    await expect(
      sessionCaptureTest.confirmAuthenticatedLogin({} as never, 'DYNAMIC_SOLICITOR', 'dynamic@example.test', '/login', 1, {
        acceptCookies: async () => undefined,
        waitForShell: async () => null,
        waitForAuthCookies: async () => true,
        info: (_message, meta) => {
          infoCalls.push(meta);
        },
      })
    ).resolves.toBeUndefined();

    expect(infoCalls).toEqual([
      expect.objectContaining({
        userIdentifier: 'DYNAMIC_SOLICITOR',
        marker: 'auth-cookies',
      }),
    ]);
  });

  test('confirmAuthenticatedLogin rejects when login establishes neither shell nor auth cookies', async () => {
    await expect(
      sessionCaptureTest.confirmAuthenticatedLogin({} as never, 'DYNAMIC_SOLICITOR', 'dynamic@example.test', '/login', 1, {
        acceptCookies: async () => undefined,
        waitForShell: async () => null,
        waitForAuthCookies: async () => false,
        info: () => undefined,
      })
    ).rejects.toThrow(/did not establish authenticated session/i);
  });

  test('non-strict UI storage warm-up failure warns without aborting global setup', () => {
    const warnings: string[] = [];

    expect(() =>
      sessionStorageTest.handleUiStorageWarmupFailure(
        new Error('Timed out waiting for auth cookies'),
        'FPL_GLOBAL_SEARCH',
        false,
        (message) => warnings.push(message)
      )
    ).not.toThrow();

    expect(warnings).toEqual([
      expect.stringContaining('Unable to warm UI session for FPL_GLOBAL_SEARCH. Timed out waiting for auth cookies'),
    ]);
  });

  test('strict UI storage warm-up failure still aborts required session setup', () => {
    const failure = new Error('Login did not establish session cookies');

    expect(() =>
      sessionStorageTest.handleUiStorageWarmupFailure(failure, 'FPL_GLOBAL_SEARCH', true, () => undefined)
    ).toThrow(failure);
  });

  test('strict storage reuse refreshes when the cached state is no longer authenticated server-side', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-storage-unit-'));
    const storagePath = path.join(tempDir, 'storage.json');

    try {
      fs.writeFileSync(
        storagePath,
        JSON.stringify({
          cookies: [
            { name: 'Idam.Session', value: 'session', expires: Math.floor(Date.now() / 1000) + 600 },
            { name: '__auth__', value: 'auth', expires: Math.floor(Date.now() / 1000) + 600 },
          ],
        })
      );

      const shouldRefresh = await sessionStorageTest.shouldRefreshStorageState(storagePath, 'https://example.test', {
        ignoreTtl: true,
        validateAuthenticatedState: async () => false,
      });

      expect(shouldRefresh).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('storage path is keyed by the resolved runtime email, not just the alias', () => {
    const firstPath = resolveUiStoragePathForUser('SOLICITOR', { email: 'first@example.test' });
    const secondPath = resolveUiStoragePathForUser('SOLICITOR', { email: 'second@example.test' });

    expect(firstPath).not.toBe(secondPath);
    expect(firstPath).toContain('solicitor-first-example-test');
    expect(secondPath).toContain('solicitor-second-example-test');
  });

  test('local UI login targets do not fall back to AAT IDAM by default', () => {
    expect(
      sessionStorageTest.resolveUiLoginTargets('http://localhost:3000/cases', {
        TEST_ENV: 'local',
        IDAM_WEB_URL: 'https://idam-web-public.aat.platform.hmcts.net',
      } as NodeJS.ProcessEnv)
    ).toEqual(['http://localhost:3000/cases']);

    expect(
      sessionStorageTest.resolveUiLoginTargets('http://localhost:3000/cases', {
        TEST_ENV: 'local',
        IDAM_WEB_URL: 'http://localhost:5000',
      } as NodeJS.ProcessEnv)
    ).toEqual(['http://localhost:3000/cases', 'http://localhost:5000/login']);
  });

  test('storage reuse refreshes when cached metadata belongs to a different resolved email for the same alias', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-storage-unit-'));
    const storagePath = path.join(tempDir, 'storage.json');

    try {
      fs.writeFileSync(
        storagePath,
        JSON.stringify({
          cookies: [
            { name: 'Idam.Session', value: 'session', expires: Math.floor(Date.now() / 1000) + 600 },
            { name: '__auth__', value: 'auth', expires: Math.floor(Date.now() / 1000) + 600 },
          ],
        })
      );
      writeUiStorageMetadata(storagePath, {
        userIdentifier: 'SOLICITOR',
        email: 'stale@example.test',
      });

      const shouldRefresh = await sessionStorageTest.shouldRefreshStorageState(storagePath, 'https://example.test', {
        ignoreTtl: true,
        validateAuthenticatedState: async () => true,
        expectedIdentity: {
          userIdentifier: 'SOLICITOR',
          email: 'fresh@example.test',
        },
      });

      expect(shouldRefresh).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
