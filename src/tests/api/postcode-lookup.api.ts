import { withXsrf, expectStatus, StatusSets } from '../../utils/api/apiTestUtils';
import { expectAddressLookupShape } from '../../utils/api/assertions';
import { shouldAssertAddress } from '../../utils/api/postcodeLookupUtils';
import type { AddressLookupResponse } from '../../utils/api/types';

import { test, expect } from './fixtures';

test.describe('Postcode lookup', { tag: '@svc-postcode-lookup' }, () => {
  test('returns address data for postcode E1', async ({ apiClient }) => {
    await withXsrf('solicitor', async (headers) => {
      const response = await apiClient.get<AddressLookupResponse>('api/addresses?postcode=E1', {
        headers,
        throwOnError: false,
      });

      expectStatus(
        response.status,
        StatusSets.guardedBasic.filter((s) => s !== 403)
      );
      if (!shouldAssertAddress(response.status)) {
        return;
      }

      expectAddressLookupShape(response.data);
    });
  });
});

test.describe('Postcode lookup helper coverage', { tag: '@svc-postcode-lookup' }, () => {
  test('shouldAssertAddress handles guarded status', () => {
    expect(shouldAssertAddress(200)).toBe(true);
    expect(shouldAssertAddress(500)).toBe(false);
  });
});
