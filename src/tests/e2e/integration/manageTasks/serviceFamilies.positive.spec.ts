import type { Cookie, Page } from '@playwright/test';

import {
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_SERVICE_LABELS,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  sortServiceFamilies,
} from '../../../../data/exui-central-assurance.js';
import { expect, test } from '../../../../fixtures/ui';
import type { TaskListPage } from '../../../../page-objects/pages/exui/taskList.po.js';
import { ensureUiStorageStateForUser } from '../../../../utils/ui/session-storage.utils.js';
import { probeUiRouteAvailability } from '../../../../utils/ui/uiHostAvailability.js';
import {
  buildManageTasksUserDetailsOptionsForJurisdictions,
  setupManageTasksBaseRoutes,
} from '../../../integration/helpers/manageTasksMockRoutes.helper.js';
import { buildSupportedJurisdictionDetails } from '../../../integration/helpers/taskListMockRoutes.helper.js';
import { buildTaskListMock, availableActionsList } from '../../../integration/mocks/taskList.mock.js';
import { loadSessionCookies } from '../utils/session.utils.js';

const userIdentifier = 'COURT_ADMIN';
const centralAssuranceUserId = 'exui-central-assurance-user';

let sessionCookies: Cookie[] = [];
let sessionBootstrapIssue: string | undefined;

async function findTaskListAccessIssue(page: Page, expectedPath: string): Promise<string | undefined> {
  const loginInput = page.locator(
    'input#username, input[name="username"], input[type="email"], input#email, input[name="email"]'
  );
  if (await loginInput.first().isVisible().catch(() => false)) {
    return `Task list navigation redirected to the login page instead of staying in EXUI (${page.url()}).`;
  }

  const unauthorizedMessage = page.getByText("Sorry, you're not authorised to perform this action");
  if (await unauthorizedMessage.isVisible().catch(() => false)) {
    return `Task list navigation reached an authorization barrier instead of the mocked task page (${page.url()}).`;
  }

  if (!page.url().includes(expectedPath)) {
    return `Task list navigation did not stay on ${expectedPath} (${page.url()}).`;
  }

  return undefined;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNavigationDuringFilterRead(error: unknown): boolean {
  return /execution context was destroyed|because of a navigation/i.test(asErrorMessage(error));
}

async function readServiceFilterValues(page: Page, taskListPage: TaskListPage): Promise<string[]> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.waitForURL(/\/work\/my-work\/available(?:\?.*)?$/, { timeout: 5_000 }).catch(() => undefined);
    await taskListPage.openFilterPanel();
    await expect(taskListPage.selectAllServicesFilter).toBeVisible();

    try {
      return await taskListPage.serviceFilterCheckboxes.evaluateAll((elements) =>
        elements
          .map((element) => {
            const checkbox = element as HTMLInputElement;
            return checkbox.value || checkbox.id.replace(/^checkbox_services/, '');
          })
          .filter((value): value is string => Boolean(value))
      );
    } catch (error) {
      if (attempt === 3 || !isNavigationDuringFilterRead(error)) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    }
  }

  return [];
}

test.beforeAll(async () => {
  const cachedSession = loadSessionCookies(userIdentifier);
  sessionCookies = cachedSession.cookies;

  try {
    await ensureUiStorageStateForUser(userIdentifier, { strict: sessionCookies.length === 0 });
  } catch (error) {
    sessionBootstrapIssue = asErrorMessage(error);
  }

  const refreshedSession = loadSessionCookies(userIdentifier);
  sessionCookies = refreshedSession.cookies;
});

test.beforeEach(async ({ page, request }, testInfo) => {
  const availability = await probeUiRouteAvailability(request, '/work/my-work/list');
  testInfo.skip(availability.shouldSkip, availability.reason);
  testInfo.skip(
    sessionCookies.length === 0,
    sessionBootstrapIssue
      ? `No cached ${userIdentifier} UI session cookies were found after session bootstrap failed: ${sessionBootstrapIssue}`
      : `No cached ${userIdentifier} UI session cookies were found for the manage-tasks proof.`
  );

  await page.context().addCookies(sessionCookies);
  await setupManageTasksBaseRoutes(page, {
    supportedJurisdictions: EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
    supportedJurisdictionDetails: buildSupportedJurisdictionDetails(EXUI_WA_SUPPORTED_SERVICE_FAMILIES, EXUI_SERVICE_LABELS),
    taskListResponse: buildTaskListMock(3, centralAssuranceUserId, availableActionsList),
    userDetails: buildManageTasksUserDetailsOptionsForJurisdictions(EXUI_WA_SUPPORTED_SERVICE_FAMILIES, centralAssuranceUserId),
  });
});

test.describe(`Available task service families as ${userIdentifier}`, () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('available tasks filter exposes only the centrally supported WA families', async ({ page, taskListPage }, testInfo) => {
    await test.step('Open the available tasks tab and filter panel', async () => {
      try {
        await page.goto('/work/my-work/available', {
          waitUntil: 'domcontentloaded',
          timeout: 20_000,
        });
      } catch (error) {
        testInfo.skip(true, `Task list navigation did not complete within 20s: ${asErrorMessage(error)}`);
      }

      const accessIssue = await findTaskListAccessIssue(page, '/work/my-work/available');
      testInfo.skip(Boolean(accessIssue), accessIssue ?? '');
      await taskListPage.waitForTaskListShellReady('central assurance service family proof');
      await taskListPage.openFilterPanel();
      await expect(taskListPage.selectAllServicesFilter).toBeVisible();
    });

    await test.step('Verify the service filter values match the supported service-family list', async () => {
      const serviceFilterValues = await readServiceFilterValues(page, taskListPage);

      expect(sortServiceFamilies(serviceFilterValues)).toEqual(sortServiceFamilies(EXUI_WA_SUPPORTED_SERVICE_FAMILIES));

      for (const canaryFamily of EXUI_CANARY_SERVICE_FAMILIES) {
        expect(serviceFilterValues).not.toContain(canaryFamily);
      }
    });
  });
});
