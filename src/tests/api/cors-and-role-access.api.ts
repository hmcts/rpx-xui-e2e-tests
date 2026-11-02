import { test, expect } from '@playwright/test';

import { StatusSets } from '../../utils/api/apiTestUtils';
import { assertCorsHeaders, shouldIgnoreCorsError } from '../../utils/api/corsUtils';

test.describe('CORS helper coverage', { tag: '@svc-cors' }, () => {
  test('assertCorsHeaders handles allowed and disallowed origins', () => {
    assertCorsHeaders(
      StatusSets.corsAllowed,
      200,
      { 'access-control-allow-origin': 'https://example.test' },
      'https://example.test'
    );
    assertCorsHeaders(StatusSets.corsAllowed, 204, {}, 'https://example.test');
    assertCorsHeaders(
      StatusSets.corsDisallowed,
      200,
      { 'Access-Control-Allow-Origin': 'https://other.test' },
      'https://example.test'
    );
    assertCorsHeaders(StatusSets.corsDisallowed, 502, {}, 'https://example.test');
  });

  test('shouldIgnoreCorsError handles network failures', () => {
    expect(shouldIgnoreCorsError(new Error('ENOTFOUND manage-case'))).toBe(true);
    expect(shouldIgnoreCorsError(new Error('ECONNREFUSED manage-case'))).toBe(true);
    expect(shouldIgnoreCorsError(new Error('ETIMEDOUT manage-case'))).toBe(false);
  });
});
