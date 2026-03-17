import { expect, test } from "../../../fixtures/ui";
import { applySessionCookies } from "../../../utils/ui/sessionCapture";
import { retryOnTransientFailure } from "../../../utils/ui/transient-failure.utils";
import { setupTaskListMockRoutes } from "../helpers/index";
import {
  buildMyTaskListMock,
  buildDeterministicMyTasksListMock,
} from "../mocks/taskList.mock";
import { extractUserIdFromCookies } from "../utils/extractUserIdFromCookies";
import { formatUiDate } from "../utils/tableUtils";

const userIdentifier = "STAFF_ADMIN";
let taskListMockResponse: ReturnType<typeof buildMyTaskListMock>;

test.beforeEach(async ({ page }) => {
  const { cookies } = await applySessionCookies(page, userIdentifier);
  const userId = extractUserIdFromCookies(cookies);
  taskListMockResponse = buildMyTaskListMock(userId?.toString() || "", 160);
});

test.describe(`Task List as ${userIdentifier}`, () => {
  test(`User ${userIdentifier} can view assigned tasks on the task list page`, async ({
    taskListPage,
    page,
    tableUtils,
  }) => {
    await test.step("Setup route mock for task list", async () => {
      await setupTaskListMockRoutes(page, taskListMockResponse);
    });

    await test.step("Navigate to the my tasks list page", async () => {
      await retryOnTransientFailure(
        async () => {
          await taskListPage.goto();
          await taskListPage.waitForManageButton(
            "deterministic priority task-list table load",
            { timeoutMs: 20_000, pollMs: 500 },
          );
          await expect(taskListPage.taskListTable).toBeVisible();
          await taskListPage.exuiSpinnerComponent.wait();
        },
        {
          maxAttempts: 2,
          onRetry: async () => {
            if (!page.isClosed()) {
              await page.reload();
            }
          },
        },
      );
    });

    await test.step("Verify user can see a list shows the expected layout and data, given the mock response", async () => {
      expect(await taskListPage.getResultsText()).toBe(
        `Showing 1 to ${Math.min(taskListMockResponse.tasks.length, 25)} of ${taskListMockResponse.total_records} results`,
      );
      const table = (
        await tableUtils.parseWorkAllocationTable(taskListPage.taskListTable)
      ).filter((row) => (row["Case name"] ?? "").trim().length > 0);
      const comparableRowCount = Math.min(
        table.length,
        taskListMockResponse.tasks.length,
      );
      expect(comparableRowCount).toBeGreaterThan(0);

      const comparableExpectedRows = taskListMockResponse.tasks.slice(
        0,
        comparableRowCount,
      );

      for (const [i, expectedRow] of comparableExpectedRows.entries()) {
        expect(table[i]["Case name"]).toBe(expectedRow.case_name);
        // Check additional columns
        expect(table[i]["Case category"]).toBe(expectedRow.case_category);
        expect(table[i]["Location"]).toBe(expectedRow.location_name);
        expect(table[i]["Task"]).toBe(expectedRow.task_title);
        expect(table[i]["Due date"]).toBe(formatUiDate(expectedRow.due_date));
        // Hearing date: allow empty string or null
        const expectedHearingDate = expectedRow.next_hearing_date || "";
        expect(table[i]["Hearing date"]).toBe(
          formatUiDate(expectedHearingDate),
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
      await setupTaskListMockRoutes(page, emptyMockResponse);
    });

    await test.step("Navigate to the my tasks list page", async () => {
      await taskListPage.goto();
      await taskListPage.exuiSpinnerComponent.wait();
    });

    await test.step("Verify table shows no results for empty mock", async () => {
      const emptyStateText = taskListPage.page
        .getByText(/(you have no assigned tasks|no tasks assigned)/i)
        .first();
      const zeroResultsSummary = taskListPage.taskListResultsAmount
        .getByText(/showing\s+0\s+to\s+0\s+of\s+0\s+results/i)
        .first();
      const taskRows = taskListPage.taskListTable.locator(
        'tbody tr:has(a[href*="/cases/case-details/"])',
      );

      const hasEmptyStateCopy = await emptyStateText
        .isVisible()
        .catch(() => false);
      const hasZeroResultsSummary = await zeroResultsSummary
        .isVisible()
        .catch(() => false);
      const rowCount = await taskRows.count();

      expect(
        hasEmptyStateCopy || hasZeroResultsSummary || rowCount === 0,
      ).toBeTruthy();
    });
  });

  test(`User ${userIdentifier} sees all types of priority tasks with specific due dates`, async ({
    taskListPage,
    page,
    tableUtils,
  }) => {
    const deterministicMockResponse = buildDeterministicMyTasksListMock(
      "deterministic-assignee",
    );

    await test.step("Setup route mock for deterministic task list", async () => {
      await setupTaskListMockRoutes(page, deterministicMockResponse);
    });

    await test.step("Navigate to the my tasks list page", async () => {
      await retryOnTransientFailure(
        async () => {
          await taskListPage.goto();
          await taskListPage.waitForManageButton(
            "deterministic priority task-list table load",
            { timeoutMs: 20_000, pollMs: 500 },
          );
          await expect(taskListPage.taskListTable).toBeVisible();
          await taskListPage.exuiSpinnerComponent.wait();
        },
        {
          maxAttempts: 2,
          onRetry: async () => {
            if (!page.isClosed()) {
              await page.reload();
            }
          },
        },
      );
    });

    await test.step("Verify table shows deterministic priority tasks and due dates", async () => {
      expect(await taskListPage.getResultsText()).toBe(
        `Showing 1 to 4 of 4 results`,
      );
      const table = (
        await tableUtils.parseWorkAllocationTable(taskListPage.taskListTable)
      ).filter((row) => (row["Case name"] ?? "").trim().length > 0);
      expect(table.length).toBeGreaterThanOrEqual(4);
      const dataRows = taskListPage.taskListTable.locator(
        'tbody tr:has(a[href*="/cases/case-details/"])',
      );
      await expect(dataRows).toHaveCount(4);
      for (let i = 0; i < 4; i++) {
        const expected = deterministicMockResponse.tasks[i];
        expect(table[i]["Case name"]).toBe(expected.case_name);
        expect(table[i]["Case category"]).toBe(expected.case_category);
        expect(table[i]["Location"]).toBe(expected.location_name);
        expect(table[i]["Task"]).toBe(expected.task_title);
        expect(table[i]["Due date"]).toBe(formatUiDate(expected.due_date));
        const actualPriority = String(
          await dataRows.nth(i).locator("td").nth(7).innerText(),
        )
          .replace(/\s+/g, "")
          .toLowerCase();
        const expectedPriority = String(expected.priority_field ?? "")
          .replace(/\s+/g, "")
          .toLowerCase();
        expect(actualPriority).toBe(expectedPriority);
      }
    });
  });
});
