/**
 * @file auth-coverage-basic.api.ts
 * @description Coverage tests for basic auth helper functions (string utils, cache, credentials)
 * @security-note Tests basic utility functions with no real credentials
 */

import { test, expect } from '@playwright/test';

import { config as apiConfig } from '../../config/api';
import { __test__ as authTest } from '../../utils/api/auth';
import { config } from '../common/apiTestConfig';

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

  test('extractCsrf parses token and returns undefined when missing', () => {
    expect(authTest.extractCsrf('<input name="_csrf" value="token">')).toBe('token');
    expect(authTest.extractCsrf('<html></html>')).toBeUndefined();
  });

  test('stripTrailingSlash removes trailing slashes', () => {
    expect(authTest.stripTrailingSlash('https://example.com///')).toBe('https://example.com');
  });

  test('getCacheKey is identity-aware and does not vary by worker', () => {
    const first = authTest.getCacheKeyForIdentity(config.testEnv, 'solicitor', 'Solicitor.One@hmcts.net');
    const sameIdentity = authTest.getCacheKeyForIdentity(config.testEnv, 'solicitor', ' solicitor.one@hmcts.net ');
    const second = authTest.getCacheKeyForIdentity(config.testEnv, 'solicitor', 'solicitor.two@hmcts.net');

    expect(first).toBe(sameIdentity);
    expect(first).not.toBe(second);
    expect(first).not.toContain('solicitor.one@hmcts.net');
  });

  test('getCredentials returns test-owned configured users and errors on unknown roles', () => {
    const creds = authTest.getCredentials('solicitor');
    expect(creds.username).toContain('@');
    expect(creds.password).toBeTruthy();
    expect(() => authTest.getCredentials('unknown' as Parameters<typeof authTest.getCredentials>[0])).toThrow(
      'No credentials configured'
    );
  });

  test('getCredentials fails closed when solicitor credentials are absent', () => {
    const solicitor = apiConfig.users[apiConfig.testEnv].solicitor;
    solicitor.e = undefined;
    solicitor.sec = undefined;

    expect(() => authTest.getCredentials('solicitor')).toThrow('Required credentials for role "solicitor" are not configured');
  });
});
