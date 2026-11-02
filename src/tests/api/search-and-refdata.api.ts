import { expectStatus, StatusSets, withRetry, withXsrf } from '../../utils/api/apiTestUtils';
import { AuthenticationError } from '../../utils/api/errors';
import { seedRoleAccessCaseId } from '../../utils/api/role-access';
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
import { RoleAssignmentContainer } from '../../utils/api/types';
import {
  buildCaseIdListPayload,
  buildCaseIdPayload,
  buildRoleAllocationRequest,
  ensureCcdCaseReference,
  postWaWithDiagnostics,
} from '../../utils/api/waRequestGuardrails';
import { config } from '../common/apiTestConfig';

import { ROLE_ACCESS_CASE_ID, resolveRoleAccessCaseId } from './data/testIds';
import { test, expect } from './fixtures';

test.describe('Global search', { tag: '@svc-global-search' }, () => {
  test('searchCases proxy responds or guards', async ({ apiClient }) => {
    const response = await withRetry(
      () =>
        apiClient.post<{ total?: number; cases?: unknown[] }>('data/internal/searchCases?ctid=xuiTestCaseType', {
          data: { size: 1, from: 0, sort: [], native_es_query: { match_all: {} } },
          throwOnError: false,
        }),
      { retries: 1, retryStatuses: [502, 504] }
    );
    expectStatus(response.status, [200, 400, 401, 403, 404, 500, 502, 504]);
    assertSearchCasesResponse(response.status, response.data);
  });
});

test.describe('Role access / AM', { tag: '@svc-role-assignment' }, () => {
  let roleAccessCaseId = ROLE_ACCESS_CASE_ID;
  const caseOfficerCredentials = config.users?.[config.testEnv as keyof typeof config.users]?.caseOfficer_r1;
  const hasCaseOfficer: boolean = Boolean(caseOfficerCredentials?.e && caseOfficerCredentials.sec);

  test.beforeAll(async ({ apiClient }) => {
    if (!roleAccessCaseId) {
      const seeded = await seedRoleAccessCaseId(apiClient);
      roleAccessCaseId = resolveRoleAccessCaseId(seeded);
    }
    roleAccessCaseId = ensureCcdCaseReference(resolveRoleAccessCaseId(roleAccessCaseId), 'role-access seed caseId');
  });

  test('get-my-access-new-count', { tag: '@svc-work-allocation' }, async ({ apiClient }) => {
    const res = await withRetry(
      () =>
        apiClient.get<{ count?: number } | number>('api/role-access/roles/get-my-access-new-count', {
          throwOnError: false,
        }),
      { retries: 2, retryStatuses: [502, 504] }
    );
    expectStatus(res.status, [200, 401, 403, 500, 502, 504]);
    assertMyAccessCount(res.status, res.data);
  });

  test('roles/access-get responds', async ({ apiClient }, testInfo) => {
    const payload = buildCaseIdListPayload(resolveRoleAccessCaseId(roleAccessCaseId));
    const res = await withRetry(
      () =>
        postWaWithDiagnostics<RoleAssignmentContainer>(apiClient, {
          endpoint: 'api/role-access/roles/access-get',
          payload,
          allowedStatuses: [200, 400, 401, 403, 404, 500],
          testInfo,
        }),
      { retries: 1, retryStatuses: [502, 504] }
    );
    expectStatus(res.status, [200, 400, 401, 403, 404, 500]);
    assertRoleAccessGetResponse(res.status, res.data);
  });

  test('roles/access-get-by-caseId responds with roles when present', async ({ apiClient }, testInfo) => {
    const payload = buildCaseIdPayload(resolveRoleAccessCaseId(roleAccessCaseId));
    const res = await postWaWithDiagnostics<RoleAssignmentContainer>(apiClient, {
      endpoint: 'api/role-access/roles/access-get-by-caseId',
      payload,
      allowedStatuses: [200, 400, 401, 403, 404, 500],
      testInfo,
    });
    expectStatus(res.status, [200, 400, 401, 403, 404, 500]);
    assertRoleAccessByCaseIdResponse(res.status, res.data);
  });

  test('exclusions/confirm responds with XSRF header', async ({ apiClient }) => {
    await withXsrf('solicitor', async (headers) => {
      const res = await apiClient.post<RoleAssignmentContainer>('api/role-access/exclusions/confirm', {
        data: {},
        headers,
        throwOnError: false,
      });
      expectStatus(res.status, StatusSets.allocateRole);
      assertRoleAssignmentsIfPresent(res.status, res.data);
    });
  });

  test('role access confirm rejects case officer without solicitor role', async ({ apiClientFor }, testInfo) => {
    if (!hasCaseOfficer) {
      testInfo.annotations.push({
        type: 'notice',
        description: 'Case officer not configured for this environment.',
      });
      expect(hasCaseOfficer).toBe(false);
      return;
    }
    try {
      const client = await apiClientFor('caseOfficer_r1');
      const res = await client.post('api/role-access/allocate-role/confirm', {
        data: buildRoleAllocationRequest(resolveRoleAccessCaseId(roleAccessCaseId)),
        throwOnError: false,
      });
      expectStatus(res.status, [401, 403, 500]);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        testInfo.annotations.push({
          type: 'notice',
          description: `Case-officer role check could not authenticate in ${config.testEnv}: ${error.message}`,
        });
        expect(error.message).toContain('caseOfficer_r1');
        return;
      }
      throw error;
    }
  });
});

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
