import { expect, test } from '@playwright/test';

import { CaseDetailsPage } from '../../../page-objects/pages/exui/caseDetails.po.js';

import { checkYourAnswersHtml } from './fixtures/page-object-dom.mock.js';

test.describe('case details table values', { tag: '@svc-internal' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(checkYourAnswersHtml);
  });

  test('reads multiselect values without the nested accessibility heading', async ({ page }) => {
    const details = new CaseDetailsPage(page);
    const answers = await details.trRowsToObjectInPage(page.locator('#answers'));
    expect(answers['Choose divorce reasons']).toBe('Adultery Desertion');
    expect(answers).not.toHaveProperty('Value');
  });

  test('preserves ordinary fields, first values and separate complex table reads', async ({ page }) => {
    const details = new CaseDetailsPage(page);
    const answers = await details.trRowsToObjectInPage('#answers');
    expect(answers['Text Field 0']).toBe('Example');
    expect(answers).not.toHaveProperty('Hidden field');
    expect(await details.trRowsToObjectInPage('#person')).toEqual({ 'First Name': 'Alice' });
    expect(await details.trRowsToObjectInPage('#empty')).toEqual({});
  });
});
