import { expect } from "@playwright/test";

import type { TaskListPage } from "../../../page-objects/pages/exui/taskList.po.js";

export async function assertSharedMyWorkFilterSections(
  taskListPage: TaskListPage,
  options: { showTypesOfWork: boolean }
): Promise<void> {
  await expect(taskListPage.taskListFilterToggle).toContainText("Hide work filter");
  await expect(taskListPage.filterPanel.getByText("Services", { exact: true })).toBeVisible();
  await expect(taskListPage.filterPanel.locator("#locations")).toBeVisible();

  if (options.showTypesOfWork) {
    await expect(taskListPage.filterPanel.getByText("Types of work", { exact: true })).toBeVisible();
    return;
  }

  await expect(taskListPage.filterPanel.locator("#types-of-work")).toBeHidden();
}

export async function assertFullLocationRequestScope(
  fullLocationRequests: string[],
  expectedFullLocationServiceCodes?: string[]
): Promise<void> {
  if (expectedFullLocationServiceCodes) {
    await expect.poll(() => fullLocationRequests.length).toBeGreaterThan(0);
    expect(fullLocationRequests.at(-1)?.split(",").sort()).toEqual(
      [...expectedFullLocationServiceCodes].sort()
    );
    return;
  }

  await expect.poll(() => fullLocationRequests.length).toBe(0);
}

export async function assertInitialSelectedLocations(
  taskListPage: TaskListPage,
  expectedInitialLocations: string[]
): Promise<void> {
  if (expectedInitialLocations.length > 0) {
    await expect(taskListPage.selectedLocationTags).toHaveText(expectedInitialLocations);
    return;
  }

  await expect(taskListPage.selectedLocationTags).toHaveCount(0);
}
