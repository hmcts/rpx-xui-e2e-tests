import type { Page } from "@playwright/test";

/**
 * Sets up mock API routes for task list tests.
 */
export async function setupTaskListMockRoutes(
  page: Page,
  taskListResponse: unknown,
): Promise<void> {
  await page.route("**/api/healthCheck*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ healthState: true }),
    });
  });

  await page.route("**/workallocation/task*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(taskListResponse),
    });
  });
}
