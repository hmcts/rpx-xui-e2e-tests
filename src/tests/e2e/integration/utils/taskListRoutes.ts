import type { Page } from "@playwright/test";

import { buildMyTaskListMock } from "../mocks/taskList.mock.js";

export const taskListRoutePattern = /\/workallocation\/task(?:\?.*)?$/;

export async function setupAvailableTaskListRoutes(
  page: Page,
  supportedJurisdictions: readonly string[],
): Promise<void> {
  const taskListMockResponse = buildMyTaskListMock(3, "");

  await page.route("**/api/wa-supported-jurisdiction/get*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(supportedJurisdictions),
    });
  });

  await page.route("**/workallocation/task/types-of-work*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { key: "applications", label: "Applications" },
        { key: "hearing_work", label: "Hearing work" },
        { key: "routine_work", label: "Routine work" },
      ]),
    });
  });

  await page.route("**/api/healthCheck*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ healthState: true }),
    });
  });

  await page.route("**/workallocation/region-location*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/workallocation/full-location*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(
    "**/workallocation/caseworker/getUsersByServiceName*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    },
  );

  await page.route(taskListRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(taskListMockResponse),
    });
  });
}
