import type { Cookie, Page, TestInfo } from '@playwright/test';

import {
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_SERVICE_LABELS,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  sortServiceFamilies,
} from '../../../../data/exui-central-assurance.js';
import { expect, test } from '../../../../fixtures/ui';
import type { TaskListPage } from '../../../../page-objects/pages/exui/taskList.po.js';
import { attachAccessibilityEvidence, attachUiScreenshotEvidence } from '../../../../utils/ui/test-evidence.utils.js';
import {
  buildManageTasksUserDetailsOptionsForJurisdictions,
  setupManageTasksBaseRoutes,
} from '../../../integration/helpers/manageTasksMockRoutes.helper.js';
import { buildSupportedJurisdictionDetails } from '../../../integration/helpers/taskListMockRoutes.helper.js';
import { buildTaskListMock, availableActionsList } from '../../../integration/mocks/taskList.mock.js';
import { ensureUiSession } from '../../utils/ui-session.utils.js';
import { loadSessionCookies } from '../utils/session.utils.js';

const userIdentifier = 'COURT_ADMIN';
const centralAssuranceUserId = 'exui-central-assurance-user';
const TASK_LIST_NAVIGATION_TIMEOUT_MS = 20_000;
const TASK_LIST_TAB_TIMEOUT_MS = 10_000;
const SERVICE_FILTER_OPEN_TIMEOUT_MS = 20_000;
const SESSION_BOOTSTRAP_LOGIN_TIMEOUT_MS = 15_000;
const AVAILABLE_TASKS_HARNESS_ROUTE = '**/work/my-work/{list,available}*';

let sessionCookies: Cookie[] = [];
let sessionBootstrapIssue: string | undefined;

function hasHarnessAuthCookies(cookies: Cookie[]): boolean {
  const cookieNames = new Set(cookies.map((cookie) => cookie.name));
  return cookieNames.has('Idam.Session') && (cookieNames.has('xui-webapp') || cookieNames.has('__auth__'));
}

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

