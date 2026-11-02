import { expect, test } from '@playwright/test';

import { TaskListPage } from '../../../page-objects/pages/exui/taskList.po.js';

import { taskLocationSearchHtml } from './fixtures/page-object-dom.mock.js';

test('reads each visible location option once from the autocomplete overlay', { tag: '@svc-internal' }, async ({ page }) => {
  await page.setContent(taskLocationSearchHtml);
  const taskList = new TaskListPage(page);

  await expect(taskList.allWorkLocationSearchResults).toHaveText(['IA Court Centre 1', 'SSCS Court Centre 1']);
});
