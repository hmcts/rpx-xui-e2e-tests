import { expect, test } from '@playwright/test';

import {
  clearRuntimeUserCredentials,
  getRuntimeUserCredentials,
  getRuntimeUserCredentialEnvMapping,
  publishRuntimeUserCredentialsToEnv,
  restoreRuntimeUserCredentialsInEnv,
  resolveRuntimeUserCredentialsFromEnv,
  setRuntimeUserCredentials,
} from '../../e2e/utils/runtimeUserCredentials.js';

test.describe.configure({ mode: 'serial' });

const ENV_KEYS = [
  'DIVORCE_SOLICITOR_USERNAME',
  'DIVORCE_SOLICITOR_PASSWORD',
  'PRL_SOLICITOR_USERNAME',
  'PRL_SOLICITOR_PASSWORD',
  'PRL_SOLICITOR2_USERNAME',
  'PRL_SOLICITOR2_PASSWORD',
  'PRL_SOLICITOR3_USERNAME',
  'PRL_SOLICITOR3_PASSWORD',
  'PRL_SOLICITOR4_USERNAME',
  'PRL_SOLICITOR4_PASSWORD',
  'PRL_SOLICITOR5_USERNAME',
  'PRL_SOLICITOR5_PASSWORD',
  'PRL_SOLICITOR6_USERNAME',
  'PRL_SOLICITOR6_PASSWORD',
  'PRL_SOLICITOR7_USERNAME',
  'PRL_SOLICITOR7_PASSWORD',
  'PRL_SOLICITOR8_USERNAME',
  'PRL_SOLICITOR8_PASSWORD',
  'BOOKING_UI_FT_ON_USERNAME',
  'BOOKING_UI_FT_ON_PASSWORD',
  'BOOKING_UI_FT_ON_1_USERNAME',
  'BOOKING_UI_FT_ON_1_PASSWORD',
  'BOOKING_UI_FT_ON_2_USERNAME',
  'BOOKING_UI_FT_ON_2_PASSWORD',
  'BOOKING_UI_FT_ON_3_USERNAME',
  'BOOKING_UI_FT_ON_3_PASSWORD',
  'BOOKING_UI_FT_ON_4_USERNAME',
  'BOOKING_UI_FT_ON_4_PASSWORD',
  'BOOKING_UI_FT_ON_5_USERNAME',
  'BOOKING_UI_FT_ON_5_PASSWORD',
  'BOOKING_UI_FT_ON_6_USERNAME',
  'BOOKING_UI_FT_ON_6_PASSWORD',
  'BOOKING_UI_FT_ON_7_USERNAME',
  'BOOKING_UI_FT_ON_7_PASSWORD',
  'BOOKING_UI_FT_ON_8_USERNAME',
  'BOOKING_UI_FT_ON_8_PASSWORD',
  'STAFF_ADMIN_USERNAME',
  'STAFF_ADMIN_PASSWORD',
  'STAFF_ADMIN_POOL_ENABLED',
  'STAFF_ADMIN_1_USERNAME',
  'STAFF_ADMIN_1_PASSWORD',
  'STAFF_ADMIN_2_USERNAME',
  'STAFF_ADMIN_2_PASSWORD',
  'STAFF_ADMIN_3_USERNAME',
  'STAFF_ADMIN_3_PASSWORD',
  'STAFF_ADMIN_4_USERNAME',
  'STAFF_ADMIN_4_PASSWORD',
  'STAFF_ADMIN_5_USERNAME',
  'STAFF_ADMIN_5_PASSWORD',
  'STAFF_ADMIN_6_USERNAME',
  'STAFF_ADMIN_6_PASSWORD',
  'STAFF_ADMIN_7_USERNAME',
  'STAFF_ADMIN_7_PASSWORD',
  'STAFF_ADMIN_8_USERNAME',
  'STAFF_ADMIN_8_PASSWORD',
  'HEARING_MANAGER_CR84_OFF_USERNAME',
  'HEARING_MANAGER_CR84_OFF_PASSWORD',
  'HEARING_MANAGER_CR84_OFF_1_USERNAME',
  'HEARING_MANAGER_CR84_OFF_1_PASSWORD',
  'HEARING_MANAGER_CR84_OFF_4_USERNAME',
  'HEARING_MANAGER_CR84_OFF_4_PASSWORD',
  'HEARING_MANAGER_CR84_OFF_2_USERNAME',
  'HEARING_MANAGER_CR84_OFF_2_PASSWORD',
  'HEARING_MANAGER_CR84_OFF_3_USERNAME',
  'HEARING_MANAGER_CR84_OFF_3_PASSWORD',
  'HEARING_MANAGER_CR84_ON_USERNAME',
  'HEARING_MANAGER_CR84_ON_PASSWORD',
  'HEARING_MANAGER_CR84_ON_1_USERNAME',
  'HEARING_MANAGER_CR84_ON_1_PASSWORD',
  'HEARING_MANAGER_CR84_ON_4_USERNAME',
  'HEARING_MANAGER_CR84_ON_4_PASSWORD',
  'HEARING_MANAGER_CR84_ON_2_USERNAME',
  'HEARING_MANAGER_CR84_ON_2_PASSWORD',
  'HEARING_MANAGER_CR84_ON_3_USERNAME',
  'HEARING_MANAGER_CR84_ON_3_PASSWORD',
  'EMPLOYMENT_DYNAMIC_CASEWORKER_USERNAME',
  'EMPLOYMENT_DYNAMIC_CASEWORKER_PASSWORD',
] as const;

let originalEnvValues: Record<string, string | undefined> = {};

