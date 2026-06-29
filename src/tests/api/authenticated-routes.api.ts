import { expectStatus, StatusSets } from '../../utils/api/apiTestUtils';
import { authenticatedRoutes } from '../common/authenticatedRoutes';

import { test, expect } from './fixtures';

function expectUnauthorizedMessageWhenPresent(status: number, data?: Record<string, unknown>) {
  if (status === 401 && data) {
    expect(data).toMatchObject({ message: 'Unauthorized' });
  }
}

test.describe('Authenticated routes require session', { tag: '@svc-auth' }, () => {
  authenticatedRoutes.forEach(({ endpoint }, index) => {
    test(`[${index + 1}] GET ${endpoint} returns guarded status`, async ({ anonymousClient }) => {
      const response = await anonymousClient.get<Record<string, unknown>>(endpoint, {
        throwOnError: false,
      });
      expectStatus(response.status, [...StatusSets.guardedBasic, 500, 502]);
      expectUnauthorizedMessageWhenPresent(response.status, response.data);
    });
  });
});
