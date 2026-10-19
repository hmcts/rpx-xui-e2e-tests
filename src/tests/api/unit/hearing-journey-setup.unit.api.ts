import { expect, test } from '@playwright/test';

import {
  applyHearingManagerSessionCookies,
  buildLargeListedHearings,
  resolveHearingsCaseRoute,
} from '../../integration/helpers/hearingJourneySetup.helper.js';

const hearingUserRoles = ['caseworker-privatelaw', 'hearing-manager'];

test.describe('hearing journey setup helper', { tag: '@svc-internal' }, () => {
  test('uses explicit route fields before routeConfig.caseConfig', () => {
    expect(
      resolveHearingsCaseRoute({
        jurisdictionId: 'EXPLICIT_JURISDICTION',
        caseTypeId: 'EXPLICIT_CASE_TYPE',
        caseReference: '1234123412341234',
        routeConfig: {
          userRoles: hearingUserRoles,
          caseConfig: {
            jurisdictionId: 'CONFIG_JURISDICTION',
            caseTypeId: 'CONFIG_CASE_TYPE',
            caseReference: '9999888877776666',
          },
        },
      })
    ).toEqual({
      jurisdictionId: 'EXPLICIT_JURISDICTION',
      caseTypeId: 'EXPLICIT_CASE_TYPE',
      caseReference: '1234123412341234',
    });
  });

  test('uses routeConfig.caseConfig when explicit route fields are omitted', () => {
    expect(
      resolveHearingsCaseRoute({
        routeConfig: {
          userRoles: hearingUserRoles,
          caseConfig: {
            jurisdictionId: 'SSCS',
            caseTypeId: 'Benefit',
            caseReference: '1111222233334444',
          },
        },
      })
    ).toEqual({
      jurisdictionId: 'SSCS',
      caseTypeId: 'Benefit',
      caseReference: '1111222233334444',
    });
  });

  test('falls back to the default hearings route when no overrides are supplied', () => {
    expect(resolveHearingsCaseRoute({ routeConfig: { userRoles: hearingUserRoles } })).toEqual({
      jurisdictionId: 'CIVIL',
      caseTypeId: 'CIVIL',
      caseReference: '1234567812345678',
    });
  });

  test('builds a stable listed-hearings dataset with sequential ids and hearing types', () => {
    expect(buildLargeListedHearings(3)).toEqual([
      expect.objectContaining({
        hearingId: '1705615000000',
        hearingType: 'ABA5-LISTED-1',
      }),
      expect.objectContaining({
        hearingId: '1705615000001',
        hearingType: 'ABA5-LISTED-2',
      }),
      expect.objectContaining({
        hearingId: '1705615000002',
        hearingType: 'ABA5-LISTED-3',
      }),
    ]);
  });

  test('annotates the selected hearing manager when applying a session', async () => {
    const annotations: Array<{ type: string; description: string }> = [];
    const usernameKey = 'HEARING_MANAGER_CR84_ON_2_USERNAME';
    const passwordKey = 'HEARING_MANAGER_CR84_ON_2_PASSWORD';
    const previousUsername = process.env[usernameKey];
    const previousPassword = process.env[passwordKey];

    process.env[usernameKey] = 'hearing-manager-on-2@example.test';
    process.env[passwordKey] = 'unit-test-password';
    try {
      const selected = await applyHearingManagerSessionCookies(
        {} as never,
        'HEARING_MANAGER_CR84_ON-2',
        { annotations, parallelIndex: 0 },
        async () => ({ cookies: [] })
      );

      expect(selected).toBe('HEARING_MANAGER_CR84_ON-2');
      expect(annotations).toEqual([{ type: 'session-user', description: 'HEARING_MANAGER_CR84_ON-2' }]);
    } finally {
      if (previousUsername === undefined) delete process.env[usernameKey];
      else process.env[usernameKey] = previousUsername;
      if (previousPassword === undefined) delete process.env[passwordKey];
      else process.env[passwordKey] = previousPassword;
    }
  });
});
