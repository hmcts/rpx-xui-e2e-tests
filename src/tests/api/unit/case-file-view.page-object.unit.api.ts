import { expect, test } from '@playwright/test';

import { CaseFileViewPage } from '../../../page-objects/pages/exui/caseFileView.po.js';

import { caseFileFolderHtml } from './fixtures/page-object-dom.mock.js';

test('resolves and expands native folder buttons within the requested hierarchy', { tag: '@svc-internal' }, async ({ page }) => {
  await page.setContent(caseFileFolderHtml);
  page.setDefaultTimeout(2_000);
  const fileView = new CaseFileViewPage(page);
  const orders = await fileView.getFolderNode('Orders');
  await expect(orders.locator(':scope > button')).toHaveAttribute('aria-expanded', 'false');

  const evidence = await fileView.getExpandedFolderNode('Orders.Evidence');
  await expect(orders.locator(':scope > button')).toHaveAttribute('aria-expanded', 'true');
  await expect(evidence.locator(':scope > button')).toHaveAttribute('aria-expanded', 'true');
  await expect(fileView.treeRoot.locator(':scope > cdk-nested-tree-node').nth(1).locator(':scope > button')).toHaveAttribute('aria-expanded', 'false');
});
