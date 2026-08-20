/**
 * @file auth-coverage-storage.api.ts
 * @description Coverage tests for auth storage state management (file operations, caching)
 * @security-note Tests storage mechanisms with temporary test files only
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { test, expect } from '@playwright/test';

import { __test__ as authTest } from '../../utils/api/auth';

test.describe.configure({ mode: 'serial' });

const mockPassword = process.env.PW_MOCK_PASSWORD ?? String(Date.now());
const mockCredentials = { username: 'test-user', password: mockPassword };
type EnsureStorageStateDeps = NonNullable<Parameters<typeof authTest.ensureStorageStateWith>[1]>;
type GetStoredCookieDeps = NonNullable<Parameters<typeof authTest.getStoredCookieWith>[2]>;

test.describe('Auth helper coverage - storage operations', { tag: '@svc-auth' }, () => {
  test('maps the generic API solicitor role to the configured divorce solicitor session', () => {
    expect(authTest.apiRoleToUiUserIdentifier('solicitor')).toBe('DIVORCE_SOLICITOR');
    expect(authTest.apiRoleToUiUserIdentifier('caseOfficer_r1')).toBe('CASEWORKER_R1');
  });

  test('tryReadState returns parsed state or undefined for invalid content', async () => {
    const tmpDir = path.join(process.cwd(), 'test-results', 'tmp-auth-state');
    await fs.mkdir(tmpDir, { recursive: true });

    const goodPath = path.join(tmpDir, 'good.json');
    await fs.writeFile(goodPath, JSON.stringify({ cookies: [] }), 'utf8');
    const good = await authTest.tryReadState(goodPath);
    expect(good).toEqual(expect.objectContaining({ cookies: [] }));

    const badPath = path.join(tmpDir, 'bad.json');
    await fs.writeFile(badPath, '{not-json', 'utf8');
    const bad = await authTest.tryReadState(badPath);
    expect(bad).toBeUndefined();

    const missing = await authTest.tryReadState(path.join(tmpDir, 'missing.json'));
    expect(missing).toBeUndefined();
  });

  test('ensureStorageStateWith reuses an authenticated state under the filesystem lock', async () => {
    let createCalls = 0;
    let createdPath = '';
    const validStates = new Map([['state-2', { cookies: [] }]]);
    const deps = {
      storageRoot: path.join(process.cwd(), 'test-results', 'auth-lock-cache'),
      acquireLock: async () => () => undefined,
      createStorageState: async () => {
        createCalls += 1;
        createdPath = authTest.getStorageStatePath(
          path.join(process.cwd(), 'test-results', 'auth-lock-cache'),
          'solicitor'
        );
        return createdPath;
      },
      tryReadState: async (pathValue: string) =>
        pathValue === createdPath ? { cookies: [] } : validStates.get(pathValue),
      unlink: async () => {
        throw new Error('unlink failed');
      },
      validateStorageState: async () => 'authenticated' as const,
      isStorageStateFresh: () => true,
      reuseExistingStorage: true,
    };

    const first = await authTest.ensureStorageStateWith('solicitor', deps as unknown as EnsureStorageStateDeps);
    expect(first).toBe(createdPath);
    const second = await authTest.ensureStorageStateWith('solicitor', deps as unknown as EnsureStorageStateDeps);
    expect(second).toBe(createdPath);
    expect(createCalls).toBe(1);
  });

  test('getStoredCookieWith rebuilds corrupted state and throws when still missing', async () => {
    let createCalls = 0;
    const readStates = [
      undefined,
      { cookies: [{ name: 'XSRF-TOKEN', value: 'token' }] }
    ];
    const deps = {
      storageRoot: path.join(process.cwd(), 'test-results', 'auth-cookie-cache'),
      acquireLock: async () => () => undefined,
      createStorageState: async () => {
        createCalls += 1;
        return `state-${createCalls}`;
      },
      tryReadState: async (pathValue: string) => {
        void pathValue;
        return readStates.shift() ?? { cookies: [{ name: 'XSRF-TOKEN', value: 'token' }] };
      },
      unlink: async () => {},
      validateStorageState: async () => 'unauthenticated' as const,
    };

    const value = await authTest.getStoredCookieWith('solicitor', 'XSRF-TOKEN', deps as unknown as GetStoredCookieDeps);
    expect(value).toBe('token');

    const emptyDeps = {
      storageRoot: path.join(process.cwd(), 'test-results', 'auth-empty-cache'),
      acquireLock: async () => () => undefined,
      createStorageState: async () => 'state-1',
      tryReadState: async () => undefined,
      unlink: async () => {},
      validateStorageState: async () => 'unauthenticated' as const,
    };
    await expect(
      authTest.getStoredCookieWith('solicitor', 'XSRF-TOKEN', emptyDeps as unknown as GetStoredCookieDeps)
    ).rejects.toThrow('Unable to read storage state');
  });

  test('createStorageStateWith honors token bootstrap and falls back to form login', async () => {
    const storageRoot = path.join(process.cwd(), 'test-results', 'auth-storage');
    const workerEnv = { TEST_WORKER_INDEX: '3' } as NodeJS.ProcessEnv;
    const expectedStorageStateSuffix = 'api-';
    let formCalls = 0;
    const onForm = async () => {
      formCalls += 1;
    };
    const tokenSuccess = await authTest.createStorageStateWith('solicitor', {
      env: workerEnv,
      storageRoot,
      mkdir: async () => undefined,
      getCredentials: () => mockCredentials,
      isTokenBootstrapEnabled: () => true,
      tryTokenBootstrap: async () => true,
      createStorageStateViaForm: onForm,
    });
    expect(tokenSuccess).toContain(expectedStorageStateSuffix);
    expect(formCalls).toBe(0);

    const tokenFallback = await authTest.createStorageStateWith('solicitor', {
      env: workerEnv,
      storageRoot,
      mkdir: async () => undefined,
      getCredentials: () => mockCredentials,
      isTokenBootstrapEnabled: () => true,
      tryTokenBootstrap: async () => false,
      createStorageStateViaForm: onForm,
    });
    expect(tokenFallback).toContain(expectedStorageStateSuffix);
    expect(formCalls).toBe(1);
  });

  test('createStorageStateWith can use UI session bootstrap for local EXUI auth', async () => {
    const storageRoot = path.join(process.cwd(), 'test-results', 'auth-storage-ui');
    const workerEnv = { TEST_WORKER_INDEX: '2' } as NodeJS.ProcessEnv;
    const expectedStorageStateSuffix = 'api-';
    let uiCalls = 0;
    let formCalls = 0;
    let tokenCalls = 0;

    const storagePath = await authTest.createStorageStateWith('solicitor', {
      env: workerEnv,
      storageRoot,
      mkdir: async () => undefined,
      getCredentials: () => mockCredentials,
      isUiSessionBootstrapEnabled: () => true,
      createStorageStateViaUi: async (role, targetStoragePath) => {
        uiCalls += 1;
        expect(role).toBe('solicitor');
        expect(targetStoragePath).toContain(expectedStorageStateSuffix);
      },
      isTokenBootstrapEnabled: () => true,
      tryTokenBootstrap: async () => {
        tokenCalls += 1;
        return true;
      },
      createStorageStateViaForm: async () => {
        formCalls += 1;
      },
    });

    expect(storagePath).toContain(expectedStorageStateSuffix);
    expect(uiCalls).toBe(1);
    expect(tokenCalls).toBe(0);
    expect(formCalls).toBe(0);
  });
});
