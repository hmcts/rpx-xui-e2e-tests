import {
  assertGlobalSearchResults,
  assertGlobalSearchServices,
  assertLocationsResponse,
  assertManageLabellingResponse,
  assertMyAccessCount,
  assertRoleAccessByCaseIdResponse,
  assertRoleAccessGetResponse,
  assertRoleAssignmentsIfPresent,
  assertSearchCasesResponse,
  assertStaffRefDataResponse,
  assertSupportedJurisdictions,
  assertValidRolesResponse,
  buildExpiredCookies,
} from '../../utils/api/searchRefDataUtils';

import { test, expect } from './fixtures';

test.describe('Search/refdata helper coverage', { tag: ['@svc-global-search', '@svc-ref-data'] }, () => {
  test('assertGlobalSearchServices covers results and empty', () => {
    assertGlobalSearchServices(200, [{ serviceId: 'svc', serviceName: 'Service' }]);
    assertGlobalSearchServices(200, []);
    assertGlobalSearchServices(401, []);
  });

  test('assertGlobalSearchResults covers populated and empty results', () => {
    assertGlobalSearchResults(200, { results: [{ caseReference: '1234' }] });
    assertGlobalSearchResults(200, { results: [] });
    assertGlobalSearchResults(401, undefined);
  });

  test('assertSearchCasesResponse covers shaped and stubbed payloads', () => {
    assertSearchCasesResponse(200, { total: 1, cases: [{ id: 'case-1' }] });
    assertSearchCasesResponse(200, { foo: 'bar' });
    assertSearchCasesResponse(500, undefined);
  });

  test('assertSupportedJurisdictions covers string arrays', () => {
    assertSupportedJurisdictions(200, ['IA']);
    assertSupportedJurisdictions(200, []);
    assertSupportedJurisdictions(403, undefined);
  });

  test('assertLocationsResponse covers list and non-list payloads', () => {
    assertLocationsResponse(200, [{ epimms_id: '123' }]);
    assertLocationsResponse(200, []);
    assertLocationsResponse(401, undefined);
  });

  test('assertStaffRefDataResponse covers staff payloads', () => {
    assertStaffRefDataResponse(200, { staff: [{ known_as: 'Name', email_id: 'a@b.com' }] });
    assertStaffRefDataResponse(200, { staff: [] });
    assertStaffRefDataResponse(200, { staff: { name: 'Not array' } });
    assertStaffRefDataResponse(400, {});
  });

  test('assertMyAccessCount handles number and object responses', () => {
    assertMyAccessCount(200, 1);
    assertMyAccessCount(200, { count: 2 });
    assertMyAccessCount(200, { value: 'unknown' });
    assertMyAccessCount(401, undefined);
  });

  test('assertRoleAccessGetResponse handles array and container shapes', () => {
    assertRoleAccessGetResponse(200, [{ roleCategory: 'LEGAL', roleName: 'role' }]);
    assertRoleAccessGetResponse(200, { roleAssignmentResponse: [{ roleCategory: 'LEGAL', roleName: 'role' }] });
    assertRoleAccessGetResponse(200, []);
    assertRoleAccessGetResponse(200, { roleAssignmentResponse: [] });
    assertRoleAccessGetResponse(200, {});
    assertRoleAccessGetResponse(403, undefined);
  });

  test('assertValidRolesResponse handles roles array', () => {
    assertValidRolesResponse(200, [{ roleId: 'id', roleName: 'name' }]);
    assertValidRolesResponse(200, []);
    assertValidRolesResponse(400, undefined);
  });

  test('assertRoleAccessByCaseIdResponse handles roleAssignmentResponse', () => {
    assertRoleAccessByCaseIdResponse(200, { roleAssignmentResponse: [{ roleCategory: 'LEGAL', roleName: 'role' }] });
    assertRoleAccessByCaseIdResponse(200, { roleAssignmentResponse: [] });
    assertRoleAccessByCaseIdResponse(200, { roleAssignmentResponse: {} });
    assertRoleAccessByCaseIdResponse(500, undefined);
  });

  test('assertManageLabellingResponse handles guarded and success statuses', () => {
    assertManageLabellingResponse(200, [{ roleCategory: 'LEGAL', roleName: 'role' }]);
    assertManageLabellingResponse(403, undefined);
  });

  test('assertRoleAssignmentsIfPresent handles success and empty arrays', () => {
    assertRoleAssignmentsIfPresent(200, [{ roleCategory: 'LEGAL', roleName: 'role' }]);
    assertRoleAssignmentsIfPresent(201, [{ roleCategory: 'LEGAL', roleName: 'role' }]);
    assertRoleAssignmentsIfPresent(200, []);
    assertRoleAssignmentsIfPresent(400, undefined);
  });

  test('buildExpiredCookies handles missing cookies', () => {
    expect(buildExpiredCookies({ cookies: [{ name: 'c', value: '1', expires: 0 }] })).toHaveLength(1);
    expect(buildExpiredCookies({})).toEqual([]);
  });
});
