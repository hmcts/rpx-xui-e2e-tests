import { expect, test } from "../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../utils/ui/storage-state.utils.js";
import { UserUtils } from "../../../utils/ui/user.utils.js";
import { ensureSessionCookies } from "../integration/utils/session.utils.js";
import { readTaskTable } from "../integration/utils/tableUtils.js";

const userUtils = new UserUtils();
const shouldRunMyWork = userUtils.hasUserCredentials("STAFF_ADMIN");

if (shouldRunMyWork) {
  test.use({ storageState: resolveUiStoragePathForUser("STAFF_ADMIN") });

  test.describe("Verify the my tasks page tabs appear as expected", () => {
    test.beforeAll(async () => {
      await ensureSessionCookies("STAFF_ADMIN", { strict: true });
    });

    test.beforeEach(async ({ page, taskListPage }) => {
      await taskListPage.goto();
      await Promise.race([
        page.waitForResponse(
          (response) =>
            response.url().includes("/workallocation/task") && response.ok(),
          {
            timeout: 60_000,
          },
        ),
        taskListPage.taskListTable.waitFor({
          state: "visible",
          timeout: 60_000,
        }),
      ]).catch(async () => {
        await taskListPage.taskListTable.waitFor({
          state: "visible",
          timeout: 60_000,
        });
      });
    });

    test("Verify My tasks actions appear as expected", async ({
      taskListPage,
    }) => {
      await test.step("Navigate to the task list page", async () => {
        await expect(taskListPage.taskListTable).toBeVisible();
        await taskListPage.exuiSpinnerComponent.wait();
        await taskListPage.manageCaseButtons.nth(0).waitFor();
      });

      await test.step("Check my available tasks has data in the table", async () => {
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

    test("Verify Available tasks actions appear as expected", async ({
      taskListPage,
    }) => {
      await test.step("Navigate to the task list page", async () => {
        await taskListPage.selectWorkMenuItem("Available tasks");
        await expect(taskListPage.taskListTable).toBeVisible();
        await taskListPage.exuiSpinnerComponent.wait();
        await taskListPage.manageCaseButtons.nth(0).waitFor();
      });

      await test.step("Check my available tasks has data in the table", async () => {
        const table = await readTaskTable(taskListPage.taskListTable);
        expect(table.length).toBeGreaterThan(0);
      });

      await test.step("Verify tasks actions are shown as expected", async () => {
        await taskListPage.manageCaseButtons.nth(0).click();
        await expect(taskListPage.taskActionsRow).toBeVisible();
        await expect(taskListPage.taskActionClaim).toBeVisible();
        await expect(taskListPage.taskActionClaimAndGo).toBeVisible();
      });
    });
  });
}
