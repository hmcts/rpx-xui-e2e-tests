import { expect, test } from "../../../fixtures/ui";
import { ensureSessionCookies } from "../../../utils/ui/sessionCapture";

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isHardFailure(error: unknown): boolean {
  const message = asMessage(error);
  return (
    /Something went wrong page was displayed/i.test(message) ||
    /returned HTTP 5\d\d/i.test(message)
  );
}

test.describe("Verify the my tasks page tabs appear as expected", () => {
  test.beforeEach(async ({ page, taskListPage }) => {
    const { cookies } = await ensureSessionCookies("STAFF_ADMIN");
    if (cookies.length) {
      await page.context().addCookies(cookies);
    }
    await taskListPage.goto();
    // Prefer UI readiness over brittle network waits; fall back to response when available.
    await Promise.race([
      (async () => {
        await page.waitForResponse(
          (res) => res.url().includes("/workallocation/task") && res.ok(),
          { timeout: 60000 },
        );
      })(),
      taskListPage.taskListTable.waitFor({ state: "visible", timeout: 60000 }),
    ]).catch(async () => {
      // If neither completes, surface clearer error context by awaiting table visibility.
      await taskListPage.taskListTable.waitFor({
        state: "visible",
        timeout: 60000,
      });
    });
  });

  test("Verify My tasks actions appear as expected", async ({
    taskListPage,
    tableUtils,
  }) => {
    await test.step("Navigate to the task list page", async () => {
      await expect(taskListPage.taskListTable).toBeVisible();
      try {
        await taskListPage.waitForManageButton("my tasks tab", {
          timeoutMs: 60_000,
        });
      } catch (error) {
        // eslint-disable-next-line playwright/no-conditional-in-test -- error classification in catch block; re-throws hard failures, skips transient ones
        if (isHardFailure(error)) {
          throw error;
        }
        throw new Error(
          `My tasks action assertions failed: no manageable tasks available in this environment (${asMessage(error)}).`,
        );
      }
    });

    await test.step("Check my available tasks has data in the table", async () => {
      const table = await tableUtils.parseWorkAllocationTable(
        taskListPage.taskListTable,
      );
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
    tableUtils,
  }) => {
    await test.step("Navigate to the task list page", async () => {
      await taskListPage.selectWorkMenuItem("Available tasks");
      await expect(taskListPage.taskListTable).toBeVisible();
      try {
        await taskListPage.waitForManageButton("available tasks tab", {
          timeoutMs: 60_000,
        });
      } catch (error) {
        // eslint-disable-next-line playwright/no-conditional-in-test -- error classification in catch block; re-throws hard failures, skips transient ones
        if (isHardFailure(error)) {
          throw error;
        }
        throw new Error(
          `Available tasks action assertions failed: no manageable tasks available in this environment (${asMessage(error)}).`,
        );
      }
    });

    await test.step("Check my available tasks has data in the table", async () => {
      const table = await tableUtils.parseWorkAllocationTable(
        taskListPage.taskListTable,
      );
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
