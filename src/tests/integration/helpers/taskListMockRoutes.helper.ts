import type { Page, Route } from '@playwright/test';

import nodeAppDataModels from '../../../data/api/nodeAppDataModels.js';

import {
  setupCaseworkerJurisdictionsRoute,
  type SupportedJurisdictionDetail,
} from './caseworkerJurisdictionMockRoutes.helper';
import {
  assertValidWorkAllocationCaseTaskMock,
  assertValidWorkAllocationTaskListMock,
} from './workAllocationMockValidation.helper';

export const taskListRoutePattern = /\/workallocation\/task(?:\?.*)?$/;
export const waSupportedJurisdictionsGetRoutePattern = '**/api/wa-supported-jurisdiction/get*';
export const waSupportedJurisdictionsDetailRoutePattern = '**/api/wa-supported-jurisdiction/detail*';
export const aggregatedCaseworkerJurisdictionsRoutePattern = '**/aggregated/caseworkers/**/jurisdictions*';
export const workAllocationTypesOfWorkRoutePattern = '**/workallocation/task/types-of-work*';
export const healthCheckRoutePattern = '**/api/healthCheck*';
export const workAllocationLocationRoutePattern = '**/workallocation/location*';
export const workAllocationRegionLocationRoutePattern = '**/workallocation/region-location*';
export const workAllocationFullLocationRoutePattern = '**/workallocation/full-location*';
export const locationByIdRoutePattern = '**/api/locations/getLocationsById*';
export const workAllocationCaseworkerByServiceNameRoutePattern = '**/workallocation/caseworker/getUsersByServiceName*';
export const userDetailsRoutePattern = /\/api\/user\/details(?:\?.*)?$/;

const defaultSupportedJurisdictionsMock = ['IA', 'SSCS', 'Other'];
type TaskMockRouteOptions = {
  bootstrapUser?: TaskListBootstrapUserOptions;
  skipValidation?: boolean;
  status?: number;
};

export type TaskListBootstrapRoleAssignment = Record<string, unknown> & {
  baseLocation?: string;
  bookable?: boolean | string;
  jurisdiction: string;
  region?: string;
  roleName?: string;
  roleType: string;
  substantive?: boolean | string;
};

