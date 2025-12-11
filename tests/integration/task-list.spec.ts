import { expect, test } from "../../fixtures/test.ts";
import {
  buildDeterministicMyTasksListMock,
  buildMyTaskListMock,
} from "./mocks/taskList.mock.ts";
import { formatUiDate, readTaskTable } from "./utils/table.utils.ts";

const TASK_USER = "STAFF_ADMIN";

const getUserIfPresent = (
  userUtils: { getUserCredentials: (id: string) => { email: string; password: string } },
  id: string,
) => {
  try {
    return userUtils.getUserCredentials(id);
  } catch {
    return undefined;
  }
};

test.describe("@integration task list", () => {
  let staffAdminEmail = "";

  test.beforeEach(async ({ userUtils, loginAs }) => {
    const creds = getUserIfPresent(userUtils, TASK_USER);
    if (!creds) {
      throw new Error(`${TASK_USER} credentials are not configured`);
    }
    staffAdminEmail = creds.email;
    await loginAs(TASK_USER);
  });

  test("renders assigned tasks from mocked response", async ({ taskListPage, page }) => {
    const taskListMockResponse = buildMyTaskListMock(160, staffAdminEmail);

    await page.route("**/workallocation/task*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(taskListMockResponse),
      });
    });

    await taskListPage.goto();
    await expect(taskListPage.taskListTable).toBeVisible();
    await taskListPage.exuiSpinnerComponent.wait();

    await expect(taskListPage.taskListResultsAmount).toHaveText(
      `Showing 1 to ${Math.min(taskListMockResponse.tasks.length, 25)} of ${taskListMockResponse.total_records} results`,
    );

    const table = await readTaskTable(taskListPage.taskListTable);
    expect(table.length).toBe(taskListMockResponse.tasks.length);

    for (let i = 0; i < table.length; i++) {
      const expectedTask = taskListMockResponse.tasks[i];
      expect(table[i]["Case name"]).toBe(expectedTask.case_name);
      expect(table[i]["Case category"]).toBe(expectedTask.case_category);
      expect(table[i]["Location"]).toBe(expectedTask.location_name);
      expect(table[i]["Task"]).toBe(expectedTask.task_title);
      expect(table[i]["Due date"]).toBe(formatUiDate(expectedTask.due_date));
      expect(table[i]["Hearing date"]).toBe(formatUiDate(expectedTask.next_hearing_date));
    }
  });

  test("shows no tasks message when response is empty", async ({ taskListPage, page }) => {
    const emptyMockResponse = { tasks: [], total_records: 0 };

    await page.route("**/workallocation/task*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyMockResponse),
      });
    });

    await taskListPage.goto();
    await expect(taskListPage.taskListTable).toBeVisible();
    await taskListPage.exuiSpinnerComponent.wait();
    await expect(taskListPage.taskListTable).toContainText("You have no assigned tasks.");
  });

  test("shows deterministic priority tasks and due dates", async ({ taskListPage, page }) => {
    const deterministicMock = buildDeterministicMyTasksListMock(staffAdminEmail);

    await page.route("**/workallocation/task*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(deterministicMock),
      });
    });

    await taskListPage.goto();
    await expect(taskListPage.taskListTable).toBeVisible();
    await taskListPage.exuiSpinnerComponent.wait();

    await expect(taskListPage.taskListResultsAmount).toHaveText("Showing 1 to 4 of 4 results");
    const table = await readTaskTable(taskListPage.taskListTable);
    expect(table.length).toBe(deterministicMock.tasks.length);

    // Table may sort by priority; assert by case name to avoid order dependence.
    const tableByCase = Object.fromEntries(
      table.map((row) => [row["Case name"], row]),
    );
    for (const expected of deterministicMock.tasks) {
      const row = tableByCase[expected.case_name];
      expect(row).toBeTruthy();
      expect(row["Case category"]).toBe(expected.case_category);
      expect(row["Location"]).toBe(expected.location_name);
      expect(row["Task"]).toBe(expected.task_title);
      expect(row["Due date"]).toBe(formatUiDate(expected.due_date));
      const displayedPriority = String(row["Priority"]).toLowerCase();
      expect(displayedPriority).toBe(String(expected.priority_field).toLowerCase());
    }
  });
});
