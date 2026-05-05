import {
  EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY,
  EXUI_HEARINGS_SUPPORTED_SERVICE_FAMILIES,
} from '../../../data/exui-central-assurance.js';
import { expect, test } from '../../../fixtures/ui';
import {
  applySessionCookies,
  caseDetailsUrl,
  HEARING_MANAGER_CR84_ON_USER,
  openHearingsTabForScenario,
  setupHearingsMockRoutes,
} from '../helpers/index.js';
import { HEARINGS_LISTED_HEARING_ID, LISTED_HEARING_SCENARIO } from '../mocks/hearings.mock.js';

const userIdentifier = HEARING_MANAGER_CR84_ON_USER;
const hearingManagerRoles = ['caseworker-privatelaw', 'caseworker-privatelaw-courtadmin', 'case-allocator', 'hearing-manager'];
const privateLawCaseConfig = {
  jurisdictionId: 'PRIVATELAW',
  caseTypeId: 'PRLAPPS',
  serviceId: 'ABA5',
};
const privateLawVariation = {
  jurisdiction: privateLawCaseConfig.jurisdictionId,
  caseType: privateLawCaseConfig.caseTypeId,
};

test.describe(`EXUI superservice hearings families as ${userIdentifier}`, { tag: ['@integration', '@integration-hearings'] }, () => {
  test('supported Private Law PRLAPPS case renders hearing-manager actions', async ({
    page,
    caseDetailsPage,
    hearingsTabPage,
    hearingViewSummaryPage,
  }) => {
    expect(EXUI_HEARINGS_SUPPORTED_SERVICE_FAMILIES).toContain('PRIVATELAW');
    expect(EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY.PRIVATELAW).toContain('PRLAPPS');

    await openHearingsTabForScenario(
      page,
      caseDetailsPage,
      {
        userRoles: hearingManagerRoles,
        hearings: [LISTED_HEARING_SCENARIO],
        caseConfig: privateLawCaseConfig,
        enabledCaseVariations: [privateLawVariation],
        amendmentCaseVariations: [privateLawVariation],
      },
      { userIdentifier }
    );

    await hearingsTabPage.waitForReady(HEARINGS_LISTED_HEARING_ID);
    await expect(hearingsTabPage.viewDetailsButton(HEARINGS_LISTED_HEARING_ID)).toBeVisible();

    await hearingsTabPage.openViewDetails(HEARINGS_LISTED_HEARING_ID);

    await expect(page).toHaveURL(/\/hearings\/request\/hearing-view-summary$/);
    await hearingViewSummaryPage.waitForReady();
    await expect(hearingViewSummaryPage.editHearingButton).toBeVisible();
  });

  test('unsupported Divorce case keeps the Hearings tab hidden', async ({ page }) => {
    expect(EXUI_HEARINGS_SUPPORTED_SERVICE_FAMILIES).not.toContain('DIVORCE');

    await applySessionCookies(page, userIdentifier);
    await setupHearingsMockRoutes(page, {
      userRoles: hearingManagerRoles,
      hearings: [LISTED_HEARING_SCENARIO],
      caseConfig: {
        jurisdictionId: 'DIVORCE',
        caseTypeId: 'DIVORCE',
        serviceId: 'ABA1',
      },
      enabledCaseVariations: [privateLawVariation],
      amendmentCaseVariations: [privateLawVariation],
    });

    await page.goto(caseDetailsUrl('DIVORCE', 'DIVORCE'), { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('tab', { name: /hearings/i })).toHaveCount(0);
  });
});