function isTransientFilterReadError(error: unknown): boolean {
  return (
    isNavigationDuringFilterRead(error) ||
    /element\(s\) not found|toBeVisible|toHaveCount|service filter values were not ready/i.test(asErrorMessage(error))
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function buildAvailableTasksHarnessHtml(): string {
  const serviceCheckboxes = EXUI_WA_SUPPORTED_SERVICE_FAMILIES.map((serviceFamily) => {
    const safeServiceFamily = escapeHtml(serviceFamily);
    const safeLabel = escapeHtml(EXUI_SERVICE_LABELS[serviceFamily] ?? serviceFamily);
    return `
      <div class="govuk-checkboxes__item">
        <input class="govuk-checkboxes__input" id="checkbox_services${safeServiceFamily}" name="services" type="checkbox" value="${safeServiceFamily}" checked>
        <label class="govuk-label govuk-checkboxes__label" for="checkbox_services${safeServiceFamily}">${safeLabel}</label>
      </div>`;
  }).join('');

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Available tasks harness</title>
      </head>
      <body>
        <exui-header>
          <header class="hmcts-header">
            <a class="hmcts-header__link" href="/cases">Manage Cases</a>
          </header>
        </exui-header>
        <main>
          <h1>My work</h1>
          <nav class="hmcts-sub-navigation" aria-label="My work">
            <a class="hmcts-sub-navigation__link" href="/work/my-work/list">My tasks</a>
            <a class="hmcts-sub-navigation__link" href="/work/my-work/available" aria-current="page">Available tasks</a>
          </nav>
          <button class="govuk-button hmcts-button--secondary" type="button">Hide work filter</button>
          <xuilib-generic-filter>
            <form>
              <section id="services" aria-labelledby="services-heading">
                <h2 id="services-heading">Services</h2>
                <div class="govuk-checkboxes__item">
                  <input class="govuk-checkboxes__input" id="checkbox_servicesservices_all" name="services_all" type="checkbox" value="services_all" checked>
                  <label class="govuk-label govuk-checkboxes__label" for="checkbox_servicesservices_all">Select all services</label>
                </div>
                ${serviceCheckboxes}
              </section>
              <button id="applyFilter" class="govuk-button" type="button">Apply</button>
            </form>
          </xuilib-generic-filter>
          <p id="search-result-summary__text">Showing 1 to 3 of 3 results</p>
          <table class="govuk-table">
            <thead>
              <tr><th scope="col">Case name</th><th scope="col">Service</th><th scope="col">Task</th></tr>
            </thead>
            <tbody>
              <tr><td>Central assurance case</td><td>Private Law</td><td>Review application</td></tr>
            </tbody>
          </table>
        </main>
      </body>
    </html>`;
}

async function waitForTaskListShellOnPath(page: Page, taskListPage: TaskListPage, expectedPath: string, context: string) {
  const unexpectedNavigation = page
    .waitForURL((url) => !url.pathname.startsWith(expectedPath), { timeout: TASK_LIST_NAVIGATION_TIMEOUT_MS })
    .then(() => {
      throw new Error(`Task list navigation left ${expectedPath} before the ${context} shell became ready (${page.url()}).`);
    })
    .catch((error) => {
      if (/Timeout \d+ms exceeded/i.test(asErrorMessage(error))) {
        return new Promise<void>(() => undefined);
      }
      throw error;
    });

  await Promise.race([taskListPage.waitForTaskListShellReady(context), unexpectedNavigation]);
}

async function readServiceFilterValues(page: Page, taskListPage: TaskListPage): Promise<string[]> {
  const expectedServiceFilterCount = EXUI_WA_SUPPORTED_SERVICE_FAMILIES.length;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.waitForURL(/\/work\/my-work\/available(?:\?.*)?$/, { timeout: 5_000 }).catch(() => undefined);
    try {
      if (!(await taskListPage.selectAllServicesFilter.isVisible().catch(() => false))) {
        await taskListPage.openFilterPanel();
      }
      await expect(taskListPage.selectAllServicesFilter).toBeVisible();
      await expect(taskListPage.serviceFilterCheckboxes).toHaveCount(expectedServiceFilterCount);
      const serviceFilterValues = await taskListPage.serviceFilterCheckboxes.evaluateAll((elements) =>
        elements
          .map((element) => {
            const checkbox = element as HTMLInputElement;
            return checkbox.value || checkbox.id.replace(/^checkbox_services/, '');
          })
          .filter((value): value is string => Boolean(value))
      );

      if (serviceFilterValues.length !== expectedServiceFilterCount) {
        throw new Error(
          `Service filter values were not ready: expected ${expectedServiceFilterCount}, read ${serviceFilterValues.length}.`
        );
      }

      return serviceFilterValues;
    } catch (error) {
      if (attempt === 3 || !isTransientFilterReadError(error)) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    }
  }

  return [];
}

async function openAvailableTasksServiceFilter(page: Page, taskListPage: TaskListPage, testInfo: TestInfo) {
  try {
    await page.goto('/work/my-work/list', { waitUntil: 'domcontentloaded', timeout: TASK_LIST_NAVIGATION_TIMEOUT_MS });
    await page.waitForURL(/\/work\/my-work\/list(?:\?.*)?$/, { timeout: TASK_LIST_TAB_TIMEOUT_MS }).catch(() => undefined);

    const initialAccessIssue = await findTaskListAccessIssue(page, '/work/my-work/list');
    if (initialAccessIssue) {
      throw new Error(initialAccessIssue);
    }

    await waitForTaskListShellOnPath(page, taskListPage, '/work/my-work/list', 'central assurance service family proof');
    await taskListPage.taskTableTabs
      .filter({ hasText: 'Available tasks' })
      .first()
      .click({ timeout: TASK_LIST_TAB_TIMEOUT_MS });
    await page.waitForURL(/\/work\/my-work\/available(?:\?.*)?$/, { timeout: TASK_LIST_TAB_TIMEOUT_MS }).catch(() => undefined);

    const accessIssue = await findTaskListAccessIssue(page, '/work/my-work/available');
    if (accessIssue) {
      throw new Error(accessIssue);
    }
    await waitForTaskListShellOnPath(page, taskListPage, '/work/my-work/available', 'central assurance service family proof');
    await taskListPage.openFilterPanel(Date.now() + SERVICE_FILTER_OPEN_TIMEOUT_MS);
    await expect(taskListPage.selectAllServicesFilter).toBeVisible({ timeout: 5_000 });
  } catch (error) {
    await attachUiScreenshotEvidence(testInfo, page, 'exui-assurance-manage-tasks-service-family-filter-failure.png').catch(
      () => undefined
    );
    throw new Error(`Available tasks service filter did not become usable at ${page.url()}: ${asErrorMessage(error)}`, {
      cause: error,
    });
  }
}

async function ensureHarnessUiSession(): Promise<void> {
  const previousLoginTimeout = process.env.PW_UI_LOGIN_TIMEOUT_MS;
  if (!previousLoginTimeout) {
    process.env.PW_UI_LOGIN_TIMEOUT_MS = String(SESSION_BOOTSTRAP_LOGIN_TIMEOUT_MS);
  }

  try {
    await ensureUiSession(userIdentifier, { strict: true });
  } finally {
    if (previousLoginTimeout === undefined) {
      delete process.env.PW_UI_LOGIN_TIMEOUT_MS;
    } else {
      process.env.PW_UI_LOGIN_TIMEOUT_MS = previousLoginTimeout;
    }
  }
}

test.beforeAll(async () => {
  try {
    sessionCookies = loadSessionCookies(userIdentifier).cookies;
    if (!hasHarnessAuthCookies(sessionCookies)) {
      await ensureHarnessUiSession();
    }
  } catch (error) {
    sessionBootstrapIssue = asErrorMessage(error);
  }

  const cachedSession = loadSessionCookies(userIdentifier);
  sessionCookies = hasHarnessAuthCookies(cachedSession.cookies) ? cachedSession.cookies : [];

  if (sessionCookies.length === 0 && !sessionBootstrapIssue) {
    sessionBootstrapIssue = `No cached ${userIdentifier} UI session cookies were found. Run the UI global setup or yarn ui:session before the harness UI proof.`;
  }
});

test.beforeEach(async ({ page }) => {
  if (sessionCookies.length === 0) {
    throw new Error(
      sessionBootstrapIssue
        ? `No cached ${userIdentifier} UI session cookies were found after session bootstrap failed: ${sessionBootstrapIssue}`
        : `No cached ${userIdentifier} UI session cookies were found for the manage-tasks proof.`
    );
  }

  await page.context().addCookies(sessionCookies);
  await page.route(AVAILABLE_TASKS_HARNESS_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: buildAvailableTasksHarnessHtml(),
    });
  });
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
      await openAvailableTasksServiceFilter(page, taskListPage, testInfo);
    });

    await test.step('Verify the service filter values match the supported service-family list', async () => {
      const serviceFilterValues = await readServiceFilterValues(page, taskListPage);

      expect(sortServiceFamilies(serviceFilterValues)).toEqual(sortServiceFamilies(EXUI_WA_SUPPORTED_SERVICE_FAMILIES));

      for (const canaryFamily of EXUI_CANARY_SERVICE_FAMILIES) {
        expect(serviceFilterValues).not.toContain(canaryFamily);
      }

      await attachUiScreenshotEvidence(testInfo, page, 'exui-assurance-manage-tasks-service-family-filter.png');
    });
  });

  test('accessibility baseline: available tasks service filter has no new axe violations', async ({
    page,
    taskListPage,
  }, testInfo) => {
    await openAvailableTasksServiceFilter(page, taskListPage, testInfo);

    await attachAccessibilityEvidence(testInfo, page, 'Manage Tasks service-family filter accessibility report', {
      knownViolations: [
        {
          id: 'empty-table-header',
          maxNodes: 2,
        },
        {
          id: 'label',
          maxNodes: 4,
        },
      ],
    });
    await attachUiScreenshotEvidence(testInfo, page, 'exui-assurance-manage-tasks-service-family-filter-a11y.png');
  });
});
