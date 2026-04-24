import { expect, type Page } from "@playwright/test";

import type { TaskListPage } from "../../../page-objects/pages/exui/taskList.po.js";
import {
  MY_WORK_LIST_URL_REGEX,
  SERVICE_DOWN_HEADING_TEXT,
  SERVICE_DOWN_URL_REGEX,
  TASK_UNAVAILABLE_WARNING
} from "../testData/index.js";

export async function assertTaskReassignFailureOutcome(
  page: Page,
  taskListPage: TaskListPage,
  statusCode: number
): Promise<void> {
  if (statusCode === 500) {
    await expect(page).toHaveURL(SERVICE_DOWN_URL_REGEX);
    await expect(
      page.getByRole("heading", { level: 1, name: SERVICE_DOWN_HEADING_TEXT })
    ).toBeVisible();
    return;
  }

  await expect(page).toHaveURL(MY_WORK_LIST_URL_REGEX);
  await expect(taskListPage.taskListTable).toBeVisible();
  await expect(taskListPage.exuiBodyComponent.message).toContainText(TASK_UNAVAILABLE_WARNING);
}
