import type { Page } from '@playwright/test';

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
export const workAllocationRegionLocationRoutePattern = '**/workallocation/region-location*';
export const workAllocationFullLocationRoutePattern = '**/workallocation/full-location*';
export const workAllocationCaseworkerByServiceNameRoutePattern = '**/workallocation/caseworker/getUsersByServiceName*';

const defaultSupportedJurisdictionsMock = ['IA', 'SSCS'];
type SupportedJurisdictionDetail = { serviceId: string; serviceName: string };
type TaskMockRouteOptions = {
  skipValidation?: boolean;
  status?: number;
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

export async function setupTaskListBootstrapRoutes(
  page: Page,
  supportedJurisdictions: readonly string[] = defaultSupportedJurisdictionsMock,
  supportedJurisdictionDetails: SupportedJurisdictionDetail[] = defaultSupportedJurisdictionDetailsMock
): Promise<void> {
  const aggregatedJurisdictions = supportedJurisdictions.map((serviceId) => {
    const detailedService = supportedJurisdictionDetails.find((service) => service.serviceId === serviceId);
    return {
      id: serviceId,
      name: detailedService?.serviceName ?? serviceId,
    };
  });

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
      body: JSON.stringify(supportedJurisdictionDetails),
    });
  });

  await page.route(aggregatedCaseworkerJurisdictionsRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(aggregatedJurisdictions),
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

  await page.route(workAllocationCaseworkerByServiceNameRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
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

  await setupTaskListBootstrapRoutes(page);

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