test.describe('Dynamic user support unit tests: pure modules', { tag: '@svc-internal' }, () => {
  test.beforeEach(() => {
    originalEnvValues = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    clearRuntimeUserCredentials('dynamic-user');
  });

  test.afterEach(() => {
    for (const key of ENV_KEYS) {
      const originalValue = originalEnvValues[key];
      if (typeof originalValue === 'string') {
        process.env[key] = originalValue;
      } else {
        delete process.env[key];
      }
    }
    clearRuntimeUserCredentials('dynamic-user');
  });

  test('runtime user credentials registry normalizes identifiers', () => {
    setRuntimeUserCredentials(' dynamic-user ', {
      email: 'dynamic@example.test',
      password: 'secret',
    });

    expect(getRuntimeUserCredentials('DYNAMIC-USER')).toEqual({
      email: 'dynamic@example.test',
      password: 'secret',
    });

    clearRuntimeUserCredentials('dynamic-user');
    expect(getRuntimeUserCredentials(' dynamic-user ')).toBeUndefined();
  });

  test('runtime user credential env publication mirrors dynamic aliases and restores previous env values', () => {
    process.env.EMPLOYMENT_DYNAMIC_CASEWORKER_USERNAME = 'previous@example.test';
    process.env.EMPLOYMENT_DYNAMIC_CASEWORKER_PASSWORD = 'previous-secret';

    expect(getRuntimeUserCredentialEnvMapping(' employment_dynamic_caseworker ')).toEqual({
      username: 'EMPLOYMENT_DYNAMIC_CASEWORKER_USERNAME',
      password: 'EMPLOYMENT_DYNAMIC_CASEWORKER_PASSWORD',
    });
    const divorceSolicitorMapping = getRuntimeUserCredentialEnvMapping(' divorce_solicitor ');
    expect(divorceSolicitorMapping).toEqual({
      username: 'DIVORCE_SOLICITOR_USERNAME',
      password: 'DIVORCE_SOLICITOR_PASSWORD',
    });
    expect(getRuntimeUserCredentialEnvMapping(' booking_ui-ft-on ')).toEqual({
      username: 'BOOKING_UI_FT_ON_USERNAME',
      password: 'BOOKING_UI_FT_ON_PASSWORD',
    });
    expect(getRuntimeUserCredentialEnvMapping(' booking_ui-ft-on-1 ')).toEqual({
      username: 'BOOKING_UI_FT_ON_1_USERNAME',
      password: 'BOOKING_UI_FT_ON_1_PASSWORD',
    });
    expect(getRuntimeUserCredentialEnvMapping(' booking_ui-ft-on-4 ')).toEqual({
      username: 'BOOKING_UI_FT_ON_4_USERNAME',
      password: 'BOOKING_UI_FT_ON_4_PASSWORD',
    });
    expect(getRuntimeUserCredentialEnvMapping(' staff_admin ')).toEqual({
      username: 'STAFF_ADMIN_USERNAME',
      password: 'STAFF_ADMIN_PASSWORD',
    });
    expect(getRuntimeUserCredentialEnvMapping(' staff_admin-1 ')).toEqual({
      username: 'STAFF_ADMIN_1_USERNAME',
      password: 'STAFF_ADMIN_1_PASSWORD',
    });
    expect(getRuntimeUserCredentialEnvMapping(' staff_admin-4 ')).toEqual({
      username: 'STAFF_ADMIN_4_USERNAME',
      password: 'STAFF_ADMIN_4_PASSWORD',
    });
    expect(getRuntimeUserCredentialEnvMapping(' hearing_manager_cr84_off ')).toEqual({
      username: 'HEARING_MANAGER_CR84_OFF_USERNAME',
      password: 'HEARING_MANAGER_CR84_OFF_PASSWORD',
    });
    expect(getRuntimeUserCredentialEnvMapping(' hearing_manager_cr84_off-1 ')).toEqual({
      username: 'HEARING_MANAGER_CR84_OFF_1_USERNAME',
      password: 'HEARING_MANAGER_CR84_OFF_1_PASSWORD',
    });
    expect(getRuntimeUserCredentialEnvMapping(' hearing_manager_cr84_on ')).toEqual({
      username: 'HEARING_MANAGER_CR84_ON_USERNAME',
      password: 'HEARING_MANAGER_CR84_ON_PASSWORD',
    });
    expect(getRuntimeUserCredentialEnvMapping(' hearing_manager_cr84_on-4 ')).toEqual({
      username: 'HEARING_MANAGER_CR84_ON_4_USERNAME',
      password: 'HEARING_MANAGER_CR84_ON_4_PASSWORD',
    });

    process.env.DIVORCE_SOLICITOR_USERNAME = 'divorce@example.test';
    process.env.DIVORCE_SOLICITOR_PASSWORD = 'divorce-secret';
    expect(resolveRuntimeUserCredentialsFromEnv(divorceSolicitorMapping!)).toEqual({
      email: 'divorce@example.test',
      password: 'divorce-secret',
    });

    const publishedState = publishRuntimeUserCredentialsToEnv('EMPLOYMENT_DYNAMIC_CASEWORKER', {
      email: 'dynamic@example.test',
      password: 'dynamic-secret',
    });

    expect(process.env.EMPLOYMENT_DYNAMIC_CASEWORKER_USERNAME).toBe('dynamic@example.test');
    expect(process.env.EMPLOYMENT_DYNAMIC_CASEWORKER_PASSWORD).toBe('dynamic-secret');

    restoreRuntimeUserCredentialsInEnv(publishedState);

    expect(process.env.EMPLOYMENT_DYNAMIC_CASEWORKER_USERNAME).toBe('previous@example.test');
    expect(process.env.EMPLOYMENT_DYNAMIC_CASEWORKER_PASSWORD).toBe('previous-secret');
  });
});
