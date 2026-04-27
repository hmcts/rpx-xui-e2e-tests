import type { Page } from '@playwright/test';

import { expect, test } from '../../../fixtures/ui';
import { applySessionCookies, caseDetailsUrl, HEARING_MANAGER_CR84_ON_USER, setupHearingsMockRoutes } from '../helpers/index.js';
import { HEARINGS_LISTED_HEARING_ID, LISTED_HEARING_SCENARIO } from '../mocks/hearings.mock.js';

const userIdentifier = HEARING_MANAGER_CR84_ON_USER;
const hearingsTabUrl = `${caseDetailsUrl()}/hearings`;
const hearingManagerRoles = ['caseworker-privatelaw', 'caseworker-privatelaw-courtadmin', 'case-allocator', 'hearing-manager'];

async function gotoAllowRedirectAbort(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch((error: Error) => {
    if (String(error).includes('ERR_ABORTED')) {
      return;
    }

    throw error;
  });
}

test.describe(`Hearings CR84 integration as ${userIdentifier}`, { tag: ['@integration', '@integration-hearings'] }, () => {
  test('Hearings - hearings-disabled case does not render the Hearings tab', async ({ page }) => {
    await applySessionCookies(page, userIdentifier);
    await setupHearingsMockRoutes(page, {
      userRoles: hearingManagerRoles,
      hearings: [LISTED_HEARING_SCENARIO],
      caseConfig: {
        jurisdictionId: 'DIVORCE',
        caseTypeId: 'DIVORCE',
      },
      enabledCaseVariations: [{ jurisdiction: 'CIVIL', caseType: 'CIVIL' }],
      amendmentCaseVariations: [{ jurisdiction: 'CIVIL', caseType: 'CIVIL' }],
    });

    await page.goto(caseDetailsUrl('DIVORCE', 'DIVORCE'), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: /hearings/i })).toHaveCount(0);
  });

  test('Hearings - user without hearing read rights cannot access LISTED hearing details entry points', async ({
    page,
    hearingsTabPage,
  }) => {
    await applySessionCookies(page, userIdentifier);
    await setupHearingsMockRoutes(page, {
      userRoles: ['caseworker-privatelaw', 'caseworker-privatelaw-courtadmin', 'case-allocator'],
      hearings: [LISTED_HEARING_SCENARIO],
    });

    await page.goto(caseDetailsUrl(), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: /hearings/i })).toHaveCount(0);

    await gotoAllowRedirectAbort(page, hearingsTabUrl);
    await expect(hearingsTabPage.container).toHaveCount(0);
    await expect(hearingsTabPage.viewDetailsButton(HEARINGS_LISTED_HEARING_ID)).toHaveCount(0);

    await gotoAllowRedirectAbort(page, '/hearings/view/hearing-view-summary');
    await expect
      .poll(() => page.url(), {
        timeout: 30_000,
        intervals: [500, 1_000, 2_000],
      })
      .not.toMatch(/\/hearings\/view\/hearing-view-summary$/);
    await expect.poll(() => page.url()).toContain('/cases');
  });
});
