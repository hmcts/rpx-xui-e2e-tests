import { expect, test } from "../../../fixtures/ui";
import type { TaskListPage } from "../../../page-objects/pages/exui/taskList.po.js";
import { loadSessionCookies } from "../integration/utils/session.utils.js";
import { readTaskTable } from "../integration/utils/tableUtils.js";
import { retryOnTransientFailure } from "../utils/transient-failure.utils.js";
import { ensureUiSession } from "../utils/ui-session.utils.js";

const TASK_LIST_BOOTSTRAP_TIMEOUT_MS = 60_000;

async function openTaskListWithRetry(
  taskListPage: TaskListPage,
  userIdentifier: string
) {
  const { cookies } = loadSessionCookies(userIdentifier);

  await retryOnTransientFailure(
    async () => {
      taskListPage.clearApiCalls();
      if (cookies.length) {
        await taskListPage.page.context().addCookies(cookies);
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
      maxAttempts: 3,
      onRetry: async () => {
        if (!taskListPage.page.isClosed()) {
          await taskListPage.page.goto("about:blank").catch(() => undefined);
        }
      }
    }
  );
}

test.describe("Verify live available task actions appear as expected", {
  tag: ["@e2e", "@e2e-manage-tasks"]
}, () => {
  const userIdentifier = "IAC_CASEOFFICER_R1";

  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    await ensureUiSession(userIdentifier);
  });

  test.beforeEach(async ({ taskListPage }) => {
    await openTaskListWithRetry(taskListPage, userIdentifier);
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
      await taskListPage.openFirstManageActions("available tasks actions", { timeoutMs: 15_000 });
      await expect(taskListPage.taskActionsRow).toBeVisible();
      await expect(taskListPage.taskActionClaim).toBeVisible();
      await expect(taskListPage.taskActionClaimAndGo).toBeVisible();
    });
  });
});
