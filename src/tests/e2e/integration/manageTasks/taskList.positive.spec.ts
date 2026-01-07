import type { Cookie } from "@playwright/test";

import { expect, test } from "../../../../fixtures/ui";
import { ensureUiStorageStateForUser } from "../../../../utils/ui/session-storage.utils.js";
import { loadSessionCookies } from "../utils/session.utils.js";
import { readTaskTable } from "../utils/tableUtils.js";

const userIdentifier = "COURT_ADMIN";
let sessionCookies: Cookie[] = [];

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
      await expect(page.getByText("Sorry, you're not authorised to perform this action")).not.toBeVisible();
    });
  });

  test(`User ${userIdentifier} sees tasks or an empty state`, async ({ taskListPage, page }) => {
    await test.step("Navigate to the my tasks list page", async () => {
      await taskListPage.goto();
      await expect(taskListPage.taskListTable).toBeVisible();
      await taskListPage.exuiSpinnerComponent.wait();
    });

    const noTasksMessage = page.getByText("You have no assigned tasks.");
    if (await noTasksMessage.isVisible().catch(() => false)) {
      await test.step("Verify empty state when no tasks are assigned", async () => {
        await expect(noTasksMessage).toBeVisible();
      });
    } else {
      await test.step("Verify at least one task row is available", async () => {
        const table = await readTaskTable(taskListPage.taskListTable);
        expect(table.length).toBeGreaterThan(0);
      });
    }
  });
});
