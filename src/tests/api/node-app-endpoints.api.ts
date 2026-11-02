import { expectStatus, StatusSets } from '../../utils/api/apiTestUtils';
import {
  assertSecurityHeaders,
  assertUserDetailsKeys,
  assertUserDetailsPayload,
  assertUserInfoDetails,
  buildExpiredCookies,
  formatAttachmentBody,
  resolveHeader,
  resolveUserInfo,
  shouldProcessUserDetails,
} from '../../utils/api/nodeAppUtils';

import nodeAppDataModels from './data/nodeAppDataModels';
import { test, expect, buildApiAttachment } from './fixtures';

test.describe('Node app endpoints', { tag: '@svc-node-app' }, () => {

  test('returns enriched user details for solicitor session', async ({ apiClient }, testInfo) => {
    const response = await apiClient.get<Record<string, unknown>>('api/user/details', { throwOnError: false });

    expectStatus(response.status, StatusSets.guardedExtended);
    if (!shouldProcessUserDetails(response.status)) {
      return;
    }
    const userInfo = resolveUserInfo(response.data);
    assertUserInfoDetails(userInfo);
    assertUserDetailsPayload(response.data);

    const expected = nodeAppDataModels.getUserDetails_oidc();
    assertUserDetailsKeys(response.data, expected);

    const attachment = buildApiAttachment(response.logEntry, {
      includeRaw: process.env.PLAYWRIGHT_DEBUG_API === '1',
    });
    const prettyBody = formatAttachmentBody(attachment);
    await testInfo.attach(`${attachment.name}-pretty`, {
      body: prettyBody,
      contentType: 'application/json',
    });
  });
});

test.describe('Node app helper coverage', { tag: '@svc-node-app' }, () => {
  test('assertUserInfoDetails covers name variants', () => {
    assertUserInfoDetails({
      email: 'user@example.com',
      roles: ['role'],
      uid: 'uid-1',
      given_name: 'Given',
      family_name: 'Family',
    });
    assertUserInfoDetails({
      email: 'user@example.com',
      roles: ['role'],
      id: 'id-1',
      forename: 'Fore',
      surname: 'Sur',
    });
    assertUserInfoDetails({
      email: 'user@example.com',
      roles: ['role'],
      id: 'id-2',
    });
  });

  test('assertUserDetailsPayload handles role assignment and sessionTimeout', () => {
    assertUserDetailsPayload({
      roleAssignmentInfo: [],
      canShareCases: true,
      sessionTimeout: { idleModalDisplayTime: 5, pattern: '.*' },
    });
  });

  test('assertUserDetailsKeys handles role assignments when present', () => {
    const expected = nodeAppDataModels.getUserDetails_oidc();
    assertUserDetailsKeys({ ...expected, roleAssignmentInfo: expected.roleAssignmentInfo }, expected);
    assertUserDetailsKeys({ ...expected, roleAssignmentInfo: [] }, expected);
  });

  test('assertSecurityHeaders tolerates missing headers', () => {
    assertSecurityHeaders('no-store', 'nosniff');
    assertSecurityHeaders();
  });

  test('shouldProcessUserDetails returns false for non-200 status', () => {
    expect(shouldProcessUserDetails(200)).toBe(true);
    expect(shouldProcessUserDetails(500)).toBe(false);
  });

  test('resolveUserInfo and formatAttachmentBody handle variants', () => {
    expect(resolveUserInfo({ userInfo: { id: 'user-1' } })).toEqual({ id: 'user-1' });
    expect(resolveUserInfo(undefined)).toEqual({});
    expect(formatAttachmentBody({ body: 'text' })).toBe('text');
    expect(formatAttachmentBody({ body: { key: 'value' } })).toContain('"key": "value"');
  });

  test('resolveHeader handles casing differences', () => {
    expect(resolveHeader({ 'content-type': 'app/json' }, 'content-type')).toBe('app/json');
    expect(resolveHeader({ 'Content-Type': 'app/json' }, 'content-type')).toBe('app/json');
    expect(resolveHeader({ 'CONTENT-TYPE': 'app/json' }, 'content-type')).toBe('app/json');
    expect(resolveHeader({}, 'content-type')).toBeUndefined();
  });

  test('buildExpiredCookies handles missing cookies', () => {
    expect(buildExpiredCookies({ cookies: [{ name: 'c', value: '1', expires: 0 }] })).toHaveLength(1);
    expect(buildExpiredCookies({})).toEqual([]);
  });
});
