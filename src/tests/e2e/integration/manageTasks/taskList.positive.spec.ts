import type { Cookie, Page } from "@playwright/test";

import { expect, test } from "../../../../fixtures/ui";
import type { TaskListPage } from "../../../../page-objects/pages/exui/taskList.po.js";
import { ensureUiStorageStateForUser } from "../../../../utils/ui/session-storage.utils.js";
import { loadSessionCookies } from "../utils/session.utils.js";
import { readTaskTable } from "../utils/tableUtils.js";

const userIdentifier = "COURT_ADMIN";
let sessionCookies: Cookie[] = [];

const assertTasksState = async (page: Page, taskListPage: TaskListPage): Promise<void> => {
  const noTasksMessage = page.getByText("You have no assigned tasks.");
  const emptyVisible = await noTasksMessage.isVisible().catch(() => false);
  if (emptyVisible) {
    await expect(noTasksMessage).toBeVisible();
    return;
  }

  const table = await readTaskTable(taskListPage.taskListTable);
  expect(table.length).toBeGreaterThan(0);
};

test.beforeAll(async () => {
  await ensureUiStorageStateForUser(userIdentifier, { strict: true });
  const { cookies } = loadSessionCookies(userIdentifier);
  sessionCookies = cookies;
});

test.beforeEach(async ({ page }) => {
  if (!sessionCookies.length) {
    throw new Error(`No session cookies found for ${userIdentifier}.`);
  }
  await page.context().addCookies(sessionCookies);
});

test.describe(`Task List as ${userIdentifier}`, () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(`User ${userIdentifier} can reach the task list page`, async ({ taskListPage, page }) => {
    await test.step("Navigate to the my tasks list page", async () => {
      await taskListPage.goto();
      await expect(taskListPage.taskListTable).toBeVisible();
      await taskListPage.exuiSpinnerComponent.wait();
    });

    await test.step("Verify the user is not blocked by authorization", async () => {
      await expect(page.getByText("Sorry, you're not authorised to perform this action")).toBeHidden();
    });
  });

  test(`User ${userIdentifier} sees tasks or an empty state`, async ({ taskListPage, page }) => {
    await test.step("Navigate to the my tasks list page", async () => {
      await taskListPage.goto();
      await expect(taskListPage.taskListTable).toBeVisible();
      await taskListPage.exuiSpinnerComponent.wait();
    });

    await test.step("Verify empty state or tasks list renders", async () => {
      await assertTasksState(page, taskListPage);
    });
  });
});
