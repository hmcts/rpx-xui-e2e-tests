import type { Page } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import type { TaskListPage } from "../../../page-objects/pages/exui/taskList.po.js";
import { loadSessionCookies } from "../integration/utils/session.utils.js";
import { readTaskTable } from "../integration/utils/tableUtils.js";
import { retryOnTransientFailure } from "../utils/transient-failure.utils.js";
import { ensureUiSession } from "../utils/ui-session.utils.js";

const TASK_LIST_BOOTSTRAP_TIMEOUT_MS = 60_000;

async function openTaskListWithRetry(
  page: Page,
  taskListPage: TaskListPage,
  userIdentifier: string
) {
  const { cookies } = loadSessionCookies(userIdentifier);

  await retryOnTransientFailure(
    async () => {
      await page.context().clearCookies();
      if (cookies.length) {
        await page.context().addCookies(cookies);
      }

      await taskListPage.goto();

      const bootstrapSignal = await Promise.race([
        taskListPage.taskListTable
          .waitFor({ state: "visible", timeout: TASK_LIST_BOOTSTRAP_TIMEOUT_MS })
          .then(() => "table" as const),
        taskListPage.errorPageHeading
          .waitFor({ state: "visible", timeout: TASK_LIST_BOOTSTRAP_TIMEOUT_MS })
          .then(() => "error-page" as const),
        taskListPage.serviceDownError
          .waitFor({ state: "visible", timeout: TASK_LIST_BOOTSTRAP_TIMEOUT_MS })
          .then(() => "service-down" as const)
      ]).catch(async () => {
        await taskListPage.taskListTable.waitFor({
          state: "visible",
          timeout: TASK_LIST_BOOTSTRAP_TIMEOUT_MS
        });
        return "table" as const;
      });

      if (bootstrapSignal === "error-page") {
        throw new Error("Something went wrong page was displayed while opening the my tasks page.");
      }

      if (bootstrapSignal === "service-down") {
        throw new Error("Task list showed service down while opening the my tasks page.");
      }
    },
    {
      maxAttempts: 2,
      onRetry: async () => {
        if (!page.isClosed()) {
          await page.goto("about:blank").catch(() => undefined);
        }
      }
    }
  );
}

test.describe("Verify the my tasks page tabs appear as expected", {
  tag: ["@e2e", "@e2e-manage-tasks"]
}, () => {
  const userIdentifier = "STAFF_ADMIN";

  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    await ensureUiSession(userIdentifier);
  });

  test.beforeEach(async ({ page, taskListPage }) => {
    await openTaskListWithRetry(page, taskListPage, userIdentifier);
  });

  test("Verify My tasks actions appear as expected", async ({ taskListPage }) => {
    await test.step("Navigate to the task list page", async () => {
      await expect(taskListPage.taskListTable).toBeVisible();
      await taskListPage.waitForManageButton("my tasks tab", { timeoutMs: 60_000 });
    });

    await test.step("Check my tasks has data in the table", async () => {
      const table = await readTaskTable(taskListPage.taskListTable);
      expect(table.length).toBeGreaterThan(0);
    });

    await test.step("Verify tasks actions are shown as expected", async () => {
      await taskListPage.manageCaseButtons.nth(0).click();
      await expect(taskListPage.taskActionsRow).toBeVisible();
      await expect(taskListPage.taskActionCancel).toBeVisible();
      await expect(taskListPage.taskActionGoTo).toBeVisible();
      await expect(taskListPage.taskActionMarkAsDone).toBeVisible();
      await expect(taskListPage.taskActionReassign).toBeVisible();
      await expect(taskListPage.taskActionUnassign).toBeVisible();
    });
  });

  test("Verify Available tasks actions appear as expected", async ({ taskListPage }) => {
    await test.step("Navigate to the available tasks page", async () => {
      await taskListPage.selectWorkMenuItem("Available tasks");
      await expect(taskListPage.taskListTable).toBeVisible();
      await taskListPage.waitForManageButton("available tasks tab", { timeoutMs: 60_000 });
    });

    await test.step("Check available tasks has data in the table", async () => {
      const table = await readTaskTable(taskListPage.taskListTable);
      expect(table.length).toBeGreaterThan(0);
    });

    await test.step("Verify available-task actions are shown as expected", async () => {
      await taskListPage.manageCaseButtons.nth(0).click();
      await expect(taskListPage.taskActionsRow).toBeVisible();
      await expect(taskListPage.taskActionClaim).toBeVisible();
      await expect(taskListPage.taskActionClaimAndGo).toBeVisible();
    });
  });
});
