import { test, expect } from '@playwright/test';

import { withEnv } from '../../utils/api/testEnv';

test.describe.configure({ mode: 'serial' });

test.describe('Configuration resolution coverage', { tag: '@svc-internal' }, () => {
  test('withEnv restores pre-existing variables', async () => {
    await test.step('harness-check:config-scoped-environment', async () => {
      process.env.CONFIG_TEST_VAR_RESTORE = 'existing';
      await withEnv({ CONFIG_TEST_VAR_RESTORE: 'override' }, () => {
        expect(process.env.CONFIG_TEST_VAR_RESTORE).toBe('override');
      });
      expect(process.env.CONFIG_TEST_VAR_RESTORE).toBe('existing');
      delete process.env.CONFIG_TEST_VAR_RESTORE;
    });
  });
});
