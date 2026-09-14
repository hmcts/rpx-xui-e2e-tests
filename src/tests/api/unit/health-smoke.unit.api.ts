import { expect, test } from '@playwright/test';

import { runHealthSmoke } from './health-smoke-support';

test.describe('Health smoke readiness contract', { tag: '@svc-internal' }, () => {
  for (const status of [200, 401, 403, 500, 0]) {
    test(`actual smoke ${status === 200 ? 'passes' : 'fails'} for HTTP ${status}`, async () => {
      const result = await runHealthSmoke(status);
      expect(result.requests).toBe(1);
      expect(result.exitCode).toBe(status === 200 ? 0 : 1);
    });
  }
});
