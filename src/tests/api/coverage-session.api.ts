import { test, expect } from '@playwright/test';

import { UserUtils } from '../e2e/utils/user.utils.js';

test.describe.configure({ mode: 'serial' });

const restoreEnv = (name: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
};

test.describe('Session and cookie utilities coverage', { tag: '@svc-internal' }, () => {
  const credentialEnvironmentKeys = [
    'PW_IAC_CASEOFFICER_R1_EMAIL',
    'PW_IAC_CASEOFFICER_R1_PASSWORD',
    'IAC_CASEOFFICER_R1_USERNAME',
    'IAC_CASEOFFICER_R1_PASSWORD',
    'CASEOFFICER_R1_USERNAME',
    'CASEOFFICER_R1_PASSWORD',
    'CASEWORKER_R1_USERNAME',
    'CASEWORKER_R1_PASSWORD',
  ] as const;
  const originalCredentialEnvironment = new Map<string, string | undefined>();

  test.beforeAll(() => {
    for (const key of credentialEnvironmentKeys) {
      originalCredentialEnvironment.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.CASEWORKER_R1_USERNAME = 'caseworker-r1@example.test';
    process.env.CASEWORKER_R1_PASSWORD = 'caseworker-r1-password';
  });

  test.afterAll(() => {
    for (const key of credentialEnvironmentKeys) {
      restoreEnv(key, originalCredentialEnvironment.get(key));
    }
  });

  test('UserUtils returns credentials for known users and errors on unknown', () => {
    const userUtils = new UserUtils();
    const creds = userUtils.getUserCredentials('IAC_CaseOfficer_R1');
    expect(creds.email).toBe('caseworker-r1@example.test');
    expect(creds.password).toBe('caseworker-r1-password');
    expect(() => userUtils.getUserCredentials('UNKNOWN_USER')).toThrow(
      'User "UNKNOWN_USER" is not configured for UI tests.'
    );
  });
});
