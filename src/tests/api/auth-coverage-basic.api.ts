/**
 * @file auth-coverage-basic.api.ts
 * @description Coverage tests for basic auth helper functions (string utils, cache, credentials)
 * @security-note Tests basic utility functions with no real credentials
 */

import { test, expect } from '@playwright/test';

import { config as apiConfig } from '../../config/api';
import { __test__ as authTest } from '../../utils/api/auth';

import { setTestSolicitorCredentials } from './apiTestCredentials';

test.describe.configure({ mode: 'serial' });

test.describe('Auth helper coverage - basic utilities', { tag: '@svc-auth' }, () => {
  let restoreCredentials: () => void;

  test.beforeEach(() => {
    restoreCredentials = setTestSolicitorCredentials();
  });

  test.afterEach(() => {
    restoreCredentials();
  });

  test('extractCsrf parses token and returns undefined when missing', async () => {
    await test.step('harness-check:auth-basic-csrf', async () => {
      expect(authTest.extractCsrf('<input name="_csrf" value="token">')).toBe('token');
      expect(authTest.extractCsrf('<html></html>')).toBeUndefined();
    });
  });

  test('stripTrailingSlash removes trailing slashes', async () => {
    await test.step('harness-check:auth-basic-url-normalization', async () => {
      expect(authTest.stripTrailingSlash('https://example.com///')).toBe('https://example.com');
    });
  });

  test('getCacheKey is identity-aware and does not vary by worker', async () => {
    await test.step('harness-check:auth-basic-cache-identity', async () => {
      const first = authTest.getCacheKeyForIdentity(apiConfig.testEnv, 'solicitor', 'Solicitor.One@hmcts.net');
      const sameIdentity = authTest.getCacheKeyForIdentity(apiConfig.testEnv, 'solicitor', ' solicitor.one@hmcts.net ');
      const second = authTest.getCacheKeyForIdentity(apiConfig.testEnv, 'solicitor', 'solicitor.two@hmcts.net');

      expect(first).toBe(sameIdentity);
      expect(first).not.toBe(second);
      expect(first).not.toContain('solicitor.one@hmcts.net');
    });

    await test.step('harness-check:auth-basic-cache-worker-invariance', async () => {
      const workerZero = {
        API_AUTH_STORAGE_SCOPE: '0',
        TEST_WORKER_INDEX: '0',
        TEST_PARALLEL_INDEX: '0',
        PW_TEST_WORKER_INDEX: '0',
      };
      const workerOne = {
        API_AUTH_STORAGE_SCOPE: '1',
        TEST_WORKER_INDEX: '1',
        TEST_PARALLEL_INDEX: '1',
        PW_TEST_WORKER_INDEX: '1',
      };

      expect(authTest.getWorkerStorageId(workerZero)).not.toBe(authTest.getWorkerStorageId(workerOne));
      expect(authTest.getCacheKey('solicitor', workerZero)).toBe(authTest.getCacheKey('solicitor', workerOne));
    });
  });

  test('getCredentials returns test-owned configured users and errors on unknown roles', async () => {
    await test.step('harness-check:auth-basic-role-credentials', async () => {
      const creds = authTest.getCredentials('solicitor');
      expect(creds.username).toContain('@');
      expect(creds.password).toBeTruthy();
      expect(() => authTest.getCredentials('unknown' as Parameters<typeof authTest.getCredentials>[0])).toThrow(
        'No credentials configured'
      );
    });
  });

  test('getCredentials fails closed when solicitor credentials are absent', async () => {
    await test.step('harness-check:auth-basic-missing-credentials', async () => {
      const solicitor = apiConfig.users[apiConfig.testEnv].solicitor;
      solicitor.e = undefined;
      solicitor.sec = undefined;

      expect(() => authTest.getCredentials('solicitor')).toThrow('Required credentials for role "solicitor" are not configured');
    });
  });
});
