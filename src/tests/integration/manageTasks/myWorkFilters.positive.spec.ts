import { expect, test } from "../../../fixtures/ui";
import { applySessionCookies, myWorkSelectableLocations, setupMyWorkFilterRoutes } from '../helpers';
import { assertSharedMyWorkFilterSections } from '../utils/workFiltersAssertions.js';

const authenticatedUserIdentifier = 'STAFF_ADMIN';

test.describe('My work filter parity', { tag: ['@integration', '@integration-manage-tasks'] }, () => {
  test.beforeEach(async ({ page }) => {
    await applySessionCookies(page, authenticatedUserIdentifier);
  });

  test('shows the work filter across the My work tabs and collapses it after Apply', async ({ taskListPage, page }) => {
    await setupMyWorkFilterRoutes(page, {
      roleAssignmentInfo: [
        {
          jurisdiction: 'IA',
          substantive: 'Y',
          roleType: 'ORGANISATION',
          baseLocation: '20001',
          isCaseAllocator: false,
        },
        {
          jurisdiction: 'SSCS',
          substantive: 'Y',
          roleType: 'ORGANISATION',
          baseLocation: '30001',
          isCaseAllocator: false,
        },
      ],
    });

    await test.step('Open the My tasks view and verify the initial work filter state', async () => {
      await taskListPage.gotoAndWaitForTaskRow('opening My tasks filters');
      await expect(taskListPage.taskListFilterToggle).toHaveText('Show work filter');
      await expect(taskListPage.filterPanel).toBeHidden();

      await taskListPage.openFilterPanel();
      await expect(taskListPage.taskListFilterToggle).toHaveText('Hide work filter');
      await expect(taskListPage.filterPanel.getByText('Services', { exact: true })).toBeVisible();
      await expect(taskListPage.filterPanel.locator('#locations')).toBeVisible();
      await expect(taskListPage.filterPanel.getByText('Types of work', { exact: true })).toBeVisible();

      await taskListPage.applyCurrentFilters();
      await expect(taskListPage.taskListFilterToggle).toHaveText('Show work filter');
      await expect(taskListPage.filterPanel).toBeHidden();
    });

    await test.step('Verify the same Services and Locations filter surface on Available tasks, My cases, and My tasks', async () => {
      for (const tab of [
        {
          name: 'Available tasks',
          open: async () => {
            await taskListPage.clickTaskTabAndWaitForView(
              'Available tasks',
              'AvailableTasks',
              'opening Available tasks filter parity view'
            );
          },
        },
        {
          name: 'My cases',
          open: async () => {
            await taskListPage.gotoMyCases();
          },
        },
        {
          name: 'My tasks',
          open: async () => {
            await taskListPage.gotoAndWaitForTaskRow('opening My tasks filter parity');
          },
        },
      ]) {
        await tab.open();
        await taskListPage.waitForTaskListShellReady(`${tab.name} filter parity`);
        await expect(taskListPage.taskListFilterToggle).toContainText('Show work filter');

        await taskListPage.openFilterPanel();
        await assertSharedMyWorkFilterSections(taskListPage, {
          showTypesOfWork: tab.name !== 'My cases'
        });

        await taskListPage.applyCurrentFilters();
        await expect(taskListPage.taskListFilterToggle).toContainText('Show work filter');
        await expect(taskListPage.filterPanel).toBeHidden();
      }
    });
  });

  test('requires at least one service before applying the My cases filter', async ({ taskListPage, page }) => {
    await setupMyWorkFilterRoutes(page, {
      roleAssignmentInfo: [
        {
          jurisdiction: 'IA',
          substantive: 'Y',
          roleType: 'ORGANISATION',
          baseLocation: '20001',
          isCaseAllocator: false,
        },
        {
          jurisdiction: 'CIVIL',
          substantive: 'Y',
          roleType: 'ORGANISATION',
          isCaseAllocator: false,
        },
      ],
    });

    await taskListPage.gotoMyCases();
    await taskListPage.openFilterPanel();

    await taskListPage.clearServicesFilters();
    await taskListPage.applyCurrentFilters();

    await taskListPage.openFilterPanel();
    await expect(taskListPage.selectServicesError).toBeVisible();
    await expect(taskListPage.selectServicesError).toContainText('Select a service');
  });

  test('applies the My cases filter again after re-selecting Immigration and Asylum', async ({ taskListPage, page }) => {
    await setupMyWorkFilterRoutes(page, {
      roleAssignmentInfo: [
        {
          jurisdiction: 'IA',
          substantive: 'Y',
          roleType: 'ORGANISATION',
          baseLocation: '20001',
          isCaseAllocator: false,
        },
        {
          jurisdiction: 'CIVIL',
          substantive: 'Y',
          roleType: 'ORGANISATION',
          isCaseAllocator: false,
        },
      ],
    });

    await test.step('Open My cases and trigger the legacy validation state', async () => {
      await taskListPage.gotoMyCases();
      await taskListPage.openFilterPanel();

      await taskListPage.setServiceFilterByLabel('Civil', false);
      await expect(taskListPage.filterPanel.getByLabel('Civil')).not.toBeChecked();
      await taskListPage.setServiceFilterByLabel('Immigration and Asylum', false);
      await expect(taskListPage.filterPanel.getByLabel('Immigration and Asylum')).not.toBeChecked();

      await taskListPage.applyCurrentFilters();
      await taskListPage.openFilterPanel();
      await expect(taskListPage.selectServicesError).toBeVisible();
      await expect(taskListPage.selectServicesError).toContainText('Select a service');
    });

    await test.step('Re-select Immigration and Asylum and verify the filter can be applied again', async () => {
      await taskListPage.setServiceFilterByLabel('Immigration and Asylum', true);
      await expect(taskListPage.filterPanel.getByLabel('Immigration and Asylum')).toBeChecked();
      await expect(taskListPage.filterPanel.getByLabel('Civil')).not.toBeChecked();

      await taskListPage.applyCurrentFilters();
      await expect(taskListPage.taskListFilterToggle).toHaveText('Show work filter');
      await expect(taskListPage.filterPanel).toBeHidden();

      await taskListPage.openFilterPanel();
      await expect(taskListPage.filterPanel.getByLabel('Immigration and Asylum')).toBeChecked();
      await expect(taskListPage.filterPanel.getByLabel('Civil')).not.toBeChecked();
    });
  });

  for (const scenario of [
    {
      expectedFullLocationServiceCodes: ['SSCS'],
      expectedVisibleServices: ['Social security and child support'],
      name: 'CASE roles do not leak into the filter when IA is case-scoped and SSCS is organisational',
      roleAssignmentInfo: [
        {
          jurisdiction: 'IA',
          substantive: 'Y',
          roleType: 'CASE',
          baseLocation: '20001',
          isCaseAllocator: false,
        },
        {
          jurisdiction: 'SSCS',
          substantive: 'Y',
          roleType: 'ORGANISATION',
          baseLocation: '30001',
          isCaseAllocator: false,
        },
      ],
      unexpectedServices: ['Immigration and Asylum', 'Civil'],
    },
    {
      expectedFullLocationServiceCodes: ['IA'],
      expectedVisibleServices: ['Immigration and Asylum'],
      name: 'CASE roles do not leak into the filter when SSCS is case-scoped and IA is organisational',
      roleAssignmentInfo: [
        {
          jurisdiction: 'IA',
          substantive: 'Y',
          roleType: 'ORGANISATION',
          baseLocation: '20001',
          isCaseAllocator: false,
        },
        {
          jurisdiction: 'SSCS',
          substantive: 'Y',
          roleType: 'CASE',
          baseLocation: '30001',
          isCaseAllocator: false,
        },
      ],
      unexpectedServices: ['Social security and child support', 'Civil'],
    },
  ]) {
    test(scenario.name, async ({ taskListPage, page }) => {
      const fullLocationServiceCodeCalls: string[][] = [];

      await setupMyWorkFilterRoutes(page, {
        roleAssignmentInfo: scenario.roleAssignmentInfo,
      });

      await page.route('**/workallocation/full-location*', async (route) => {
        const requestUrl = new URL(route.request().url());
        const rawServiceCodes = requestUrl.searchParams.get('serviceCodes') ?? '';
        fullLocationServiceCodeCalls.push(
          rawServiceCodes
            .split(',')
            .map((serviceCode) => serviceCode.trim())
            .filter(Boolean)
            .sort()
        );

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(myWorkSelectableLocations),
        });
      });

      await taskListPage.goto();
      await taskListPage.openFilterPanel();

      for (const expectedServiceLabel of scenario.expectedVisibleServices) {
        await expect(taskListPage.filterPanel.getByLabel(expectedServiceLabel)).toBeVisible();
      }

      for (const unexpectedServiceLabel of scenario.unexpectedServices) {
        await expect(taskListPage.filterPanel.getByLabel(unexpectedServiceLabel)).toHaveCount(0);
      }

      expect(fullLocationServiceCodeCalls).toContainEqual([...scenario.expectedFullLocationServiceCodes].sort());
    });
  }
});
