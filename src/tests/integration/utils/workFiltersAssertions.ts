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
