import { test, expect } from '@playwright/test';

import { withEnv } from '../../utils/api/testEnv';
import { __test__ as apiTestConfigTest } from '../common/apiTestConfig';
import appTestConfig, { __test__ as appTestConfigTest } from '../common/appTestConfig';
import config, { __test__ as configUtilsTest } from '../e2e/utils/config.utils.js';

test.describe.configure({ mode: 'serial' });

test.describe('Configuration resolution coverage', { tag: '@svc-internal' }, () => {
  test('apiTestConfig helpers resolve env values', () => {
    expect(apiTestConfigTest.resolveBaseUrl(undefined)).toBe(`${config.urls.exuiDefaultUrl}/`);
    expect(apiTestConfigTest.resolveBaseUrl('https://example.test')).toBe('https://example.test');

    expect(apiTestConfigTest.resolveTestEnv(undefined)).toBe('aat');
    expect(apiTestConfigTest.resolveTestEnv('demo')).toBe('demo');
    expect(apiTestConfigTest.resolveTestEnv('aat')).toBe('aat');
    expect(apiTestConfigTest.resolveTestEnv('local')).toBe('local');
    expect(apiTestConfigTest.resolveTestEnv('prod')).toBe('aat');
  });

  test('appTestConfig helpers resolve preview and test env', () => {
    const preview = appTestConfigTest.resolvePreviewConfig(
      [{ previewUrl: 'preview.example', demoUrl: 'https://demo.example' }],
      'https://preview.example/path'
    );
    expect(preview).toEqual(expect.objectContaining({ demoUrl: 'https://demo.example' }));
    expect(appTestConfigTest.resolvePreviewConfig([], 'https://preview.example/path')).toBeUndefined();
    expect(
      appTestConfigTest.resolvePreviewConfig([{ previewUrl: 'preview.example', demoUrl: 'https://demo.example' }], undefined)
    ).toBeUndefined();

    const env = {} as NodeJS.ProcessEnv;
    expect(appTestConfigTest.applyPreviewConfig({ demoUrl: 'https://demo.example' }, env)).toBe(true);
    expect(env.TEST_ENV).toBe('demo');
    expect(env.TEST_URL).toBe('https://demo.example');
    expect(appTestConfigTest.applyPreviewConfig(undefined, env)).toBe(false);

    expect(appTestConfigTest.resolveTestEnv(undefined)).toBe('aat');
    expect(appTestConfigTest.resolveTestEnv('demo')).toBe('demo');
    expect(appTestConfigTest.resolveTestEnv('aat')).toBe('aat');
    expect(appTestConfigTest.resolveTestEnv('local')).toBe('local');
    expect(appTestConfigTest.resolveTestEnv('prod')).toBe('aat');
    expect(appTestConfig.getTestEnvFromEnviornment()).toBeTruthy();
  });

  test('config.utils resolves env vars and URLs', async () => {
    expect(configUtilsTest.resolveUrl('https://override', 'https://fallback')).toBe('https://override');
    expect(configUtilsTest.resolveUrl(undefined, 'https://fallback')).toBe('https://fallback');

    await withEnv({ CONFIG_TEST_VAR: 'value' }, () => {
      expect(configUtilsTest.getEnvVar('CONFIG_TEST_VAR')).toBe('value');
    });
    await withEnv({ CONFIG_TEST_VAR: undefined }, () => {
      expect(() => configUtilsTest.getEnvVar('CONFIG_TEST_VAR')).toThrow('CONFIG_TEST_VAR');
    });

    expect(config.urls.exuiDefaultUrl).toBeTruthy();
    expect(['aat', 'demo', 'local']).toContain(config.testEnv);
  });

  test('withEnv restores pre-existing variables', async () => {
    process.env.CONFIG_TEST_VAR_RESTORE = 'existing';
    await withEnv({ CONFIG_TEST_VAR_RESTORE: 'override' }, () => {
      expect(process.env.CONFIG_TEST_VAR_RESTORE).toBe('override');
    });
    expect(process.env.CONFIG_TEST_VAR_RESTORE).toBe('existing');
    delete process.env.CONFIG_TEST_VAR_RESTORE;
  });
});
