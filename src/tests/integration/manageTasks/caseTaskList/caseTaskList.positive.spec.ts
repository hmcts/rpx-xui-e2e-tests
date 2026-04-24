import { faker } from '@faker-js/faker';

import { expect, test } from '../../../../fixtures/ui';
import { applySessionCookiesAndExtractUserId, setupCaseTaskListMockRoute } from '../../helpers';
import { buildCaseDetailsTasksMinimal } from '../../mocks/caseDetailsTasks.builder';
import { buildAsylumCaseMock } from '../../mocks/cases/asylumCase.mock';
import { formatUiDate } from '../../utils/tableUtils';

const userIdentifier = 'STAFF_ADMIN';
const inSixHours = faker.date.soon({ days: 0.25 }).toISOString();
const inTwoDays = faker.date.soon({ days: 2 }).toISOString();
const in90Days = faker.date.future().toISOString();
const caseId = faker.number.int({ min: 1000000000, max: 9999999999 }).toString();
let assigneeId: string | null = null;
const caseMockResponse = buildAsylumCaseMock({ caseId });
const asAssigneeList = (value: string | null): string[] =>
  [value].filter((candidate): candidate is string => Boolean(candidate));

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
  test(`Low priority tasks assigned to logged in user show elements and markdown as expected`, async ({
    caseDetailsPage,
    page,
  }) => {
    const taskData = {
      id: [faker.string.uuid().toString()],
      caseId: caseMockResponse.case_id,
      titles: ['Follow-up extended direction', 'follow up overdue respondent evidence', 'follow up overdue respondent evidence'],
      states: ['assigned'],
      types: ['followUpExtendedDirection', 'followUpOverdueRespondentEvidence', 'followUpOverdueRespondentEvidence'],
      taskSystems: ['SELF'],
      locations: [{ name: 'Manchester', id: '512401' }],
      descriptions: [
        'You still need to submit your appeal.\n\n[Submit your appeal](/case/IA/Asylum/${[CASE_REFERENCE]}/trigger/submitAppeal)',
        'Current progress of the case ![Progress map showing that the appeal is now at stage 1 of 11 stages - the Appeal started stage](https://raw.githubusercontent.com/hmcts/ia-appeal-frontend/master/app/assets/images/progress_legalRep_appealStarted.svg)',
        '# Next steps\nPlease review the evidence before proceeding.',
      ],
      majorPriorities: [6000, 6000, 6000],
      priorityDates: [in90Days],
      dueDates: [in90Days],
      assignees: asAssigneeList(assigneeId),
    };
    const tasks = buildCaseDetailsTasksMinimal(taskData);

    await test.step('Setup route mock for task details', async () => {
      await setupCaseTaskListMockRoute(page, caseId, tasks);
    });

    await test.step('Navigate to mocked case task list', async () => {
      await page.goto(`/cases/case-details/IA/Asylum/${caseId}/tasks`);
      await caseDetailsPage.taskListContainer.waitFor();
      await caseDetailsPage.exuiSpinnerComponent.wait();
    });

    await test.step('Verify the task table shows the expected results', async () => {
      const table = await caseDetailsPage.getTaskKeyValueRows();

      expect.soft(table).toHaveLength(taskData.titles.length);
      taskData.titles.forEach((title, i) => {
        expect.soft(table[i].Title).toContain(title);
        expect.soft(table[i]['Assigned to']).not.toBeFalsy();
        expect.soft(table[i]['Due date']).toBe(formatUiDate(in90Days));
        expect.soft(table[i].Priority).toContain('LOW');
      });

      expect.soft(table[0]['Next steps'], 'Next steps not showing expected text').toContain(
        'You still need to submit your appeal. Submit your appeal'
      );
      expect.soft(table[0]['Next steps HTML'], 'Next steps link does not contain expected submitAppeal href').toContain(
        `href="/case/IA/Asylum/${caseId}/trigger/submitAppeal?tid=${taskData.id}"`
      );
      expect.soft(table[1]['Next steps'], 'Next steps not showing expected text').toContain('Current progress of the case');
      expect.soft(table[1]['Next steps HTML'], 'Next steps not showing expected image').toContain(
        `<img src="https://raw.githubusercontent.com/hmcts/ia-appeal-frontend/master/app/assets/images/progress_legalRep_appealStarted.svg?tid=${taskData.id}" alt="Progress map showing that the appeal is now at stage 1 of 11 stages - the Appeal started stage">`
      );
      expect.soft(table[2]['Next steps HTML'], 'Next steps not showing text as a heading').toContain('<h1>Next steps</h1>');
      expect.soft(table[2]['Next steps'], 'Next steps not showing expected text').toContain(
        'Next steps Please review the evidence before proceeding.'
      );
    });
  });

  test(`Priority labels render as in order for each task depending on major priority rate and date`, async ({
    caseDetailsPage,
    page,
  }) => {
    const taskData = {
      id: [faker.string.uuid().toString()],
      caseId: caseMockResponse.case_id,
      titles: ['Urgent', 'High', 'Medium', 'Low'],
      states: ['assigned'],
      types: ['followUpExtendedDirection'],
      taskSystems: ['SELF'],
      locations: [{ name: 'Manchester', id: '512401' }],
      assignees: asAssigneeList(assigneeId),
      majorPriorities: [1000, 4000, 5000, 6000],
      priorityDates: [inTwoDays, inTwoDays, inSixHours, inTwoDays],
      dueDates: [inTwoDays, inTwoDays, inSixHours, inTwoDays],
    };

    await test.step('Setup route mock for priority label tasks', async () => {
      await setupCaseTaskListMockRoute(page, caseId, buildCaseDetailsTasksMinimal(taskData));
    });

    await test.step('Navigate to mocked case task list', async () => {
      await page.goto(`/cases/case-details/IA/Asylum/${caseId}/tasks`);
      await caseDetailsPage.taskListContainer.waitFor();
    });

    await test.step('Verify the expected priority labels are shown', async () => {
      const table = await caseDetailsPage.getTaskKeyValueRows();

      taskData.titles.forEach((title, i) => {
        const expectedPriority = title.toUpperCase();
        expect.soft(table[i].Priority, `The priority label for task ${i} should be ${expectedPriority}`).toContain(
          expectedPriority
        );
        expect.soft(table[i]['Due date'], `The due date for task ${i} should match`).toBe(formatUiDate(taskData.dueDates[i]));
        expect.soft(table[i].Title, `The title for task ${i} should match`).toContain(title);
        expect.soft(table[i]['Next steps'], `Next steps for task ${i} should contain CTA`).toContain(
          'Click link to proceed to task'
        );
      });
    });
  });

  test(`Tasks not assigned to the logged in user don't show next steps`, async ({ caseDetailsPage, page }) => {
    const otherUser = faker.string.uuid();
    const taskData = {
      id: [faker.string.uuid().toString()],
      caseId: caseMockResponse.case_id,
      titles: ['Follow-up extended direction', 'follow up overdue respondent evidence', 'follow up overdue respondent evidence'],
      states: ['terminated'],
      types: ['followUpExtendedDirection', 'followUpOverdueRespondentEvidence', 'followUpOverdueRespondentEvidence'],
      taskSystems: ['SELF'],
      locations: [{ name: 'Manchester', id: '512401' }],
      descriptions: [
        'You still need to submit your appeal.\n\n[Submit your appeal](/case/IA/Asylum/${[CASE_REFERENCE]}/trigger/submitAppeal)',
        'Current progress of the case ![Progress map showing that the appeal is now at stage 1 of 11 stages - the Appeal started stage](https://raw.githubusercontent.com/hmcts/ia-appeal-frontend/master/app/assets/images/progress_legalRep_appealStarted.svg)',
        '# Next steps\nPlease review the evidence before proceeding.',
      ],
      majorPriorities: [6000, 6000, 6000],
      priorityDates: [in90Days],
      dueDates: [in90Days],
      assignees: [otherUser],
    };

    await page.route(`**/workallocation/caseworker/getUsersByServiceName*`, async (route) => {
      const body = JSON.stringify([
        {
          email: 'test@example.com',
          firstName: 'User',
          idamId: otherUser,
          lastName: 'Test',
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

    await setupCaseTaskListMockRoute(page, caseId, buildCaseDetailsTasksMinimal(taskData));

    await test.step('Navigate to mocked case task list', async () => {
      await page.goto(`/cases/case-details/IA/Asylum/${caseId}/tasks`);
      await caseDetailsPage.taskListContainer.waitFor();
    });

    await test.step('Verify table shows results', async () => {
      const table = await caseDetailsPage.getTaskKeyValueRows();

      expect.soft(table).toHaveLength(taskData.titles.length);
      taskData.titles.forEach((title, i) => {
        expect.soft(table[i].Title).toContain(title);
        expect.soft(table[i].Priority).toContain('LOW');
        expect.soft(table[i]['Due date']).toBe(formatUiDate(in90Days));
        expect.soft(table[i]['Assigned to']).toContain('User Test');
        expect.soft(table[i]['Next steps']).toBeFalsy();
      });
    });
  });

  test(`Tasks with task alerts show above all tasks`, async ({ caseDetailsPage, page }) => {
    const otherUser = faker.string.uuid();
    const taskData = {
      id: [faker.string.uuid().toString()],
      caseId: caseMockResponse.case_id,
      titles: ['Follow-up extended direction', 'follow up overdue respondent evidence', 'follow up overdue respondent evidence'],
      states: ['terminated'],
      types: ['followUpExtendedDirection', 'followUpOverdueRespondentEvidence', 'followUpOverdueRespondentEvidence'],
      priorityDates: [in90Days],
      dueDates: [in90Days],
      assignees: [otherUser],
      warnings: [true],
      warning_list: [
        {
          values: [
            { warningCode: '1200', warningText: faker.lorem.sentence() },
            { warningCode: '1201', warningText: faker.lorem.sentence() },
          ],
        },
        {
          values: [
            { warningCode: '1202', warningText: faker.lorem.sentence() },
            { warningCode: '1203', warningText: faker.lorem.sentence() },
          ],
        },
      ],
    };

    await setupCaseTaskListMockRoute(page, caseId, buildCaseDetailsTasksMinimal(taskData));

    await test.step('Navigate to mocked case task list', async () => {
      await page.goto(`/cases/case-details/IA/Asylum/${caseId}/tasks`);
      await caseDetailsPage.taskListContainer.waitFor();
      await caseDetailsPage.exuiSpinnerComponent.wait();
    });

    await test.step('Verify task alerts are shown in the UI', async () => {
      await caseDetailsPage.taskAlerts.waitFor();
      const alertText = await caseDetailsPage.taskAlerts.innerText();
      expect.soft(alertText).toContain(taskData.warning_list[0].values[0].warningText);
      expect.soft(alertText).toContain(taskData.warning_list[0].values[1].warningText);
      expect.soft(alertText).toContain(taskData.warning_list[1].values[0].warningText);
      expect.soft(alertText).toContain(taskData.warning_list[1].values[1].warningText);
    });
  });
});
