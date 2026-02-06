import type { Cookie } from "@playwright/test";

import { expect, test } from "../../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../../utils/ui/storage-state.utils.js";
import { UserUtils } from "../../../../utils/ui/user.utils.js";
import {
  buildDeterministicMyTasksListMock,
  buildMyTaskListMock,
} from "../mocks/taskList.mock.js";
import { extractUserIdFromCookies } from "../utils/extractUserIdFromCookies.js";
import { ensureSessionCookies } from "../utils/session.utils.js";
import { formatUiDate, readTaskTable } from "../utils/tableUtils.js";

const userIdentifier = "STAFF_ADMIN";
const shouldRunTaskList = new UserUtils().hasUserCredentials(userIdentifier);
let sessionCookies: Cookie[] = [];
let taskListMockResponse: ReturnType<typeof buildMyTaskListMock>;

const getNormalizedPriority = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).toLowerCase();
};

if (shouldRunTaskList) {
  test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

  test.beforeAll(async () => {
    const session = await ensureSessionCookies(userIdentifier, {
      strict: true,
    });
    sessionCookies = session.cookies;
  });

  test.beforeEach(async () => {
    const userId = extractUserIdFromCookies(sessionCookies);
    taskListMockResponse = buildMyTaskListMock(160, userId?.toString() || "");
  });

  test.describe(`Task List as ${userIdentifier}`, () => {
    test(`User ${userIdentifier} can view assigned tasks on the task list page`, async ({
      taskListPage,
      page,
    }) => {
      await test.step("Setup route mock for task list", async () => {
        await page.route("**/workallocation/task*", async (route) => {
          const body = JSON.stringify(taskListMockResponse);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body,
          });
        });
      });

      await test.step("Navigate to the my tasks list page", async () => {
        await taskListPage.goto();
        await expect(taskListPage.taskListTable).toBeVisible();
        await taskListPage.exuiSpinnerComponent.wait();
      });

      await test.step("Verify user can see a list shows the expected layout and data, given the mock response", async () => {
        await expect(taskListPage.taskListResultsAmount).toHaveText(
          `Showing 1 to ${Math.min(taskListMockResponse.tasks.length, 25)} of ${taskListMockResponse.total_records} results`,
        );
        const table = await readTaskTable(taskListPage.taskListTable);
        for (let i = 0; i < table.length; i++) {
          const expectedCaseName = taskListMockResponse.tasks[i].case_name;
          expect(table[i]["Case name"]).toBe(expectedCaseName);
          expect(table[i]["Case category"]).toBe(
            taskListMockResponse.tasks[i].case_category,
          );
          expect(table[i]["Location"]).toBe(
            taskListMockResponse.tasks[i].location_name,
          );
          expect(table[i]["Task"]).toBe(
            taskListMockResponse.tasks[i].task_title,
          );
          expect(table[i]["Due date"]).toBe(
            formatUiDate(taskListMockResponse.tasks[i].due_date),
          );
          expect(table[i]["Hearing date"]).toBe(
            formatUiDate(taskListMockResponse.tasks[i].next_hearing_date),
          );
        }
      });
    });

    test(`User ${userIdentifier} sees the no tasks message if there are no assigned tasks`, async ({
      taskListPage,
      page,
    }) => {
      const emptyMockResponse = { tasks: [], total_records: 0 };

      await test.step("Setup route mock for empty task list", async () => {
        await page.route("**/workallocation/task*", async (route) => {
          const body = JSON.stringify(emptyMockResponse);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body,
          });
        });
      });

      await test.step("Navigate to the my tasks list page", async () => {
        await taskListPage.goto();
        await expect(taskListPage.taskListTable).toBeVisible();
        await taskListPage.exuiSpinnerComponent.wait();
      });

      await test.step("Verify table shows no results for empty mock", async () => {
        await expect(taskListPage.taskListTable).toContainText(
          "You have no assigned tasks.",
        );
      });
    });

    test(`User ${userIdentifier} sees all types of priority tasks with specific due dates`, async ({
      taskListPage,
      page,
    }) => {
      const deterministicMockResponse = buildDeterministicMyTasksListMock(
        "deterministic-assignee",
      );

      await test.step("Setup route mock for deterministic task list", async () => {
        await page.route("**/workallocation/task*", async (route) => {
          const body = JSON.stringify(deterministicMockResponse);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body,
          });
        });
      });

      await test.step("Navigate to the my tasks list page", async () => {
        await taskListPage.goto();
        await expect(taskListPage.taskListTable).toBeVisible();
        await taskListPage.exuiSpinnerComponent.wait();
      });

      await test.step("Verify table shows deterministic priority tasks and due dates", async () => {
        await expect(taskListPage.taskListResultsAmount).toHaveText(
          "Showing 1 to 4 of 4 results",
        );
        const table = await readTaskTable(taskListPage.taskListTable);
        expect(table.length).toBe(4);

        for (let i = 0; i < table.length; i++) {
          const expected = deterministicMockResponse.tasks[i];
          expect(table[i]["Case name"]).toBe(expected.case_name);
          expect(table[i]["Case category"]).toBe(expected.case_category);
          expect(table[i]["Location"]).toBe(expected.location_name);
          expect(table[i]["Task"]).toBe(expected.task_title);
          expect(table[i]["Due date"]).toBe(formatUiDate(expected.due_date));

          const actualPriority = getNormalizedPriority(table[i]["Priority"]);
          const expectedPriority = getNormalizedPriority(
            expected.priority_field,
          );
          expect(actualPriority).toBe(expectedPriority);
        }
      });
    });
  });
}
