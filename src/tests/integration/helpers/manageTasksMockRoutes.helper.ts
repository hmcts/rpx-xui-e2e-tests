import type { Page, Route } from '@playwright/test';

import { extractUserIdFromCookies } from '../../e2e/integration/utils/extractUserIdFromCookies.js';

import { setupNgIntegrationBaseRoutes, type NgIntegrationUserDetailsOptions } from './ngIntegrationMockRoutes.helper';
import { setupTaskListBootstrapRoutes, taskListRoutePattern } from './taskListMockRoutes.helper';
import { assertValidWorkAllocationTaskListMock } from './workAllocationMockValidation.helper';

export const myCasesRoutePattern = /\/workallocation\/my-work\/cases(?:\?.*)?$/;
export const myAccessRoutePattern = /\/workallocation\/my-work\/myaccess(?:\?.*)?$/;
export const allWorkCasesRoutePattern = /\/workallocation\/all-work\/cases(?:\?.*)?$/;

const defaultTaskListResponse = { tasks: [], total_records: 0 };
const buildDefaultManageTasksUserDetails = (userId = 'staff-admin-integration-user') => ({
  userId,
  roleCategory: 'LEGAL_OPERATIONS',
  roles: ['caseworker-ia', 'caseworker-ia-caseofficer', 'caseworker-civil', 'staff-admin', 'task-supervisor'],
  roleAssignmentInfo: [
    { jurisdiction: 'IA', substantive: 'Y', roleType: 'ORGANISATION', baseLocation: '765324' },
    { jurisdiction: 'CIVIL', substantive: 'Y', roleType: 'ORGANISATION', baseLocation: '231596' },
  ],
});
const customUserDetailsConfiguredKey = '__hmctsManageTasksCustomUserDetailsConfigured';

async function resolveManageTasksUserId(page: Page): Promise<string | undefined> {
  const cookies = await page.context().cookies().catch(() => []);
  return extractUserIdFromCookies(cookies) ?? undefined;
}

type BaseManageTaskRouteOptions = {
  taskListResponse?: unknown;
  taskListHandler?: (route: Route) => Promise<void>;
  supportedJurisdictions?: readonly string[];
  supportedJurisdictionDetails?: Array<{ serviceId: string; serviceName: string }>;
  userDetails?: NgIntegrationUserDetailsOptions;
};

export async function setupManageTasksBaseRoutes(page: Page, options: BaseManageTaskRouteOptions = {}): Promise<void> {
  const customUserDetailsConfigured = Boolean((page as Page & Record<string, unknown>)[customUserDetailsConfiguredKey]);
  const resolvedUserId = customUserDetailsConfigured ? undefined : await resolveManageTasksUserId(page);
  const userDetails = options.userDetails ?? (customUserDetailsConfigured ? undefined : buildDefaultManageTasksUserDetails(resolvedUserId));
  await setupNgIntegrationBaseRoutes(page, {
    userDetails,
    skipUserDetailsMock: customUserDetailsConfigured && !options.userDetails,
  });
  await setupTaskListBootstrapRoutes(page, options.supportedJurisdictions, options.supportedJurisdictionDetails);

  await page.route('**/api/role-access/roles/getJudicialUsers*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });

  await page.route('**/api/role-access/roles/get-my-access-new-count*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0 }),
    });
  });

  await page.route(taskListRoutePattern, async (route) => {
    if (options.taskListHandler) {
      await options.taskListHandler(route);
      return;
    }

    const resolvedTaskListResponse = options.taskListResponse ?? defaultTaskListResponse;
    assertValidWorkAllocationTaskListMock(resolvedTaskListResponse);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(resolvedTaskListResponse),
    });
  });
}

export function markManageTasksCustomUserDetailsConfigured(page: Page): void {
  (page as Page & Record<string, unknown>)[customUserDetailsConfiguredKey] = true;
}

export function buildManageTasksUserDetailsOptionsForJurisdictions(
  supportedJurisdictions: readonly string[],
  userId = 'exui-central-assurance-user'
): NgIntegrationUserDetailsOptions {
  return {
    userId,
    roleCategory: 'LEGAL_OPERATIONS',
    roles: [
      'caseworker-ia-caseofficer',
      'caseworker-civil-staff',
      'caseworker-privatelaw',
      'caseworker-publiclaw',
      'caseworker-employment',
      'caseworker-st_cic',
      'staff-admin',
      'task-supervisor',
    ],
    roleAssignmentInfo: supportedJurisdictions.map((jurisdiction) => ({
      jurisdiction,
      substantive: 'Y',
      roleType: 'ORGANISATION',
      baseLocation: '765324',
    })),
  };
}

type MyCasesRouteOptions = BaseManageTaskRouteOptions & {
  status?: number;
  routeHandler?: (route: Route) => Promise<void>;
};

export async function setupMyCasesRoutes(page: Page, myCasesResponse: unknown, options: MyCasesRouteOptions = {}): Promise<void> {
  await setupManageTasksBaseRoutes(page, options);

  await page.route(myCasesRoutePattern, async (route) => {
    if (options.routeHandler) {
      await options.routeHandler(route);
      return;
    }

    await route.fulfill({
      status: options.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(myCasesResponse),
    });
  });
}

type MyAccessRouteOptions = BaseManageTaskRouteOptions & {
  status?: number;
  newCount?: number;
};

export async function setupMyAccessRoutes(
  page: Page,
  myAccessResponse: unknown,
  options: MyAccessRouteOptions = {}
): Promise<void> {
  await setupManageTasksBaseRoutes(page, options);

  await page.route('**/api/role-access/roles/get-my-access-new-count*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: options.newCount ?? 0 }),
    });
  });

  await page.route(myAccessRoutePattern, async (route) => {
    await route.fulfill({
      status: options.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(myAccessResponse),
    });
  });
}

type AllWorkCasesRouteOptions = BaseManageTaskRouteOptions & {
  status?: number;
  routeHandler?: (route: Route) => Promise<void>;
};

export async function setupAllWorkCasesRoutes(
  page: Page,
  allWorkCasesResponse: unknown,
  options: AllWorkCasesRouteOptions = {}
): Promise<void> {
  await setupManageTasksBaseRoutes(page, options);

  await page.route(allWorkCasesRoutePattern, async (route) => {
    if (options.routeHandler) {
      await options.routeHandler(route);
      return;
    }

    await route.fulfill({
      status: options.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(allWorkCasesResponse),
    });
  });
}