export type TaskListBootstrapUserOptions = {
  replaceRoleAssignments?: boolean;
  roleAssignments?: TaskListBootstrapRoleAssignment[];
  roleCategory?: string;
  roles?: string[];
  skipUserDetailsMock?: boolean;
  userId?: string;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const serviceLabelByJurisdiction: Record<string, string> = {
  CIVIL: 'Civil',
  DIVORCE: 'Divorce',
  EMPLOYMENT: 'Employment',
  FR: 'Financial Remedy',
  IA: 'Immigration & Asylum',
  PRIVATELAW: 'Private Law',
  PROBATE: 'Probate',
  PUBLICLAW: 'Public Law',
  SSCS: 'Social security and child support',
  ST_CIC: 'Special Tribunals',
  Other: 'Other',
};

export function buildSupportedJurisdictionDetails(
  supportedJurisdictions: readonly string[],
  labels: Record<string, string> = serviceLabelByJurisdiction
): SupportedJurisdictionDetail[] {
  return supportedJurisdictions.map((serviceId) => ({ serviceId, serviceName: labels[serviceId] ?? serviceId }));
}

const defaultSupportedJurisdictionDetailsMock: SupportedJurisdictionDetail[] = buildSupportedJurisdictionDetails(
  defaultSupportedJurisdictionsMock
);

const defaultTaskListLocationMock = {
  epimms_id: '765324',
  site_name: 'Taylor House',
  region_id: '1',
  region: 'London',
  postcode: 'EC1R 4QU',
  court_address: '88 Rosebery Avenue, London',
  is_case_management_location: 'Y',
  is_hearing_location: 'Y',
};

type RequestedLocation = {
  id?: string;
  locationId?: string;
  services?: string[];
};

const buildResolvedBaseLocations = (
  supportedJurisdictions: readonly string[],
  requestedLocations: RequestedLocation[] = []
) =>
  supportedJurisdictions.map((serviceId, index) => {
    const requestedLocation =
      requestedLocations.find((location) => location.services?.includes(serviceId)) ?? requestedLocations[index];
    return {
      id: requestedLocation?.id ?? requestedLocation?.locationId ?? `${index + 1}765324`,
      locationName: `${serviceLabelByJurisdiction[serviceId] ?? serviceId} Hearing Centre`,
      regionId: '1',
      services: [serviceId],
    };
  });

export async function setupTaskListBootstrapRoutes(
  page: Page,
  supportedJurisdictions: readonly string[] = defaultSupportedJurisdictionsMock,
  supportedJurisdictionDetails: SupportedJurisdictionDetail[] = defaultSupportedJurisdictionDetailsMock,
  userOptions: TaskListBootstrapUserOptions = {}
): Promise<void> {
  const resolvedSupportedJurisdictionDetails = buildSupportedJurisdictionDetails(
    supportedJurisdictions,
    Object.fromEntries(supportedJurisdictionDetails.map((detail) => [detail.serviceId, detail.serviceName]))
  );

  if (!userOptions.skipUserDetailsMock) {
    const userDetails = nodeAppDataModels.getUserDetailsOauth();
    if (userOptions.userId) {
      userDetails.userInfo.id = userOptions.userId;
      userDetails.userInfo.uid = userOptions.userId;
    }
    const baseRoles = Array.isArray(userDetails.userInfo.roles)
      ? userDetails.userInfo.roles.filter((role): role is string => typeof role === 'string')
      : [];
    const resolvedRoles = userOptions.roles ?? baseRoles;
    userDetails.userInfo.roles = Array.from(new Set([...resolvedRoles, 'task-supervisor']));
    userDetails.userInfo.roleCategory = userOptions.roleCategory ?? 'LEGAL_OPERATIONS';
    const routeRoleAssignments =
      userOptions.roleAssignments ??
      supportedJurisdictions.map((jurisdiction) => ({
        jurisdiction,
        roleName: 'task-supervisor',
        roleType: 'ORGANISATION',
        substantive: 'Y',
      }));
    userDetails.roleAssignmentInfo = [
      ...(userOptions.replaceRoleAssignments
        ? []
        : Array.isArray(userDetails.roleAssignmentInfo)
          ? userDetails.roleAssignmentInfo
          : []),
      ...routeRoleAssignments,
    ];

    await page.addInitScript((seededUserInfo) => {
      window.sessionStorage.setItem('userDetails', JSON.stringify(seededUserInfo));
    }, userDetails.userInfo);

    await page.route('**/auth/isAuthenticated*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true),
      });
    });

    const fulfillUserDetails = async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(userDetails),
      });
    };

    await page.context().route(userDetailsRoutePattern, fulfillUserDetails);
    await page.route(userDetailsRoutePattern, fulfillUserDetails);

    await page.route('**/api/organisation*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: 'Playwright Organisation',
          organisationIdentifier: 'PLAYWRIGHT_ORG',
          status: 'ACTIVE',
          contactInformation: [],
          paymentAccount: [],
        }),
      });
    });
  }

  await page.route('**/api/role-access/roles/getJudicialUsers*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/role-access/roles/get-my-access-new-count*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0 }),
    });
  });

  await page.route('**/api/role-access/allocate-role/valid-roles*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          serviceId: 'IA',
          roles: [{ roleId: 'lead-judge', roleName: 'Lead judge' }],
        },
      ]),
    });
  });

  await page.route(workAllocationCaseworkerByServiceNameRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await setupCaseworkerJurisdictionsRoute(page, [...supportedJurisdictions], resolvedSupportedJurisdictionDetails);

  await page.route(waSupportedJurisdictionsGetRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(supportedJurisdictions),
    });
  });

  await page.route(waSupportedJurisdictionsDetailRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(resolvedSupportedJurisdictionDetails),
    });
  });

  await page.route(workAllocationTypesOfWorkRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { key: 'applications', label: 'Applications' },
        { key: 'hearing_work', label: 'Hearing work' },
        { key: 'routine_work', label: 'Routine work' },
      ]),
    });
  });

  await page.route(healthCheckRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ healthState: true }),
    });
  });

  await page.route(workAllocationLocationRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([defaultTaskListLocationMock]),
    });
  });

  await page.route(workAllocationRegionLocationRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route(workAllocationFullLocationRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route(locationByIdRoutePattern, async (route) => {
    const requestBody = route.request().postDataJSON() as { locations?: RequestedLocation[] } | undefined;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildResolvedBaseLocations(supportedJurisdictions, requestBody?.locations)),
    });
  });
}

/**
 * Sets up mock API routes for Task List tests.
 *
 * Mocks the health-check and work-allocation task endpoints so tests run
 * without a live backend, preventing flakiness from downstream service
 * unavailability.
 *
 * @param page            - Playwright Page object
 * @param taskListResponse - The mock task list payload to return from the task endpoint
 *
 * @example
 * ```typescript
 * await setupTaskListMockRoutes(page, buildMyTaskListMock(userId, 160));
 * ```
 */
export async function setupTaskListMockRoutes(
  page: Page,
  taskListResponse: unknown,
  options: TaskMockRouteOptions = {}
): Promise<void> {
  if (!options.skipValidation) {
    assertValidWorkAllocationTaskListMock(taskListResponse);
  }

  await setupTaskListBootstrapRoutes(
    page,
    defaultSupportedJurisdictionsMock,
    defaultSupportedJurisdictionDetailsMock,
    options.bootstrapUser
  );

  await page.route(taskListRoutePattern, async (route) => {
    await route.fulfill({
      status: options.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(taskListResponse),
    });
  });
}

export function buildCaseTaskListRoutePattern(caseId: string): RegExp {
  return new RegExp(`/workallocation/case/task/${escapeRegex(caseId)}(?:\\?.*)?$`);
}

export async function setupCaseTaskListMockRoute(
  page: Page,
  caseId: string,
  caseTaskResponse: unknown,
  options: TaskMockRouteOptions = {}
): Promise<void> {
  if (!options.skipValidation) {
    assertValidWorkAllocationCaseTaskMock(caseTaskResponse);
  }

  await page.route(buildCaseTaskListRoutePattern(caseId), async (route) => {
    await route.fulfill({
      status: options.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(caseTaskResponse),
    });
  });
}
