import { shouldAssertAddress } from '../../utils/api/postcodeLookupUtils';

import { test, expect } from './fixtures';

test.describe('Postcode lookup helper coverage', { tag: '@svc-postcode-lookup' }, () => {
  test('shouldAssertAddress handles guarded status', () => {
    expect(shouldAssertAddress(200)).toBe(true);
    expect(shouldAssertAddress(500)).toBe(false);
  });
});
