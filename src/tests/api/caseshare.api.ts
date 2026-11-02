import { expectCaseShareShape } from '../../utils/api/assertions';
import { assertCaseShareEntries, resolveEntries } from '../../utils/api/caseShareUtils';

import { test, expect } from './fixtures';

test.describe('Case share helper coverage', { tag: '@svc-case-share' }, () => {
  test('assertCaseShareEntries covers function and object schemas', () => {
    const casesPayload = { cases: [{ caseId: 'case-1', sharedWith: [] }] };
    assertCaseShareEntries(casesPayload, 'cases', expectCaseShareShape);

    const orgPayload = { organisations: [{ organisationIdentifier: 'org-1', name: 'Org' }] };
    assertCaseShareEntries(
      orgPayload,
      'organisations',
      expect.objectContaining({
        organisationIdentifier: expect.any(String),
        name: expect.any(String),
      })
    );
  });

  test('resolveEntries handles array payloads', () => {
    const data = [{ caseId: 'case-1' }];
    expect(resolveEntries(data, 'cases')).toEqual(data);
  });

  test('resolveEntries handles direct property payloads', () => {
    const data = { cases: [{ caseId: 'case-2' }] };
    expect(resolveEntries(data, 'cases')).toEqual(data.cases);
  });

  test('resolveEntries handles nested payloads', () => {
    const data = { payload: { cases: [{ caseId: 'case-3' }] } };
    expect(resolveEntries(data, 'cases')).toEqual(data.payload.cases);
  });

  test('resolveEntries handles missing payloads', () => {
    expect(resolveEntries({ foo: 'bar' }, 'cases')).toEqual([]);
    expect(resolveEntries(undefined, 'cases')).toEqual([]);
  });
});
