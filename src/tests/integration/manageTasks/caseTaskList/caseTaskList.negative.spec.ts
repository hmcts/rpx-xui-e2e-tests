import { faker } from '@faker-js/faker';

import { expect, test } from '../../../../fixtures/ui';
import { applySessionCookiesAndExtractUserId } from '../../helpers';
import { buildAsylumCaseMock } from '../../mocks/cases/asylumCase.mock';

const userIdentifier = 'STAFF_ADMIN';
const caseId = faker.number.int({ min: 1000000000, max: 9999999999 }).toString();
let assigneeId: string | null = null;
const caseMockResponse = buildAsylumCaseMock({ caseId });

test.beforeEach(async ({ page }) => {
  assigneeId = await applySessionCookiesAndExtractUserId(page, userIdentifier);
  await page.route(`**data/internal/cases/${caseId}*`, async (route) => {
    const body = JSON.stringify(caseMockResponse);
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });

  await page.route(`**/workallocation/caseworker/getUsersByServiceName*`, async (route) => {
    const body = JSON.stringify([
      {
        email: 'test@example.com',
        firstName: 'Test',
        idamId: assigneeId,
        lastName: 'User',
        location: {
          id: 227101,
          locationName: 'Newport (South Wales) Immigration and Asylum Tribunal',
        },
        roleCategory: 'LEGAL_OPERATIONS',
        service: 'IA',
      },
    ]);
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });
});

test.describe(`User ${userIdentifier} can see assigned tasks on a case`, () => {
  test(`An empty task response shows an empty task list`, async ({ caseDetailsPage, page }) => {
    await test.step('Setup route mock for an empty task details', async () => {
      await page.route(`**workallocation/case/task/${caseId}*`, async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      });
    });

    await test.step('Navigate to mocked case task list', async () => {
      await page.goto(`/cases/case-details/IA/Asylum/${caseId}/tasks`);
      await caseDetailsPage.taskListContainer.waitFor();
      await caseDetailsPage.exuiSpinnerComponent.wait();
    });

    await test.step('Verify the task table shows no results', async () => {
      await expect(caseDetailsPage.taskItem).toHaveCount(0);
    });
  });

  [400].forEach((code) => {
    test(`The UI shows the following when the task API returns ${code}`, async ({ caseDetailsPage, page }) => {
      await test.step('Setup route mock for priority label tasks', async () => {
        await page.route(`**workallocation/case/task/${caseId}*`, async (route) => {
          const body = JSON.stringify({ message: `force error ${code}` });
          await route.fulfill({ status: code, contentType: 'application/json', body });
        });
      });

      await test.step('Navigate to mocked case task list', async () => {
        await page.goto(`/cases/case-details/IA/Asylum/${caseId}/tasks`);
        await caseDetailsPage.taskListContainer.waitFor();
      });

      await test.step('Verify the task list stays empty', async () => {
        await expect(caseDetailsPage.taskItem).toHaveCount(0);
      });
    });
  });
});
