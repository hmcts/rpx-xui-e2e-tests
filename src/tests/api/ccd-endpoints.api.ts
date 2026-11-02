import type { ApiClient as PlaywrightApiClient } from '@hmcts/playwright-common';

import { stringifyCaseTypeId } from '../../utils/api/caseTypeIdUtils';
import { assertJurisdictionsForUser } from '../../utils/api/ccdUtils';

import { test, expect } from './fixtures';

test.describe('CCD helper coverage', { tag: '@svc-ccd' }, () => {
  test('stringifyCaseTypeId handles basic variants', () => {
    expect(stringifyCaseTypeId('XUI-1')).toBe('XUI-1');
    expect(stringifyCaseTypeId(123)).toBe('123');
    expect(stringifyCaseTypeId({ id: 'AAT' })).toBe('AAT');
    expect(stringifyCaseTypeId({ foo: 'bar' })).toContain('foo');
    expect(stringifyCaseTypeId(undefined)).toBe('');
  });

  test('assertJurisdictionsForUser handles guarded status', async () => {
    const apiClient = {
      get: async () => ({ status: 403, data: undefined }),
    };
    await assertJurisdictionsForUser(apiClient as unknown as PlaywrightApiClient, []);
  });

  test('assertJurisdictionsForUser handles non-array payloads', async () => {
    let calls = 0;
    const apiClient = {
      get: async () => {
        calls += 1;
        if (calls === 1) {
          return { status: 200, data: { userInfo: { uid: 'user-1' } } };
        }
        return { status: 200, data: { foo: 'bar' } };
      },
    };
    await assertJurisdictionsForUser(apiClient as unknown as PlaywrightApiClient, []);
  });

  test('assertJurisdictionsForUser handles missing user id', async () => {
    const apiClient = {
      get: async () => ({ status: 200, data: { userInfo: {} } }),
    };
    await assertJurisdictionsForUser(apiClient as unknown as PlaywrightApiClient, []);
  });

  test('assertJurisdictionsForUser handles full payload', async () => {
    let calls = 0;
    const apiClient = {
      get: async () => {
        calls += 1;
        if (calls === 1) {
          return { status: 200, data: { userInfo: { id: 'user-1' } } };
        }
        return {
          status: 200,
          data: [
            { id: 'jur-1', name: 'Jurisdiction 1', description: 'Desc' },
            { id: 'jur-2', name: 'Jurisdiction 2', description: 'Desc' },
          ],
        };
      },
    };
    await assertJurisdictionsForUser(apiClient as unknown as PlaywrightApiClient, ['Jurisdiction 1']);
  });
});
